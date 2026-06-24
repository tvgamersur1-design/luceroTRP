import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Horario } from '../models/Horario';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/horarios - Listar horarios
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { activo } = req.query;
    const filter: Record<string, unknown> = {};
    if (activo !== undefined) filter.activo = activo === 'true';

    const horarios = await Horario.find(filter).sort({ hora: 1 });
    res.json({ horarios });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener horarios' });
  }
});

// POST /api/horarios - Crear horario
router.post('/', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { hora, label } = req.body;

    if (!hora || !label) {
      throw new AppError('hora y label son requeridos', 400);
    }

    const horario = await Horario.create({
      hora,
      label,
      activo: true,
      adminId: req.user?._id || null,
    });

    res.status(201).json(horario);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear horario' });
  }
});

// PUT /api/horarios/:id - Actualizar horario
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const horario = await Horario.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!horario) {
      throw new AppError('Horario no encontrado', 404);
    }
    res.json(horario);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar horario' });
  }
});

// DELETE /api/horarios/:id - Eliminar horario
router.delete('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const horario = await Horario.findByIdAndDelete(req.params.id);
    if (!horario) {
      throw new AppError('Horario no encontrado', 404);
    }
    res.json({ message: 'Horario eliminado exitosamente' });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al eliminar horario' });
  }
});

export { router as horariosRoutes };
