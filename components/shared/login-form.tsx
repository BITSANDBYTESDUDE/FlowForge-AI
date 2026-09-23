'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { signIn } from '@/lib/auth/client';
import { loginSchema, toFieldErrors } from '@/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Sign-in form.
 *
 * Validation runs client-side first for immediate feedback, then Better Auth
 * verifies the credentials. `next` is read from the query string so the
 * middleware can send a user back to the page they originally requested.
 *
 * Only same-origin relative paths are honoured for `next` — accepting an
 * absolute URL here would make this an open redirect.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({ email: '', password: '' });

  const rawNext = searchParams.get('next');
  const nextPath = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  function update(field: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    setPending(true);
    try {
      const { error } = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        // Better Auth returns a generic message for bad credentials on purpose;
        // distinguishing "no such user" from "wrong password" would enumerate accounts.
        setFormError(error.message ?? 'Those credentials did not work. Check your email and password.');
        return;
      }

      toast.success('Signed in');
      // Refresh so server components re-read the new session cookie.
      router.replace(nextPath);
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Welcome back</CardTitle>
        <CardDescription>Sign in to continue to your workspaces.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={values.email}
              onChange={(event) => update('email', event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              disabled={pending}
            />
            {errors.email ? (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => update('password', event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              disabled={pending}
            />
            {errors.password ? (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" loading={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            No account yet?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
