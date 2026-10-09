import { prisma } from '../config/database';
import { AppError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { UserStatus } from '@prisma/client';

export interface CustomerFilter {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class CustomerService {
  async list(filter: CustomerFilter) {
    const {
      search,
      status,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filter;

    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { customerCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status as UserStatus;
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { name: true, email: true, role: true } },
          connections: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: { id: true, status: true, plan: { select: { name: true } } },
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: { id: true, status: true, endDate: true, plan: { select: { name: true, price: true } } },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total };
  }

  async findById(id: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { name: true, email: true, role: true, status: true, createdAt: true } },
        connections: {
          include: { plan: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { invoice: true },
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!customer) throw new NotFoundError('Customer not found');
    return customer;
  }

  async findByUserId(userId: string) {
    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
        connections: {
          include: {
            plan: true,
            subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer) throw new NotFoundError('Customer profile not found');
    return customer;
  }

  async update(id: string, data: {
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    kyc?: any;
  }) {
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundError('Customer not found');

    return prisma.customer.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async suspend(id: string, adminId: string) {
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundError('Customer not found');

    await prisma.$transaction([
      prisma.customer.update({ where: { id }, data: { status: 'SUSPENDED' } }),
      prisma.user.update({ where: { id: customer.userId }, data: { status: 'SUSPENDED' } }),
      prisma.connection.updateMany({
        where: { customerId: id, status: 'ACTIVE' },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      }),
    ]);

    await addJob(QUEUE_NAMES.AUDIT, JOB_NAMES.WRITE_AUDIT, {
      userId: adminId,
      action: 'CUSTOMER_SUSPENDED',
      entityType: 'Customer',
      entityId: id,
    });
  }

  async activate(id: string, adminId: string) {
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundError('Customer not found');

    await prisma.$transaction([
      prisma.customer.update({ where: { id }, data: { status: 'ACTIVE' } }),
      prisma.user.update({ where: { id: customer.userId }, data: { status: 'ACTIVE' } }),
    ]);

    await addJob(QUEUE_NAMES.AUDIT, JOB_NAMES.WRITE_AUDIT, {
      userId: adminId,
      action: 'CUSTOMER_ACTIVATED',
      entityType: 'Customer',
      entityId: id,
    });
  }

  async getStats() {
    const [total, active, suspended] = await Promise.all([
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.customer.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.customer.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
    ]);
    return { total, active, suspended };
  }
}

export const customerService = new CustomerService();
