import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { logger } from '../utils/logger';
import { pruneExpiredIdempotencyKeys } from '../middleware/idempotency';

const connection: ConnectionOptions = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

export async function startScheduler(): Promise<void> {
  // Schedule subscription expiry check every minute
  const subscriptionQueue = new Queue(QUEUE_NAMES.SUBSCRIPTION, { connection });
  await subscriptionQueue.upsertJobScheduler(
    'subscription-expiry-check',
    { every: 60 * 1000 }, // every minute
    { name: JOB_NAMES.CHECK_EXPIRY, data: {} }
  );

  // Schedule renewal reminders every hour
  await subscriptionQueue.upsertJobScheduler(
    'renewal-reminders',
    { every: 60 * 60 * 1000 }, // every hour
    { name: JOB_NAMES.RENEWAL_REMINDER, data: {} }
  );

  // Schedule network monitoring every 30 seconds
  const monitoringQueue = new Queue(QUEUE_NAMES.MONITORING, { connection });
  await monitoringQueue.upsertJobScheduler(
    'device-monitoring',
    { every: 30 * 1000 }, // every 30 seconds
    { name: JOB_NAMES.MONITOR_DEVICES, data: {} }
  );

  // Schedule SLA check every 15 minutes
  const ticketQueue = new Queue(QUEUE_NAMES.TICKET, { connection });
  await ticketQueue.upsertJobScheduler(
    'sla-check',
    { every: 15 * 60 * 1000 }, // every 15 minutes
    { name: JOB_NAMES.CHECK_SLA, data: {} }
  );

  // Prune expired idempotency keys every hour
  setInterval(async () => {
    try {
      const count = await pruneExpiredIdempotencyKeys();
      if (count > 0) logger.info({ count }, 'Scheduler: pruned expired idempotency keys');
    } catch (err) {
      logger.error({ err }, 'Scheduler: idempotency key prune failed');
    }
  }, 60 * 60 * 1000);

  // Run once immediately on startup to clean any leftovers
  pruneExpiredIdempotencyKeys().catch(() => {});

  logger.info('Scheduler started: subscription-expiry, renewal-reminders, device-monitoring, sla-check, idempotency-prune');
}

