import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/audit - Listar logs de auditoría
router.get('/', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: 'Listar logs de auditoría - próximamente' });
});

// GET /api/audit/:id - Obtener log de auditoría por ID
router.get('/:id', authenticate, requireRole('super-admin'), async (req, res) => {
  res.json({ message: `Obtener log de auditoría ${req.params.id} - próximamente` });
});

export { router as auditRoutes };
