import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { planService } from './plan.service';
import { sendSuccess, sendCreated } from '../utils/response';

const planSchema = z.object({
  name: z.string().min(2).max(100),
  speedMbps: z.number().int().positive(),
  price: z.number().positive(),
  billingCycleDays: z.number().int().positive().optional(),
  dataLimitGb: z.number().int().positive().nullable().optional(),
  installationFee: z.number().min(0).optional(),
  activationFee: z.number().min(0).optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
});

export class PlanController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true' && 
        ['SUPER_ADMIN', 'ISP_ADMIN'].includes(req.user?.role || '');
      const plans = await planService.list(includeInactive);
      sendSuccess(res, plans);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await planService.findById(req.params.id);
      sendSuccess(res, plan);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = planSchema.parse(req.body);
      const plan = await planService.create(data);
      sendCreated(res, plan, 'Plan created');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = planSchema.partial().parse(req.body);
      const plan = await planService.update(req.params.id, data);
      sendSuccess(res, plan, 'Plan updated');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await planService.delete(req.params.id);
      sendSuccess(res, null, 'Plan deleted');
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await planService.toggleStatus(req.params.id);
      sendSuccess(res, plan, `Plan ${plan.isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
      next(error);
    }
  }
}

export const planController = new PlanController();
