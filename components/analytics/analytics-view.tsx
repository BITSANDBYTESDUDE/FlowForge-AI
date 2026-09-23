'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { analyticsApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { MetricCard } from '@/components/analytics/metric-card';
import {
  ActivityTrendChart,
  OverdueByAssigneeChart,
  TaskStatusChart,
  TeamPerformanceChart,
} from '@/components/analytics/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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

/**
 * Analytics.
 *
 * Every number comes from an aggregation over the workspace's own documents.
 * Nothing is estimated or hardcoded, and an empty workspace reports zeros rather
 * than sample data — which is why there is an explicit empty state instead of
 * charts drawing flat lines that look like real measurements.
 */
export function AnalyticsView() {
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analytics', activeWorkspace?.id, days],
    queryFn: () => analyticsApi.overview(activeWorkspace!.id, days),
    enabled: Boolean(activeWorkspace),
  });

  if (workspaceLoading) return <AnalyticsSkeleton />;
  if (!activeWorkspace) return <NoWorkspaceState />;
  if (isLoading) return <AnalyticsSkeleton />;

  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not load analytics'}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { metrics } = data;
  const nothingYet =
    metrics.workflows.total === 0 && metrics.tasks.total === 0 && metrics.executions.total === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`How work is moving in ${activeWorkspace.name}`}
        actions={
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="w-36" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {nothingYet ? (
        <EmptyState
          icon={BarChart3}
          title="No data to analyse yet"
          description="Analytics fill in once you have workflows, tasks, or executions in this workspace."
        />
      ) : (
        <>
          {/* -------------------------------------------------- headline */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Active workflows"
              value={metrics.workflows.active}
              hint={`${metrics.workflows.total} total`}
              icon={TrendingUp}
            />
            <MetricCard
              label="Open tasks"
              value={metrics.tasks.open}
              hint={`${metrics.tasks.completed} completed`}
              icon={BarChart3}
            />
            <MetricCard
              label="Overdue tasks"
              value={metrics.tasks.overdue}
              hint={metrics.tasks.overdue > 0 ? 'needs attention' : 'all on time'}
              icon={Clock}
              tone={metrics.tasks.overdue > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Avg. completion"
              value={
                metrics.averageCompletionHours === null
                  ? '—'
                  : formatHours(metrics.averageCompletionHours)
              }
              hint={
                metrics.averageCompletionHours === null
                  ? 'no completed tasks yet'
                  : 'from creation to completion'
              }
              icon={Clock}
            />
          </div>

          {/* ----------------------------------------------- completion */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Task activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTrendChart data={data.taskTrend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Task completion rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-semibold tracking-tight">
                      {metrics.tasks.completionRate}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {metrics.tasks.completed}/{metrics.tasks.total}
                    </span>
                  </div>
                  <Progress
                    value={metrics.tasks.completionRate}
                    className="mt-3"
                    aria-label="Task completion rate"
                  />
                </div>

                <dl className="space-y-2 border-t pt-3 text-sm">
                  <Row label="Executions run" value={metrics.executions.total} />
                  <Row label="Running now" value={metrics.executions.running} />
                  <Row label="Failed" value={metrics.executions.failed} />
                  <Row label="Workflows completed" value={metrics.workflows.completed} />
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------------------------------ breakdowns */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Tasks by status</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskStatusChart data={data.tasksByStatus} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Overdue by assignee</CardTitle>
              </CardHeader>
              <CardContent>
                <OverdueByAssigneeChart data={data.overdueByAssignee} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Team performance</CardTitle>
            </CardHeader>
            <CardContent>
              <TeamPerformanceChart data={data.teamPerformance} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tasks by priority</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tasksByPriority.map((entry) => (
                    <TableRow key={entry.priority}>
                      <TableCell className="text-sm capitalize">
                        {entry.priority.toLowerCase()}
                      </TableCell>
                      <TableCell className="text-right text-sm">{entry.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Hours are the storage unit; days read better once past ~48h. */
function formatHours(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-72 w-full lg:col-span-2" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

