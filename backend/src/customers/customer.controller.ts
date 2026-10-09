import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { customerService } from './customer.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { AppError } from '../middleware/errorHandler';

const updateSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  kyc: z.any().optional(),
});

export class CustomerController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const { search, status, sortBy, sortOrder } = req.query;

      const { customers, total } = await customerService.list({
        search: search as string,
        status: status as string,
        page,
        limit,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });

      sendPaginated(res, customers, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await customerService.findById(req.params.id);
      sendSuccess(res, customer);
    } catch (error) {
      next(error);
    }
  }

  async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const customer = await customerService.findByUserId(req.user.userId);
      sendSuccess(res, customer);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = updateSchema.parse(req.body);
      const customer = await customerService.update(req.params.id, data);
      sendSuccess(res, customer, 'Customer updated');
    } catch (error) {
      next(error);
    }
  }

  async updateMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      const data = updateSchema.parse(req.body);
      // Get customer ID from user ID
      const { prisma } = await import('../config/database');
      const customer = await prisma.customer.findUnique({ where: { userId: req.user.userId } });
      if (!customer) throw new AppError('Customer profile not found', 404);
      const updated = await customerService.update(customer.id, data);
      sendSuccess(res, updated, 'Profile updated');
    } catch (error) {
      next(error);
    }
  }

  async suspend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      await customerService.suspend(req.params.id, req.user.userId);
      sendSuccess(res, null, 'Customer suspended');
    } catch (error) {
      next(error);
    }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);
      await customerService.activate(req.params.id, req.user.userId);
      sendSuccess(res, null, 'Customer activated');
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await customerService.getStats();
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
