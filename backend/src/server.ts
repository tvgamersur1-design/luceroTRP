import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';

import { config } from './config';
import { connectDatabase } from './database/connect';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth.routes';
import { viajesRoutes } from './routes/viajes.routes';
import { choferesRoutes } from './routes/choferes.routes';
import { vehiculosRoutes } from './routes/vehiculos.routes';
import { rutasRoutes } from './routes/rutas.routes';
import { tarifasRoutes } from './routes/tarifas.routes';
import { alertasRoutes } from './routes/alertas.routes';
import { incidenciasRoutes } from './routes/incidencias.routes';
import { usuariosRoutes } from './routes/usuarios.routes';
import { auditRoutes } from './routes/audit.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { syncRoutes } from './routes/sync.routes';
import { pasajerosRoutes } from './routes/pasajeros.routes';
import { locationRoutes } from './routes/location.routes';
import { horariosRoutes } from './routes/horarios.routes';
import { setupWebSocket } from './websocket/handlers';
import { setIO } from './websocket/socket';
import { User } from './models/User';

const app = express();

// Trust proxy (needed behind Render's reverse proxy)
app.set('trust proxy', 1);

// Express 4 async error wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Seed admin users if they don't exist
const seedAdminUsers = async () => {
  try {
    const existingAdmin = await User.findOne({ email: 'admin@lucero.com' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        email: 'admin@lucero.com',
        password: hashedPassword,
        nombre: 'Admin Lucero',
        rol: 'admin',
        activo: true,
      });
      logger.info('Usuario admin creado: admin@lucero.com / admin123');
    } else {
      logger.info('Usuario admin ya existe');
    }

    const existingSuper = await User.findOne({ email: 'super@lucero.com' });
    if (!existingSuper) {
      const hashedPassword = await bcrypt.hash('super123', 10);
      await User.create({
        email: 'super@lucero.com',
        password: hashedPassword,
        nombre: 'Super Admin',
        rol: 'super-admin',
        activo: true,
      });
      logger.info('Usuario super-admin creado: super@lucero.com / super123');
    } else {
      logger.info('Usuario super-admin ya existe');
    }
  } catch (error) {
    logger.error('Error en seed de usuarios:', error);
  }
};

const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
  transports: ['polling'],
  allowUpgrades: false,
  pingInterval: 25000,
  pingTimeout: 60000,
  allowEIO3: true,
});

// Socket.IO auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Autenticación requerida'));
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, config.jwt.secret);
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});

// WebSocket handlers
setIO(io);
setupWebSocket(io);

// Middleware
app.disable('etag');
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Disable 304 caching for API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Demasiadas peticiones, intenta de nuevo más tarde',
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/viajes', viajesRoutes);
app.use('/api/choferes', choferesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/tarifas', tarifasRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/pasajeros', pasajerosRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/horarios', horariosRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Debug: test MongoDB connection
app.get('/api/debug/db', async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const state = mongoose.default.connection.readyState;
    const stateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const userCount = await User.countDocuments();
    res.json({
      connectionState: stateMap[state] || 'unknown',
      userCount,
      mongoUri: config.mongodb.uri ? 'set' : 'NOT SET',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDatabase();

    // Seed admin users on startup
    await seedAdminUsers();

    // Drop old unique index on passengers.dni if it exists
    try {
      const mongoose = await import('mongoose');
      const Passenger = mongoose.default.model('Passenger');
      const indexes = await Passenger.collection.indexes();
      const dniIndex = indexes.find((i: any) => i.key?.dni === 1 && i.unique);
      if (dniIndex?.name) {
        await Passenger.collection.dropIndex(dniIndex.name);
        logger.info('Índice único viejo en passengers.dni eliminado');
      }
    } catch {
      // Index doesn't exist or already dropped — ignore
    }

    httpServer.listen(config.port, () => {
      logger.info(`Servidor corriendo en http://${config.host}:${config.port}`);
      logger.info(`Entorno: ${config.env}`);
    });
  } catch (error) {
    logger.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido. Cerrando servidor...');
  httpServer.close(() => {
    logger.info('Servidor cerrado');
    process.exit(0);
  });
});

startServer();

export { app, io };
