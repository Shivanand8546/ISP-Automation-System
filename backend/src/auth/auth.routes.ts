import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const router = Router();

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', authLimiter, authController.register.bind(authController));
router.post('/login', authLimiter, authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));

// Protected routes
router.post('/logout', authenticate, authController.logout.bind(authController));
router.get('/me', authenticate, authController.me.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));
router.get('/sessions', authenticate, authController.getSessions.bind(authController));
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession.bind(authController));

export default router;
