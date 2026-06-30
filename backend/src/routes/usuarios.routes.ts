import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, requireRole } from '../middleware/auth';
import { User } from '../models/User';

const router = Router();

// GET /api/usuarios - Listar usuarios (para sync y admin)
// Accessible a todos los autenticados (solo devuelve datos públicos, sin password)
router.get('/', authenticate, async (req, res) => {
  try {
    const { adminId, rol } = req.query;
    const filter: Record<string, unknown> = { activo: true };

    const userRol = (req as any).user?.rol;

    // Admins only see their own users; super-admin sees all; choferes see all active
    if (userRol === 'admin') {
      filter.adminId = (req as any).user._id;
    } else if (adminId && userRol === 'super-admin') {
      filter.adminId = adminId;
    }

    if (rol) filter.rol = rol;

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ users });
  } catch (error) {
    console.error('[usuarios] List error:', error);
    res.status(500).json({ message: 'Error al listar usuarios' });
  }
});

// GET /api/usuarios/:id - Obtener usuario por ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ user });
  } catch (error) {
    console.error('[usuarios] Get error:', error);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
});

// POST /api/usuarios - Crear usuario
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req, res) => {
  try {
    const { email, password, nombre, rol } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({ message: 'Email, password y nombre son requeridos' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      nombre,
      rol: rol || 'admin',
      adminId: (req as any).user._id,
      activo: true,
    });

    const { password: _, ...userWithoutPassword } = user.toObject();
    res.status(201).json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[usuarios] Create error:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// PUT /api/usuarios/:id - Actualizar usuario
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req, res) => {
  try {
    const { email, nombre, rol, activo, password } = req.body;
    const update: Record<string, unknown> = {};

    if (email) update.email = email.toLowerCase();
    if (nombre) update.nombre = nombre;
    if (rol) update.rol = rol;
    if (typeof activo === 'boolean') update.activo = activo;
    if (password) update.password = await bcrypt.hash(password, 10);

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({ user });
  } catch (error) {
    console.error('[usuarios] Update error:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
});

// DELETE /api/usuarios/:id - Eliminar usuario (soft delete)
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    ).select('-password').lean();

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado', user });
  } catch (error) {
    console.error('[usuarios] Delete error:', error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
});

export { router as usuariosRoutes };
