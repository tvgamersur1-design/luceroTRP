import { Router, Response } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { Passenger } from '../models/Passenger';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/pasajeros - Listar pasajeros
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};

    if (search) {
      const term = search as string;
      filter.$or = [
        { nombre: { $regex: term, $options: 'i' } },
        { dni: { $regex: term, $options: 'i' } },
        { telefono: { $regex: term, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [pasajeros, total] = await Promise.all([
      Passenger.find(filter).sort({ nombre: 1 }).skip(skip).limit(limitNum),
      Passenger.countDocuments(filter),
    ]);

    res.json({ pasajeros, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener pasajeros' });
  }
});

// GET /api/pasajeros/:id - Obtener pasajero por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pasajero = await Passenger.findById(req.params.id);
    if (!pasajero) {
      throw new AppError('Pasajero no encontrado', 404);
    }
    res.json(pasajero);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al obtener pasajero' });
  }
});

// POST /api/pasajeros - Crear pasajero
router.post('/', authenticate, requireRole('super-admin', 'admin', 'chofer'), async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, dni, telefono, email } = req.body;

    if (!nombre) {
      throw new AppError('El nombre es requerido', 400);
    }

    if (dni) {
      const existing = await Passenger.findOne({ dni });
      if (existing) {
        return res.json(existing);
      }
    }

    const pasajero = await Passenger.create({
      nombre,
      dni,
      telefono,
      email,
      totalViajes: 0,
      montoTotalGastado: 0,
    });

    res.status(201).json(pasajero);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al crear pasajero' });
  }
});

// PUT /api/pasajeros/:id - Actualizar pasajero
router.put('/:id', authenticate, requireRole('super-admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pasajero = await Passenger.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!pasajero) {
      throw new AppError('Pasajero no encontrado', 404);
    }

    res.json(pasajero);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar pasajero' });
  }
});

export { router as pasajerosRoutes };
