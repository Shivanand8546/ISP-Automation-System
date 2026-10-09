import { prisma } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';

export class TechnicianService {
  async list(filters: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = filters;
    const where: any = { deletedAt: null };
    if (status) where.status = status;

    const [technicians, total] = await Promise.all([
      prisma.technician.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
          _count: {
            select: {
              tickets: { where: { isActive: true } },
              installations: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } },
            },
          },
        },
      }),
      prisma.technician.count({ where }),
    ]);

    return { technicians, total };
  }

  async findById(id: string) {
    const tech = await prisma.technician.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { name: true, email: true } },
        tickets: {
          where: { isActive: true },
          include: { ticket: { select: { title: true, priority: true, status: true } } },
        },
        installations: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PENDING'] } },
          include: { customer: { include: { user: { select: { name: true } } } } },
        },
        incidents: { where: { status: { not: 'CLOSED' } }, take: 5 },
      },
    });
    if (!tech) throw new NotFoundError('Technician not found');
    return tech;
  }

  async create(data: {
    userId: string;
    name: string;
    phone: string;
    serviceArea: string[];
    maxWorkload?: number;
  }) {
    return prisma.technician.create({
      data: {
        userId: data.userId,
        name: data.name,
        phone: data.phone,
        serviceArea: data.serviceArea,
        maxWorkload: data.maxWorkload || 10,
        status: 'AVAILABLE',
      },
    });
  }

  async update(id: string, data: any) {
    const tech = await prisma.technician.findFirst({ where: { id, deletedAt: null } });
    if (!tech) throw new NotFoundError('Technician not found');
    return prisma.technician.update({ where: { id }, data });
  }

  async getInstallations(technicianId: string) {
    return prisma.installation.findMany({
      where: { assignedTechnicianId: technicianId },
      include: {
        customer: { include: { user: { select: { name: true } } } },
        connection: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async completeInstallation(installationId: string, technicianId: string) {
    const installation = await prisma.installation.findFirst({
      where: { id: installationId, assignedTechnicianId: technicianId },
      include: { connection: { include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });

    if (!installation) throw new NotFoundError('Installation not found or not assigned to you');

    await prisma.installation.update({
      where: { id: installationId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await addJob(QUEUE_NAMES.INSTALLATION, JOB_NAMES.INSTALLATION_COMPLETED, {
      installationId,
      connectionId: installation.connectionId,
      customerId: installation.customerId,
    });

    return { success: true, message: 'Installation completed' };
  }

  async getWorkloadStats() {
    const techs = await prisma.technician.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: {
            tickets: { where: { isActive: true } },
            installations: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } },
          },
        },
      },
    });

    return techs.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      activeTickets: t._count.tickets,
      activeInstallations: t._count.installations,
      workload: t._count.tickets + t._count.installations,
    }));
  }
}

export const technicianService = new TechnicianService();
