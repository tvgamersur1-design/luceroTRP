import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Location } from '../models/Location';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// POST /api/location - Guardar ubicación GPS
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng, velocidad, direccion, viajeId, vehiculoId } = req.body;

    if (lat === undefined || lng === undefined) {
      throw new AppError('lat y lng son requeridos', 400);
    }

    const location = await Location.create({
      choferId: req.user?._id,
      vehiculoId,
      viajeId,
      lat,
      lng,
      velocidad,
      direccion,
      timestamp: new Date(),
    });

    res.status(201).json(location);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al guardar ubicación' });
  }
});

// GET /api/location/chofer/:choferId - Última ubicación de un chofer
router.get('/chofer/:choferId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const location = await Location.findOne({ choferId: req.params.choferId })
      .sort({ timestamp: -1 })
      .lean();

    res.json(location || null);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener ubicación' });
  }
});

// GET /api/location/activas - Todas las ubicaciones activas (últimos 10 min)
router.get('/activas', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const locations = await Location.aggregate([
      { $match: { timestamp: { $gt: tenMinAgo } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$choferId',
          lat: { $first: '$lat' },
          lng: { $first: '$lng' },
          velocidad: { $first: '$velocidad' },
          direccion: { $first: '$direccion' },
          timestamp: { $first: '$timestamp' },
          viajeId: { $first: '$viajeId' },
          vehiculoId: { $first: '$vehiculoId' },
        },
      },
    ]);

    res.json(locations);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener ubicaciones activas' });
  }
});

// GET /api/location/trail/:viajeId - Historial de ubicación de un viaje
router.get('/trail/:viajeId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const locations = await Location.find({ viajeId: req.params.viajeId })
      .sort({ timestamp: 1 })
      .select('lat lng velocidad direccion timestamp')
      .lean();

    res.json(locations);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial de ubicación' });
  }
});

export { router as locationRoutes };
