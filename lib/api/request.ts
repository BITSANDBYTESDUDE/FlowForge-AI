import type { NextRequest } from 'next/server';
import { enforceRateLimit, type RateLimitBucket } from '@/lib/rate-limit';
import { requireSession, type ActiveSession } from '@/lib/auth/session';
import { ValidationError } from '@/lib/utils/errors';
import type { z, ZodTypeAny } from 'zod';

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
 * Returns the session and then charges the rate limit against the user id, so
 * one noisy account cannot consume another's budget. The session is resolved
 * first because the identifier has to be trustworthy — limiting by a
 * client-supplied value would make the limiter trivially bypassable. Routes
 * needing a permission call `requirePermission` afterwards with the workspace id
 * from the request.
 *
 * Unauthenticated endpoints should be limited by IP instead; Better Auth's own
 * routes handle that internally (see `getAuthRateLimitConfig`).
 */
export async function requireApiSession(
  request: NextRequest,
  bucket: RateLimitBucket = 'api',
): Promise<ActiveSession> {
  const session = await requireSession();
  await enforceRateLimit(bucket, session.user.id);
  return session;
}
