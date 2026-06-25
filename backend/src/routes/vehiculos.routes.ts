import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Vehicle } from '../models/Vehicle';
import { AppError } from '../middleware/errorHandler';
import { getIO } from '../websocket/socket';

const router = Router();

// GET /api/vehiculos - Listar vehículos
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activo, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (activo !== undefined) filter.activo = activo === 'true';

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [vehiculos, total] = await Promise.all([
      Vehicle.find(filter).sort({ placa: 1 }).skip(skip).limit(limitNum),
      Vehicle.countDocuments(filter),
    ]);

    res.json({ vehiculos, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener vehículos' });
  }
});

// GET /api/vehiculos/:id - Obtener vehículo por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const vehiculo = await Vehicle.findById(req.params.id);
    if (!vehiculo) {
      throw new AppError('Vehículo no encontrado', 404);
    }
    res.json(vehiculo);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener vehículo' });
  }
});

// POST /api/vehiculos - Crear vehículo
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { placa, marca, modelo, anio, capacidad, color, configuracionAsientos } = req.body;

    if (!placa || !marca || !modelo || !anio || !capacidad || !color) {
      throw new AppError('Todos los campos son requeridos', 400);
    }

    const existingPlaca = await Vehicle.findOne({ placa: placa.toUpperCase() });
    if (existingPlaca) {
      throw new AppError('Ya existe un vehículo con esa placa', 409);
    }

    const vehiculo = await Vehicle.create({
      placa: placa.toUpperCase(),
      marca,
      modelo,
      anio,
      capacidad,
      color,
      configuracionAsientos: configuracionAsientos || [],
      activo: true,
    });

    getIO().emit('vehicle:created', vehiculo);
    res.status(201).json(vehiculo);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear vehículo' });
  }
});

// PUT /api/vehiculos/:id - Actualizar vehículo
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const vehiculo = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!vehiculo) {
      throw new AppError('Vehículo no encontrado', 404);
    }
    getIO().emit('vehicle:updated', vehiculo);
    res.json(vehiculo);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar vehículo' });
  }
});

// DELETE /api/vehiculos/:id - Eliminar vehículo (desactivar)
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const vehiculo = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { $set: { activo: false } },
      { new: true }
    );
    if (!vehiculo) {
      throw new AppError('Vehículo no encontrado', 404);
    }
    getIO().emit('vehicle:deleted', req.params.id);
    res.json({ message: 'Vehículo desactivado exitosamente', vehiculo });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al desactivar vehículo' });
  }
});

// PUT /api/vehiculos/:id/ubicacion - Actualizar ubicación GPS
router.put('/:id/ubicacion', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      throw new AppError('lat y lng son requeridos', 400);
    }

    const vehiculo = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'ultimaUbicacion.type': 'Point',
          'ultimaUbicacion.coordinates': [lng, lat],
        },
      },
      { new: true }
    );

    if (!vehiculo) {
      throw new AppError('Vehículo no encontrado', 404);
    }

    res.json({ message: 'Ubicación actualizada', vehiculo });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar ubicación' });
  }
});

export { router as vehiculosRoutes };
