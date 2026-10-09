/**
 * Idempotency Middleware — Production Implementation
 *
 * Guarantees at-most-once semantics for mutating HTTP endpoints.
 *
 * Protocol:
 *  1. Client sends  Idempotency-Key: <uuid>  header on POST/PUT/PATCH.
 *  2. First request:  record created (IN_PROGRESS), handler runs, response stored.
 *  3. Duplicate request (same key + same body hash):
 *       - IN_PROGRESS  → 409 with Retry-After
 *       - COMPLETED    → cached response replayed (X-Idempotency-Replayed: true)
 *       - FAILED       → allowed through for retry
 *       - EXPIRED      → treated as fresh (stale record deleted)
 *  4. Reuse with different body  → 422 Unprocessable.
 *  5. Reuse on different endpoint/method → 422 Unprocessable.
 *
 * Storage: prisma.idempotencyKey  (@@unique [userId, key])
 * TTL:     config.app.idempotencyKeyTtlHours  (default 24h)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { config } from '../config';
import { AppError, ConflictError } from './errorHandler';
import { logger } from '../utils/logger';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Stable SHA-256 hash of the request body (sorted keys → deterministic) */
function hashBody(body: unknown): string {
  const normalised =
    body && typeof body === 'object'
      ? JSON.stringify(body, Object.keys(body as object).sort())
      : JSON.stringify(body ?? {});
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

/** TTL from config, defaulting to 24 hours */
function ttlMs(): number {
  return (config.app.idempotencyKeyTtlHours ?? 24) * 60 * 60 * 1000;
}

// ─── middleware factory ──────────────────────────────────────────────────────

/**
 * Usage:
 *   router.post('/payments', authenticate, idempotencyMiddleware(), handler)
 *
 * Options:
 *   required  – when true, requests without the header are rejected (400).
 *               Default: false (header optional; no header = pass through).
 */
export function idempotencyMiddleware(options: { required?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = (req.headers['idempotency-key'] as string | undefined)?.trim();

    // ── 1. Header absent ────────────────────────────────────────────────────
    if (!key) {
      if (options.required) {
        return next(new AppError('Idempotency-Key header is required for this endpoint', 400));
      }
      return next(); // optional — skip idempotency entirely
    }

    // ── 2. Key format guard ─────────────────────────────────────────────────
    if (key.length > 255) {
      return next(new AppError('Idempotency-Key must be ≤ 255 characters', 400));
    }

    // ── 3. Auth required ────────────────────────────────────────────────────
    if (!req.user) {
      return next(new AppError('Authentication is required to use idempotency keys', 401));
    }

    const userId      = req.user.userId;
    const requestHash = hashBody(req.body);
    const endpoint    = req.path;        // e.g. "/payments"
    const method      = req.method;      // e.g. "POST"

    try {
      // ── 4. Look up existing record ────────────────────────────────────────
      const existing = await prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId, key } },
      });

      if (existing) {
        // ── 4a. Expired → delete and fall through to create ─────────────────
        if (existing.expiresAt < new Date()) {
          await prisma.idempotencyKey.delete({
            where: { userId_key: { userId, key } },
          }).catch(() => {}); // race-safe
          // fall through to create fresh record
        }
        // ── 4b. Still valid ──────────────────────────────────────────────────
        else {
          // Reject cross-endpoint reuse
          if (existing.endpoint !== endpoint || existing.method !== method) {
            return next(
              new AppError(
                `Idempotency-Key was previously used for ${existing.method} ${existing.endpoint}. ` +
                  `It cannot be reused for ${method} ${endpoint}.`,
                422
              )
            );
          }

          // Reject body mismatch
          if (existing.requestHash !== requestHash) {
            return next(
              new AppError(
                'Idempotency-Key has been reused with a different request payload.',
                422
              )
            );
          }

          // Still processing — tell client to back off
          if (existing.status === 'IN_PROGRESS') {
            res
              .status(409)
              .setHeader('Retry-After', '2')
              .setHeader('X-Idempotency-Status', 'IN_PROGRESS')
              .json({
                success: false,
                message: 'This request is still being processed. Retry after 2 seconds.',
                retryAfter: 2,
              });
            return;
          }

          // Previously failed → allow a clean retry (delete old record)
          if (existing.status === 'FAILED') {
            logger.info({ key, userId }, 'Idempotency: retrying failed request');
            await prisma.idempotencyKey.delete({
              where: { userId_key: { userId, key } },
            }).catch(() => {});
            // fall through to create fresh record
          }

          // Completed → replay cached response
          if (existing.status === 'COMPLETED' && existing.responseBody != null) {
            logger.info({ key, userId }, 'Idempotency: replaying completed response');
            res
              .status(existing.responseStatus ?? 200)
              .setHeader('X-Idempotency-Status', 'REPLAYED')
              .setHeader('X-Idempotency-Replayed', 'true')
              .json(existing.responseBody);
            return;
          }
          // COMPLETED but responseBody is null (shouldn't happen) → fall through
        }
      }

      // ── 5. Create IN_PROGRESS record ─────────────────────────────────────
      const expiresAt = new Date(Date.now() + ttlMs());
      try {
        await prisma.idempotencyKey.create({
          data: { key, userId, endpoint, method, requestHash, status: 'IN_PROGRESS', expiresAt },
        });
      } catch (err: any) {
        // P2002 = unique constraint violation → concurrent duplicate request
        if (err.code === 'P2002') {
          res
            .status(409)
            .setHeader('Retry-After', '2')
            .setHeader('X-Idempotency-Status', 'IN_PROGRESS')
            .json({
              success: false,
              message: 'A concurrent request with this key is already being processed.',
              retryAfter: 2,
            });
          return;
        }
        throw err;
      }

      // ── 6. Intercept res.json to persist the response ────────────────────
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        const statusCode  = res.statusCode;
        const finalStatus = statusCode >= 200 && statusCode < 300 ? 'COMPLETED' : 'FAILED';

        prisma.idempotencyKey
          .update({
            where: { userId_key: { userId, key } },
            data: {
              status:         finalStatus,
              responseStatus: statusCode,
              responseBody:   body as any,
            },
          })
          .catch((err) => {
            logger.error({ err, key, userId }, 'Idempotency: failed to persist response');
          });

        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

// ─── cleanup utility (call from a scheduled job) ────────────────────────────

/**
 * Delete expired idempotency key records.
 * Recommended to run hourly via your BullMQ scheduler.
 *
 *   await pruneExpiredIdempotencyKeys();
 */
export async function pruneExpiredIdempotencyKeys(): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  logger.info({ deleted: result.count }, 'Idempotency: pruned expired keys');
  return result.count;
}
