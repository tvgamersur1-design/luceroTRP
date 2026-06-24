import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
