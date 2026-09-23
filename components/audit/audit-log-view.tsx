'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { auditApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { formatDateTime, formatRelative } from '@/lib/utils/format';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 25;
const ALL = 'ALL';

/**
 * Actions an admin is most likely to be looking for, offered as a filter.
 * Kept explicit rather than derived from the enum so the dropdown order reflects
 * what matters in a review, not alphabetical accident.
 */
const ACTION_FILTERS = [
  'WORKFLOW_CREATED',
  'WORKFLOW_UPDATED',
  'WORKFLOW_DELETED',
  'WORKFLOW_EXECUTED',
  'MEMBER_INVITED',
  'MEMBER_REMOVED',
  'ROLE_CHANGED',
  'AI_GENERATION',
] as const;

/** Severity intent per action, so destructive events stand out at a glance. */
const ACTION_VARIANT: Record<string, BadgeProps['variant']> = {
  WORKFLOW_DELETED: 'destructive',
  WORKSPACE_DELETED: 'destructive',
  MEMBER_REMOVED: 'destructive',
  ROLE_CHANGED: 'warning',
  MEMBER_INVITED: 'success',
  WORKFLOW_CREATED: 'success',
  WORKFLOW_EXECUTED: 'secondary',
  AI_GENERATION: 'secondary',
};

/** "WORKFLOW_CREATED" -> "Workflow created" */
function humanise(action: string): string {
  const lower = action.replaceAll('_', ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Audit log.
 *
 * Read-only by construction: the API exposes no write method, because entries
 * are produced by `recordAudit` at the moment of the audited action. There is
 * therefore no edit or delete affordance to render here.
 *
 * Requires `audit:read` (ADMIN or OWNER). A VIEWER or MEMBER who reaches this
 * page is refused by the API with a 403, which is shown as an explanatory card
 * rather than an empty table — an empty table would read as "nothing has
 * happened", which is a different and misleading claim.
 */
export function AuditLogView() {
  const { activeWorkspace, isLoading: workspaceLoading, can } = useWorkspace();
  const [action, setAction] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const mayRead = can('audit:read');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit', activeWorkspace?.id, action, page],
    queryFn: () =>
      auditApi.list({
        workspaceId: activeWorkspace!.id,
        action: action === ALL ? undefined : action,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeWorkspace) && mayRead,
  });

  if (workspaceLoading) return <AuditSkeleton />;
  if (!activeWorkspace) return <NoWorkspaceState />;

  if (!mayRead) {
    return (
      <>
        <PageHeader
          title="Audit log"
          description="A permanent record of sensitive changes made in this workspace."
        />
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldCheck className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">You do not have access to the audit log</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Only workspace owners and admins can review the audit log. Ask an owner if you need
              access.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  if (isLoading) return <AuditSkeleton />;

  if (isError) {
    return (
      <>
        <PageHeader title="Audit log" />
        <Card className="mt-6">
          <CardContent className="p-5 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load the audit log'}
          </CardContent>
        </Card>
      </>
    );
  }

  const entries = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          <>
            A permanent, append-only record of sensitive changes in{' '}
            <span className="font-medium text-foreground">{activeWorkspace.name}</span>.
          </>
        }
        actions={
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[220px]" aria-label="Filter by action">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {ACTION_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanise(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={ShieldCheck}
          title="No audit entries"
          description={
            action === ALL
              ? 'Sensitive actions such as deleting a workflow or changing a role are recorded here.'
              : 'No entries match this action filter.'
          }
          action={
            action === ALL ? undefined : (
              <Button variant="outline" onClick={() => setAction(ALL)}>
                Clear filter
              </Button>
            )
          }
        />
      ) : (
        <Card className="mt-6 overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="hidden md:table-cell">Entity</TableHead>
                  <TableHead className="hidden lg:table-cell">Details</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[entry.action] ?? 'outline'}>
                        {humanise(entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{entry.actor.name}</span>
                      {entry.actor.email ? (
                        <span className="block text-xs text-muted-foreground">
                          {entry.actor.email}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {entry.entityType}
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] truncate text-xs text-muted-foreground lg:table-cell">
                      {Object.keys(entry.metadata).length > 0
                        ? JSON.stringify(entry.metadata)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                        {formatRelative(entry.createdAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} entries
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AuditSkeleton() {
  return (
    <>
      <PageHeader title="Audit log" description="Loading…" />
      <Card className="mt-6">
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
