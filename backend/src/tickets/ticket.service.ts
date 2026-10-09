import { prisma } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';
import { TicketPriority, TicketCategory } from '@prisma/client';
import { config } from '../config';

export interface CreateTicketInput {
  customerId: string;
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
}

export class TicketService {
  private getSlaDeadline(priority: TicketPriority): Date {
    const hours = config.sla[priority.toLowerCase() as keyof typeof config.sla] || 24;
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  private async generateTicketNumber(): Promise<string> {
    const count = await prisma.ticket.count();
    return `TKT-${new Date().getFullYear()}-${String(count + 1001).padStart(6, '0')}`;
  }

  async create(input: CreateTicketInput) {
    const { customerId, title, description, priority = 'MEDIUM', category = 'GENERAL' } = input;

    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Customer not found');

    const ticketNumber = await this.generateTicketNumber();
    const slaDeadline = this.getSlaDeadline(priority);

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        customerId,
        title,
        description,
        priority,
        category,
        status: 'OPEN',
        slaDeadline,
      },
      include: { customer: { include: { user: true } } },
    });

    // Queue auto-assignment
    await addJob(QUEUE_NAMES.TICKET, JOB_NAMES.TICKET_CREATED, {
      ticketId: ticket.id,
      priority,
    });

    // Notify via socket
    const io = getSocketServer();
    io?.to('admin').emit('NEW_TICKET', {
      ticketId: ticket.id,
      ticketNumber,
      priority,
      title,
    });

    return ticket;
  }

  async list(filters: {
    status?: string;
    priority?: string;
    category?: string;
    customerId?: string;
    assignedTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, priority, category, customerId, assignedTo, search, page = 1, limit = 20 } = filters;
    const where: any = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          customer: { include: { user: { select: { name: true } } } },
          assignments: {
            where: { isActive: true },
            include: { technician: true },
          },
          _count: { select: { comments: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return { tickets, total };
  }

  async findById(id: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        customer: { include: { user: true } },
        comments: { orderBy: { createdAt: 'asc' } },
        assignments: {
          include: { technician: { include: { user: true } } },
          orderBy: { assignedAt: 'desc' },
        },
        escalations: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  async addComment(ticketId: string, userId: string, content: string, isInternal = false) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Ticket not found');

    const comment = await prisma.ticketComment.create({
      data: { ticketId, userId, content, isInternal },
    });

    // Update ticket status if needed
    if (ticket.status === 'WAITING_FOR_CUSTOMER') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    const io = getSocketServer();
    io?.to(`ticket:${ticketId}`).emit('TICKET_UPDATED', { ticketId, type: 'COMMENT' });

    return comment;
  }

  async updateStatus(ticketId: string, status: string, userId: string) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Ticket not found');

    const data: any = { status };
    if (status === 'RESOLVED') data.resolvedAt = new Date();
    if (status === 'CLOSED') data.closedAt = new Date();

    const updated = await prisma.ticket.update({ where: { id: ticketId }, data });

    const io = getSocketServer();
    io?.to(`ticket:${ticketId}`).emit('TICKET_UPDATED', { ticketId, status });
    io?.to('admin').emit('TICKET_UPDATED', { ticketId, status });

    // If resolved, notify customer
    if (status === 'RESOLVED') {
      await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
        userId: ticket.customerId, // Will be resolved to user ID in worker
        ticketId,
        type: 'TICKET_RESOLVED',
        title: 'Ticket Resolved',
        message: `Your ticket ${ticket.ticketNumber} has been resolved.`,
      });
    }

    return updated;
  }

  async assignTechnician(ticketId: string, technicianId: string, assignedBy?: string) {
    const [ticket, technician] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticketId } }),
      prisma.technician.findUnique({ where: { id: technicianId } }),
    ]);

    if (!ticket) throw new NotFoundError('Ticket not found');
    if (!technician) throw new NotFoundError('Technician not found');

    // Deactivate previous assignments
    await prisma.ticketAssignment.updateMany({
      where: { ticketId, isActive: true },
      data: { isActive: false, unassignedAt: new Date() },
    });

    // Create new assignment
    await prisma.ticketAssignment.create({
      data: { ticketId, technicianId, assignedBy, isActive: true },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'ASSIGNED' },
    });

    await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
      userId: ticket.customerId,
      type: 'TICKET_ASSIGNED',
      title: 'Technician Assigned',
      message: `A technician has been assigned to your ticket ${ticket.ticketNumber}`,
    });

    return { success: true };
  }

  async escalate(ticketId: string, reason: string, escalatedBy?: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { customer: true },
    });
    if (!ticket) throw new NotFoundError('Ticket not found');

    await prisma.ticketEscalation.create({
      data: {
        ticketId,
        escalatedTo: 'SUPERVISOR',
        escalatedBy,
        reason,
      },
    });

    if (ticket.priority !== 'CRITICAL') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          priority: ticket.priority === 'HIGH' ? 'CRITICAL' : 'HIGH',
        },
      });
    }

    const io = getSocketServer();
    io?.to('admin').emit('TICKET_UPDATED', {
      ticketId,
      type: 'ESCALATED',
      priority: ticket.priority,
    });
  }

  async getStats() {
    const [open, inProgress, resolved, critical] = await Promise.all([
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'ASSIGNED'] } } }),
      prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { priority: 'CRITICAL', status: { not: 'CLOSED' } } }),
    ]);

    // SLA breached
    const slaBreached = await prisma.ticket.count({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        slaDeadline: { lt: new Date() },
      },
    });

    return { open, inProgress, resolved, critical, slaBreached };
  }

  async checkSlaBreach() {
    const breached = await prisma.ticket.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        slaDeadline: { lt: new Date() },
      },
      include: { customer: { include: { user: true } } },
    });

    for (const ticket of breached) {
      await this.escalate(ticket.id, 'SLA deadline breached automatically', 'SYSTEM');
    }
  }
}

export const ticketService = new TicketService();
