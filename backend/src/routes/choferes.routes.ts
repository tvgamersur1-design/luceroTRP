import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Driver } from '../models/Driver';
import { AppError } from '../middleware/errorHandler';
import { getIO } from '../websocket/socket';

const router = Router();

// GET /api/choferes - Listar usuarios
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activo, rol, page = '1', limit = '50' } = req.query;
    const filter: Record<string, unknown> = {};
    if (activo !== undefined) filter.activo = activo === 'true';
    if (rol) filter.rol = rol;

    // Si es admin, solo ve sus usuarios (los que creó)
    if (req.user?.rol === 'admin') {
      filter.adminId = req.user._id;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [usuarios, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ nombre: 1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(filter),
    ]);

    // Para usuarios con rol chofer, obtener datos del Driver
    const usuariosConDriver = await Promise.all(
      usuarios.map(async (u) => {
        if (u.rol === 'chofer') {
          const driver = await Driver.findOne({ userId: u._id });
          return {
            ...u.toObject(),
            driver: driver || null,
          };
        }
        return { ...u.toObject(), driver: null };
      })
    );

    res.json({ usuarios: usuariosConDriver, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

// GET /api/choferes/:id - Obtener usuario por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const usuario = await User.findById(req.params.id).select('-password');
    if (!usuario) {
      throw new AppError('Usuario no encontrado', 404);
    }

    let driver = null;
    if (usuario.rol === 'chofer') {
      driver = await Driver.findOne({ userId: usuario._id });
    }

    res.json({ ...usuario.toObject(), driver });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
});

// POST /api/choferes - Crear usuario (User + Driver si es chofer)
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, nombre, rol, licencia, telefono } = req.body;

    if (!email || !password || !nombre || !rol) {
      throw new AppError('email, password, nombre y rol son requeridos', 400);
    }

    // Validar que si es chofer, tenga licencia y teléfono
    if (rol === 'chofer' && (!licencia || !telefono)) {
      throw new AppError('Los choferes requieren licencia y teléfono', 400);
    }

    // Verificar email único
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('El email ya está registrado', 409);
    }

    // Verificar licencia única (solo para choferes)
    if (rol === 'chofer' && licencia) {
      const existingLicencia = await Driver.findOne({ licencia });
      if (existingLicencia) {
        throw new AppError('Ya existe un chofer con esa licencia', 409);
      }
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      nombre,
      rol,
      adminId: req.user?._id || null,
      activo: true,
    });

    // Si es chofer, crear Driver vinculado
    let driver = null;
    if (rol === 'chofer') {
      driver = await Driver.create({
        userId: user._id,
        nombre,
        licencia,
        telefono,
        activo: true,
        calificacion: 5.0,
        totalViajes: 0,
      });
    }

    getIO().emit('driver:created', { _id: user._id, email: user.email, nombre: user.nombre, rol: user.rol });

    res.status(201).json({
      _id: user._id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      adminId: user.adminId,
      activo: user.activo,
      driver,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// PUT /api/choferes/:id - Actualizar usuario
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, email, rol, licencia, telefono, activo } = req.body;

    const usuario = await User.findById(req.params.id);
    if (!usuario) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // Actualizar campos del User
    if (nombre) usuario.nombre = nombre;
    if (email) usuario.email = email.toLowerCase();
    if (rol) usuario.rol = rol;
    if (activo !== undefined) usuario.activo = activo;
    await usuario.save();

    // Si es chofer, actualizar Driver
    if (usuario.rol === 'chofer') {
      const driver = await Driver.findOne({ userId: usuario._id });
      if (driver) {
        if (nombre) driver.nombre = nombre;
        if (licencia) driver.licencia = licencia;
        if (telefono) driver.telefono = telefono;
        if (activo !== undefined) driver.activo = activo;
        await driver.save();
      } else if (licencia && telefono) {
        // Crear Driver si no existe
        await Driver.create({
          userId: usuario._id,
          nombre: usuario.nombre,
          licencia,
          telefono,
          activo: activo !== undefined ? activo : true,
          calificacion: 5.0,
          totalViajes: 0,
        });
      }
    }

    getIO().emit('driver:updated', { _id: usuario._id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol });

    res.json({
      _id: usuario._id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      adminId: usuario.adminId,
      activo: usuario.activo,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
});

// DELETE /api/choferes/:id - Desactivar usuario
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const usuario = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { activo: false } },
      { new: true }
    );
    if (!usuario) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // Desactivar Driver si existe
    if (usuario.rol === 'chofer') {
      await Driver.findOneAndUpdate(
        { userId: usuario._id },
        { $set: { activo: false } }
      );
    }

    getIO().emit('driver:deleted', req.params.id);

    res.json({ message: 'Usuario desactivado exitosamente', usuario });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al desactivar usuario' });
  }
});

export { router as choferesRoutes };
