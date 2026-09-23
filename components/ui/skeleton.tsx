import type * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Skeleton placeholder.
 *
 * Marked `aria-hidden` because a screen reader gains nothing from an empty box;
 * the surrounding region announces loading via `aria-busy` instead.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
