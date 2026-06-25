import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const JWT_EXPIRY = config.jwt.expiration as jwt.SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRY = config.jwt.refreshExpiration as jwt.SignOptions['expiresIn'];

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email y contraseña son requeridos', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new AppError('Credenciales incorrectas', 401);
    }

    if (!user.activo) {
      throw new AppError('Usuario desactivado', 403);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Credenciales incorrectas', 401);
    }

    user.ultimoAcceso = new Date();
    await user.save();

    const accessToken = jwt.sign(
      { _id: user._id, email: user.email, rol: user.rol },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { _id: user._id },
      config.jwt.refreshSecret,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (error) {
    console.error('[LOGIN ERROR]', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, rol, adminId } = req.body;

    if (!email || !password || !nombre) {
      throw new AppError('Email, contraseña y nombre son requeridos', 400);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('El email ya está registrado', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      nombre,
      rol: rol || 'admin',
      adminId: adminId || null,
      activo: true,
    });

    const accessToken = jwt.sign(
      { _id: user._id, email: user.email, rol: user.rol },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { _id: user._id },
      config.jwt.refreshSecret,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token requerido', 400);
    }

    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
      _id: string;
    };

    const user = await User.findById(decoded._id);
    if (!user || !user.activo) {
      throw new AppError('Usuario no encontrado o desactivado', 404);
    }

    const accessToken = jwt.sign(
      { _id: user._id, email: user.email, rol: user.rol },
      config.jwt.secret,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ accessToken });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Refresh token expirado' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Refresh token inválido' });
    }
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?._id).select('-password');
    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }
    res.json({ user });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// PUT /api/auth/update-profile
router.put('/update-profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, email } = req.body;

    if (!nombre || !email) {
      throw new AppError('Nombre y email son requeridos', 400);
    }

    // Verificar si el email ya está en uso por otro usuario
    const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user?._id } });
    if (existingUser) {
      throw new AppError('El email ya está registrado', 409);
    }

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      { $set: { nombre, email: email.toLowerCase() } },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    res.json({ user });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar perfil' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Contraseña actual y nueva contraseña son requeridas', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('La nueva contraseña debe tener al menos 6 caracteres', 400);
    }

    const user = await User.findById(req.user?._id);
    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new AppError('La contraseña actual es incorrecta', 401);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al cambiar contraseña' });
  }
});

export { router as authRoutes };
