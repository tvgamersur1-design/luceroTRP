import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { Location } from '../models/Location';
import { Trip } from '../models/Trip';
import { Alert } from '../models/Alert';

interface LocationData {
  choferId: string;
  vehiculoId?: string;
  viajeId?: string;
  lat: number;
  lng: number;
  velocidad?: number;
  direccion?: number;
}

export function setupWebSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`Cliente WebSocket conectado: ${socket.id} (transport: ${socket.conn.transport.name})`);

    socket.conn.on('upgrade', (transport: any) => {
      logger.info(`Socket ${socket.id} upgraded to ${transport.name}`);
    });

    socket.on('chofer:location', async (data: LocationData) => {
      try {
        await Location.create({
          choferId: data.choferId,
          vehiculoId: data.vehiculoId,
          viajeId: data.viajeId,
          lat: data.lat,
          lng: data.lng,
          velocidad: data.velocidad,
          direccion: data.direccion,
          timestamp: new Date(),
        });

        io.emit('location:update', {
          choferId: data.choferId,
          lat: data.lat,
          lng: data.lng,
          velocidad: data.velocidad,
          direccion: data.direccion,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Error guardando ubicación:', error);
      }
    });

    socket.on('trip:start', async (data: { viajeId: string }) => {
      try {
        const viaje = await Trip.findById(data.viajeId)
          .populate('choferId', 'nombre')
          .populate('vehiculoId', 'placa')
          .populate('rutaId', 'nombre origen destino');

        if (viaje) {
          io.emit('trip:started', {
            viajeId: viaje._id,
            chofer: viaje.choferId,
            vehiculo: viaje.vehiculoId,
            ruta: viaje.rutaId,
          });
        }
      } catch (error) {
        logger.error('Error emitiendo inicio de viaje:', error);
      }
    });

    socket.on('trip:update', async (data: { viajeId: string; ingresoTotal: number; pasajeros: number }) => {
      io.emit('trip:updated', data);
    });

    socket.on('alert:create', async (data: { tipo: string; titulo: string; descripcion: string; nivel: string; choferId?: string; viajeId?: string }) => {
      try {
        const alerta = await Alert.create({
          tipo: data.tipo,
          titulo: data.titulo,
          descripcion: data.descripcion,
          nivel: data.nivel,
          choferId: data.choferId,
          viajeId: data.viajeId,
          leida: false,
          atendida: false,
        });

        io.emit('alert:created', alerta);
      } catch (error) {
        logger.error('Error creando alerta:', error);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Cliente WebSocket desconectado: ${socket.id} razon: ${reason}`);
    });
  });
}
