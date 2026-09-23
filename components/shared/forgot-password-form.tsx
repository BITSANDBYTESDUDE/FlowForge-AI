'use client';

import { useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { forgetPassword } from '@/lib/auth/client';
import { forgotPasswordSchema } from '@/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Request a password reset link.
 *
 * On success this always shows the same confirmation, whether or not the address
 * belongs to an account. Reporting "no such user" would let anyone enumerate
 * which emails are registered, so the ambiguity is intentional and matches the
 * generic message Better Auth returns from the sign-in endpoint.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useIsHydrated();
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }

    setPending(true);
    try {
      const { error: requestError } = await forgetPassword({
        email: parsed.data.email,
        redirectTo: '/reset-password',
      });
      if (requestError) {
        setError(requestError.message ?? 'Could not send a reset link. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10">
            <Mail className="size-4 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">Check your email</CardTitle>
          <CardDescription>
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            we sent a link to reset your password. The link expires in one hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Nothing arrived? Check spam, or confirm the address you signed up with.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            Use a different email
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Reset your password</CardTitle>
        <CardDescription>
          Enter the email you signed up with and we will send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
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
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              aria-invalid={Boolean(error)}
              disabled={pending}
            />
          </div>

          <Button type="submit" className="w-full" loading={pending} disabled={!hydrated}>
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3" aria-hidden="true" />
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
