import { Skeleton } from '@/components/ui/skeleton';

/**
 * Generic route-level loading fallback.
 *
 * Feature routes define their own skeletons that mirror their real layout; this
 * exists so a navigation never shows a blank screen while a segment streams.
 */
export default function Loading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
