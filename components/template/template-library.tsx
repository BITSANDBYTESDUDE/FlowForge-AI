'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LayoutTemplate, Search, Sparkles, Trash2 } from 'lucide-react';
import { templatesApi } from '@/lib/api/endpoints';
import type { TemplateSummary } from '@/types/api';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NoWorkspaceState } from '@/components/dashboard/no-workspace-state';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowPreview } from '@/components/ai/workflow-preview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';

/**
 * Template library.
 *
 * Browsing works without a workspace (templates are global), but applying one
 * does not: a template becomes a workflow inside a workspace, so the apply
 * action is disabled until one exists. The distinction is surfaced rather than
 * hiding the whole page behind the no-workspace state.
 */
export function TemplateLibrary() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeWorkspace, can, isLoading: workspaceLoading } = useWorkspace();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [preview, setPreview] = useState<TemplateSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplateSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['templates', { search, category }],
    queryFn: () =>
      templatesApi.list({
        ...(category !== 'ALL' ? { category } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    placeholderData: (previous) => previous,
  });

  const detail = useQuery({
    queryKey: ['template', preview?.id],
    queryFn: () => templatesApi.get(preview!.id),
    enabled: Boolean(preview),
  });

  const apply = useMutation({
    mutationFn: (template: TemplateSummary) =>
      templatesApi.apply(template.id, activeWorkspace!.id),
    onSuccess: (result) => {
      toast.success(`Created “${result.workflow.name}” from template`);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setPreview(null);
      router.push(`/workflow/${result.workflow.id}?workspace=${activeWorkspace!.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (template: TemplateSummary) =>
      templatesApi.remove(template.id, activeWorkspace!.id),
    onSuccess: () => {
      toast.success('Template deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setPendingDelete(null);
    },
  });

  const templates = data?.templates ?? [];
  const categories = data?.categories ?? [];
  const hasFilters = search.trim().length > 0 || category !== 'ALL';

  if (workspaceLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Start from a proven workflow instead of a blank canvas."
      />

      {!activeWorkspace ? <NoWorkspaceState /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates…"
            className="pl-8"
            aria-label="Search templates"
          />
        </div>
      </div>

      {/* Category chips rather than a select: there are few categories and they
          are the primary way people browse a template library. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory('ALL')}
          aria-pressed={category === 'ALL'}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            category === 'ALL'
              ? 'border-primary bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          All
        </button>
        {categories.map((entry) => (
          <button
            key={entry.category}
            type="button"
            onClick={() => setCategory(entry.category)}
            aria-pressed={category === entry.category}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              category === entry.category
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {entry.category.toLowerCase()} ({entry.count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title={hasFilters ? 'No templates match' : 'No templates available'}
          description={
            hasFilters
              ? 'Try another category or search term.'
              : 'Templates will appear here once the library is seeded.'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setCategory('ALL');
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Card className="group h-full">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold group-hover:text-primary">{template.name}</p>
                    {template.isSystem ? (
                      <Badge variant="muted" className="shrink-0 text-[10px]">
                        built-in
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        custom
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-3 flex-1 text-xs text-muted-foreground">
                    {template.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {template.category.toLowerCase()}
                    </Badge>
                    <Badge variant="muted" className="text-[10px]">
                      {template.nodeCount} steps
                    </Badge>
                    {template.usageCount > 0 ? (
                      <span className="text-[10px] text-muted-foreground">
                        used {template.usageCount}×
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setPreview(template)}
                    >
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => apply.mutate(template)}
                      loading={apply.isPending && apply.variables?.id === template.id}
                      disabled={!activeWorkspace || !can('workflow:create')}
                      title={
                        !activeWorkspace
                          ? 'Create a workspace first'
                          : can('workflow:create')
                            ? undefined
                            : 'You need permission to create workflows'
                      }
                    >
                      <Sparkles className="size-3.5" />
                      Use
                    </Button>
                    {!template.isSystem && template.workspaceId === activeWorkspace?.id ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${template.name}`}
                        onClick={() => setPendingDelete(template)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* --------------------------------------------------------- preview */}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>{preview?.description}</DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : detail.data ? (
            <>
              <WorkflowPreview
                graph={{ nodes: detail.data.template.nodes, edges: detail.data.template.edges }}
              />
              <p className="text-xs text-muted-foreground">
                {detail.data.template.nodes.length} steps · {detail.data.template.edges.length} connections
              </p>
            </>
          ) : (
            <p className="text-sm text-destructive">Could not load this template.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button
              onClick={() => preview && apply.mutate(preview)}
              loading={apply.isPending}
              disabled={!activeWorkspace || !can('workflow:create')}
            >
              Use this template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingDelete ? (
        <ConfirmDelete
          template={pendingDelete}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => remove.mutate(pendingDelete)}
        />
      ) : null}
    </div>
  );
}

function ConfirmDelete({
  template,
  pending,
  onCancel,
  onConfirm,
}: {
  template: TemplateSummary;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{template.name}”?</DialogTitle>
          <DialogDescription>
            Workflows already created from this template are unaffected. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
