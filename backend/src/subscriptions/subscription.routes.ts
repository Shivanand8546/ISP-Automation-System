import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from './subscription.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    let customerId = req.query.customerId as string;

    if (req.user?.role === 'CUSTOMER') {
      const { prisma } = await import('../config/database');
      const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
      customerId = customer?.id || '';
    }

    const { subscriptions, total } = await subscriptionService.list(customerId, req.query.status as string, page, limit);
    sendPaginated(res, subscriptions, total, page, limit);
  } catch (error) { next(error); }
});

router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await subscriptionService.getStats();
    sendSuccess(res, stats);
  } catch (error) { next(error); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = await subscriptionService.findById(req.params.id);
    sendSuccess(res, sub);
  } catch (error) { next(error); }
});

router.post('/:id/cancel', idempotencyMiddleware(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await subscriptionService.cancel(req.params.id, req.body.reason);
    sendSuccess(res, null, 'Subscription cancelled');
  } catch (error) { next(error); }
});

export default router;
