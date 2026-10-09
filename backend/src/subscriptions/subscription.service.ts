import { prisma } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';

export class SubscriptionService {
  async list(customerId?: string, status?: string, page = 1, limit = 20) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { include: { user: { select: { name: true } } } },
          plan: true,
          connection: true,
        },
      }),
      prisma.subscription.count({ where }),
    ]);
    return { subscriptions, total };
  }

  async findById(id: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: { include: { user: true } },
        plan: true,
        connection: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        subscriptionHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!subscription) throw new NotFoundError('Subscription not found');
    return subscription;
  }

  async cancel(id: string, reason?: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { customer: { include: { user: true } } },
    });
    if (!subscription) throw new NotFoundError('Subscription not found');

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      prisma.connection.update({
        where: { id: subscription.connectionId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      prisma.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          previousStatus: subscription.status,
          newStatus: 'CANCELLED',
          reason,
        },
      }),
    ]);

    const io = getSocketServer();
    io?.to(`user:${subscription.customer.userId}`).emit('SUBSCRIPTION_UPDATED', {
      subscriptionId: id,
      status: 'CANCELLED',
    });
  }

  async getExpiringSubscriptions(daysAhead = 7) {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + daysAhead);

    return prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: now, lte: future },
      },
      include: {
        customer: { include: { user: true } },
        plan: true,
      },
    });
  }

  async getExpiredSubscriptions() {
    return prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: new Date() },
      },
      include: {
        customer: { include: { user: true } },
        plan: true,
        connection: true,
      },
    });
  }

  async expireSubscription(id: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { customer: { include: { user: true } }, connection: true },
    });
    if (!subscription) return;

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id },
        data: { status: 'EXPIRED' },
      }),
      prisma.connection.update({
        where: { id: subscription.connectionId },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      }),
      prisma.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          previousStatus: 'ACTIVE',
          newStatus: 'EXPIRED',
          reason: 'Subscription end date reached',
        },
      }),
    ]);

    // Send notification
    await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
      userId: subscription.customer.userId,
      type: 'PLAN_EXPIRED',
      title: 'Subscription Expired',
      message: 'Your subscription has expired. Please renew to continue using the service.',
    });

    const io = getSocketServer();
    io?.to(`user:${subscription.customer.userId}`).emit('SUBSCRIPTION_UPDATED', {
      subscriptionId: id,
      status: 'EXPIRED',
    });
  }

  async getStats() {
    const [active, expired, cancelled, pending] = await Promise.all([
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.subscription.count({ where: { status: 'CANCELLED' } }),
      prisma.subscription.count({ where: { status: 'PENDING' } }),
    ]);
    return { active, expired, cancelled, pending, total: active + expired + cancelled + pending };
  }
}

export const subscriptionService = new SubscriptionService();
