import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Alert } from '../models/Alert';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/alertas - Listar alertas
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { leida, nivel, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (leida !== undefined) filter.leida = leida === 'true';
    if (nivel) filter.nivel = nivel;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [alertas, total] = await Promise.all([
      Alert.find(filter)
        .populate('vehiculoId', 'placa marca')
        .populate('choferId', 'nombre')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Alert.countDocuments(filter),
    ]);

    res.json({ alertas, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener alertas' });
  }
});

// GET /api/alertas/:id - Obtener alerta por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const alerta = await Alert.findById(req.params.id)
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre licencia')
      .populate('usuarioAtendio', 'nombre email');

    if (!alerta) {
      throw new AppError('Alerta no encontrada', 404);
    }
    res.json(alerta);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener alerta' });
  }
});

// PUT /api/alertas/:id/leer - Marcar alerta como leída
router.put('/:id/leer', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const alerta = await Alert.findByIdAndUpdate(
      req.params.id,
      { $set: { leida: true } },
      { new: true }
    );
    if (!alerta) {
      throw new AppError('Alerta no encontrada', 404);
    }
    res.json({ message: 'Alerta marcada como leída', alerta });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al marcar alerta' });
  }
});

// PUT /api/alertas/:id/atender - Atender alerta
router.put('/:id/atender', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const alerta = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          atendida: true,
          usuarioAtendio: req.user?._id,
          fechaAtencion: new Date(),
        },
      },
      { new: true }
    );
    if (!alerta) {
      throw new AppError('Alerta no encontrada', 404);
    }
    res.json({ message: 'Alerta atendida', alerta });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al atender alerta' });
  }
});

// POST /api/alertas - Crear alerta
router.post('/', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    const { tipo, titulo, descripcion, nivel, vehiculoId, choferId, viajeId } = req.body;

    if (!tipo || !titulo || !descripcion) {
      throw new AppError('tipo, titulo y descripcion son requeridos', 400);
    }

    const alerta = await Alert.create({
      tipo,
      titulo,
      descripcion,
      nivel: nivel || 'info',
      vehiculoId,
      choferId,
      viajeId,
      leida: false,
      atendida: false,
    });

    res.status(201).json(alerta);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear alerta' });
  }
});

// DELETE /api/alertas/:id - Eliminar alerta
router.delete('/:id', authenticate, requireRole('super-admin'), async (req: AuthRequest, res: Response) => {
  try {
    const alerta = await Alert.findByIdAndDelete(req.params.id);
    if (!alerta) {
      throw new AppError('Alerta no encontrada', 404);
    }
    res.json({ message: 'Alerta eliminada exitosamente' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al eliminar alerta' });
  }
});

export { router as alertasRoutes };
