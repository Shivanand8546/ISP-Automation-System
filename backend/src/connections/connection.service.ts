import { prisma } from '../config/database';
import { NotFoundError, AppError, ConflictError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';
import { logger } from '../utils/logger';

export interface CreateConnectionInput {
  customerId: string;
  planId: string;
  installationAddress: string;
  preferredDate?: Date;
}

export class ConnectionService {
  async create(input: CreateConnectionInput) {
    const { customerId, planId, installationAddress, preferredDate } = input;

    // Verify customer and plan exist
    const [customer, plan] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } }),
      prisma.plan.findFirst({ where: { id: planId, isActive: true, deletedAt: null } }),
    ]);

    if (!customer) throw new NotFoundError('Customer not found');
    if (!plan) throw new NotFoundError('Plan not found or inactive');

    // Check for existing active/pending connection
    const existingActive = await prisma.connection.findFirst({
      where: { customerId, status: { in: ['ACTIVE', 'INSTALLATION_REQUIRED', 'PENDING'] } },
    });
    if (existingActive) {
      throw new ConflictError('Customer already has an active or pending connection');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create connection
      const connection = await tx.connection.create({
        data: { customerId, planId, installationAddress, status: 'INSTALLATION_REQUIRED' },
      });

      // Create subscription (pending)
      const subscription = await tx.subscription.create({
        data: {
          customerId,
          planId,
          connectionId: connection.id,
          status: 'PENDING',
        },
      });

      // Create installation request
      const installation = await tx.installation.create({
        data: {
          customerId,
          connectionId: connection.id,
          address: installationAddress,
          preferredDate: preferredDate ? new Date(preferredDate) : null,
          status: 'PENDING',
        },
      });

      return { connection, subscription, installation };
    });

    // Queue auto-assignment
    await addJob(QUEUE_NAMES.INSTALLATION, JOB_NAMES.INSTALLATION_ASSIGNED, {
      installationId: result.installation.id,
      customerId,
    });

    return result;
  }

  async list(customerId?: string, status?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    return prisma.connection.findMany({
      where,
      include: {
        customer: { include: { user: { select: { name: true } } } },
        plan: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        installation: { include: { assignedTechnician: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const connection = await prisma.connection.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { name: true, email: true } } } },
        plan: true,
        subscriptions: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
        installation: { include: { assignedTechnician: true } },
      },
    });
    if (!connection) throw new NotFoundError('Connection not found');
    return connection;
  }

  async activate(id: string, adminId?: string) {
    const connection = await prisma.connection.findUnique({ where: { id } });
    if (!connection) throw new NotFoundError('Connection not found');

    await prisma.connection.update({
      where: { id },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    const io = getSocketServer();
    io?.emit('CONNECTION_UPDATED', { connectionId: id, status: 'ACTIVE' });

    await addJob(QUEUE_NAMES.AUDIT, JOB_NAMES.WRITE_AUDIT, {
      userId: adminId,
      action: 'CONNECTION_ACTIVATED',
      entityType: 'Connection',
      entityId: id,
    });
  }

  async suspend(id: string, adminId?: string) {
    const connection = await prisma.connection.findUnique({ where: { id } });
    if (!connection) throw new NotFoundError('Connection not found');

    await prisma.connection.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });

    const io = getSocketServer();
    io?.emit('CONNECTION_UPDATED', { connectionId: id, status: 'SUSPENDED' });
  }

  async cancel(id: string, adminId?: string) {
    await prisma.connection.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  async updatePlan(id: string, newPlanId: string) {
    const connection = await prisma.connection.findUnique({ where: { id } });
    if (!connection) throw new NotFoundError('Connection not found');

    const plan = await prisma.plan.findFirst({ where: { id: newPlanId, isActive: true } });
    if (!plan) throw new NotFoundError('Plan not found');

    return prisma.connection.update({ where: { id }, data: { planId: newPlanId } });
  }
}

export const connectionService = new ConnectionService();
