import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { DeviceToken } from '../models/DeviceToken';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/notifications/register-token — Registrar FCM token
router.post('/register-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { fcmToken, platform } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: 'fcmToken es requerido' });
    }

    await DeviceToken.findOneAndUpdate(
      { fcmToken },
      {
        userId,
        fcmToken,
        platform: platform || 'android',
        active: true,
      },
      { upsert: true, new: true }
    );

    logger.info(`FCM token registrado para usuario ${userId}`);
    res.json({ message: 'Token registrado' });
  } catch (error) {
    logger.error('Error registrando token:', error);
    res.status(500).json({ message: 'Error al registrar token' });
  }
});

// DELETE /api/notifications/unregister-token — Remover FCM token
router.delete('/unregister-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: 'fcmToken es requerido' });
    }

    await DeviceToken.findOneAndDelete({ fcmToken });
    logger.info(`FCM token removido`);
    res.json({ message: 'Token removido' });
  } catch (error) {
    logger.error('Error removiendo token:', error);
    res.status(500).json({ message: 'Error al remover token' });
  }
});

export { router as notificationsRoutes };
