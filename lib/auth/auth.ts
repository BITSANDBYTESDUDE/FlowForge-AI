import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { getEnv } from '@/lib/env';
import { getMongoDb } from '@/lib/db/connect';

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

export const auth = betterAuth({
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
  // Must be last: it writes session cookies through Next's cookie store, which
  // is required for server actions and route handlers to persist the session.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
