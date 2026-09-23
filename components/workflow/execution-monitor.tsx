'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { executionsApi, tasksApi } from '@/lib/api/endpoints';
import type { ExecutionSummary } from '@/types/execution';
import { canTransitionExecution } from '@/types/execution';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { formatRelative } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ExecutionStatusBadge, TaskStatusBadge, TaskPriorityBadge } from '@/components/shared/status-badges';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import type { WorkflowDetail } from '@/types/workflow';

/**
 * Execution monitor.
 *
 * Shows one run: progress, the current step, its tasks, and the run log. State
 * transitions are gated by `canTransitionExecution`, which is the same table the
 * server enforces, so impossible actions are disabled rather than failing.
 */
export function ExecutionMonitor({
  execution: initialExecution,
  workflow,
}: {
  execution: ExecutionSummary;
  workflow: WorkflowDetail;
}) {
  const { activeWorkspace, can } = useWorkspace();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['execution', initialExecution.id],
    queryFn: () => executionsApi.get(initialExecution.id),
    // Poll while the run is live so progress reflects task completions made
    // elsewhere without requiring a manual refresh.
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status ?? initialExecution.status;
      return status === 'RUNNING' || status === 'PENDING' ? 10_000 : false;
    },
    initialData: { execution: initialExecution },
  });

  const execution = data?.execution ?? initialExecution;
  const log = ('log' in data!.execution ? data!.execution.log : []) as {
    nodeId: string | null;
    type: string;
    message: string;
    at: string;
  }[];

  const tasks = useQuery({
    queryKey: ['tasks', activeWorkspace?.id, 'execution', execution.workflowId],
    queryFn: () => tasksApi.list({ workspaceId: activeWorkspace!.id, workflowId: execution.workflowId, limit: 100 }),
    enabled: Boolean(activeWorkspace),
  });

  const transition = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'cancel') =>
      action === 'pause'
        ? executionsApi.pause(execution.id)
        : action === 'resume'
          ? executionsApi.resume(execution.id)
          : executionsApi.cancel(execution.id),
    onSuccess: (result, action) => {
      toast.success(
        action === 'pause'
          ? 'Execution paused'
          : action === 'resume'
            ? 'Execution resumed'
            : 'Execution cancelled',
      );
      setCancelOpen(false);
      queryClient.setQueryData(['execution', execution.id], result);
      queryClient.invalidateQueries({ queryKey: ['executions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setCancelOpen(false);
    },
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.complete(taskId, activeWorkspace!.id),
    onSuccess: (result) => {
      toast.success(result.advanced ? 'Task completed — execution moved forward' : 'Task completed');
      queryClient.invalidateQueries({ queryKey: ['execution', execution.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const currentNodes = execution.currentNodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));

  /** Tasks whose node is on the current frontier, i.e. actionable right now. */
  const actionableTasks = (tasks.data?.items ?? []).filter(
    (task) => task.nodeId && execution.currentNodeIds.includes(task.nodeId),
  );

  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status);

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------- header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  {execution.label || execution.workflowName}
                </h1>
                <ExecutionStatusBadge status={execution.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {execution.workflowName}
                {execution.startedAt ? ` · started ${formatRelative(execution.startedAt)}` : ''}
                {execution.completedAt ? ` · finished ${formatRelative(execution.completedAt)}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {can('workflow:execute') && !isTerminal ? (
                <>
                  {canTransitionExecution(execution.status, 'PAUSED') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => transition.mutate('pause')}
                      loading={transition.isPending}
                    >
                      <Pause className="size-3.5" />
                      Pause
                    </Button>
                  ) : null}
                  {canTransitionExecution(execution.status, 'RUNNING') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => transition.mutate('resume')}
                      loading={transition.isPending}
                    >
                      <Play className="size-3.5" />
                      Resume
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    <Ban className="size-3.5" />
                    Cancel
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['execution', execution.id] })}
                aria-label="Refresh execution"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {execution.progress.completed} of {execution.progress.total} steps complete
              </span>
              <span className="font-medium">{execution.progress.percent}%</span>
            </div>
            <Progress value={execution.progress.percent} aria-label="Execution progress" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------ current */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {isTerminal ? 'Final steps' : 'Waiting on'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {execution.status === 'COMPLETED' ? (
              <p className="text-sm text-muted-foreground">
                This run completed all {execution.progress.total} steps.
              </p>
            ) : currentNodes.length === 0 && !isLoading ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">
                  No step is currently active. The run may be waiting on a task that was completed
                  out of band — try refreshing.
                </span>
              </div>
            ) : (
              <ul className="space-y-2">
                {currentNodes.map((node) => (
                  <li key={node.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{node.title}</p>
                    {node.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{node.description}</p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {node.type.replace('_', ' ').toLowerCase()}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {actionableTasks.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks to complete
                </p>
                <ul className="space-y-2">
                  {actionableTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <TaskStatusBadge status={task.status} />
                          <TaskPriorityBadge priority={task.priority} />
                          {task.dueDate ? (
                            <span className="text-[11px] text-muted-foreground">
                              due {formatRelative(task.dueDate)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {task.status !== 'COMPLETED' && can('task:update') ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeTask.mutate(task.id)}
                          loading={completeTask.isPending && completeTask.variables === task.id}
                        >
                          Complete
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {execution.completedNodeIds.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Completed steps
                </p>
                <ul className="space-y-1">
                  {execution.completedNodeIds.map((nodeId) => {
                    const node = nodeById.get(nodeId);
                    if (!node) return null;
                    return (
                      <li key={nodeId} className="flex items-center gap-2 text-xs">
                        <RotateCcw className="size-3 shrink-0 text-success" aria-hidden="true" />
                        <span className="text-muted-foreground line-through">{node.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* --------------------------------------------------------- log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Run log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && log.length === 0 ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : log.length === 0 ? (
              <p className="text-sm text-muted-foreground">No log entries recorded yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {[...log].reverse().map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="border-l-2 border-muted pl-3 text-xs"
                  >
                    <p className="leading-snug">{entry.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {entry.type.toLowerCase().replace('_', ' ')} · {formatRelative(entry.at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {tasks.data && tasks.data.items.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">All tasks from this workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {tasks.data.items.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <TaskStatusBadge status={task.status} />
                      <TaskPriorityBadge priority={task.priority} />
                    </div>
                  </div>
                  {task.dueDate &&
                  new Date(task.dueDate) < new Date() &&
                  task.status !== 'COMPLETED' ? (
                    <span className="text-[11px] text-destructive">overdue</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this execution?</AlertDialogTitle>
            <AlertDialogDescription>
              The run is marked cancelled and will not advance further. Tasks already created are
              kept. This cannot be resumed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transition.isPending}>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                transition.mutate('cancel');
              }}
              disabled={transition.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel execution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
