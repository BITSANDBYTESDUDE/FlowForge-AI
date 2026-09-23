'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api/client';

/**
 * Route-level error boundary.
 *
 * Next renders this in place of a crashed subtree. The message shown to the
 * user comes from `getErrorMessage`, which never surfaces a stack trace; the
 * full error goes to the console for local debugging.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button className="mt-5" onClick={reset}>
        <RefreshCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
