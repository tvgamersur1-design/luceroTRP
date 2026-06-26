import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Trip } from '../models/Trip';
import { Driver } from '../models/Driver';
import { AppError } from '../middleware/errorHandler';
import { getIO } from '../websocket/socket';

const router = Router();

// GET /api/viajes - Listar viajes
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { estado, fecha, choferId, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};

    if (estado) filter.estado = estado;
    if (fecha) filter.fechaInicio = { $gte: new Date(fecha as string) };
    if (choferId) filter.choferId = choferId;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [viajes, total] = await Promise.all([
      Trip.find(filter)
        .populate('rutaId', 'nombre origen destino')
        .populate('vehiculoId', 'placa marca modelo')
        .populate('choferId', 'nombre')
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
      .populate('rutaId', 'nombre origen destino paradas distanciaKm')
      .populate('vehiculoId', 'placa marca modelo capacidad color')
      .populate('choferId', 'nombre licencia telefono')
      .populate('pasajeros.pasajeroId', 'nombre dni telefono');

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
    const { pasajeroId, montoPagado, metodoPago } = req.body;

    if (!pasajeroId || !montoPagado || !metodoPago) {
      throw new AppError('pasajeroId, montoPagado y metodoPago son requeridos', 400);
    }

    const viaje = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          pasajeros: {
            pasajeroId,
            montoPagado,
            metodoPago,
            timestamp: new Date(),
          },
        },
        $inc: { ingresoTotal: montoPagado },
      },
      { new: true, runValidators: true }
    );

    if (!viaje) {
      throw new AppError('Viaje no encontrado', 404);
    }

    res.json({ message: 'Pasajero agregado al viaje', viaje });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al agregar pasajero' });
  }
});

export { router as viajesRoutes };
