import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Customer self-service routes
router.get('/me', customerController.getMyProfile.bind(customerController));
router.put('/me', customerController.updateMyProfile.bind(customerController));

// Admin routes
router.get('/', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), customerController.list.bind(customerController));
router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN'), customerController.getStats.bind(customerController));
router.get('/:id', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), customerController.getById.bind(customerController));
router.put('/:id', authorize('SUPER_ADMIN', 'ISP_ADMIN'), customerController.update.bind(customerController));
router.post('/:id/suspend', authorize('SUPER_ADMIN', 'ISP_ADMIN'), customerController.suspend.bind(customerController));
router.post('/:id/activate', authorize('SUPER_ADMIN', 'ISP_ADMIN'), customerController.activate.bind(customerController));

export default router;
