import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticate, authorize } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

router.post('/webhook', paymentController.handleRazorpayWebhook.bind(paymentController));
router.use(authenticate);

router.get('/config', paymentController.getConfig.bind(paymentController));
router.post('/', idempotencyMiddleware(), paymentController.create.bind(paymentController));
router.get('/', paymentController.list.bind(paymentController));
router.get('/stats', authorize('SUPER_ADMIN', 'ISP_ADMIN'), paymentController.getStats.bind(paymentController));
router.get('/manual-queue', authorize('SUPER_ADMIN', 'ISP_ADMIN'), paymentController.listManualQueue.bind(paymentController));
router.post('/:id/utr', paymentController.submitUtr.bind(paymentController));
router.post('/:id/verify-manual', authorize('SUPER_ADMIN', 'ISP_ADMIN'), paymentController.verifyManual.bind(paymentController));
router.post('/:id/reject-manual', authorize('SUPER_ADMIN', 'ISP_ADMIN'), paymentController.rejectManual.bind(paymentController));
router.post('/:id/verify-checkout', authorize('SUPER_ADMIN', 'ISP_ADMIN'), paymentController.verifyCheckout.bind(paymentController));
router.get('/:id', paymentController.getById.bind(paymentController));

export default router;
