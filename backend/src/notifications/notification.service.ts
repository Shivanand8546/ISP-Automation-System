import { prisma } from '../config/database';
import { getSocketServer } from '../websocket';
import { NotificationType } from '@prisma/client';

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  meta?: Record<string, unknown>;
}

export class NotificationService {
  async send(input: SendNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        meta: input.meta as any,
      },
    });

    // Emit real-time notification
    const io = getSocketServer();
    io?.to(`user:${input.userId}`).emit('NOTIFICATION_CREATED', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  async list(userId: string, unreadOnly = false, page = 1, limit = 20) {
    const where: any = { userId };
    if (unreadOnly) where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  async markRead(id: string, userId: string) {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }
}

export const notificationService = new NotificationService();
