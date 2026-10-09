import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Queue names
export const QUEUE_NAMES = {
  AUTH: 'auth',
  NOTIFICATION: 'notification',
  BILLING: 'billing',
  SUBSCRIPTION: 'subscription',
  INVOICE: 'invoice',
  TICKET: 'ticket',
  INSTALLATION: 'installation',
  MONITORING: 'monitoring',
  INCIDENT: 'incident',
  AUDIT: 'audit',
  REPORT: 'report',
  EMAIL: 'email',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Job names
export const JOB_NAMES = {
  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT_EVENT: 'LOGOUT_EVENT',
  SUSPICIOUS_LOGIN: 'SUSPICIOUS_LOGIN',

  // Billing
  PROCESS_PAYMENT: 'PROCESS_PAYMENT',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  GENERATE_INVOICE: 'GENERATE_INVOICE',

  // Subscription
  CHECK_EXPIRY: 'CHECK_EXPIRY',
  RENEWAL_REMINDER: 'RENEWAL_REMINDER',
  AUTO_SUSPEND: 'AUTO_SUSPEND',
  AUTO_ACTIVATE: 'AUTO_ACTIVATE',
  SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',

  // Tickets
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_ASSIGNED: 'TICKET_ASSIGNED',
  TICKET_ESCALATION: 'TICKET_ESCALATION',
  CHECK_SLA: 'CHECK_SLA',

  // Installation
  INSTALLATION_ASSIGNED: 'INSTALLATION_ASSIGNED',
  INSTALLATION_COMPLETED: 'INSTALLATION_COMPLETED',

  // Monitoring
  MONITOR_DEVICES: 'MONITOR_DEVICES',
  DEVICE_STATUS_CHANGE: 'DEVICE_STATUS_CHANGE',
  CHECK_INCIDENTS: 'CHECK_INCIDENTS',

  // Incident
  CREATE_INCIDENT: 'CREATE_INCIDENT',
  RESOLVE_INCIDENT: 'RESOLVE_INCIDENT',

  // Notification
  SEND_NOTIFICATION: 'SEND_NOTIFICATION',
  SEND_EMAIL: 'SEND_EMAIL',

  // Audit
  WRITE_AUDIT: 'WRITE_AUDIT',

  // Reports
  GENERATE_REPORT: 'GENERATE_REPORT',
} as const;

const connection: ConnectionOptions = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

// Queue registry
const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

export async function addJob<T>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: { delay?: number; priority?: number; repeat?: { every?: number; cron?: string } }
): Promise<void> {
  try {
    const queue = getQueue(queueName);
    await queue.add(jobName, data, options);
    logger.debug({ queueName, jobName }, 'Job added to queue');
  } catch (error) {
    logger.error({ err: error, queueName, jobName }, 'Failed to add job to queue');
    // Don't throw - queue failures should not break main operations
  }
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
