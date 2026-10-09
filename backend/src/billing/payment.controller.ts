import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { paymentService } from './payment.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';

const createPaymentSchema = z.object({
  subscriptionId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
});

const manualUtrSchema = z.object({
  utr: z.string().regex(/^\d{12}$/).describe('UTR must be exactly 12 digits'),
});

const verifyManualSchema = z.object({
  receivedAmount: z.number().positive(),
});

const rejectManualSchema = z.object({
  reason: z.string().min(1),
});

export class PaymentController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const data = createPaymentSchema.parse(req.body);

      let customerId = data.customerId;
      if (!customerId && req.user.role === 'CUSTOMER') {
        const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
        if (!customer) throw new AppError('Customer profile not found', 404);
        customerId = customer.id;
      }

      if (!customerId) throw new AppError('customerId is required', 400);

      const idempotencyKey = req.headers['idempotency-key'] as string;
      const result = await paymentService.createAndProcess({
        customerId,
        subscriptionId: data.subscriptionId,
        idempotencyKey,
      });

      sendCreated(res, result, 'Payment processed successfully');
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      let customerId = req.query.customerId as string;

      if (req.user?.role === 'CUSTOMER') {
        const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
        customerId = customer?.id || '';
      }

      const { payments, total } = await paymentService.list(customerId, req.query.status as string, page, limit);
      sendPaginated(res, payments, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.findById(req.params.id);
      if (req.user?.role === 'CUSTOMER') {
        const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
        if (!customer || payment.customerId !== customer.id) throw new AppError('You cannot access another customer payment', 403);
      }
      sendSuccess(res, payment);
    } catch (error) {
      next(error);
    }
  }

  async getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, await paymentService.getProviderConfig());
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await paymentService.getRevenueStats();
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async verifyCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const body = z.object({
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string(),
      }).parse(req.body);

      const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
      if (!payment) throw new AppError('Payment not found', 404);
      const provider = (await import('./payment.provider')).getPaymentProvider() as any;
      const valid = provider.verifyCheckoutSignature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature,
        payment.id,
      );

      if (!valid) {
        sendSuccess(res, { verified: false, message: 'Invalid Razorpay signature' }, 'Invalid Razorpay signature', 400);
        return;
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: body.razorpay_payment_id,
        },
      });

      const fetched = await provider.fetchPayment(body.razorpay_payment_id);
      if (fetched?.status === 'captured' || fetched?.status === 'authorized') {
        await paymentService.finalizePayment(payment.id, 'SUCCESS', {
          providerPaymentId: body.razorpay_payment_id,
          expectedAmount: Number(payment.amount) * 100,
          expectedCurrency: payment.currency,
        });
      }

      sendSuccess(res, { verified: true, status: fetched?.status || 'unknown' });
    } catch (error) {
      next(error);
    }
  }

  async handleRazorpayWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = req.body as Buffer;
      const providedSignature = req.headers['x-razorpay-signature'];
      const eventId = req.headers['x-razorpay-event-id'] as string;
      const payload = raw.toString('utf8');

      if (!providedSignature || typeof providedSignature !== 'string') {
        throw new AppError('Missing Razorpay signature', 400);
      }

      const expected = crypto
        .createHmac('sha256', config.payment.razorpay.webhookSecret)
        .update(payload)
        .digest('hex');

      const safeCompare = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
      if (!safeCompare) {
        logger.error('Razorpay webhook signature mismatch');
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }

      const existing = await prisma.providerWebhookEvent.findUnique({ where: { eventId } });
      if (existing) {
        return res.status(200).json({ success: true, message: 'Duplicate event ignored' });
      }

      const body = JSON.parse(payload || '{}');
      const eventType = body.event;
      const notes = body.payload?.payment?.entity?.notes || body.payload?.order?.entity?.notes || {};
      const paymentId = notes.paymentId || body.payload?.payment?.entity?.notes?.paymentId || body.payload?.payment?.entity?.order_id;
      const razorpayPaymentId = body.payload?.payment?.entity?.id || body.payload?.payment?.entity?.payment_id;
      const orderId = body.payload?.payment?.entity?.order_id || body.payload?.order?.entity?.id;

      await prisma.providerWebhookEvent.create({
        data: {
          eventId: eventId || `${Date.now()}-${Math.random()}`,
          provider: 'RAZORPAY',
          type: eventType,
          payload: body,
          receivedAt: new Date(),
        },
      });

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const target = paymentId ? await prisma.payment.findFirst({ where: { id: paymentId } }) : await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
        if (target) {
          await paymentService.finalizePayment(target.id, 'SUCCESS', {
            providerOrderId: orderId,
            providerPaymentId: razorpayPaymentId,
            expectedAmount: Number(target.amount) * 100,
            expectedCurrency: target.currency,
          });
        }
      }

      if (eventType === 'payment.failed') {
        const target = paymentId ? await prisma.payment.findFirst({ where: { id: paymentId } }) : await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
        if (target) {
          await paymentService.finalizePayment(target.id, 'FAILED', {
            failureReason: body.payload?.payment?.entity?.error_description || 'Razorpay payment failed',
          });
        }
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async submitUtr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const { utr } = manualUtrSchema.parse(req.body);
      const payment = await paymentService.submitUtr(req.params.id, req.user.userId, utr);
      sendSuccess(res, payment, 'UTR submitted successfully');
    } catch (error) {
      next(error);
    }
  }

  async verifyManual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      if (req.user.role === 'CUSTOMER') throw new AppError('Only admins can verify manual payments', 403);
      const { receivedAmount } = verifyManualSchema.parse(req.body);
      const payment = await paymentService.verifyManualPayment(req.params.id, req.user.userId, receivedAmount);
      sendSuccess(res, payment, 'Payment verified successfully');
    } catch (error) {
      next(error);
    }
  }

  async rejectManual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      if (req.user.role === 'CUSTOMER') throw new AppError('Only admins can reject manual payments', 403);
      const { reason } = rejectManualSchema.parse(req.body);
      const payment = await paymentService.rejectManualPayment(req.params.id, reason);
      sendSuccess(res, payment, 'Payment rejected');
    } catch (error) {
      next(error);
    }
  }

  async listManualQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await paymentService.listManualQueue();
      sendSuccess(res, payments);
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
