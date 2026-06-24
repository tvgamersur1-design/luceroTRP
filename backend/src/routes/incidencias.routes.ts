import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Incident } from '../models/Incident';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/incidencias - Listar incidencias
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { estado, nivel, tipo, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (estado) filter.estado = estado;
    if (nivel) filter.nivel = nivel;
    if (tipo) filter.tipo = tipo;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [incidencias, total] = await Promise.all([
      Incident.find(filter)
        .populate('vehiculoId', 'placa marca')
        .populate('choferId', 'nombre')
        .populate('reportadoPor', 'nombre email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Incident.countDocuments(filter),
    ]);

    res.json({ incidencias, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener incidencias' });
  }
});

// GET /api/incidencias/:id - Obtener incidencia por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const incidencia = await Incident.findById(req.params.id)
      .populate('vehiculoId', 'placa marca modelo')
      .populate('choferId', 'nombre licencia telefono')
      .populate('reportadoPor', 'nombre email')
      .populate('resueltoPor', 'nombre email');

    if (!incidencia) {
      throw new AppError('Incidencia no encontrada', 404);
    }
    res.json(incidencia);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener incidencia' });
  }
});

// POST /api/incidencias - Crear incidencia
router.post('/', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    const { tipo, titulo, descripcion, nivel, vehiculoId, choferId, viajeId, ubicacion, coordenadas, testigos } = req.body;

    if (!tipo || !titulo || !descripcion) {
      throw new AppError('tipo, titulo y descripcion son requeridos', 400);
    }

    const incidencia = await Incident.create({
      tipo,
      titulo,
      descripcion,
      nivel: nivel || 'medio',
      vehiculoId,
      choferId,
      viajeId,
      ubicacion,
      coordenadas,
      testigos: testigos || [],
      estado: 'reportado',
      reportadoPor: req.user?._id,
    });

    res.status(201).json(incidencia);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear incidencia' });
  }
});

// PUT /api/incidencias/:id - Actualizar incidencia
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const incidencia = await Incident.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!incidencia) {
      throw new AppError('Incidencia no encontrada', 404);
    }
    res.json(incidencia);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar incidencia' });
  }
});

// PUT /api/incidencias/:id/resolver - Resolver incidencia
router.put('/:id/resolver', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { solucion } = req.body;

    const incidencia = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          estado: 'resuelto',
          solucion: solucion || 'Resuelta por administrador',
          resueltoPor: req.user?._id,
          fechaResolucion: new Date(),
        },
      },
      { new: true }
    );

    if (!incidencia) {
      throw new AppError('Incidencia no encontrada', 404);
    }
    res.json({ message: 'Incidencia resuelta', incidencia });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al resolver incidencia' });
  }
});

// POST /api/incidencias/:id/fotos - Agregar fotos a incidencia
router.post('/:id/fotos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fotos } = req.body;
    if (!fotos || !Array.isArray(fotos) || fotos.length === 0) {
      throw new AppError('fotos es requerido (array de base64 strings)', 400);
    }

    const incidencia = await Incident.findByIdAndUpdate(
      req.params.id,
      { $push: fotos.length === 1 ? { fotos: fotos[0] } : { $each: fotos } },
      { new: true }
    );

    if (!incidencia) {
      throw new AppError('Incidencia no encontrada', 404);
    }
    res.json(incidencia);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al subir fotos' });
  }
});

export { router as incidenciasRoutes };
