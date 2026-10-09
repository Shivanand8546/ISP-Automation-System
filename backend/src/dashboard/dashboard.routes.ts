import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/admin', authorize('SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCustomers, activeCustomers, suspendedCustomers,
      activeConnections, suspendedConnections,
      activeSubscriptions, expiredSubscriptions,
      openTickets, criticalTickets, slaBreached,
      monthlyRevenue, totalRevenue, pendingPayments,
      onlineDevices, offlineDevices,
      openIncidents, criticalIncidents,
      recentPayments, recentTickets
    ] = await Promise.all([
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.customer.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.customer.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.connection.count({ where: { status: 'ACTIVE' } }),
      prisma.connection.count({ where: { status: 'SUSPENDED' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'ASSIGNED'] } } }),
      prisma.ticket.count({ where: { priority: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      prisma.ticket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] }, slaDeadline: { lt: now } } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS', createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.networkDevice.count({ where: { status: 'ONLINE', deletedAt: null } }),
      prisma.networkDevice.count({ where: { status: 'OFFLINE', deletedAt: null } }),
      prisma.incident.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
      prisma.incident.count({ where: { severity: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      prisma.payment.findMany({ where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, take: 5, include: { customer: { include: { user: { select: { name: true } } } } } }),
      prisma.ticket.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { customer: { include: { user: { select: { name: true } } } } } }),
    ]);

    // Revenue trend (last 6 months)
    const revenueTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const rev = await prisma.payment.aggregate({
        where: { status: 'SUCCESS', createdAt: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      });
      revenueTrend.push({
        month: monthStart.toLocaleString('default', { month: 'short', year: '2-digit' }),
        revenue: Number(rev._sum.amount || 0),
      });
    }

    sendSuccess(res, {
      customers: { total: totalCustomers, active: activeCustomers, suspended: suspendedCustomers },
      connections: { active: activeConnections, suspended: suspendedConnections },
      subscriptions: { active: activeSubscriptions, expired: expiredSubscriptions },
      tickets: { open: openTickets, critical: criticalTickets, slaBreached },
      revenue: {
        monthly: Number(monthlyRevenue._sum.amount || 0),
        total: Number(totalRevenue._sum.amount || 0),
        pending: pendingPayments,
      },
      network: { online: onlineDevices, offline: offlineDevices },
      incidents: { open: openIncidents, critical: criticalIncidents },
      recentPayments,
      recentTickets,
      revenueTrend,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/customer', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { userId: req.user.userId },
      include: {
        connections: {
          include: { plan: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 5, include: { invoice: true } },
        tickets: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } }, take: 5 },
      },
    });

    const unreadNotifications = customer
      ? await prisma.notification.count({ where: { userId: req.user.userId, isRead: false } })
      : 0;

    sendSuccess(res, { customer, unreadNotifications });
  } catch (error) {
    next(error);
  }
});

router.get('/technician', authorize('TECHNICIAN'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const technician = await prisma.technician.findUnique({
      where: { userId: req.user.userId },
      include: {
        tickets: {
          where: { isActive: true },
          include: { ticket: { include: { customer: { include: { user: true } } } } },
        },
        installations: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PENDING'] } },
          include: { customer: { include: { user: { select: { name: true } } } }, connection: { include: { plan: true } } },
        },
      },
    });

    sendSuccess(res, { technician });
  } catch (error) {
    next(error);
  }
});

export default router;
