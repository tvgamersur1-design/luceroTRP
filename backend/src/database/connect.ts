import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodb.uri);
    logger.info('MongoDB conectado exitosamente');
  } catch (error) {
    logger.error('Error conectando a MongoDB:', error);
    process.exit(1);
  }

  mongoose.connection.on('error', (error) => {
    logger.error('Error en MongoDB:', error);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB desconectado');
  });
};
