import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
        <Compass className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        The page you are looking for does not exist, or you may not have access to it.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
