import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
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
    const where: any = {};

    if (req.user.role === 'CUSTOMER') {
      const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
      if (customer) where.customerId = customer.id;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: true,
          subscription: { include: { plan: true } },
          customer: { include: { user: { select: { name: true } } } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    sendPaginated(res, invoices, total, page, limit);
  } catch (e) { next(e); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        payment: true,
        subscription: { include: { plan: true } },
        customer: { include: { user: { select: { name: true, email: true } } } },
      },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    sendSuccess(res, invoice);
  } catch (e) { next(e); }
});

export default router;
