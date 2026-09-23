import { z } from 'zod';

/**
 * Client-side credential schemas.
 *
 * Mirrors Better Auth's configured constraints (`minPasswordLength: 10`), so the
 * form rejects what the server would reject instead of round-tripping to find
 * out. The server remains the authority — these exist for feedback, not security.
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

export const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(80),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address').max(254),
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .max(128, 'Use at most 128 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/** Maps a Zod error to a `{ field: message }` record for inline display. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
