import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { sendSuccess, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate, authorize('SUPER_ADMIN', 'ISP_ADMIN'));

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const { action, entityType, userId } = req.query;
    const where: any = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    sendPaginated(res, logs, total, page, limit);
  } catch (error) { next(error); }
});

export default router;
