import { prisma } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';
import { IncidentSeverity } from '@prisma/client';

export class IncidentService {
  async create(data: {
    deviceId?: string;
    title: string;
    description?: string;
    severity?: IncidentSeverity;
    affectedArea?: string;
  }) {
    const incident = await prisma.incident.create({
      data: {
        deviceId: data.deviceId,
        title: data.title,
        description: data.description,
        severity: data.severity || 'MEDIUM',
        affectedArea: data.affectedArea,
        status: 'OPEN',
      },
      include: { device: true },
    });

    // Auto-assign technician
    const tech = await prisma.technician.findFirst({
      where: { status: 'AVAILABLE', deletedAt: null },
    });

    if (tech) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: { technicianId: tech.id },
      });
    }

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] }, status: 'ACTIVE' },
    });

    for (const admin of admins) {
      await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
        userId: admin.id,
        type: 'NETWORK_INCIDENT',
        title: 'Network Incident Created',
        message: `Incident: ${incident.title}. Severity: ${incident.severity}`,
        meta: { incidentId: incident.id },
      });
    }

    const io = getSocketServer();
    io?.emit('INCIDENT_CREATED', {
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      deviceId: incident.deviceId,
    });

    return incident;
  }

  async list(filters: { status?: string; severity?: string; page?: number; limit?: number }) {
    const { status, severity, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        include: {
          device: true,
          technician: { include: { user: { select: { name: true } } } },
          updates: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    return { incidents, total };
  }

  async findById(id: string) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        device: true,
        technician: { include: { user: true } },
        updates: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!incident) throw new NotFoundError('Incident not found');
    return incident;
  }

  async updateStatus(id: string, status: string, message?: string, updatedBy?: string) {
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const data: any = { status };
    if (status === 'RESOLVED') data.resolvedAt = new Date();
    if (status === 'CLOSED') data.closedAt = new Date();

    await prisma.$transaction([
      prisma.incident.update({ where: { id }, data }),
      prisma.incidentUpdate.create({
        data: { incidentId: id, message: message || `Status changed to ${status}`, updatedBy },
      }),
    ]);

    if (status === 'RESOLVED') {
      const io = getSocketServer();
      io?.emit('INCIDENT_RESOLVED', { incidentId: id });

      // Notify admins
      const admins = await prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] } },
      });
      for (const admin of admins) {
        await addJob(QUEUE_NAMES.NOTIFICATION, JOB_NAMES.SEND_NOTIFICATION, {
          userId: admin.id,
          type: 'INCIDENT_RESOLVED',
          title: 'Incident Resolved',
          message: `Incident "${incident.title}" has been resolved.`,
        });
      }
    }
  }

  async assignTechnician(id: string, technicianId: string) {
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');
    return prisma.incident.update({ where: { id }, data: { technicianId } });
  }

  async getStats() {
    const [open, critical, resolved] = await Promise.all([
      prisma.incident.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
      prisma.incident.count({ where: { severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
      prisma.incident.count({ where: { status: 'RESOLVED' } }),
    ]);
    return { open, critical, resolved };
  }
}

export const incidentService = new IncidentService();
