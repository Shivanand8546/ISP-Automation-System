import { Worker, Job, ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../queues';
import { prisma } from '../config/database';
import { notificationService } from '../notifications/notification.service';
import { incidentService } from '../incidents/incident.service';
import { subscriptionService } from '../subscriptions/subscription.service';
import { ticketService } from '../tickets/ticket.service';
import { networkService } from '../network/network.service';
import { logger } from '../utils/logger';

const connection: ConnectionOptions = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

const workers: Worker[] = [];

// ====== AUTH WORKER ======
const authWorker = new Worker(
  QUEUE_NAMES.AUTH,
  async (job: Job) => {
    if (job.name === JOB_NAMES.LOGIN_SUCCESS) {
      const { userId, email, ip, userAgent } = job.data;
      await prisma.auditLog.create({
        data: { userId, userEmail: email, action: 'LOGIN', ipAddress: ip, userAgent, entityType: 'User', entityId: userId },
      });
      logger.debug({ userId }, 'Login audit logged');
    }
    if (job.name === JOB_NAMES.LOGOUT_EVENT) {
      const { userId, sessionId } = job.data;
      await prisma.auditLog.create({
        data: { userId, action: 'LOGOUT', entityType: 'Session', entityId: sessionId },
      });
    }
  },
  { connection, concurrency: 5 }
);

// ====== NOTIFICATION WORKER ======
const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATION,
  async (job: Job) => {
    if (job.name === JOB_NAMES.SEND_NOTIFICATION) {
      const { userId, type, title, message, meta } = job.data;
      // Resolve customer to user if needed
      let targetUserId = userId;
      
      // If userId is a customerId format, resolve it
      const customer = await prisma.customer.findFirst({ where: { id: userId } });
      if (customer) targetUserId = customer.userId;

      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        logger.warn({ userId }, 'User not found for notification');
        return;
      }

      await notificationService.send({ userId: targetUserId, type, title, message, meta });
    }
  },
  { connection, concurrency: 10 }
);

// ====== AUDIT WORKER ======
const auditWorker = new Worker(
  QUEUE_NAMES.AUDIT,
  async (job: Job) => {
    if (job.name === JOB_NAMES.WRITE_AUDIT) {
      const { userId, userEmail, action, entityType, entityId, meta, ipAddress, userAgent } = job.data;
      await prisma.auditLog.create({
        data: { userId, userEmail, action, entityType, entityId, meta, ipAddress, userAgent },
      });
    }
  },
  { connection, concurrency: 10 }
);

// ====== INCIDENT WORKER ======
const incidentWorker = new Worker(
  QUEUE_NAMES.INCIDENT,
  async (job: Job) => {
    if (job.name === JOB_NAMES.CREATE_INCIDENT) {
      const { deviceId, deviceName, reason } = job.data;
      // Check if there's already an open incident for this device
      const existing = await prisma.incident.findFirst({
        where: { deviceId, status: { in: ['OPEN', 'INVESTIGATING'] } },
      });
      if (existing) {
        logger.debug({ deviceId }, 'Incident already exists for device');
        return;
      }
      await incidentService.create({
        deviceId,
        title: `Device Offline: ${deviceName}`,
        description: reason,
        severity: 'HIGH',
      });
    }
  },
  { connection, concurrency: 5 }
);

// ====== SUBSCRIPTION WORKER ======
const subscriptionWorker = new Worker(
  QUEUE_NAMES.SUBSCRIPTION,
  async (job: Job) => {
    if (job.name === JOB_NAMES.CHECK_EXPIRY) {
      logger.debug('Checking expired subscriptions...');
      const expired = await subscriptionService.getExpiredSubscriptions();
      for (const sub of expired) {
        await subscriptionService.expireSubscription(sub.id);
        logger.info({ subscriptionId: sub.id }, 'Subscription expired and suspended');
      }
    }
    if (job.name === JOB_NAMES.RENEWAL_REMINDER) {
      const expiring = await subscriptionService.getExpiringSubscriptions(7);
      for (const sub of expiring) {
        const daysLeft = Math.ceil(
          (new Date(sub.endDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        await notificationService.send({
          userId: sub.customer.userId,
          type: 'PLAN_EXPIRING',
          title: 'Subscription Expiring Soon',
          message: `Your subscription to ${sub.plan.name} expires in ${daysLeft} days. Please renew to avoid service interruption.`,
          meta: { subscriptionId: sub.id, daysLeft },
        });
      }
    }
  },
  { connection, concurrency: 3 }
);

// ====== TICKET WORKER ======
const ticketWorker = new Worker(
  QUEUE_NAMES.TICKET,
  async (job: Job) => {
    if (job.name === JOB_NAMES.TICKET_CREATED) {
      const { ticketId, priority } = job.data;
      // Auto-assign technician for high priority tickets
      if (['HIGH', 'CRITICAL'].includes(priority)) {
        const tech = await prisma.technician.findFirst({
          where: { status: 'AVAILABLE', deletedAt: null },
          include: { _count: { select: { tickets: { where: { isActive: true } } } } },
          orderBy: { updatedAt: 'asc' },
        });
        if (tech) {
          await ticketService.assignTechnician(ticketId, tech.id, 'SYSTEM');
        }
      }
    }
    if (job.name === JOB_NAMES.CHECK_SLA) {
      await ticketService.checkSlaBreach();
    }
  },
  { connection, concurrency: 5 }
);

// ====== MONITORING WORKER ======
const monitoringWorker = new Worker(
  QUEUE_NAMES.MONITORING,
  async (job: Job) => {
    if (job.name === JOB_NAMES.MONITOR_DEVICES) {
      await networkService.monitorAllDevices();
    }
  },
  { connection, concurrency: 1 }
);

// ====== INSTALLATION WORKER ======
const installationWorker = new Worker(
  QUEUE_NAMES.INSTALLATION,
  async (job: Job) => {
    if (job.name === JOB_NAMES.INSTALLATION_ASSIGNED) {
      const { installationId, customerId } = job.data;
      // Auto-assign technician
      const tech = await prisma.technician.findFirst({
        where: { status: 'AVAILABLE', deletedAt: null },
      });
      if (tech) {
        await prisma.installation.update({
          where: { id: installationId },
          data: { assignedTechnicianId: tech.id, status: 'ASSIGNED' },
        });

        // Notify customer
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          include: { user: true },
        });
        if (customer) {
          await notificationService.send({
            userId: customer.userId,
            type: 'TECHNICIAN_ASSIGNED',
            title: 'Technician Assigned for Installation',
            message: 'A technician has been assigned for your installation. You will be contacted shortly.',
          });
        }
      }
    }
    if (job.name === JOB_NAMES.INSTALLATION_COMPLETED) {
      const { installationId, connectionId, customerId } = job.data;
      // Notify customer
      const customer = await prisma.customer.findFirst({
        where: { id: customerId },
        include: { user: true },
      });
      if (customer) {
        await notificationService.send({
          userId: customer.userId,
          type: 'INSTALLATION_COMPLETED',
          title: 'Installation Completed',
          message: 'Your internet installation has been completed. You can now make payment to activate your service.',
        });
      }
    }
  },
  { connection, concurrency: 5 }
);

// Error handlers
[authWorker, notificationWorker, auditWorker, incidentWorker, subscriptionWorker, ticketWorker, monitoringWorker, installationWorker].forEach((worker) => {
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, `Worker job failed`);
  });
  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, jobName: job.name }, 'Worker job completed');
  });
  workers.push(worker);
});

export function getWorkers() {
  return workers;
}

export async function closeAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  logger.info('All workers closed');
}

export { authWorker, notificationWorker, auditWorker, incidentWorker, subscriptionWorker, ticketWorker, monitoringWorker, installationWorker };
