import { Router, Request, Response, NextFunction } from 'express';
import { incidentService } from './incident.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { incidents, total } = await incidentService.list({
      status: req.query.status as string,
      severity: req.query.severity as string,
      page, limit,
    });
    sendPaginated(res, incidents, total, page, limit);
  } catch (e) { next(e); }
});

router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await incidentService.getStats()); } catch (e) { next(e); }
});

router.post('/', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.create(req.body);
    sendCreated(res, incident, 'Incident created');
  } catch (e) { next(e); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await incidentService.findById(req.params.id)); } catch (e) { next(e); }
});

router.put('/:id/status', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await incidentService.updateStatus(req.params.id, req.body.status, req.body.message, req.user?.userId);
    sendSuccess(res, null, 'Status updated');
  } catch (e) { next(e); }
});

router.post('/:id/assign', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await incidentService.assignTechnician(req.params.id, req.body.technicianId);
    sendSuccess(res, result, 'Technician assigned');
  } catch (e) { next(e); }
});

export default router;
