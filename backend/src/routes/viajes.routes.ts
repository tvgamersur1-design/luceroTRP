import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Trip } from '../models/Trip';
import { Driver } from '../models/Driver';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { getIO } from '../websocket/socket';
import { sendPushToUser } from '../services/push';

const router = Router();

// Helper: emit trip update to admins + trip room + driver room
function emitTripUpdate(viajePopulated: any) {
  const io = getIO();
  const tripId = viajePopulated?._id?.toString();
  const choferId = typeof viajePopulated?.choferId === 'object' && viajePopulated?.choferId !== null
    ? viajePopulated.choferId._id?.toString() || viajePopulated.choferId.toString()
    : viajePopulated?.choferId?.toString();

  io.to('admins').to(`trip:${tripId}`).emit('trip:updated', viajePopulated);
  if (choferId) {
    io.to(`driver:${choferId}`).emit('trip:updated', viajePopulated);
  }
}

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
    const { estado, fecha, fechaFin, choferId, page = '1', limit = '50' } = req.query;
    const filter: Record<string, unknown> = {};

    if (fecha || fechaFin) {
      const dateFilter: Record<string, Date> = {};
      if (fecha) dateFilter.$gte = new Date(fecha as string);
      if (fechaFin) {
        const end = new Date(fechaFin as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      filter.fechaInicio = dateFilter;
    }

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

    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:created', viajePopulado);
    getIO().to(`driver:${choferId}`).emit('trip:created', viajePopulado);

    // Send push notification to the assigned driver
    try {
      const driver = await Driver.findById(choferId).populate('userId', 'nombre');
      const driverUser = driver?.userId as any;
      const ruta = viajePopulado?.rutaId as any;
      const vehiculo = viajePopulado?.vehiculoId as any;
      const fechaLabel = new Date(fechaInicio).toLocaleDateString('es-PE');
      const horaLabel = horaSalida || new Date(fechaInicio).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      if (driverUser?._id && viajePopulado) {
        await sendPushToUser(
          driverUser._id.toString(),
          '🚗 Viaje asignado',
          `${ruta?.nombre || 'Ruta'} • ${vehiculo?.placa || ''} • ${fechaLabel} ${horaLabel}`,
          { viajeId: viaje._id.toString(), type: 'trip_assigned' }
        );
      }
      // Notify ayudantes (assistants)
      if (ayudantes && ayudantes.length > 0) {
        for (const ay of ayudantes) {
          try {
            const ayDriver = await Driver.findById(ay.choferId).populate('userId', 'nombre');
            const ayUser = ayDriver?.userId as any;
            if (ayUser?._id) {
              await sendPushToUser(
                ayUser._id.toString(),
                '🚗 Te asignaron como ayudante',
                `${ruta?.nombre || 'Ruta'} • ${vehiculo?.placa || ''} • ${fechaLabel} ${horaLabel}`,
                { viajeId: viaje._id.toString(), type: 'trip_assigned' }
              );
            }
          } catch (ayErr) {
            console.error('Error sending push to ayudante:', ayErr);
          }
        }
      }
    } catch (pushErr) {
      console.error('Error sending trip assignment push:', pushErr);
    }

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

    emitTripUpdate(viaje);

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

    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:deleted', viaje._id.toString());

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

    const viajeActual = await Trip.findById(req.params.id);
    if (!viajeActual) {
      throw new AppError('Viaje no encontrado', 404);
    }
    if (viajeActual.estado !== 'planificado') {
      throw new AppError(`No se puede iniciar un viaje en estado "${viajeActual.estado}"`, 400);
    }

    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: { estado: 'en_transito', fechaInicioReal: new Date() } },
      { new: true }
    )
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:updated', viaje);
    const choferObj = viaje.choferId as any;
    const choferRoomId = choferObj?._id?.toString() || (typeof viaje.choferId === 'string' ? viaje.choferId : '');
    if (choferRoomId) getIO().to(`driver:${choferRoomId}`).emit('trip:updated', viaje);

    // P2 FIX: Emit trip:started so frontend can show real-time notification
    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:started', { viajeId: viaje._id });
    if (choferRoomId) getIO().to(`driver:${choferRoomId}`).emit('trip:started', { viajeId: viaje._id });

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

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    // Validaciones
    const pasajerosPendientes = viaje.pasajeros.filter(
      p => p.estado !== 'bajado' && p.estado !== 'no_llegado'
    );
    const totalPasajeros = viaje.pasajeros.length;

    if (totalPasajeros === 0) {
      throw new AppError('Debe agregar al menos 1 pasajero antes de completar el viaje', 400);
    }

    if (pasajerosPendientes.length > 0) {
      const nombres = pasajerosPendientes.map(p => {
        const name = (p.pasajeroId as any)?.nombre || 'Pasajero';
        return `${name} (${p.estado})`;
      }).join(', ');
      throw new AppError(
        `Hay ${pasajerosPendientes.length} pasajero(s) pendiente(s): ${nombres}. Marque todos como bajado o no_llegado antes de completar.`,
        400
      );
    }

    // Guardar egresos
    const { egresos = [] } = req.body;

    const viajeActualizado = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          estado: 'completado',
          fechaFin: new Date(),
          egresos: egresos.map((e: any) => ({
            concepto: e.concepto,
            monto: e.monto,
            categoria: e.categoria || 'otro',
            timestamp: new Date(),
          })),
        },
      },
      { new: true }
    )
      .populate('rutaId', 'nombre origen destino')
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre');

    if (!viajeActualizado) throw new AppError('Error al actualizar viaje', 500);

    emitTripUpdate(viajeActualizado);

    res.json({ message: 'Viaje completado', viaje: viajeActualizado });
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

    // Seat conflict detection: check if any existing passenger already has these seats
    if (asientos && asientos.length > 0) {
      const viajeActual = await Trip.findById(req.params.id);
      if (viajeActual) {
        for (const num of asientos) {
          const occupant = viajeActual.pasajeros.find((p: any) =>
            p.asientos?.includes(num) &&
            p.estado !== 'bajado' &&
            p.estado !== 'no_llegado'
          );
          if (occupant) {
            const occupantName = (occupant.pasajeroId as any)?.nombre || 'Otro pasajero';
            throw new AppError(`Asiento #${num} ya esta ocupado por ${occupantName}`, 409);
          }
        }
      }
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

    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:updated', viaje);
    const addChoferObj = viaje.choferId as any;
    const addChoferRoom = addChoferObj?._id?.toString() || (typeof viaje.choferId === 'string' ? viaje.choferId : '');
    if (addChoferRoom) getIO().to(`driver:${addChoferRoom}`).emit('trip:updated', viaje);

    // P1 FIX: Emit granular passenger event for real-time seat map updates
    const newPassenger = viaje.pasajeros[viaje.pasajeros.length - 1];
    getIO().to('admins').to(`trip:${viaje._id}`).emit('trip:passenger-added', {
      viajeId: viaje._id,
      pasajero: newPassenger,
    });
    if (addChoferRoom) getIO().to(`driver:${addChoferRoom}`).emit('trip:passenger-added', {
      viajeId: viaje._id,
      pasajero: newPassenger,
    });

    // Send push notification — notify everyone EXCEPT who added the passenger
    try {
      const addedByUserId = req.user?._id?.toString();
      const passengerDoc = viaje.pasajeros[viaje.pasajeros.length - 1];
      const passengerName = (passengerDoc?.pasajeroId as any)?.nombre || 'Pasajero';
      const destino = passengerDoc?.destino || 'sin destino';
      const asientos = passengerDoc?.asientos?.join(', ') || 'sin asiento';

      // Determine who added this passenger (name for the message)
      const addedByUser = await User.findById(addedByUserId).select('nombre rol');
      const addedByName = addedByUser?.nombre || 'Alguien';
      const addedByRol = addedByUser?.rol || '';

      // Build the message
      const title = '👤 Pasajero agregado';
      let body = '';

      if (addedByRol === 'chofer') {
        body = `${addedByName} agregó a ${passengerName} → ${destino} (${asientos})`;
      } else if (addedByRol === 'admin' || addedByRol === 'super-admin') {
        body = `Admin agregó a ${passengerName} → ${destino} (${asientos})`;
      } else {
        body = `${addedByName} agregó a ${passengerName} → ${destino} (${asientos})`;
      }

      // Collect all user IDs to notify (chofer + ayudantes + admins, minus who added)
      const userIdsToNotify: string[] = [];

      // 1. Notify the chofer (if not the one who added)
      const choferUserId = (viaje.choferId as any)?.userId?._id?.toString()
        || (viaje.choferId as any)?.userId?.toString()
        || (typeof viaje.choferId === 'string' ? viaje.choferId : '');
      if (choferUserId && choferUserId !== addedByUserId) {
        userIdsToNotify.push(choferUserId);
      }

      // 2. Notify ayudantes (if not the one who added)
      if (viaje.ayudantes && viaje.ayudantes.length > 0) {
        for (const ay of viaje.ayudantes) {
          try {
            const ayDriverId = (ay.choferId as any)?._id || ay.choferId;
            if (ayDriverId) {
              const ayDriver = await Driver.findById(ayDriverId).populate('userId', '_id');
              const ayUserId = (ayDriver?.userId as any)?._id?.toString() || (ayDriver?.userId as any)?.toString();
              if (ayUserId && ayUserId !== addedByUserId) {
                userIdsToNotify.push(ayUserId);
              }
            }
          } catch { /* skip */ }
        }
      }

      // 3. Notify all admins (if not the one who added)
      const admins = await User.find({ rol: { $in: ['admin', 'super-admin'] } }).select('_id');
      for (const admin of admins) {
        const adminId = admin._id.toString();
        if (adminId !== addedByUserId) {
          userIdsToNotify.push(adminId);
        }
      }

      // Send push to all collected users
      const uniqueIds = [...new Set(userIdsToNotify)];
      for (const uid of uniqueIds) {
        await sendPushToUser(uid, title, body, {
          viajeId: viaje._id.toString(),
          type: 'passenger_added',
        });
      }

      console.log(`[Push] Passenger added: notified ${uniqueIds.length} users (skipped ${addedByName})`);
    } catch (pushErr) {
      console.error('Error sending passenger push:', pushErr);
    }

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

    // Seat conflict detection: check if any OTHER passenger already has these seats
    for (const num of asientos) {
      const occupant = viaje.pasajeros.find((p: any) =>
        p.pasajeroId?.toString() !== pasajero.pasajeroId?.toString() &&
        p.asientos?.includes(num) &&
        p.estado !== 'bajado' &&
        p.estado !== 'no_llegado'
      );
      if (occupant) {
        const occupantName = (occupant.pasajeroId as any)?.nombre || 'Otro pasajero';
        throw new AppError(`Asiento #${num} ya esta ocupado por ${occupantName}`, 409);
      }
    }

    pasajero.asientos = asientos;
    pasajero.estado = 'abordado';
    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    getIO().to('admins').to(`trip:${viajePopulado?._id}`).emit('trip:updated', viajePopulado);
    const seatChoferObj = viajePopulado?.choferId as any;
    const seatChoferRoom = seatChoferObj?._id?.toString() || (typeof viajePopulado?.choferId === 'string' ? viajePopulado?.choferId : '');
    if (seatChoferRoom) getIO().to(`driver:${seatChoferRoom}`).emit('trip:updated', viajePopulado);

    // P1 FIX: Emit granular passenger seat change event
    getIO().to('admins').to(`trip:${viajePopulado?._id}`).emit('trip:passenger-seat-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      asientos,
    });
    if (seatChoferRoom) getIO().to(`driver:${seatChoferRoom}`).emit('trip:passenger-seat-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      asientos,
    });

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

    const TRANSICIONES: Record<string, string[]> = {
      reservado: ['en_terminal', 'en_camino', 'no_llegado'],
      en_terminal: ['abordado', 'no_llegado'],
      en_camino: ['abordado', 'no_llegado'],
      abordado: ['bajado'],
      no_llegado: [],
      bajado: [],
    };

    const permitidos = TRANSICIONES[pasajero.estado] || [];
    if (!permitidos.includes(estado)) {
      throw new AppError(`No se puede cambiar de "${pasajero.estado}" a "${estado}"`, 400);
    }

    pasajero.estado = estado;
    // Liberar asiento si el pasajero no llego
    if (estado === 'no_llegado') {
      pasajero.asientos = [];
      if (pasajero.montoPagado > 0) {
        viaje.ingresoTotal = Math.max(0, viaje.ingresoTotal - pasajero.montoPagado);
        pasajero.montoPagado = 0;
      }
    }
    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    emitTripUpdate(viajePopulado);

    // P1 FIX: Emit granular passenger state change event
    const estadoChoferObj = viajePopulado?.choferId as any;
    const estadoChoferRoom = estadoChoferObj?._id?.toString() || (typeof viajePopulado?.choferId === 'string' ? viajePopulado?.choferId : '');
    getIO().to('admins').to(`trip:${viajePopulado?._id}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado,
      nombre: (pasajero?.pasajeroId as any)?.nombre,
    });
    if (estadoChoferRoom) getIO().to(`driver:${estadoChoferRoom}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado,
      nombre: (pasajero?.pasajeroId as any)?.nombre,
    });

    // Notify everyone about status change (except who did it)
    try {
      const statusByUserId = req.user?._id?.toString();
      const nombrePax = (pasajero?.pasajeroId as any)?.nombre || 'Pasajero';
      const estadoLabels: Record<string, string> = {
        reservado: '📌 Reservado',
        en_terminal: '🏢 En terminal',
        abordado: '🚌 Abordado',
        no_llegado: '❌ No llegó',
        bajado: '✅ Bajado',
        en_camino: '🚗 En camino',
      };

      const statusByUser = await User.findById(statusByUserId).select('nombre rol');
      const statusByName = statusByUser?.nombre || 'Alguien';

      const title = `${estadoLabels[estado] || '🔄 Estado'}`;
      const body = `${statusByName} marcó a ${nombrePax} como "${estado}"`;

      const userIdsToNotify: string[] = [];

      // Notify chofer
      const statusChoferUserId = (viaje.choferId as any)?.userId?._id?.toString()
        || (viaje.choferId as any)?.userId?.toString()
        || '';
      if (statusChoferUserId && statusChoferUserId !== statusByUserId) userIdsToNotify.push(statusChoferUserId);

      // Notify ayudantes
      if (viaje.ayudantes && viaje.ayudantes.length > 0) {
        for (const ay of viaje.ayudantes) {
          try {
            const ayDriverId = (ay.choferId as any)?._id || ay.choferId;
            const ayDriver = await Driver.findById(ayDriverId).populate('userId', '_id');
            const ayUserId = (ayDriver?.userId as any)?._id?.toString();
            if (ayUserId && ayUserId !== statusByUserId) userIdsToNotify.push(ayUserId);
          } catch { /* skip */ }
        }
      }

      // Notify admins
      const admins = await User.find({ rol: { $in: ['admin', 'super-admin'] } }).select('_id');
      for (const admin of admins) {
        if (admin._id.toString() !== statusByUserId) userIdsToNotify.push(admin._id.toString());
      }

      const uniqueIds = [...new Set(userIdsToNotify)];
      for (const uid of uniqueIds) {
        await sendPushToUser(uid, title, body, { viajeId: viaje._id.toString(), type: 'passenger_status' });
      }
    } catch (pushErr) {
      console.error('Error sending status push:', pushErr);
    }

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

    const { paradaBajada, montoCobrado, metodoPago } = req.body;

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    const pasajero = viaje.pasajeros.find((p: any) => p._id?.toString() === req.params.pid || p.pasajeroId?.toString() === req.params.pid);
    if (!pasajero) throw new AppError('Pasajero no encontrado en el viaje', 404);

    pasajero.estado = 'bajado';
    pasajero.paradaBajada = paradaBajada || pasajero.destino || '';
    pasajero.fechaBajada = new Date();

    if (metodoPago && metodoPago !== 'pendiente') {
      pasajero.metodoPago = metodoPago;
    }

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

    emitTripUpdate(viajePopulado);

    // P1 FIX: Emit granular passenger state change for dropoff
    const dropChoferObj = viajePopulado?.choferId as any;
    const dropChoferRoom = dropChoferObj?._id?.toString() || (typeof viajePopulado?.choferId === 'string' ? viajePopulado?.choferId : '');
    const dropNombrePax = (pasajero?.pasajeroId as any)?.nombre || 'Pasajero';
    getIO().to('admins').to(`trip:${viajePopulado?._id}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado: 'bajado',
      nombre: dropNombrePax,
    });
    if (dropChoferRoom) getIO().to(`driver:${dropChoferRoom}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado: 'bajado',
      nombre: dropNombrePax,
    });

    // Notify everyone about passenger drop-off (except who did it)
    try {
      const dropByUserId = req.user?._id?.toString();
      const pasajeroInfo = viajePopulado?.pasajeros?.find((p: any) =>
        p._id?.toString() === req.params.pid || p.pasajeroId?._id?.toString() === req.params.pid
      );
      const nombrePax = (pasajeroInfo?.pasajeroId as any)?.nombre || 'Pasajero';
      const monto = pasajeroInfo?.montoPagado || montoCobrado || 0;
      const metodo = pasajeroInfo?.metodoPago || metodoPago || 'pendiente';
      const parada = paradaBajada || pasajero.destino || 'parada';

      const dropByUser = await User.findById(dropByUserId).select('nombre rol');
      const dropByName = dropByUser?.nombre || 'Alguien';

      const title = '✅ Pasajero bajado';
      const body = `${dropByName} dejó a ${nombrePax} en ${parada} • S/.${monto} (${metodo})`;

      const userIdsToNotify: string[] = [];

      // Notify chofer
      const dropChoferUserId = (viaje.choferId as any)?.userId?._id?.toString()
        || (viaje.choferId as any)?.userId?.toString()
        || '';
      if (dropChoferUserId && dropChoferUserId !== dropByUserId) userIdsToNotify.push(dropChoferUserId);

      // Notify ayudantes
      if (viaje.ayudantes && viaje.ayudantes.length > 0) {
        for (const ay of viaje.ayudantes) {
          try {
            const ayDriverId = (ay.choferId as any)?._id || ay.choferId;
            const ayDriver = await Driver.findById(ayDriverId).populate('userId', '_id');
            const ayUserId = (ayDriver?.userId as any)?._id?.toString();
            if (ayUserId && ayUserId !== dropByUserId) userIdsToNotify.push(ayUserId);
          } catch { /* skip */ }
        }
      }

      // Notify admins
      const admins = await User.find({ rol: { $in: ['admin', 'super-admin'] } }).select('_id');
      for (const admin of admins) {
        if (admin._id.toString() !== dropByUserId) userIdsToNotify.push(admin._id.toString());
      }

      const uniqueIds = [...new Set(userIdsToNotify)];
      for (const uid of uniqueIds) {
        await sendPushToUser(uid, title, body, { viajeId: viaje._id.toString(), type: 'passenger_dropoff' });
      }
    } catch (pushErr) {
      console.error('Error sending dropoff push:', pushErr);
    }

    res.json({ message: 'Bajada registrada', viaje: viajePopulado });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al registrar bajada' });
  }
});

// PUT /api/viajes/:id/pasajeros/:pid/no-llegado - Marcar pasajero como no llegado
router.put('/:id/pasajeros/:pid/no-llegado', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!await canModifyTrip(req, req.params.id)) {
      throw new AppError('No tienes permiso para modificar este viaje', 403);
    }

    const viaje = await Trip.findById(req.params.id);
    if (!viaje) throw new AppError('Viaje no encontrado', 404);

    const pasajero = viaje.pasajeros.find((p: any) =>
      p._id?.toString() === req.params.pid || p.pasajeroId?.toString() === req.params.pid
    );
    if (!pasajero) throw new AppError('Pasajero no encontrado en el viaje', 404);

    // Restar del ingresoTotal si tenía monto
    if (pasajero.montoPagado > 0) {
      viaje.ingresoTotal = Math.max(0, viaje.ingresoTotal - pasajero.montoPagado);
      pasajero.montoPagado = 0;
    }

    // Liberar asiento
    pasajero.asientos = [];
    pasajero.estado = 'no_llegado';
    await viaje.save();

    const viajePopulado = await Trip.findById(req.params.id)
      .populate('rutaId', 'nombre origen destino paradas tiempoEstimadoMin')
      .populate('vehiculoId', 'placa marca modelo capacidad configuracionAsientos')
      .populate('choferId', 'nombre licencia telefono userId')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono')
      .populate('pasajeros.tarifaId', 'nombre precio origenTramo destinoTramo');

    emitTripUpdate(viajePopulado);

    // P1 FIX: Emit granular passenger state change for no-llegado
    const nlChoferObj = viajePopulado?.choferId as any;
    const nlChoferRoom = nlChoferObj?._id?.toString() || (typeof viajePopulado?.choferId === 'string' ? viajePopulado?.choferId : '');
    getIO().to('admins').to(`trip:${viajePopulado?._id}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado: 'no_llegado',
      nombre: (pasajero?.pasajeroId as any)?.nombre,
    });
    if (nlChoferRoom) getIO().to(`driver:${nlChoferRoom}`).emit('trip:passenger-state-changed', {
      viajeId: viajePopulado?._id,
      pasajeroId: req.params.pid,
      estado: 'no_llegado',
      nombre: (pasajero?.pasajeroId as any)?.nombre,
    });

    res.json({ message: 'Pasajero marcado como no llegado', viaje: viajePopulado });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al marcar no llegado' });
  }
});

export { router as viajesRoutes };
