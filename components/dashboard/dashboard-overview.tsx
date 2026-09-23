'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ListChecks,
  Sparkles,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { analyticsApi, workflowsApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { formatRelative } from '@/lib/utils/format';
import { MetricCard } from '@/components/analytics/metric-card';
import { ActivityTrendChart } from '@/components/analytics/charts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { AiSuggestions } from '@/components/dashboard/ai-suggestions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { WorkflowStatusBadge } from '@/components/shared/status-badges';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';

/**
 * Dashboard overview.
 *
 * Every figure comes from `/api/analytics` for the active workspace. There are no
 * placeholder numbers: while loading, cards show skeletons rather than zeros,
 * because a zero that later becomes 12 misleads more than a skeleton does.
 */
export function DashboardOverview() {
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const workspaceId = activeWorkspace?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analytics', workspaceId, 30],
    queryFn: () => analyticsApi.overview(workspaceId!, 30),
    enabled: Boolean(workspaceId),
  });

  const recentWorkflows = useQuery({
    queryKey: ['workflows', workspaceId, 'recent'],
    queryFn: () => workflowsApi.list({ workspaceId: workspaceId!, limit: 5, page: 1 }),
    enabled: Boolean(workspaceId),
  });

  if (workspaceLoading) {
    return <OverviewSkeleton />;
  }

  if (!activeWorkspace) {
    return <NoWorkspaceState />;
  }

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{activeWorkspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {metrics
              ? `${metrics.workflows.active} active workflow${metrics.workflows.active === 1 ? '' : 's'} · ${metrics.tasks.open} open task${metrics.tasks.open === 1 ? '' : 's'}`
              : 'Workspace overview'}
          </p>
        </div>
        <Button asChild>
          <Link href={`/dashboard/workflows?workspace=${activeWorkspace.id}&new=ai`}>
            <Sparkles className="size-4" />
            Generate with AI
          </Link>
        </Button>
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-5 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {error instanceof Error ? error.message : 'Could not load analytics'}
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active workflows"
          value={metrics?.workflows.active ?? 0}
          hint={metrics ? `${metrics.workflows.total} total` : undefined}
          icon={WorkflowIcon}
          loading={isLoading}
        />
        <MetricCard
          label="Open tasks"
          value={metrics?.tasks.open ?? 0}
          hint={metrics ? `${metrics.tasks.completed} completed` : undefined}
          icon={ListChecks}
          loading={isLoading}
        />
        <MetricCard
          label="Overdue"
          value={metrics?.tasks.overdue ?? 0}
          hint={metrics?.tasks.overdue ? 'Needs attention' : 'Nothing past due'}
          icon={Clock}
          tone={metrics?.tasks.overdue ? 'destructive' : 'default'}
          loading={isLoading}
        />
        <MetricCard
          label="Completion rate"
          value={metrics ? `${Math.round(metrics.tasks.completionRate)}%` : '—'}
          hint={
            metrics?.averageCompletionHours !== null && metrics?.averageCompletionHours !== undefined
              ? `Avg ${Math.round(metrics.averageCompletionHours)}h to complete`
              : 'Across all tasks'
          }
          icon={CheckCircle2}
          tone="success"
          loading={isLoading}
        />
      </div>

      {/* ------------------------------------------------------------- charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activity over 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ActivityTrendChart data={data?.taskTrend ?? []} />
            )}
          </CardContent>
        </Card>

        <AiSuggestions />
      </div>

      {/* ------------------------------------------- workflows and activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Recent workflows</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href={`/dashboard/workflows?workspace=${activeWorkspace.id}`}>
                View all
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentWorkflows.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (recentWorkflows.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={WorkflowIcon}
                title="No workflows yet"
                description="Describe a process and let FlowForge AI build your first workflow."
                action={
                  <Button asChild size="sm">
                    <Link href={`/dashboard/workflows?workspace=${activeWorkspace.id}&new=ai`}>
                      <Sparkles className="size-4" />
                      Generate with AI
                    </Link>
                  </Button>
                }
                className="border-0 py-8"
              />
            ) : (
              <ul className="divide-y">
                {recentWorkflows.data?.items.map((workflow) => (
                  <li key={workflow.id}>
                    <Link
                      href={`/workflow/${workflow.id}?workspace=${activeWorkspace.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{workflow.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {workflow.nodeCount} step{workflow.nodeCount === 1 ? '' : 's'} · updated{' '}
                          {formatRelative(workflow.updatedAt)}
                        </p>
                      </div>
                      <WorkflowStatusBadge status={workflow.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed limit={8} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 w-full lg:col-span-2" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
