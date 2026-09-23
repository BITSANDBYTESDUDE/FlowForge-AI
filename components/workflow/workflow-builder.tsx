'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bot,
  History,
  Layers,
  Loader2,
  Play,
  Redo2,
  Save,
  Settings2,
  Undo2,
} from 'lucide-react';
import { workflowsApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WorkflowCanvas } from '@/components/workflow/workflow-canvas';
import { NodePalette } from '@/components/workflow/node-palette';
import { PropertiesPanel } from '@/components/workflow/properties-panel';
import { VersionHistoryPanel } from '@/components/workflow/version-history-panel';
import { AiAssistantPanel } from '@/components/ai/ai-assistant-panel';
import { RunWorkflowDialog } from '@/components/workflow/run-workflow-dialog';
import type { WorkflowDetail, WorkflowStatus } from '@/types/workflow';

/**
 * Workflow builder.
 *
 * Layout follows the conventional three-column diagram editor: palette, canvas,
 * inspector. On narrow screens the side panels move into tabs below the canvas,
 * because a 300px canvas is not usable.
 *
 * Save is explicit rather than autosave. Workflow edits are consequential (they
 * create versions and can invalidate an in-flight execution), so the user
 * chooses when a change becomes a version.
 */
export function WorkflowBuilder({
  workflowId,
  initialWorkflow,
}: {
  workflowId: string;
  initialWorkflow: WorkflowDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeWorkspace, can } = useWorkspace();

  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [name, setName] = useState(initialWorkflow.name);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('properties');

  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const setGraph = useBuilderStore((state) => state.setGraph);
  const toGraph = useBuilderStore((state) => state.toGraph);
  const dirty = useBuilderStore((state) => state.dirty);
  const markClean = useBuilderStore((state) => state.markClean);
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const historyLength = useBuilderStore((state) => state.history.length);
  const futureLength = useBuilderStore((state) => state.future.length);
  const autoLayout = useBuilderStore((state) => state.autoLayout);

  // Seed the store once per workflow. Re-seeding on every render would discard
  // in-progress edits.
  useEffect(() => {
    setGraph({ nodes: initialWorkflow.nodes, edges: initialWorkflow.edges });
  }, [initialWorkflow.id, initialWorkflow.nodes, initialWorkflow.edges, setGraph]);


  const save = useMutation({
    mutationFn: async () => {
      const graph = toGraph();
      // Client-side pre-check mirroring the server's graph rules, so obvious
      // problems are reported instantly instead of after a round trip.
      const graphError = validateGraph(graph.nodes, graph.edges);
      if (graphError) throw new ApiError('VALIDATION_ERROR', graphError, 400);

      return workflowsApi.update(workflowId, {
        workspaceId: activeWorkspace!.id,
        name: name.trim() || workflow.name,
        graph,
        status: workflow.status,
        changeSummary: describeChange(workflow, graph.nodes.length),
      });
    },
    onSuccess: (result) => {
      setWorkflow(result.workflow);
      markClean();
      toast.success(`Saved as version ${result.workflow.currentVersion}`);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-versions', workflowId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: (status: WorkflowStatus) =>
      workflowsApi.update(workflowId, { workspaceId: activeWorkspace!.id, status }),
    onSuccess: (result) => {
      setWorkflow((previous) => ({ ...previous, status: result.workflow.status }));
      toast.success(`Workflow marked ${result.workflow.status.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleRestored = useCallback((version: number) => {
    setWorkflow((previous) => ({ ...previous, currentVersion: version }));
  }, []);

  // Warn before losing unsaved graph edits on a full navigation or tab close.
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /** Ctrl/Cmd+S saves. Registered here because the builder owns the save action. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !save.isPending) save.mutate();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, save]);

  const canEdit = can('workflow:update');
  const canExecute = can('workflow:execute');

  const inspector = (
    <div className="space-y-3">
      <PropertiesPanel />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* ----------------------------------------------------------- toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b bg-card/40 px-3 py-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to workflows">
          <Link href={`/dashboard/workflows?workspace=${activeWorkspace?.id ?? ''}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <Badge variant={workflow.status === 'ACTIVE' ? 'success' : 'muted'}>
            {workflow.status.toLowerCase()}
          </Badge>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            v{workflow.currentVersion}
          </span>
          {dirty ? (
            <span className="shrink-0 text-[11px] text-warning-foreground dark:text-warning">
              unsaved
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={historyLength === 0}
            aria-label="Undo (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={futureLength === 0}
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              autoLayout();
              toast.success('Layout applied');
            }}
            aria-label="Auto layout (L)"
            title="Auto layout (L)"
          >
            <Layers className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setNameDialogOpen(true)}
            aria-label="Workflow settings"
            title="Workflow settings"
            disabled={!canEdit}
          >
            <Settings2 className="size-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {canExecute && workflow.status === 'ACTIVE' ? (
            <Button size="sm" variant="outline" onClick={() => setRunDialogOpen(true)}>
              <Play className="size-3.5" />
              Run
            </Button>
          ) : null}

          {canEdit && workflow.status === 'DRAFT' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus.mutate('ACTIVE')}
              loading={setStatus.isPending}
            >
              Publish
            </Button>
          ) : null}

          {canEdit ? (
            <Button
              size="sm"
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!dirty}
              title="Save (Ctrl+S)"
            >
              {save.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save
                </>
              )}
            </Button>
          ) : null}
        </div>
      </header>

      {!canEdit ? (
        <p className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          You have read-only access to this workflow. Editing requires the member role.
        </p>
      ) : null}

      {/* ------------------------------------------------------ three columns */}
      <div className="hidden flex-1 overflow-hidden lg:grid lg:grid-cols-[200px_1fr_300px]">
        <aside className="overflow-y-auto border-r p-3">
          <NodePalette />
        </aside>

        <div className="relative min-w-0 overflow-hidden">
          <WorkflowCanvas />
        </div>

        <aside className="flex flex-col overflow-hidden border-l">
          <Tabs defaultValue="properties" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-3 mt-3 grid grid-cols-3">
              <TabsTrigger value="properties" className="text-xs">
                Properties
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs">
                <Bot className="mr-1 size-3" />
                AI
              </TabsTrigger>
              <TabsTrigger value="versions" className="text-xs">
                <History className="mr-1 size-3" />
                Versions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="flex-1 overflow-y-auto p-3">
              {inspector}
            </TabsContent>
            <TabsContent value="ai" className="flex-1 overflow-y-auto p-3">
              <AiAssistantPanel workflowId={workflowId} />
            </TabsContent>
            <TabsContent value="versions" className="flex-1 overflow-y-auto p-3">
              <VersionHistoryPanel
                workflowId={workflowId}
                currentVersion={workflow.currentVersion}
                onRestored={handleRestored}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* ------------------------------------------------- mobile fallback */}
      <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
        <div className="h-[45dvh] border-b">
          <WorkflowCanvas />
        </div>
        <Tabs
          value={mobileTab}
          onValueChange={setMobileTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-3 mt-3 grid grid-cols-4">
            <TabsTrigger value="palette" className="text-xs">
              Add
            </TabsTrigger>
            <TabsTrigger value="properties" className="text-xs">
              Edit
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">
              AI
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs">
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="palette" className="flex-1 overflow-y-auto p-3">
            <NodePalette />
          </TabsContent>
          <TabsContent value="properties" className="flex-1 overflow-y-auto p-3">
            {inspector}
          </TabsContent>
          <TabsContent value="ai" className="flex-1 overflow-y-auto p-3">
            <AiAssistantPanel workflowId={workflowId} />
          </TabsContent>
          <TabsContent value="versions" className="flex-1 overflow-y-auto p-3">
            <VersionHistoryPanel
              workflowId={workflowId}
              currentVersion={workflow.currentVersion}
              onRestored={handleRestored}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ----------------------------------------------------- settings modal */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Workflow settings</DialogTitle>
            <DialogDescription>
              Renaming creates a new version when you save. Status controls whether the workflow can
              be executed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workflow-status">Status</Label>
              <Select
                value={workflow.status}
                onValueChange={(value) => setStatus.mutate(value as WorkflowStatus)}
              >
                <SelectTrigger id="workflow-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft — not executable</SelectItem>
                  <SelectItem value="ACTIVE">Active — can be executed</SelectItem>
                  <SelectItem value="ARCHIVED">Archived — read-only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {nodes.length} steps · {edges.length} connections
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setNameDialogOpen(false);
                save.mutate();
              }}
              disabled={!dirty}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RunWorkflowDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        workflow={workflow}
        onStarted={(executionId) => {
          setRunDialogOpen(false);
          router.push(`/workflow/${workflowId}/execution?execution=${executionId}&workspace=${activeWorkspace?.id ?? ''}`);
        }}
      />
    </div>
  );
}

/**
 * Client-side graph checks.
 *
 * Intentionally a subset of `workflowGraphSchema`: it catches the mistakes users
 * actually make (no start, dangling decision, empty title) so they get instant
 * feedback. The server schema remains the authority and validates far more.
 */
function validateGraph(
  nodes: { id: string; type: string; title: string }[],
  edges: { id: string; source: string; target: string }[],
): string | null {
  if (nodes.length === 0) return 'Add at least one step before saving.';

  const untitled = nodes.find((node) => !node.title.trim());
  if (untitled) return 'Every step needs a title.';

  const starts = nodes.filter((node) => node.type === 'START');
  if (starts.length > 1) return 'A workflow can only have one start step.';

  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      return 'A connection points at a step that no longer exists. Remove it and reconnect.';
    }
  }

  for (const node of nodes) {
    if (node.type === 'DECISION') {
      const outgoing = edges.filter((edge) => edge.source === node.id).length;
      if (outgoing < 2) {
        return `Decision "${node.title}" needs at least two outgoing connections.`;
      }
    }
  }

  return null;
}

function describeChange(workflow: WorkflowDetail, nodeCount: number): string {
  const nodeDelta = nodeCount - workflow.nodes.length;
  if (nodeDelta > 0) return `Added ${nodeDelta} step${nodeDelta === 1 ? '' : 's'}`;
  if (nodeDelta < 0) return `Removed ${-nodeDelta} step${nodeDelta === -1 ? '' : 's'}`;
  return 'Updated workflow graph';
}
