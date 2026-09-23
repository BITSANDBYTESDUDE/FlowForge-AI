'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ListTodo, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-react';
import { tasksApi, workspacesApi, type UpdateTaskBody } from '@/lib/api/endpoints';
import type { Paginated } from '@/lib/utils/pagination';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/shared/status-badges';
import { TaskDialog } from '@/components/task/task-dialog';
import { formatDate } from '@/lib/utils/format';
import { canTransitionTask, type TaskSummary, type TaskStatus, type TaskPriority } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const PAGE_SIZE = 20;

/**
 * Task list.
 *
 * A table on desktop and stacked cards on mobile — the same data, because a
 * horizontally scrolling table on a phone is not a usable interface.
 *
 * Status changes go through the transitions table, so statuses a task cannot
 * legally move to (e.g. reopening a completed task) are simply not offered.
 */
export function TaskList() {
  const queryClient = useQueryClient();
  const { activeWorkspace, isLoading: workspaceLoading, can } = useWorkspace();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'ALL'>('ALL');
  const [priority, setPriority] = useState<TaskPriority | 'ALL'>('ALL');
  const [assignee, setAssignee] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TaskSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskSummary | null>(null);

  const workspaceId = activeWorkspace?.id;

  const { data, isLoading, isError, error } = useQuery<Paginated<TaskSummary>>({
    queryKey: ['tasks', workspaceId, { search, status, priority, assignee, overdueOnly, page }],
    queryFn: () =>
      tasksApi.list({
        workspaceId: workspaceId!,
        page,
        limit: PAGE_SIZE,
        sort: 'dueDate',
        order: 'asc',
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status !== 'ALL' ? { status } : {}),
        ...(priority !== 'ALL' ? { priority } : {}),
        ...(assignee !== 'ALL' ? { assigneeId: assignee } : {}),
        ...(overdueOnly ? { overdue: true } : {}),
      }),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });

  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => workspacesApi.members(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: UpdateTaskBody }) =>
      tasksApi.update(taskId, body),
    onSuccess: () => {
      toast.success('Task updated');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.complete(taskId, workspaceId!),
    onSuccess: (result) => {
      toast.success(result.advanced ? 'Task completed — workflow advanced' : 'Task completed');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId, workspaceId!),
    onSuccess: () => {
      toast.success('Task deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message);
      setPendingDelete(null);
    },
  });

  if (workspaceLoading) return <TaskListSkeleton />;
  if (!activeWorkspace) return <NoWorkspaceState />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const memberList = members.data?.members ?? [];
  const memberName = (userId: string | null) =>
    userId ? (memberList.find((member) => member.userId === userId)?.user?.name ?? 'Unknown') : null;

  const hasFilters =
    search.trim().length > 0 ||
    status !== 'ALL' ||
    priority !== 'ALL' ||
    assignee !== 'ALL' ||
    overdueOnly;

  function clearFilters() {
    setSearch('');
    setStatus('ALL');
    setPriority('ALL');
    setAssignee('ALL');
    setOverdueOnly(false);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description={`${total} task${total === 1 ? '' : 's'} in ${activeWorkspace.name}`}
        actions={
          can('task:create') ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <ListTodo className="size-4" />
              New task
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search tasks…"
            className="pl-8"
            aria-label="Search tasks"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as TaskStatus | 'ALL');
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="TODO">To do</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="BLOCKED">Blocked</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={priority}
            onValueChange={(value) => {
              setPriority(value as TaskPriority | 'ALL');
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All priorities</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={assignee}
            onValueChange={(value) => {
              setAssignee(value);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Anyone</SelectItem>
              {memberList.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.user?.name ?? member.userId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={overdueOnly ? 'default' : 'outline'}
            onClick={() => {
              setOverdueOnly((previous) => !previous);
              setPage(1);
            }}
            aria-pressed={overdueOnly}
          >
            Overdue
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TaskListSkeleton />
      ) : isError ? (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load tasks'}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={hasFilters ? 'No tasks match those filters' : 'No tasks yet'}
          description={
            hasFilters
              ? 'Try clearing a filter or searching for something else.'
              : 'Tasks come from workflow steps when you run a workflow, or you can add one directly.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : can('task:create') ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                New task
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Priority</TableHead>
                  <TableHead className="w-40">Assignee</TableHead>
                  <TableHead className="w-32">Due</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((task) => {
                  const overdue =
                    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
                  return (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p
                            className={
                              task.status === 'COMPLETED'
                                ? 'text-sm text-muted-foreground line-through'
                                : 'text-sm font-medium'
                            }
                          >
                            {task.title}
                          </p>
                          {task.workflowId ? (
                            <Link
                              href={`/workflow/${task.workflowId}?workspace=${workspaceId}`}
                              className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                            >
                              from workflow
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TaskStatusBadge status={task.status} />
                      </TableCell>
                      <TableCell>
                        <TaskPriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {memberName(task.assigneeId) ?? 'Unassigned'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            overdue ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'
                          }
                        >
                          {formatDate(task.dueDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TaskRowMenu
                          task={task}
                          canEdit={can('task:update')}
                          canDelete={can('task:delete')}
                          onEdit={() => {
                            setEditing(task);
                            setDialogOpen(true);
                          }}
                          onDelete={() => setPendingDelete(task)}
                          onStatusChange={(next) =>
                            updateTask.mutate({
                              taskId: task.id,
                              body: { workspaceId: workspaceId!, status: next },
                            })
                          }
                          onComplete={() => completeTask.mutate(task.id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {items.map((task) => {
              const overdue =
                task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
              return (
                <li key={task.id}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{task.title}</p>
                        <TaskRowMenu
                          task={task}
                          canEdit={can('task:update')}
                          canDelete={can('task:delete')}
                          onEdit={() => {
                            setEditing(task);
                            setDialogOpen(true);
                          }}
                          onDelete={() => setPendingDelete(task)}
                          onStatusChange={(next) =>
                            updateTask.mutate({
                              taskId: task.id,
                              body: { workspaceId: workspaceId!, status: next },
                            })
                          }
                          onComplete={() => completeTask.mutate(task.id)}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <TaskStatusBadge status={task.status} />
                        <TaskPriorityBadge priority={task.priority} />
                        {task.dueDate ? (
                          <Badge variant={overdue ? 'destructive' : 'outline'}>
                            {formatDate(task.dueDate)}
                          </Badge>
                        ) : null}
                      </div>
                      {task.assigneeId ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {memberName(task.assigneeId)}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });
        }}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the task. If it belongs to a running execution, that run will
              not advance past this step. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) deleteTask.mutate(pendingDelete.id);
              }}
              disabled={deleteTask.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTask.isPending ? 'Deleting…' : 'Delete task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaskRowMenu({
  task,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onStatusChange,
  onComplete,
}: {
  task: TaskSummary;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onComplete: () => void;
}) {
  // Only transitions the state machine allows, so the menu cannot offer an
  // action the API would reject.
  const nextStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'].filter(
    (candidate): candidate is TaskStatus => canTransitionTask(task.status, candidate as TaskStatus),
  );

  const canComplete = task.status !== 'COMPLETED' && task.status !== 'CANCELLED';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${task.title}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canComplete && canEdit ? (
          <DropdownMenuItem onClick={onComplete}>
            <CheckCircle2 className="size-4" />
            Mark complete
          </DropdownMenuItem>
        ) : null}

        {canEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" />
            Edit details
          </DropdownMenuItem>
        ) : null}

        {canEdit && nextStatuses.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Move to
            </DropdownMenuLabel>
            {nextStatuses.map((next) => (
              <DropdownMenuItem key={next} onClick={() => onStatusChange(next)}>
                {next.replace('_', ' ').toLowerCase()}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

