import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode: number = 200,
  meta?: ApiResponse['meta']
): Response {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    meta,
  };
  return res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, data?: T, message?: string): Response {
  return sendSuccess(res, data, message || 'Created successfully', 201);
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: Record<string, string[]>
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    error: message,
    errors,
  };
  return res.status(statusCode).json(response);
}

export function sendUnauthorized(res: Response, message: string = 'Unauthorized'): Response {
  return sendError(res, message, 401);
}

export function sendForbidden(res: Response, message: string = 'Forbidden'): Response {
  return sendError(res, message, 403);
}

export function sendNotFound(res: Response, message: string = 'Not found'): Response {
  return sendError(res, message, 404);
}

export function sendConflict(res: Response, message: string = 'Conflict'): Response {
  return sendError(res, message, 409);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message?: string
): Response {
  return sendSuccess(res, data, message, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
