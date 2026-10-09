import { prisma } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { getSocketServer } from '../websocket';
import { logger } from '../utils/logger';
import { NetworkDeviceStatus, NetworkMetricSimStatus } from '@prisma/client';

// ====== NETWORK SIMULATOR ======
function simulateMetrics(simStatus: NetworkMetricSimStatus) {
  switch (simStatus) {
    case 'NORMAL':
      return {
        cpuPercent: Math.random() * 30 + 5,
        memoryPercent: Math.random() * 40 + 20,
        bandwidthIn: Math.random() * 100 + 10,
        bandwidthOut: Math.random() * 80 + 5,
        latencyMs: Math.random() * 5 + 1,
        packetLoss: Math.random() * 0.5,
        uptime: Math.floor(Math.random() * 3600 * 24 * 30),
        status: 'ONLINE' as NetworkDeviceStatus,
      };
    case 'HIGH_LATENCY':
      return {
        cpuPercent: Math.random() * 50 + 30,
        memoryPercent: Math.random() * 50 + 30,
        bandwidthIn: Math.random() * 60 + 10,
        bandwidthOut: Math.random() * 50 + 5,
        latencyMs: Math.random() * 200 + 100,
        packetLoss: Math.random() * 5 + 1,
        uptime: Math.floor(Math.random() * 3600 * 24),
        status: 'DEGRADED' as NetworkDeviceStatus,
      };
    case 'HIGH_PACKET_LOSS':
      return {
        cpuPercent: Math.random() * 40 + 20,
        memoryPercent: Math.random() * 50 + 30,
        bandwidthIn: Math.random() * 50 + 5,
        bandwidthOut: Math.random() * 40 + 5,
        latencyMs: Math.random() * 50 + 20,
        packetLoss: Math.random() * 30 + 10,
        uptime: Math.floor(Math.random() * 3600 * 12),
        status: 'DEGRADED' as NetworkDeviceStatus,
      };
    case 'HIGH_CPU':
      return {
        cpuPercent: Math.random() * 20 + 80,
        memoryPercent: Math.random() * 20 + 70,
        bandwidthIn: Math.random() * 90 + 50,
        bandwidthOut: Math.random() * 80 + 40,
        latencyMs: Math.random() * 20 + 5,
        packetLoss: Math.random() * 2,
        uptime: Math.floor(Math.random() * 3600 * 24),
        status: 'DEGRADED' as NetworkDeviceStatus,
      };
    case 'HIGH_BANDWIDTH':
      return {
        cpuPercent: Math.random() * 50 + 40,
        memoryPercent: Math.random() * 40 + 40,
        bandwidthIn: 950 + Math.random() * 50,
        bandwidthOut: 900 + Math.random() * 100,
        latencyMs: Math.random() * 10 + 5,
        packetLoss: Math.random() * 1,
        uptime: Math.floor(Math.random() * 3600 * 24 * 7),
        status: 'DEGRADED' as NetworkDeviceStatus,
      };
    case 'OFFLINE':
      return {
        cpuPercent: 0,
        memoryPercent: 0,
        bandwidthIn: 0,
        bandwidthOut: 0,
        latencyMs: 0,
        packetLoss: 100,
        uptime: 0,
        status: 'OFFLINE' as NetworkDeviceStatus,
      };
    default:
      return simulateMetrics('NORMAL');
  }
}

export class NetworkService {
  async listDevices(filters: { status?: string; type?: string; search?: string; page?: number; limit?: number }) {
    const { status, type, search, page = 1, limit = 20 } = filters;
    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search } },
        { deviceCode: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [devices, total] = await Promise.all([
      prisma.networkDevice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { status: 'asc' },
        include: {
          metrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
          _count: { select: { incidents: true } },
        },
      }),
      prisma.networkDevice.count({ where }),
    ]);

    return { devices, total };
  }

  async findDeviceById(id: string) {
    const device = await prisma.networkDevice.findFirst({
      where: { id, deletedAt: null },
      include: {
        metrics: { orderBy: { recordedAt: 'desc' }, take: 24 },
        incidents: { orderBy: { createdAt: 'desc' }, take: 5 },
        interfaces: true,
      },
    });
    if (!device) throw new NotFoundError('Device not found');
    return device;
  }

  async createDevice(data: {
    name: string;
    ipAddress: string;
    type: any;
    vendor?: string;
    model?: string;
    location?: string;
    description?: string;
  }) {
    const deviceCode = `DEV-${Date.now().toString(36).toUpperCase()}`;
    return prisma.networkDevice.create({
      data: { ...data, deviceCode, status: 'UNKNOWN' },
    });
  }

  async updateDevice(id: string, data: any) {
    const device = await prisma.networkDevice.findFirst({ where: { id, deletedAt: null } });
    if (!device) throw new NotFoundError('Device not found');
    return prisma.networkDevice.update({ where: { id }, data });
  }

  async deleteDevice(id: string) {
    const device = await prisma.networkDevice.findFirst({ where: { id, deletedAt: null } });
    if (!device) throw new NotFoundError('Device not found');
    return prisma.networkDevice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async setSimulationStatus(deviceId: string, simStatus: NetworkMetricSimStatus) {
    const device = await prisma.networkDevice.findFirst({ where: { id: deviceId } });
    if (!device) throw new NotFoundError('Device not found');
    return prisma.networkDevice.update({ where: { id: deviceId }, data: { simStatus } });
  }

  async monitorAllDevices(): Promise<void> {
    const devices = await prisma.networkDevice.findMany({
      where: { deletedAt: null },
      include: { metrics: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    });

    const io = getSocketServer();

    for (const device of devices) {
      const simMetrics = simulateMetrics(device.simStatus);
      const previousStatus = device.status;
      const newStatus = simMetrics.status;

      // Record metrics
      await prisma.networkMetric.create({
        data: {
          deviceId: device.id,
          cpuPercent: simMetrics.cpuPercent,
          memoryPercent: simMetrics.memoryPercent,
          bandwidthIn: simMetrics.bandwidthIn,
          bandwidthOut: simMetrics.bandwidthOut,
          latencyMs: simMetrics.latencyMs,
          packetLoss: simMetrics.packetLoss,
          uptime: simMetrics.uptime,
        },
      });

      // Update device status
      await prisma.networkDevice.update({
        where: { id: device.id },
        data: { status: newStatus, lastSeen: newStatus !== 'OFFLINE' ? new Date() : device.lastSeen },
      });

      // Emit status to frontend
      io?.emit('DEVICE_STATUS_CHANGED', {
        deviceId: device.id,
        deviceCode: device.deviceCode,
        name: device.name,
        status: newStatus,
        metrics: simMetrics,
      });

      // Handle status changes
      if (previousStatus !== 'OFFLINE' && newStatus === 'OFFLINE') {
        logger.warn({ deviceId: device.id, name: device.name }, 'Device went offline');
        await addJob(QUEUE_NAMES.INCIDENT, JOB_NAMES.CREATE_INCIDENT, {
          deviceId: device.id,
          deviceName: device.name,
          reason: 'Device went offline',
        });
      }

      if (previousStatus === 'OFFLINE' && newStatus !== 'OFFLINE') {
        logger.info({ deviceId: device.id, name: device.name }, 'Device came back online');
        // Auto-resolve open incidents for this device
        await this.resolveDeviceIncidents(device.id);
      }
    }
  }

  private async resolveDeviceIncidents(deviceId: string): Promise<void> {
    const openIncidents = await prisma.incident.findMany({
      where: { deviceId, status: { in: ['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } },
    });

    for (const incident of openIncidents) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });

      await prisma.incidentUpdate.create({
        data: {
          incidentId: incident.id,
          message: 'Device came back online. Incident auto-resolved.',
          updatedBy: 'SYSTEM',
        },
      });

      const io = getSocketServer();
      io?.emit('INCIDENT_RESOLVED', { incidentId: incident.id, deviceId });
    }
  }

  async getDeviceStats() {
    const [total, online, offline, degraded] = await Promise.all([
      prisma.networkDevice.count({ where: { deletedAt: null } }),
      prisma.networkDevice.count({ where: { status: 'ONLINE', deletedAt: null } }),
      prisma.networkDevice.count({ where: { status: 'OFFLINE', deletedAt: null } }),
      prisma.networkDevice.count({ where: { status: 'DEGRADED', deletedAt: null } }),
    ]);
    return { total, online, offline, degraded };
  }
}

export const networkService = new NetworkService();
