import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Fare } from '../models/Fare';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/tarifas - Listar tarifas
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activa, rutaId, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (activa !== undefined) filter.activa = activa === 'true';
    if (rutaId) filter.rutaId = rutaId;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [tarifas, total] = await Promise.all([
      Fare.find(filter)
        .populate('rutaId', 'nombre origen destino')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Fare.countDocuments(filter),
    ]);

    res.json({ tarifas, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tarifas' });
  }
});

// GET /api/tarifas/:id - Obtener tarifa por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tarifa = await Fare.findById(req.params.id).populate('rutaId', 'nombre origen destino');
    if (!tarifa) {
      throw new AppError('Tarifa no encontrada', 404);
    }
    res.json(tarifa);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener tarifa' });
  }
});

// POST /api/tarifas - Crear tarifa
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { rutaId, nombre, origenTramo, destinoTramo, distanciaKm, precio, moneda, fechaVigencia } = req.body;

    if (!rutaId || !nombre || !precio) {
      throw new AppError('rutaId, nombre y precio son requeridos', 400);
    }

    const tarifa = await Fare.create({
      rutaId,
      nombre,
      origenTramo: origenTramo || '',
      destinoTramo: destinoTramo || '',
      distanciaKm: distanciaKm || 0,
      precio,
      moneda: moneda || 'PEN',
      activa: true,
      fechaVigencia: fechaVigencia ? new Date(fechaVigencia) : undefined,
    });

    const tarifaPopulada = await Fare.findById(tarifa._id).populate('rutaId', 'nombre origen destino');

    res.status(201).json(tarifaPopulada);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear tarifa' });
  }
});

// PUT /api/tarifas/:id - Actualizar tarifa
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tarifa = await Fare.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('rutaId', 'nombre origen destino');

    if (!tarifa) {
      throw new AppError('Tarifa no encontrada', 404);
    }
    res.json(tarifa);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar tarifa' });
  }
});

// DELETE /api/tarifas/:id - Eliminar tarifa (desactivar)
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tarifa = await Fare.findByIdAndUpdate(
      req.params.id,
      { $set: { activa: false } },
      { new: true }
    );
    if (!tarifa) {
      throw new AppError('Tarifa no encontrada', 404);
    }
    res.json({ message: 'Tarifa desactivada exitosamente', tarifa });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al desactivar tarifa' });
  }
});

export { router as tarifasRoutes };
