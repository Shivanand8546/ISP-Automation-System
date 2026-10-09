import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { config } from '../config';
import { JwtPayload } from '../middleware/auth';
import { AppError, UnauthorizedError, ConflictError } from '../middleware/errorHandler';
import { addJob, QUEUE_NAMES, JOB_NAMES } from '../queues';
import { logger } from '../utils/logger';
import { Role } from '@prisma/client';

const SALT_ROUNDS = 12;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: Role;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
  device?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const { name, email, phone, password, role = 'CUSTOMER' } = input;

    // Check existing
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        throw new ConflictError('Phone number already registered');
      }
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, phone, passwordHash, role },
      });

      // Create customer profile if role is CUSTOMER
      if (role === 'CUSTOMER') {
        const customerCode = await this.generateCustomerCode(tx);
        await tx.customer.create({
          data: {
            userId: newUser.id,
            customerCode,
            email,
            phone,
          },
        });
      }

      return newUser;
    });

    // Create session and tokens
    return this.createSession(user, { ip: '', userAgent: '', device: '' });
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const { email, password, ip, userAgent, device } = input;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is suspended');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      // Queue failed login event
      await addJob(QUEUE_NAMES.AUDIT, JOB_NAMES.WRITE_AUDIT, {
        action: 'LOGIN_FAILED',
        userEmail: email,
        meta: { ip, userAgent },
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const result = await this.createSession(user, { ip, userAgent, device });

    // Queue background events (non-blocking)
    await addJob(QUEUE_NAMES.AUTH, JOB_NAMES.LOGIN_SUCCESS, {
      userId: user.id,
      email: user.email,
      ip,
      userAgent,
      device,
    });

    return result;
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });

    // Queue logout event
    await addJob(QUEUE_NAMES.AUTH, JOB_NAMES.LOGOUT_EVENT, {
      userId,
      sessionId,
    });
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const tokenHash = hashToken(refreshToken);

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account suspended');
    }

    const payload: JwtPayload = {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiry,
    } as jwt.SignOptions);

    // Update last activity
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    return { accessToken };
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            customerCode: true,
            address: true,
            city: true,
            state: true,
            status: true,
          },
        },
        technician: {
          select: {
            id: true,
            serviceArea: true,
            status: true,
          },
        },
      },
    });

    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) throw new AppError('User not found', 404);

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedError('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all sessions
    await prisma.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  async getSessions(userId: string) {
    return prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        device: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(
    user: { id: string; email: string; name: string; role: Role },
    meta: { ip?: string; userAgent?: string; device?: string }
  ): Promise<AuthResult> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + config.app.sessionExpiryDays * 24 * 60 * 60 * 1000
    );

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ip: meta.ip,
        userAgent: meta.userAgent,
        device: meta.device,
        expiresAt,
      },
    });

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiry,
    } as jwt.SignOptions);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private async generateCustomerCode(tx: any): Promise<string> {
    const count = await tx.customer.count();
    return `ISP${String(count + 1001).padStart(6, '0')}`;
  }
}

export const authService = new AuthService();
