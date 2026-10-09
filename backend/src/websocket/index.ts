import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { JwtPayload } from '../middleware/auth';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as JwtPayload;
    logger.debug({ userId: user.userId, socketId: socket.id }, 'Socket connected');

    // Join personal room
    socket.join(`user:${user.userId}`);

    // Join role rooms
    if (['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'].includes(user.role)) {
      socket.join('admin');
    }
    if (user.role === 'TECHNICIAN') {
      socket.join('technician');
    }

    socket.on('JOIN_TICKET', (ticketId: string) => {
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('LEAVE_TICKET', (ticketId: string) => {
      socket.leave(`ticket:${ticketId}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ userId: user.userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

export function getSocketServer(): Server | null {
  return io;
}
