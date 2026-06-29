import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Trip } from '../models/Trip';
import { Driver } from '../models/Driver';
import { AppError } from '../middleware/errorHandler';
import { getIO } from '../websocket/socket';

const router = Router();

async function canModifyTrip(req: AuthRequest, viajeId: string): Promise<boolean> {
  if (req.user?.rol === 'super-admin' || req.user?.rol === 'admin') return true;

  const viaje = await Trip.findById(viajeId).select('choferId ayudantes');
  if (!viaje) return false;

  const userId = req.user?._id;
  const driver = await Driver.findOne({ userId });
  const driverId = driver?._id?.toString();

  if (viaje.choferId?.toString() === userId || viaje.choferId?.toString() === driverId) return true;

  return viaje.ayudantes?.some(a =>
    a.choferId?.toString() === userId || a.choferId?.toString() === driverId
  ) || false;
}

// GET /api/viajes/debug-chofer - Diagnóstico: ver qué ve el chofer
router.get('/debug-chofer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const rol = req.user?.rol;

    const driver = await Driver.findOne({ userId });

    const filter: Record<string, unknown> = {};
    if (driver) {
      filter.choferId = { $in: [driver._id.toString(), userId] };
    } else {
      filter.choferId = userId;
    }

    const viajes = await Trip.find(filter)
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa')
      .select('estado fechaInicio horaSalida choferId')
      .sort({ fechaInicio: -1 });

    res.json({
      userId,
      rol,
      driverFound: !!driver,
      driverId: driver?._id || null,
      viajesCount: viajes.length,
      viajes: viajes.map(v => ({
        _id: v._id,
        estado: v.estado,
        fechaInicio: v.fechaInicio,
        horaSalida: v.horaSalida,
        choferId: v.choferId,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error en diagnóstico', error: String(error) });
  }
});

// GET /api/viajes - Listar viajes
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { estado, fecha, choferId, page = '1', limit = '50' } = req.query;
    const filter: Record<string, unknown> = {};

    if (fecha) filter.fechaInicio = { $gte: new Date(fecha as string) };

    if (choferId) {
      const driver = await Driver.findOne({ userId: choferId });
      const driverIdStr = driver ? driver._id.toString() : null;

      if (estado) {
        if (estado === 'planificado') {
          filter.estado = 'planificado';
        } else if (estado === 'en_transito') {
          const ids = driverIdStr ? [driverIdStr, choferId] : [choferId];
          filter.$and = [
            { estado: 'en_transito' },
            { choferId: { $in: ids } },
          ];
        } else {
          const ids = driverIdStr ? [driverIdStr, choferId] : [choferId];
          filter.$and = [
            { estado },
            { choferId: { $in: ids } },
          ];
        }
      } else {
        const ids = driverIdStr ? [driverIdStr, choferId] : [choferId];
        filter.$or = [
          { estado: 'planificado' },
          { $and: [{ estado: 'en_transito' }, { choferId: { $in: ids } }] },
        ];
      }
    } else {
      if (estado) filter.estado = estado;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [viajes, total] = await Promise.all([
      Trip.find(filter)
        .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
        .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
        .populate('choferId', 'nombre licencia telefono userId')
        .populate('pasajeros.pasajeroId', 'nombre dni telefono')
        .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo')
        .sort({ fechaInicio: -1 })
        .skip(skip)
        .limit(limitNum),
      Trip.countDocuments(filter),
    ]);

    res.json({ viajes, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener viajes' });
  }
});

// GET /api/viajes/:id - Obtener viaje por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const viaje = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad color configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    res.json(viaje);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener viaje' });
  }
});

// POST /api/viajes - Crear viaje
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { rutaId, vehiculoId, choferId, fechaInicio, horaSalida, ayudantes } = req.body;

    if (!rutaId || !vehiculoId || !choferId || !fechaInicio) {
      throw new AppError('rutaId, vehiculoId, choferId y fechaInicio son requeridos', 400);
    }

    const driverExists = await Driver.findById(choferId);
    if (!driverExists) {
      throw new AppError('El chofer seleccionado no existe en la base de datos de conductores', 400);
    }

    const viaje = await Trip.create({
      rutaId,
      vehiculoId,
      choferId,
      fechaInicio: new Date(fechaInicio),
      horaSalida: horaSalida || '',
      ayudantes: ayudantes || [],
      estado: 'planificado',
      pasajeros: [],
      ingresoTotal: 0,
    });

    const viajePopulado = await Trip.findById(viaje._id)
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    getIO().emit('trip:created', viajePopulado);

    res.status(201).json(viajePopulado);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear viaje' });
  }
});

// PUT /api/viajes/:id - Actualizar viaje
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    )
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().emit('trip:updated', viaje);

    res.json(viaje);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar viaje' });
  }
});

// DELETE /api/viajes/:id - Cancelar viaje
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: { estado: 'cancelado' } },
      { new: true }
    );

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().emit('trip:deleted', req.params.id);

    res.json({ message: 'Viaje cancelado exitosamente', viaje });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al cancelar viaje' });
  }
});

// PUT /api/viajes/:id/iniciar - Iniciar viaje
router.put('/:id/iniciar', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para iniciar este viaje', 403);
    }

    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: { estado: 'en_transito', fechaInicio: new Date() } },
      { new: true }
    )
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().emit('trip:updated', viaje);

    res.json({ message: 'Viaje iniciado', viaje });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al iniciar viaje' });
  }
});

// PUT /api/viajes/:id/completar - Completar viaje
router.put('/:id/completar', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para completar este viaje', 403);
    }

    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: { estado: 'completado', fechaFin: new Date() } },
      { new: true }
    )
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().emit('trip:updated', viaje);

    res.json({ message: 'Viaje completado', viaje });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al completar viaje' });
  }
});

// POST /api/viajes/:id/pasajeros - Agregar pasajero al viaje
router.post('/:id/pasajeros', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para agregar pasajeros a este viaje', 403);
    }

    const { pasajeroId, montoPagado, metodoPago, asientos, estado, destino, tarifaId } = req.body;

    if (!metodoPago) {
      throw new AppError('metodoPago es requerido', 400);
    }

    if (montoPagado === undefined || montoPagado === null || isNaN(Number(montoPagado))) {
      throw new AppError('montoPagado debe ser un número válido', 400);
    }

    const montoNum = Number(montoPagado) || 0;

    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          pasajeros: {
            pasajeroId: pasajeroId || undefined,
            montoPagado: montoNum,
            metodoPago,
            timestamp: new Date(),
            asientos: asientos || [],
            estado: estado || 'abordado',
            destino: destino || '',
            tarifaId: tarifaId || undefined,
          },
        },
        $inc: { ingresoTotal: montoNum },
      },
      { new: true, runValidators: true }
    )
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().emit('trip:updated', viaje);

    res.json({ message: 'Pasajero agregado al viaje', viaje });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al agregar pasajero' });
  }
});

// PUT /api/viajes/:id/pasajeros/:pid/asiento - Asignar/cambiar asiento(s)
router.put('/:id/pasajeros/:pid/asiento', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para modificar asientos en este viaje', 403);
    }

    const { asientos } = req.body;

    if (!asientos || !Array.isArray(asientos)) {
      throw new AppError('asientos debe ser un array de números', 400);
    }

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    const pasajero = viaje.pasajeros.find((p: any) => p._id?.toString() === req.params.pid || p.pasajeroId?.toString() === req.params.pid);
    if (!pasajero) throw new AppError('Pasajero no encontrado en el viaje', 404);

    pasajero.asientos = asientos;
    pasajero.estado = 'abordado';
    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    getIO().emit('trip:updated', viajePopulado);

    res.json({ message: 'Asiento(s) asignado(s)', viaje: viajePopulado });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al asignar asiento' });
  }
});

// PUT /api/viajes/:id/pasajeros/:pid/estado - Cambiar estado del pasajero
router.put('/:id/pasajeros/:pid/estado', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para cambiar estados en este viaje', 403);
    }

    const { estado } = req.body;
    const validStates = ['reservado', 'en_terminal', 'abordado', 'no_llegado', 'bajado', 'en_camino'];

    if (!estado || !validStates.includes(estado)) {
      throw new AppError(`Estado inválido. Válidos: ${validStates.join(', ')}`, 400);
    }

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    const pasajero = viaje.pasajeros.find((p: any) => p._id?.toString() === req.params.pid || p.pasajeroId?.toString() === req.params.pid);
    if (!pasajero) throw new AppError('Pasajero no encontrado en el viaje', 404);

    pasajero.estado = estado;
    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    getIO().emit('trip:updated', viajePopulado);

    res.json({ message: 'Estado actualizado', viaje: viajePopulado });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al cambiar estado' });
  }
});

// POST /api/viajes/:id/pasajeros/:pid/bajar - Registrar bajada del pasajero
router.post('/:id/pasajeros/:pid/bajar', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para registrar bajadas en este viaje', 403);
    }

    const { paradaBajada, montoCobrado } = req.body;

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    const pasajero = viaje.pasajeros.find((p: any) => p._id?.toString() === req.params.pid || p.pasajeroId?.toString() === req.params.pid);
    if (!pasajero) throw new AppError('Pasajero no encontrado en el viaje', 404);

    pasajero.estado = 'bajado';
    pasajero.paradaBajada = paradaBajada || pasajero.destino || '';
    pasajero.fechaBajada = new Date();

    if (montoCobrado !== undefined && montoCobrado !== pasajero.montoPagado) {
      viaje.ingresoTotal = viaje.ingresoTotal - pasajero.montoPagado + montoCobrado;
      pasajero.montoPagado = montoCobrado;
    }

    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    getIO().emit('trip:updated', viajePopulado);

    res.json({ message: 'Bajada registrada', viaje: viajePopulado });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al registrar bajada' });
  }
});

export { router as viajesRoutes };
