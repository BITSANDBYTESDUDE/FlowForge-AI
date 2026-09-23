import type { Metadata } from 'next';
import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your FlowForge AI workspace.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Workflow className="size-4" aria-hidden="true" />
          </span>
          FlowForge AI
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        {children}
      </main>
    </div>
  );
}
