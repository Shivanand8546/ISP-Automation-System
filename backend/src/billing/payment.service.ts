import { prisma } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { getPaymentProvider, buildUpiLink } from './payment.provider';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface CreatePaymentInput {
  customerId: string;
  subscriptionId: string;
  amount?: number;
  idempotencyKey?: string;
}

export type FinalizePaymentOutcome = 'SUCCESS' | 'FAILED' | 'EXPIRED';

export interface FinalizePaymentMeta {
  failureReason?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  verifiedById?: string;
  expectedAmount?: number;
  expectedCurrency?: string;
  reason?: string;
}

export class PaymentService {
  async createAndProcess(input: CreatePaymentInput) {
    const { customerId, subscriptionId, idempotencyKey } = input;
    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, customerId },
      include: { plan: true, customer: { include: { user: true } }, connection: true },
    });

    if (!subscription) throw new NotFoundError('Subscription not found');

    const amount = Number(subscription.plan.price ?? 0);
    const providerName = (config.payment.provider || 'MOCK').toUpperCase();

    const payment = await prisma.payment.create({
      data: {
        customerId,
        subscriptionId,
        amount,
        currency: 'INR',
        status: 'PENDING',
        provider: providerName,
        idempotencyKey,
        expiresAt: new Date(Date.now() + config.payment.pendingExpiryMinutes * 60_000),
      },
    });

    if (providerName === 'RAZORPAY') {
      const provider = getPaymentProvider() as any;
      const order = await provider.processPayment({
        amount,
        currency: 'INR',
        customerId,
        subscriptionId,
        paymentId: payment.id,
        idempotencyKey,
      });

      const orderId = order.orderId || order.transactionId;
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerOrderId: orderId,
          providerRef: order.providerRef,
          transactionId: order.orderId || order.transactionId,
          providerPaymentId: order.meta?.providerPaymentId as string | null,
          meta: { ...(payment.meta || {}), ...(order.meta || {}) },
        },
      });

      return {
        paymentId: updated.id,
        orderId,
        amount: Number(updated.amount),
        currency: updated.currency,
        keyId: order.keyId || config.payment.razorpay.keyId,
        provider: 'RAZORPAY',
      };
    }

    if (providerName === 'UPI_MANUAL') {
      const upiLink = buildUpiLink(payment.id, amount, `INV-${Date.now()}`);
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          meta: { upiLink },
        },
      });
      return {
        paymentId: payment.id,
        provider: 'UPI_MANUAL',
        amount: Number(amount),
        currency: 'INR',
        upiLink,
      };
    }

    const mockProvider = getPaymentProvider();
    const result = await mockProvider.processPayment({
      amount,
      currency: 'INR',
      customerId,
      subscriptionId,
      paymentId: payment.id,
      idempotencyKey,
    });

    if (result.status === 'SUCCESS') {
      const finalized = await this.finalizePayment(payment.id, 'SUCCESS', {
        providerPaymentId: result.providerRef,
      });
      return { paymentId: payment.id, status: finalized.status || 'SUCCESS', provider: 'MOCK' };
    }

    await this.finalizePayment(payment.id, 'FAILED', { failureReason: result.failureReason || 'Payment failed' });
    throw new AppError(`Payment failed: ${result.failureReason || 'Unknown error'}`, 402);
  }

  async finalizePayment(paymentId: string, outcome: FinalizePaymentOutcome, meta: FinalizePaymentMeta = {}) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          customer: { include: { user: true } },
          subscription: { include: { plan: true, connection: true } },
          invoice: true,
        },
      });

      if (!existing) throw new NotFoundError('Payment not found');
      if (existing.status === 'SUCCESS' || existing.status === 'FAILED' || existing.status === 'EXPIRED') {
        return { payment: existing, status: existing.status, activated: false };
      }

      const allowedStates = ['PENDING', 'AWAITING_VERIFICATION'];
      const transition = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: allowedStates } },
        data: {
          status: outcome === 'SUCCESS' ? 'SUCCESS' : outcome,
          failureReason: outcome === 'SUCCESS' ? null : (meta.failureReason || outcome),
          paidAt: outcome === 'SUCCESS' ? new Date() : existing.paidAt,
          providerPaymentId: meta.providerPaymentId || existing.providerPaymentId,
          providerOrderId: meta.providerOrderId || existing.providerOrderId,
          verifiedById: meta.verifiedById || existing.verifiedById,
          verifiedAt: meta.verifiedById ? new Date() : existing.verifiedAt,
        },
      });

      if (transition.count !== 1) {
        return { payment: existing, status: existing.status, activated: false };
      }

      if (outcome === 'SUCCESS') {
        const expectedCents = Number(existing.amount) * 100;
        const actual = meta.expectedAmount ?? expectedCents;
        if ((existing.provider === 'RAZORPAY' || meta.expectedAmount !== undefined) && actual !== expectedCents) {
          await tx.payment.update({
            where: { id: paymentId },
            data: { status: 'FAILED', failureReason: 'Amount mismatch: payment amount did not match expected invoice amount', verifiedAt: new Date() },
          });
          await tx.paymentTransaction.create({
            data: {
              paymentId,
              type: 'AMOUNT_MISMATCH',
              amount: existing.amount,
              status: 'FAILED',
              meta: { expectedAmount: expectedCents, receivedAmount: actual },
            },
          });
          return { payment: { ...existing, status: 'FAILED' }, status: 'FAILED', activated: false };
        }

        const invoiceCount = await tx.invoice.count();
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1001).padStart(6, '0')}`;
        const tax = Number(existing.amount) * 0.18;
        const total = Number(existing.amount) + tax;

        const invoice = await tx.invoice.upsert({
          where: { paymentId },
          create: {
            invoiceNumber,
            paymentId,
            subscriptionId: existing.subscriptionId,
            customerId: existing.customerId,
            amount: existing.amount,
            tax: String(tax),
            total: String(total),
            status: 'PAID',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            paidAt: new Date(),
          },
          update: {
            status: 'PAID',
            paidAt: new Date(),
          },
        });

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (existing.subscription?.plan?.billingCycleDays ?? 30));

        const updatedSubscription = await tx.subscription.update({
          where: { id: existing.subscriptionId },
          data: {
            status: 'ACTIVE',
            startDate,
            endDate,
          },
        });

        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: existing.subscriptionId,
            previousStatus: existing.subscription.status,
            newStatus: 'ACTIVE',
            reason: 'Payment successful',
          },
        });

        if (existing.subscription.connectionId) {
          await tx.connection.update({
            where: { id: existing.subscription.connectionId },
            data: { status: 'ACTIVE', activatedAt: startDate, expiresAt: endDate },
          });
        }

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'SUCCESS',
            paidAt: new Date(),
            failureReason: null,
            meta: { ...(existing.meta || {}), finalizedAt: new Date().toISOString(), outcome: 'SUCCESS' },
          },
        });

        await tx.paymentTransaction.create({
          data: {
            paymentId,
            type: 'PAYMENT_SUCCESS',
            amount: existing.amount,
            status: 'SUCCESS',
            providerRef: existing.providerOrderId || existing.providerRef || existing.id,
            meta: { invoiceId: invoice.id, subscriptionId: existing.subscriptionId },
          },
        });

        await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
          userId: existing.customer.userId,
          type: 'PAYMENT_SUCCESS',
          title: 'Payment Successful',
          message: `Your payment of ₹${Number(existing.amount).toLocaleString('en-IN')} has been confirmed.`,
          meta: { paymentId: paymentId, invoiceId: invoice.id },
        });

        await addJob(QUEUE_NAMES.AUDIT, JOB_NAMES.WRITE_AUDIT, {
          userId: existing.customer.userId,
          action: 'PAYMENT_SUCCESS',
          entityType: 'Payment',
          entityId: paymentId,
          meta: { amount: Number(existing.amount), subscriptionId: existing.subscriptionId, provider: existing.provider },
        });

        const io = getSocketServer();
        io?.to(`user:${existing.customer.userId}`).emit('PAYMENT_SUCCESS', {
          paymentId,
          amount: Number(existing.amount),
          invoiceNumber: invoice.invoiceNumber,
        });

        return { payment: updatedPayment, invoice, subscription: updatedSubscription, status: 'SUCCESS', activated: true };
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: outcome,
          failureReason: meta.failureReason || outcome,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          paymentId,
          type: outcome === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_EXPIRED',
          amount: existing.amount,
          status: outcome,
          providerRef: existing.providerOrderId || existing.providerRef || existing.id,
          meta: { reason: meta.failureReason || outcome },
        },
      });

      await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
        userId: existing.customer.userId,
        type: 'PAYMENT_FAILED',
        title: outcome === 'FAILED' ? 'Payment Failed' : 'Payment Expired',
        message: outcome === 'FAILED' ? `Your payment failed: ${meta.failureReason || 'Please try again.'}` : 'Your payment expired before confirmation. Please try again.',
        meta: { paymentId, outcome },
      });

      return { payment: updatedPayment, status: outcome, activated: false };
    });
  }

  async list(customerId?: string, status?: string, page = 1, limit = 20) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { include: { user: { select: { name: true } } } },
          subscription: { include: { plan: true } },
          invoice: true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total };
  }

  async findById(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { name: true, email: true } } } },
        subscription: { include: { plan: true, connection: true } },
        invoice: true,
        transactions: true,
      },
    });
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }

  async getRevenueStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalRevenue, monthlyRevenue, totalPayments, pendingPayments] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS', createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.payment.count({ where: { status: 'SUCCESS' } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      totalRevenue: Number(totalRevenue._sum.amount || 0),
      monthlyRevenue: Number(monthlyRevenue._sum.amount || 0),
      totalPayments,
      pendingPayments,
    };
  }

  async getProviderConfig() {
    return {
      provider: (config.payment.provider || 'MOCK').toUpperCase(),
    };
  }

  async submitUtr(paymentId: string, userId: string, utr: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { customer: { include: { user: true } } } });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.customer.userId !== userId) throw new AppError('You cannot modify another customer payment', 403);
    if (payment.status !== 'PENDING') throw new AppError('Payment is not awaiting UTR submission', 400);
    if (payment.expiresAt && payment.expiresAt < new Date()) {
      throw new AppError('This payment has expired', 400);
    }

    const duplicate = await prisma.payment.findFirst({ where: { utr } });
    if (duplicate) throw new AppError('This UTR has already been used for another payment', 409);

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'AWAITING_VERIFICATION',
        utr,
        utrSubmittedAt: new Date(),
      },
    });

    await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
      userId: payment.customer.userId,
      type: 'PAYMENT_FAILED',
      title: 'UPI payment submitted',
      message: 'Your payment has been submitted for manual verification.',
      meta: { paymentId },
    });

    return updated;
  }

  async verifyManualPayment(paymentId: string, verifiedById: string, receivedAmount: number) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'AWAITING_VERIFICATION') throw new AppError('This payment is not awaiting verification', 400);
    if (Number(payment.amount) !== Number(receivedAmount)) throw new AppError('Received amount does not match the invoice amount', 400);
    return this.finalizePayment(paymentId, 'SUCCESS', { verifiedById, expectedAmount: Number(payment.amount) * 100, expectedCurrency: payment.currency });
  }

  async rejectManualPayment(paymentId: string, reason: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'AWAITING_VERIFICATION') throw new AppError('This payment is not awaiting verification', 400);
    return this.finalizePayment(paymentId, 'FAILED', { failureReason: reason || 'Rejected by admin' });
  }

  async reconcilePendingPayments() {
    const now = new Date();
    const expired = await prisma.payment.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      include: { customer: { include: { user: true } }, subscription: { include: { plan: true, connection: true } } },
    });

    for (const payment of expired) {
      await this.finalizePayment(payment.id, 'EXPIRED', { failureReason: 'Payment expired before confirmation' });
    }

    const pendingRazorpay = await prisma.payment.findMany({
      where: { status: 'PENDING', provider: 'RAZORPAY', providerOrderId: { not: null } },
      include: { customer: { include: { user: true } }, subscription: { include: { plan: true, connection: true } } },
    });

    let reconciled = 0;
    for (const payment of pendingRazorpay) {
      const orderId = payment.providerOrderId || payment.transactionId || undefined;
      if (!orderId) continue;

      const provider = getPaymentProvider() as any;
      if (typeof provider.fetchOrder === 'function') {
        try {
          const order = await provider.fetchOrder(orderId);
          if (order && ['paid', 'completed'].includes(String(order.status || '').toLowerCase())) {
            await this.finalizePayment(payment.id, 'SUCCESS', {
              providerOrderId: order.id || orderId,
              providerPaymentId: payment.providerPaymentId || order.id,
              expectedAmount: Number(payment.amount) * 100,
              expectedCurrency: payment.currency,
            });
            reconciled += 1;
          }
        } catch {
          // ignore reconciliation failures; a later run will retry
        }
      }
    }

    return { expired: expired.length, reconciled };
  }

  async listManualQueue() {
    return prisma.payment.findMany({
      where: { status: 'AWAITING_VERIFICATION' },
      include: { customer: { include: { user: true } }, subscription: { include: { plan: true } } },
      orderBy: { utrSubmittedAt: 'desc' },
    });
  }
}

export const paymentService = new PaymentService();
