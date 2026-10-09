import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { networkService } from './network.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const createDeviceSchema = z.object({
  name: z.string().min(2),
  ipAddress: z.string().min(7),
  type: z.enum(['ROUTER', 'OLT', 'SWITCH', 'ONU', 'ONT', 'ACCESS_POINT', 'FIREWALL', 'SERVER']),
  vendor: z.string().optional(),
  model: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { devices, total } = await networkService.listDevices({
      status: req.query.status as string,
      type: req.query.type as string,
      search: req.query.search as string,
      page, limit,
    });
    sendPaginated(res, devices, total, page, limit);
  } catch (e) { next(e); }
});

router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await networkService.getDeviceStats()); } catch (e) { next(e); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await networkService.findDeviceById(req.params.id)); } catch (e) { next(e); }
});

router.post('/', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDeviceSchema.parse(req.body);
    const device = await networkService.createDevice(data);
    sendCreated(res, device, 'Device created');
  } catch (e) { next(e); }
});

router.put('/:id', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await networkService.updateDevice(req.params.id, req.body);
    sendSuccess(res, device, 'Device updated');
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await networkService.deleteDevice(req.params.id);
    sendSuccess(res, null, 'Device deleted');
  } catch (e) { next(e); }
});

// Simulator control
router.post('/:id/simulate', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { simStatus } = req.body;
    const device = await networkService.setSimulationStatus(req.params.id, simStatus);
    sendSuccess(res, device, `Simulation set to ${simStatus}`);
  } catch (e) { next(e); }
});

// Manual trigger monitoring
router.post('/monitor/trigger', authorize('SUPER_ADMIN', 'ISP_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await networkService.monitorAllDevices();
    sendSuccess(res, null, 'Monitoring triggered');
  } catch (e) { next(e); }
});

export default router;
