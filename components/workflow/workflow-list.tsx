'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { workflowsApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';
import { GenerateWorkflowDialog } from '@/components/ai/generate-workflow-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowStatusBadge } from '@/components/shared/status-badges';
import { formatRelative } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkflowStatus } from '@/types/workflow';

const PAGE_SIZE = 12;

export function WorkflowList() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { activeWorkspace, isLoading: workspaceLoading, can } = useWorkspace();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkflowStatus | 'ALL'>(
    (searchParams.get('status') as WorkflowStatus | null) ?? 'ALL',
  );
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(searchParams.get('new') === 'ai');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const workspaceId = activeWorkspace?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['workflows', workspaceId, { status, search, page }],
    queryFn: () =>
      workflowsApi.list({
        workspaceId: workspaceId!,
        page,
        limit: PAGE_SIZE,
        ...(status !== 'ALL' ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });

  const removeWorkflow = useMutation({
    mutationFn: (id: string) => workflowsApi.remove(id, workspaceId!),
    onSuccess: () => {
      toast.success('Workflow deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message);
      setPendingDelete(null);
    },
  });

  const archiveWorkflow = useMutation({
    mutationFn: (id: string) =>
      workflowsApi.update(id, { workspaceId: workspaceId!, status: 'ARCHIVED' }),
    onSuccess: () => {
      toast.success('Workflow archived');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (workspaceLoading) {
    return <ListSkeleton />;
  }

  if (!activeWorkspace) {
    return <NoWorkspaceState />;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search.trim().length > 0 || status !== 'ALL';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description={`${total} workflow${total === 1 ? '' : 's'} in ${activeWorkspace.name}`}
        actions={
          can('workflow:create') ? (
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles className="size-4" />
              Generate with AI
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            placeholder="Search workflows…"
            className="pl-8"
            aria-label="Search workflows"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as WorkflowStatus | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load workflows'}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title={hasFilters ? 'No workflows match those filters' : 'No workflows yet'}
          description={
            hasFilters
              ? 'Try a different search term or clear the status filter.'
              : 'Describe a process and let FlowForge AI build your first workflow.'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setStatus('ALL');
                }}
              >
                Clear filters
              </Button>
            ) : can('workflow:create') ? (
              <Button onClick={() => setGenerateOpen(true)}>
                <Sparkles className="size-4" />
                Generate with AI
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((workflow) => (
              <li key={workflow.id}>
                <Card className="group h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/workflow/${workflow.id}?workspace=${workspaceId}`}
                        className="min-w-0 flex-1"
                      >
                        <p className="truncate text-sm font-semibold group-hover:text-primary">
                          {workflow.name}
                        </p>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${workflow.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/workflow/${workflow.id}?workspace=${workspaceId}`}>
                              Open
                            </Link>
                          </DropdownMenuItem>
                          {can('workflow:update') && workflow.status !== 'ARCHIVED' ? (
                            <DropdownMenuItem onClick={() => archiveWorkflow.mutate(workflow.id)}>
                              <Archive className="size-4" />
                              Archive
                            </DropdownMenuItem>
                          ) : null}
                          {can('workflow:delete') ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setPendingDelete({ id: workflow.id, name: workflow.name })
                                }
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Link
                      href={`/workflow/${workflow.id}?workspace=${workspaceId}`}
                      className="mt-2 flex-1"
                    >
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {workflow.description || 'No description'}
                      </p>
                    </Link>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <WorkflowStatusBadge status={workflow.status} />
                      <Badge variant="muted">
                        {workflow.nodeCount} step{workflow.nodeCount === 1 ? '' : 's'}
                      </Badge>
                      <Badge variant="outline">v{workflow.currentVersion}</Badge>
                    </div>

                    <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                      Updated {formatRelative(workflow.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
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

      <GenerateWorkflowDialog open={generateOpen} onOpenChange={setGenerateOpen} />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the workflow, its version history, and any executions. Tasks
              already created from its nodes are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeWorkflow.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) removeWorkflow.mutate(pendingDelete.id);
              }}
              disabled={removeWorkflow.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeWorkflow.isPending ? 'Deleting…' : 'Delete workflow'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-40 w-full" />
      ))}
    </div>
  );
}
