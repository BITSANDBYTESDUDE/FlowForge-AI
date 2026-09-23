import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { getEnv } from '@/lib/env';
import { getMongoDb } from '@/lib/db/connect';
import { sendEmail } from '@/lib/notifications';
import { logger } from '@/lib/utils/logger';

/**
 * Better Auth owns credentials and sessions.
 *
 * The `user` collection is shared with our Mongoose `User` model, so the
 * additional `plan` field is declared here — Better Auth is the only writer for
 * auth-owned documents, and Mongoose must agree on the shape or it would strip
 * the field on read.
 *
 * The database is resolved through an async factory so the connection stays
 * lazy: importing this module never opens a socket, which keeps build-time and
 * middleware imports safe. Better Auth awaits the factory before building its
 * adapter (verified against 1.1.x), but its published `database` type does not
 * yet include the function form, hence the single cast below.
 */
const env = getEnv();

const resolveDatabase = (async (options: BetterAuthOptions) => {
  const db = await getMongoDb();
  return mongodbAdapter(db)(options);
}) as unknown as BetterAuthOptions['database'];

/**
 * Builds the shared config.
 *
 * `withNextCookies` exists because the `nextCookies` plugin writes session
 * cookies through Next's `cookies()` helper, which throws outside a request
 * scope. That is correct for the app and wrong for scripts and background jobs —
 * see `serverAuth` below.
 */
function buildOptions(withNextCookies: boolean): BetterAuthOptions {
  return {
    appName: 'FlowForge AI',
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
    secret: env.AUTH_SECRET,
    database: resolveDatabase,
    emailAndPassword: {
      enabled: true,
      // Minimum 10 characters, plus a letter/digit requirement enforced in the
      // registration schema. Better Auth hashes with scrypt and never stores
      // plaintext.
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      /**
       * Password reset.
       *
       * Better Auth generates the token and calls this to deliver it. The link
       * points at our own `/reset-password` page rather than Better Auth's
       * built-in endpoint, because that endpoint returns JSON — a user clicking
       * it in an inbox needs a form, not a response body.
       *
       * `sendEmail` is currently a no-op placeholder (see lib/notifications), so
       * in development the reset link is written to the server log instead of an
       * inbox. The token, expiry and account invalidation are all real.
       */
      sendResetPassword: async ({ user, token }) => {
        const url = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
        await sendEmail({
          to: user.email,
          subject: 'Reset your FlowForge AI password',
          body: `Use this link within 1 hour to choose a new password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        });
        if (env.NODE_ENV !== 'production') {
          // Local development only, so the flow is testable without a mail
          // provider. Never log a live reset token in production.
          logger.info(`Password reset link for ${user.email}: ${url}`);
        }
      },
      resetPasswordTokenExpiresIn: 60 * 60,
    },
    user: {
      additionalFields: {
        plan: {
          type: 'string',
          required: false,
          defaultValue: 'FREE',
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    },
    // Must be last when present: it writes session cookies through Next's
    // cookie store, which route handlers and server actions require.
    plugins: withNextCookies ? [nextCookies()] : [],
  };
}

/** The app's auth instance. Used by route handlers and server components. */
export const auth = betterAuth(buildOptions(true));

/**
 * Request-scope-free instance for scripts (seeding, migrations) and future
 * background jobs.
 *
 * It talks to the same database and applies the same password hashing; it
 * simply cannot set response cookies, because there is no response. Calling
 * `auth.api.*` from a script would throw "cookies was called outside a request
 * scope", so those callers should use this instance instead.
 */
export const serverAuth = betterAuth(buildOptions(false));

export type AuthSession = typeof auth.$Infer.Session;
