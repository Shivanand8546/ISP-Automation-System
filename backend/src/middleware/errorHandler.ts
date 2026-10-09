import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 400, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

export class ValidationError extends AppError {
  errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>, message: string = 'Validation failed') {
    super(message, 422);
    this.errors = errors;
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    const issues = (err as any).issues || (err as any).errors || [];
    issues.forEach((e: any) => {
      const key = (e.path && e.path.length > 0) ? e.path.join('.') : 'root';
      if (!errors[key]) errors[key] = [];
      errors[key].push(e.message || 'Validation error');
    });
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, url: req.url, method: req.method }, 'Unexpected application error');
    }
    return sendError(res, err.message, err.statusCode);
  }

  // Prisma errors
  if ((err as any).code === 'P2002') {
    const target = (err as any).meta?.target;
    return sendError(res, `Duplicate value for: ${target?.join(', ')}`, 409);
  }

  if ((err as any).code === 'P2025') {
    return sendError(res, 'Record not found', 404);
  }

  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  return sendError(res, 'Internal server error', 500);
}

export function notFoundHandler(req: Request, res: Response): Response {
  return sendError(res, `Route not found: ${req.method} ${req.url}`, 404);
}
