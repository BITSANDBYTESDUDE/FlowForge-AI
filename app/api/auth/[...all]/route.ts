import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/auth';

/**
 * Better Auth's catch-all handler.
 *
 * All auth endpoints (sign-up, sign-in, sign-out, session, password reset) are
 * served from here. Rate limiting for `/api/auth/*` is configured through the
 * `rateLimit` option in `lib/auth/auth.ts` rather than in `middleware.ts`, which
 * deliberately skips API routes. See `getAuthRateLimitConfig` for why the
 * library defaults are replaced instead of left in place.
 */
export const { GET, POST } = toNextJsHandler(auth);
