import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const unreadOnly = req.query.unreadOnly === 'true';
    const { notifications, total } = await notificationService.list(req.user.userId, unreadOnly, page, limit);
    sendPaginated(res, notifications, total, page, limit);
  } catch (e) { next(e); }
});

router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const count = await notificationService.getUnreadCount(req.user.userId);
    sendSuccess(res, { count });
  } catch (e) { next(e); }
});

router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const notification = await notificationService.markRead(req.params.id, req.user.userId);
    sendSuccess(res, notification);
  } catch (e) { next(e); }
});

router.post('/mark-all-read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    await notificationService.markAllRead(req.user.userId);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (e) { next(e); }
});

export default router;
