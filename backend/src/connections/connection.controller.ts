import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { connectionService } from './connection.service';
import { sendSuccess, sendCreated } from '../utils/response';
import { AppError } from '../middleware/errorHandler';

const createSchema = z.object({
  planId: z.string().uuid(),
  installationAddress: z.string().min(5),
  preferredDate: z.string().optional(),
});

export class ConnectionController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const data = createSchema.parse(req.body);

      // Get customer ID
      const { prisma } = await import('../config/database');
      let customerId = req.body.customerId;
      
      if (!customerId && req.user.role === 'CUSTOMER') {
        const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
        if (!customer) throw new AppError('Customer profile not found', 404);
        customerId = customer.id;
      }

      const result = await connectionService.create({
        customerId,
        planId: data.planId,
        installationAddress: data.installationAddress,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : undefined,
      });

      sendCreated(res, result, 'Connection request created');
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connections = await connectionService.list(
        req.query.customerId as string,
        req.query.status as string
      );
      sendSuccess(res, connections);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connection = await connectionService.findById(req.params.id);
      sendSuccess(res, connection);
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      await connectionService.activate(req.params.id, req.user.userId);
      sendSuccess(res, null, 'Connection activated');
    } catch (error) {
      next(error);
    }
  }

  async suspend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      await connectionService.suspend(req.params.id, req.user.userId);
      sendSuccess(res, null, 'Connection suspended');
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      await connectionService.cancel(req.params.id, req.user.userId);
      sendSuccess(res, null, 'Connection cancelled');
    } catch (error) {
      next(error);
    }
  }
}

export const connectionController = new ConnectionController();
