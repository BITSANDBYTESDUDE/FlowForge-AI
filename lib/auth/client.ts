'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser auth client. Only the base URL is needed — every secret stays on the
 * server, and Better Auth's client never receives the auth secret.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});

export const { signIn, signUp, signOut, useSession, getSession, updateUser, forgetPassword, resetPassword } =
  authClient;
