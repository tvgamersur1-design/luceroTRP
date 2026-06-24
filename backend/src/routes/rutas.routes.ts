import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Route } from '../models/Route';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/rutas - Listar rutas
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activa, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (activa !== undefined) filter.activa = activa === 'true';

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [rutas, total] = await Promise.all([
      Route.find(filter).sort({ nombre: 1 }).skip(skip).limit(limitNum),
      Route.countDocuments(filter),
    ]);

    res.json({ rutas, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener rutas' });
  }
});

// GET /api/rutas/:id - Obtener ruta por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ruta = await Route.findById(req.params.id);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    res.json(ruta);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener ruta' });
  }
});

// POST /api/rutas - Crear ruta
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, origen, destino, paradas, tiempoEstimadoMin, terreno, origenesExtendidos, destinosExtendidos } = req.body;

    if (!nombre || !origen || !destino || !tiempoEstimadoMin) {
      throw new AppError('nombre, origen, destino y tiempoEstimadoMin son requeridos', 400);
    }

    const ruta = await Route.create({
      nombre,
      origen,
      destino,
      paradas: paradas || [],
      tiempoEstimadoMin,
      terreno: terreno || '',
      origenesExtendidos: origenesExtendidos || [],
      destinosExtendidos: destinosExtendidos || [],
      activa: true,
    });

    res.status(201).json(ruta);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear ruta' });
  }
});

// PUT /api/rutas/:id - Actualizar ruta
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const ruta = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    res.json(ruta);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar ruta' });
  }
});

// DELETE /api/rutas/:id - Eliminar ruta (desactivar)
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const ruta = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: { activa: false } },
      { new: true }
    );
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    res.json({ message: 'Ruta desactivada exitosamente', ruta });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al desactivar ruta' });
  }
});

export { router as rutasRoutes };
