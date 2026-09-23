'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/client';

/**
 * Client-side provider stack.
 *
 * Kept as a single client component so `app/layout.tsx` can stay a server
 * component. The QueryClient is created in state rather than at module scope:
 * a module-level client would be shared across requests on the server and leak
 * one user's cached data into another's render.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Retrying a 4xx just repeats a decision the server already made.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: 'border-border bg-card text-card-foreground',
                description: 'text-muted-foreground',
              },
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
