import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
}

// POST /api/errors - Log frontend errors
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { message, stack, componentStack, url, userAgent, timestamp } = req.body as ErrorReport;

    if (!message) {
      return res.status(400).json({ message: 'message is required' });
    }

    // Log to file via logger
    logger.error(`[Frontend Error] ${message}`, {
      stack,
      componentStack,
      url: url || req.headers.referer,
      userAgent: userAgent || req.headers['user-agent'],
      timestamp: timestamp || new Date().toISOString(),
      userId: req.user?._id || 'anonymous',
      ip: req.ip,
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    // Don't let error reporting fail the client
    console.error('[Error reporting] Failed to log error:', error);
    res.status(201).json({ ok: true }); // Still return 201 to not block client
  }
});

export { router as errorsRoutes };
