'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { resetPassword } from '@/lib/auth/client';
import { resetPasswordSchema, toFieldErrors } from '@/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Choose a new password from an emailed reset token.
 *
 * The token arrives in the query string. It is passed to Better Auth, which
 * verifies the signature and expiry server-side — the client never decides
 * whether a token is valid, and a tampered token simply fails.
 *
 * A missing token is caught before rendering the form rather than after a
 * pointless submit: the link was truncated or hand-typed.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [done, setDone] = useState(false);

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

    const parsed = resetPasswordSchema.safeParse({ token, ...values });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    setPending(true);
    try {
      // On success Better Auth validates and rotates the credential, and revokes
      // existing sessions for the account.
      const { error } = await resetPassword({
        newPassword: parsed.data.password,
        token: parsed.data.token,
      });

      if (error) {
        setFormError(
          error.message ??
            'That reset link is no longer valid. Request a new one and try again.',
        );
        return;
      }

      toast.success('Password updated');
      setDone(true);
      // Give the confirmation a beat before moving to sign-in.
      setTimeout(() => router.replace('/login'), 1500);
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">This link is incomplete</CardTitle>
          <CardDescription>
            The reset link is missing its token. It may have been cut off by your email client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">Password updated</CardTitle>
          <CardDescription>
            Your password has been changed and any other signed-in sessions were signed out. Taking
            you to sign in…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Choose a new password</CardTitle>
        <CardDescription>Pick something you have not used before.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {formError}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={values.password}
              onChange={(event) => update('password', event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : 'password-hint'}
              disabled={pending}
            />
            {errors.password ? (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password}
              </p>
            ) : (
              <p id="password-hint" className="text-xs text-muted-foreground">
                At least 10 characters, including a letter and a number.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) => update('confirmPassword', event.target.value)}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
              disabled={pending}
            />
            {errors.confirmPassword ? (
              <p id="confirm-error" className="text-xs text-destructive">
                {errors.confirmPassword}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" loading={pending}>
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
