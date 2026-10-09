import { Router } from 'express';
import { planController } from './plan.controller';
import { authenticate, authorize, optionalAuth } from '../middleware/auth';

const router = Router();

// Public routes (plans visible to all)
router.get('/', optionalAuth, planController.list.bind(planController));
router.get('/:id', optionalAuth, planController.getById.bind(planController));

// Admin routes
router.post('/', authenticate, authorize('SUPER_ADMIN', 'ISP_ADMIN'), planController.create.bind(planController));
router.put('/:id', authenticate, authorize('SUPER_ADMIN', 'ISP_ADMIN'), planController.update.bind(planController));
router.delete('/:id', authenticate, authorize('SUPER_ADMIN', 'ISP_ADMIN'), planController.delete.bind(planController));
router.post('/:id/toggle', authenticate, authorize('SUPER_ADMIN', 'ISP_ADMIN'), planController.toggleStatus.bind(planController));

export default router;
