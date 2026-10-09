import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ticketService } from './ticket.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.enum(['BILLING', 'TECHNICAL', 'INSTALLATION', 'COMPLAINT', 'GENERAL', 'NETWORK']).optional(),
  customerId: z.string().uuid().optional(),
});

router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await ticketService.getStats()); } catch (e) { next(e); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    let customerId = req.query.customerId as string;

    if (req.user?.role === 'CUSTOMER') {
      const { prisma } = await import('../config/database');
      const customer = await prisma.customer.findUnique({ where: { userId: req.user!.userId } });
      customerId = customer?.id || '';
    }

    const { tickets, total } = await ticketService.list({
      status: req.query.status as string,
      priority: req.query.priority as string,
      category: req.query.category as string,
      customerId,
      search: req.query.search as string,
      page,
      limit,
    });
    sendPaginated(res, tickets, total, page, limit);
  } catch (e) { next(e); }
});

router.post('/', idempotencyMiddleware(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const data = createSchema.parse(req.body);
    let customerId = data.customerId;

    if (!customerId && req.user.role === 'CUSTOMER') {
      const { prisma } = await import('../config/database');
      const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
      if (!customer) throw new AppError('Customer profile not found', 404);
      customerId = customer.id;
    }

    if (!customerId) throw new AppError('customerId required', 400);
    const ticket = await ticketService.create({ ...data, customerId });
    sendCreated(res, ticket, 'Ticket created');
  } catch (e) { next(e); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await ticketService.findById(req.params.id)); } catch (e) { next(e); }
});

router.post('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const { content, isInternal } = req.body;
    const comment = await ticketService.addComment(req.params.id, req.user.userId, content, isInternal);
    sendCreated(res, comment);
  } catch (e) { next(e); }
});

router.put('/:id/status', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const ticket = await ticketService.updateStatus(req.params.id, req.body.status, req.user.userId);
    sendSuccess(res, ticket, 'Status updated');
  } catch (e) { next(e); }
});

router.post('/:id/assign', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const result = await ticketService.assignTechnician(req.params.id, req.body.technicianId, req.user.userId);
    sendSuccess(res, result, 'Technician assigned');
  } catch (e) { next(e); }
});

router.post('/:id/escalate', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    await ticketService.escalate(req.params.id, req.body.reason, req.user.userId);
    sendSuccess(res, null, 'Ticket escalated');
  } catch (e) { next(e); }
});

export default router;
