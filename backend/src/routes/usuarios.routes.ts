import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/usuarios - Listar usuarios
router.get('/', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: 'Listar usuarios - próximamente' });
});

// GET /api/usuarios/:id - Obtener usuario por ID
router.get('/:id', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: `Obtener usuario ${req.params.id} - próximamente` });
});

// POST /api/usuarios - Crear usuario
router.post('/', authenticate, requireRole('super-admin'), async (req, res) => {
  res.status(201).json({ message: 'Crear usuario - próximamente' });
});

// PUT /api/usuarios/:id - Actualizar usuario
router.put('/:id', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: `Actualizar usuario ${req.params.id} - próximamente` });
});

// DELETE /api/usuarios/:id - Eliminar usuario
router.delete('/:id', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: `Eliminar usuario ${req.params.id} - próximamente` });
});

export { router as usuariosRoutes };
