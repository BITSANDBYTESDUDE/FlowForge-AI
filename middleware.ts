import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Route protection.
 *
 * This is an optimistic gate, not the authorization boundary: it only checks
 * whether a session cookie is present, because verifying the session would
 * require a database round trip on every request including static assets.
 * Real enforcement lives in the API layer (`requireSession` /
 * `requirePermission`), which is what actually protects data. A forged cookie
 * gets past this middleware and then fails at the first API call.
 */

/** Routes that require a session cookie. */
const PROTECTED_PREFIXES = ['/dashboard', '/workflow'];

/**
 * Auth pages a signed-in user should be redirected away from.
 *
 * `/reset-password` is included even though it carries a token: a user with an
 * active session has no reason to set a password through it, and letting a
 * signed-in visitor render the form invites confusion about which account is
 * being changed.
 */
const AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    // Preserve where the user was heading so login can send them back.
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthPage = AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes (they enforce their own auth), Next internals, and files
  // with an extension (static assets, favicon, images).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};
