import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { enforceRateLimit, type RateLimitBucket } from '@/lib/rate-limit';
import { requireSession, type ActiveSession } from '@/lib/auth/session';
import { ValidationError } from '@/lib/utils/errors';
import type { z, ZodTypeAny } from 'zod';

/**
 * Best-effort client address.
 *
 * Vercel sets `x-forwarded-for` with the client first; a self-hosted proxy may
 * append. We take the left-most entry, which is the only value a well-behaved
 * proxy guarantees, and fall back to a constant so the limiter still applies
 * rather than being bypassable by omitting headers.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

/**
 * Rate-limit identifiers must not store raw IPs. A truncated SHA-256 is stable
 * for the window's lifetime and is not reversible for IPv4 in practice.
 */
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/**
 * Parses and validates a JSON request body, converting failures to 400s.
 *
 * The generic is bound to the schema itself and the return type derived via
 * `z.output`, so callers get the *parsed* type. Typing it as `ZodType<T>` would
 * unify input and output, and TypeScript resolves that to the input type — which
 * makes fields with Zod `.default()` look optional at every call site.
 */
export async function parseJsonBody<TSchema extends ZodTypeAny>(
  request: NextRequest,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('The submitted data is invalid', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data as z.output<TSchema>;
}

/**
 * Guard for authenticated API routes.
 *
 * Enforces the rate limit before authentication so unauthenticated floods are
 * cheap to reject, then returns the session. Routes needing a permission call
 * `requirePermission` afterwards with the workspace id from the request.
 */
export async function requireApiSession(
  request: NextRequest,
  bucket: RateLimitBucket = 'api',
): Promise<ActiveSession> {
  const session = await requireSession();
  await enforceRateLimit(bucket, session.user.id);
  return session;
}

/** Guard for unauthenticated endpoints (auth, public listings): limit by IP. */
export async function limitAnonymousRequest(
  request: NextRequest,
  bucket: RateLimitBucket,
): Promise<void> {
  await enforceRateLimit(bucket, hashIdentifier(getClientIp(request)));
}
