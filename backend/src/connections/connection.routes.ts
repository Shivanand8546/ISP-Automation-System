import { Router } from 'express';
import { connectionController } from './connection.controller';
import { authenticate, authorize } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT', 'TECHNICIAN'), connectionController.list.bind(connectionController));
router.post('/', idempotencyMiddleware(), connectionController.create.bind(connectionController));
router.get('/:id', connectionController.getById.bind(connectionController));
router.post('/:id/activate', authorize('SUPER_ADMIN', 'ISP_ADMIN'), connectionController.activate.bind(connectionController));
router.post('/:id/suspend', authorize('SUPER_ADMIN', 'ISP_ADMIN'), connectionController.suspend.bind(connectionController));
router.post('/:id/cancel', authorize('SUPER_ADMIN', 'ISP_ADMIN'), connectionController.cancel.bind(connectionController));

export default router;
