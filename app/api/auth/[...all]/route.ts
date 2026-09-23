import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/auth';

/**
 * Better Auth's catch-all handler.
 *
 * All auth endpoints (sign-up, sign-in, sign-out, session, password reset) are
 * served from here. Rate limiting for `/api/auth/*` is applied in `middleware.ts`
 * so it runs before Better Auth processes the request.
 */
export const { GET, POST } = toNextJsHandler(auth);
