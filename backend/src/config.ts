import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Startup guard: prevent running with default JWT secrets in production
const isProduction = process.env.NODE_ENV === 'production';
const defaultSecrets = ['default-secret-change-me', 'default-refresh-secret', 'tu-secreto-aqui-cambiar-en-produccion', 'tu-refresh-secreto-aqui'];

if (isProduction) {
  const jwtSecret = process.env.JWT_SECRET || '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';

  if (!jwtSecret || defaultSecrets.includes(jwtSecret)) {
    console.error('[FATAL] JWT_SECRET no está configurado o usa el valor predeterminado.');
    console.error('[FATAL] Genera un secret aleatorio de 32+ bytes y configúralo en Render.');
    console.error('[FATAL] Ejemplo: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }

  if (!refreshSecret || defaultSecrets.includes(refreshSecret)) {
    console.error('[FATAL] JWT_REFRESH_SECRET no está configurado o usa el valor predeterminado.');
    console.error('[FATAL] Genera un secret aleatorio de 32+ bytes y configúralo en Render.');
    process.exit(1);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lucero-trp',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiration: process.env.JWT_EXPIRATION || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  websocket: {
    corsOrigin: process.env.WS_CORS_ORIGIN || 'http://localhost:5173',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
