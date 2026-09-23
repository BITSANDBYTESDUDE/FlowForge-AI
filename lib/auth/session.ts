import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import { UnauthenticatedError } from '@/lib/utils/errors';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  plan: string;
};

export type ActiveSession = {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
};

/**
 * Reads the current session from the request headers.
 *
 * Returns `null` rather than throwing so callers that render optional chrome
 * (marketing header, public template gallery) can branch without a try/catch.
 */
export async function getSession(): Promise<ActiveSession | null> {
  const requestHeaders = await headers();

  const result = await auth.api.getSession({ headers: requestHeaders });
  if (!result?.user || !result.session) return null;

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      image: result.user.image ?? null,
      plan: (result.user as { plan?: string }).plan ?? 'FREE',
    },
    sessionId: result.session.id,
    expiresAt: new Date(result.session.expiresAt),
  };
}

/**
 * Session accessor for API routes and server actions.
 *
 * Every authenticated handler must go through this instead of trusting a
 * user id supplied by the client.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function requireUser(): Promise<SessionUser> {
  return (await requireSession()).user;
}
