import { Router, Request, Response, NextFunction } from 'express';
import { technicianService } from './technician.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { technicians, total } = await technicianService.list({
      status: req.query.status as string, page, limit,
    });
    sendPaginated(res, technicians, total, page, limit);
  } catch (e) { next(e); }
});

router.get('/workload', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await technicianService.getWorkloadStats()); } catch (e) { next(e); }
});

router.get('/my-installations', authorize('TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const tech = await (await import('../config/database')).prisma.technician.findUnique({ where: { userId: req.user.userId } });
    if (!tech) throw new AppError('Technician profile not found', 404);
    const installations = await technicianService.getInstallations(tech.id);
    sendSuccess(res, installations);
  } catch (e) { next(e); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await technicianService.findById(req.params.id)); } catch (e) { next(e); }
});

router.post('/:id/installations/:installationId/complete', authorize('TECHNICIAN', 'SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    let techId = req.params.id;
    if (req.user.role === 'TECHNICIAN') {
      const tech = await (await import('../config/database')).prisma.technician.findUnique({ where: { userId: req.user.userId } });
      if (!tech) throw new AppError('Technician profile not found', 404);
      techId = tech.id;
    }
    const result = await technicianService.completeInstallation(req.params.installationId, techId);
    sendSuccess(res, result, 'Installation completed');
  } catch (e) { next(e); }
});

router.put('/:id', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tech = await technicianService.update(req.params.id, req.body);
    sendSuccess(res, tech, 'Technician updated');
  } catch (e) { next(e); }
});

export default router;
