import { prisma } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';

export interface PlanInput {
  name: string;
  speedMbps: number;
  price: number;
  billingCycleDays?: number;
  dataLimitGb?: number | null;
  installationFee?: number;
  activationFee?: number;
  description?: string;
  features?: string[];
}

export class PlanService {
  async list(includeInactive = false) {
    return prisma.plan.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { price: 'asc' },
    });
  }

  async findById(id: string) {
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  }

  async create(data: PlanInput) {
    return prisma.plan.create({
      data: {
        name: data.name,
        speedMbps: data.speedMbps,
        price: data.price,
        billingCycleDays: data.billingCycleDays ?? 30,
        dataLimitGb: data.dataLimitGb,
        installationFee: data.installationFee ?? 0,
        activationFee: data.activationFee ?? 0,
        description: data.description,
        features: data.features ?? [],
      },
    });
  }

  async update(id: string, data: Partial<PlanInput>) {
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');
    return prisma.plan.update({ where: { id }, data });
  }

  async delete(id: string) {
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');
    // Soft delete
    return prisma.plan.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async toggleStatus(id: string) {
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');
    return prisma.plan.update({ where: { id }, data: { isActive: !plan.isActive } });
  }
}

export const planService = new PlanService();
