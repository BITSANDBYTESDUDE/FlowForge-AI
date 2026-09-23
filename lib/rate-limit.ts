import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getEnv, hasRedis } from '@/lib/env';
import { RateLimitError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Rate limiting abstraction.
 *
 * Upstash Redis is used when configured (correct across serverless instances).
 * Otherwise we fall back to an in-process fixed window, which is adequate for a
 * single long-lived dev server and is deliberately *not* presented as
 * production-grade — the log line says so.
 */
export type RateLimitBucket = 'ai' | 'auth' | 'api';

type BucketConfig = { limit: number; windowSeconds: number };

export function getBucketConfig(bucket: RateLimitBucket): BucketConfig {
  const env = getEnv();
  switch (bucket) {
    case 'ai':
      return { limit: env.RATE_LIMIT_AI_REQUESTS, windowSeconds: env.RATE_LIMIT_AI_WINDOW_SECONDS };
    case 'auth':
      return {
        limit: env.RATE_LIMIT_AUTH_REQUESTS,
        windowSeconds: env.RATE_LIMIT_AUTH_WINDOW_SECONDS,
      };
    case 'api':
      return { limit: env.RATE_LIMIT_API_REQUESTS, windowSeconds: env.RATE_LIMIT_API_WINDOW_SECONDS };
  }
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

/* ------------------------------------------------------------------ Upstash */

let redisLimiters: Record<string, Ratelimit> | null = null;

function getRedisLimiter(bucket: RateLimitBucket): Ratelimit | null {
  if (!hasRedis()) return null;

  if (!redisLimiters) {
    const env = getEnv();
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });

    redisLimiters = {
      ai: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          getBucketConfig('ai').limit,
          `${getBucketConfig('ai').windowSeconds} s`,
        ),
        prefix: 'flowforge:rl:ai',
        analytics: false,
      }),
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          getBucketConfig('auth').limit,
          `${getBucketConfig('auth').windowSeconds} s`,
        ),
        prefix: 'flowforge:rl:auth',
        analytics: false,
      }),
      api: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          getBucketConfig('api').limit,
          `${getBucketConfig('api').windowSeconds} s`,
        ),
        prefix: 'flowforge:rl:api',
        analytics: false,
      }),
    };
  }

  return redisLimiters[bucket] ?? null;
}

/* ------------------------------------------------------- In-memory fallback */

type Window = { count: number; resetAt: number };
const memoryWindows = new Map<string, Window>();

// Without eviction the map grows unbounded in a long-running process.
function evictExpired(now: number): void {
  if (memoryWindows.size < 5_000) return;
  for (const [key, window] of memoryWindows) {
    if (window.resetAt <= now) memoryWindows.delete(key);
  }
}

function memoryLimit(key: string, config: BucketConfig): RateLimitResult {
  const now = Date.now();
  evictExpired(now);

  const existing = memoryWindows.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowSeconds * 1000;
    memoryWindows.set(key, { count: 1, resetAt });
    return { success: true, limit: config.limit, remaining: config.limit - 1, resetAt };
  }

  existing.count += 1;
  const remaining = Math.max(0, config.limit - existing.count);
  return { success: existing.count <= config.limit, limit: config.limit, remaining, resetAt: existing.resetAt };
}

/* ------------------------------------------------------------------- Public */

let warnedAboutFallback = false;

/**
 * Consumes one token for `identifier` in `bucket`.
 *
 * `identifier` should be a stable, non-sensitive key — a user id when known,
 * otherwise a hashed IP. Never pass raw credentials.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitResult> {
  const config = getBucketConfig(bucket);
  const limiter = getRedisLimiter(bucket);

  if (!limiter) {
    if (!warnedAboutFallback && getEnv().NODE_ENV === 'production') {
      warnedAboutFallback = true;
      logger.warn('Rate limiting is using the in-memory fallback; configure Upstash in production');
    }
    return memoryLimit(`${bucket}:${identifier}`, config);
  }

  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.reset,
  };
}

/** Throwing variant used by API routes. */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(bucket, identifier);
  if (!result.success) {
    const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }
  return result;
}

/** Test-only: clears the in-memory windows between cases. */
export function resetRateLimits(): void {
  memoryWindows.clear();
  warnedAboutFallback = false;
}
