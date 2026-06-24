import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';

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

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: config.websocket.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// WebSocket handlers
setupWebSocket(io);

// Middleware
app.use(helmet());
app.use(cors({ origin: config.cors.origin }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDatabase();

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
