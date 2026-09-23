'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, RotateCcw } from 'lucide-react';
import { workflowsApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { formatRelative } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
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

/**
 * Version history.
 *
 * Restoring is destructive to unsaved canvas edits, so it goes through a
 * confirmation. The restore endpoint is the authority on what the graph becomes;
 * the local store is then re-seeded from the response rather than guessing.
 */
export function VersionHistoryPanel({
  workflowId,
  currentVersion,
  onRestored,
}: {
  workflowId: string;
  currentVersion: number;
  onRestored: (version: number) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const setGraph = useBuilderStore((state) => state.setGraph);
  const dirty = useBuilderStore((state) => state.dirty);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-versions', workflowId, activeWorkspace?.id],
    queryFn: () => workflowsApi.versions(workflowId, activeWorkspace!.id),
    enabled: Boolean(activeWorkspace),
  });

  const restore = useMutation({
    mutationFn: (version: number) =>
      workflowsApi.restoreVersion(workflowId, activeWorkspace!.id, version),
    onSuccess: (result) => {
      // Re-seed from the server response so the canvas exactly matches what was
      // persisted, including positions normalised by the schema.
      setGraph({ nodes: result.workflow.nodes, edges: result.workflow.edges });
      onRestored(result.workflow.currentVersion);
      toast.success(`Restored version ${pendingVersion}`);
      setPendingVersion(null);
      queryClient.invalidateQueries({ queryKey: ['workflow-versions', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setPendingVersion(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const versions = data?.versions ?? [];

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No versions yet"
        description="Saving changes to this workflow will record a restorable version here."
        className="border-0 py-8"
      />
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {versions.map((version) => {
          const isCurrent = version.version === currentVersion;
          return (
            <li
              key={version.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">v{version.version}</span>
                  {isCurrent ? (
                    <Badge variant="success" className="text-[10px]">
                      current
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {version.changeSummary || 'No change summary recorded'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {formatRelative(version.createdAt)}
                </p>
              </div>
              {!isCurrent ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => setPendingVersion(version.version)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="size-3" />
                  Restore
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={pendingVersion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingVersion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {pendingVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              {dirty
                ? 'You have unsaved changes on the canvas. Restoring replaces them with this version, and those edits cannot be recovered.'
                : 'The canvas will be replaced with this version. The current state is saved as a new version first, so you can undo this by restoring it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingVersion !== null) restore.mutate(pendingVersion);
              }}
              disabled={restore.isPending}
            >
              {restore.isPending ? 'Restoring…' : 'Restore version'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
