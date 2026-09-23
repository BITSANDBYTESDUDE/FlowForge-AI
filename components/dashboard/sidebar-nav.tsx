'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  LayoutDashboard,
  Layers,
  ListChecks,
  ScrollText,
  Settings,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import type { Permission } from '@/lib/permissions';

/**
 * `permission` gates visibility to what the current role can actually open. The
 * audit log is admin-only, so showing it to every member would advertise a page
 * that answers with a 403. This is a UI convenience — the API still enforces it.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true, permission: null },
  { href: '/dashboard/workflows', label: 'Workflows', icon: Workflow, exact: false, permission: null },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListChecks, exact: false, permission: null },
  { href: '/dashboard/templates', label: 'Templates', icon: Layers, exact: false, permission: null },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, exact: false, permission: null },
  { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText, exact: false, permission: 'audit:read' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, exact: false, permission: null },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
  permission: Permission | null;
}>;

/**
 * Primary dashboard navigation.
 *
 * Active state is derived from the pathname so deep links (a workflow inside
 * `/dashboard/workflows/...`) still highlight their section.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { activeWorkspace, can } = useWorkspace();

  function hrefFor(href: string) {
    return activeWorkspace ? `${href}?workspace=${activeWorkspace.id}` : href;
  }

  const items = NAV_ITEMS.filter((item) => item.permission === null || can(item.permission));

  return (
    <nav aria-label="Dashboard" className="space-y-0.5">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={hrefFor(item.href)}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
