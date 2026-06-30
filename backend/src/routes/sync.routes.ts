import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SyncWatermark } from '../models/SyncWatermark';
import { Trip } from '../models/Trip';
import { Passenger } from '../models/Passenger';
import { Payment } from '../models/Payment';
import { Route } from '../models/Route';
import { Fare } from '../models/Fare';
import { Driver } from '../models/Driver';
import { Vehicle } from '../models/Vehicle';
import { AuditLog } from '../models/AuditLog';

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SYNCABLE_MODELS: Record<string, { model: mongoose.Model<any>; name: string }> = {
  trips: { model: Trip, name: 'Trip' },
  viajes: { model: Trip, name: 'Trip' },
  passengers: { model: Passenger, name: 'Passenger' },
  pasajeros: { model: Passenger, name: 'Passenger' },
  payments: { model: Payment, name: 'Payment' },
  pagos: { model: Payment, name: 'Payment' },
  routes: { model: Route, name: 'Route' },
  rutas: { model: Route, name: 'Route' },
  fares: { model: Fare, name: 'Fare' },
  tarifas: { model: Fare, name: 'Fare' },
  drivers: { model: Driver, name: 'Driver' },
  choferes: { model: Driver, name: 'Driver' },
  vehicles: { model: Vehicle, name: 'Vehicle' },
  vehiculos: { model: Vehicle, name: 'Vehicle' },
};

// POST /api/sync/pending - Obtener cambios desde un timestamp
router.post('/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { lastSync, deviceId } = req.body;

    if (!deviceId) {
      throw new AppError('deviceId es requerido', 400);
    }

    const sinceDate = lastSync ? new Date(lastSync) : new Date(0);

    const changes: Array<{
      tabla: string;
      registroId: string;
      accion: string;
      datos: Record<string, unknown>;
      timestamp: string;
    }> = [];

    for (const [tabla, { model }] of Object.entries(SYNCABLE_MODELS)) {
      const updated = await model.find({
        updatedAt: { $gt: sinceDate },
      }).lean();

      for (const doc of updated) {
        const d = doc as unknown as { _id: { toString(): string }; updatedAt: Date };
        changes.push({
          tabla,
          registroId: d._id.toString(),
          accion: 'update',
          datos: doc as unknown as Record<string, unknown>,
          timestamp: d.updatedAt.toISOString(),
        });
      }
    }

    changes.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const now = new Date();
    await SyncWatermark.findOneAndUpdate(
      { deviceId },
      { lastSyncDate: now, updatedAt: now },
      { upsert: true }
    );

    res.json({
      changes,
      syncDate: now.toISOString(),
      total: changes.length,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener cambios pendientes' });
  }
});

// POST /api/sync/batch - Recibir batch de cambios del móvil
router.post('/batch', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { changes, deviceId } = req.body;

    if (!Array.isArray(changes) || changes.length === 0) {
      throw new AppError('changes debe ser un array no vacío', 400);
    }

    if (!deviceId) {
      throw new AppError('deviceId es requerido', 400);
    }

    const results: Array<{
      tabla: string;
      registroId: string;
      status: 'ok' | 'error';
      error?: string;
    }> = [];

    for (const change of changes) {
      const { tabla, registroId, accion, datos } = change;

      const modelEntry = SYNCABLE_MODELS[tabla];
      if (!modelEntry) {
        results.push({
          tabla,
          registroId,
          status: 'error',
          error: `Tabla '${tabla}' no es sincronizable`,
        });
        continue;
      }

      try {
        // Handle local temp IDs (from offline mode)
        const isLocalId = registroId.startsWith('local-');
        const mongoId = isLocalId ? new mongoose.Types.ObjectId() : registroId;

        switch (accion) {
          case 'create':
          case 'update':
            if (isLocalId) {
              // Create new document with generated ObjectId
              const doc = new modelEntry.model({ ...datos, _id: mongoId, updatedAt: new Date() });
              await doc.save();
            } else {
              await modelEntry.model.findOneAndUpdate(
                { _id: registroId },
                { $set: { ...datos, updatedAt: new Date() } },
                { upsert: true, new: true }
              );
            }
            break;
          case 'delete':
            if (!isLocalId) {
              await modelEntry.model.findByIdAndDelete(registroId);
            }
            break;
          default:
            results.push({
              tabla,
              registroId,
              status: 'error',
              error: `Accion '${accion}' no soportada`,
            });
            continue;
        }

        if (req.user) {
          await AuditLog.create({
            usuarioId: req.user._id,
            accion: `sync_${accion}`,
            entidad: modelEntry.name,
            entidadId: registroId,
            datosNuevos: datos,
          });
        }

        results.push({
          tabla,
          registroId,
          status: 'ok',
          ...(isLocalId ? { newId: mongoId.toString() } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        results.push({
          tabla,
          registroId,
          status: 'error',
          error: message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'ok').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    res.json({
      message: `Sincronizados: ${successCount} exitosos, ${errorCount} con error`,
      results,
      successCount,
      errorCount,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al procesar batch de sincronización' });
  }
});

export { router as syncRoutes };
