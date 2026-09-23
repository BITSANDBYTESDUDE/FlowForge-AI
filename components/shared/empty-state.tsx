import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Empty state.
 *
 * Every list in the app renders this instead of a blank region. The optional
 * `action` slot is what turns an empty screen into a next step, so lists should
 * pass a real primary action wherever one exists.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
