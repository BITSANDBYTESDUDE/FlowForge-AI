'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { aiApi, workflowsApi, type AiDraft } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { WorkflowPreview } from '@/components/ai/workflow-preview';

const EXAMPLES = [
  'I want to launch a website for a client',
  'Onboard a new employee onto my team',
  'Plan and run a social media campaign for a product launch',
  'Prepare for my final year university project',
  'Handle a freelance client project from brief to handoff',
];

/**
 * AI workflow generation.
 *
 * Two-phase on purpose: the first call uses `dryRun` so nothing is written until
 * the user has seen the graph, and the second persists it through the same
 * `createWorkflow` service the manual builder uses. This means a bad generation
 * costs nothing to discard, and a saved workflow is indistinguishable from a
 * hand-built one.
 */
export function GenerateWorkflowDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useWorkspace();
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [aiMeta, setAiMeta] = useState<{ model: string; heuristic: boolean } | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      aiApi.generateWorkflow({
        workspaceId: activeWorkspace!.id,
        description: description.trim(),
        dryRun: true,
      }),
    onSuccess: (data) => {
      setDraft(data.draft);
      setAiMeta(data.meta);
      toast.success(`Generated “${data.draft.name}”`);
    },
    onError: (error: unknown) => {
      // AI_UNAVAILABLE is expected when no provider key is configured; the
      // message from the API already explains it, so surface it verbatim.
      if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
        toast.error(error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    },
  });

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('Nothing to save');
      return workflowsApi.create({
        workspaceId: activeWorkspace!.id,
        name: draft.name,
        description: draft.description,
        status: 'DRAFT',
        tags: draft.tags,
        graph: { nodes: draft.nodes, edges: draft.edges },
      });
    },
    onSuccess: (data) => {
      toast.success('Workflow saved');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      reset();
      onOpenChange(false);
      router.push(`/workflow/${data.workflow.id}?workspace=${activeWorkspace!.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function reset() {
    setDescription('');
    setDraft(null);
    setAiMeta(null);
  }

  function handleClose(next: boolean) {
    if (save.isPending || generate.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  const canGenerate = description.trim().length >= 10 && !generate.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Generate a workflow
          </DialogTitle>
          <DialogDescription>
            Describe the process the way you would explain it to a colleague. FlowForge will propose
            the steps, decisions, and connections — you review before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-description">What process do you want to run?</Label>
              <Textarea
                id="ai-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="I want to launch a website for a client"
                rows={4}
                maxLength={4000}
                disabled={generate.isPending}
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>At least 10 characters. More detail means a better graph.</span>
                <span>{description.length}/4000</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Try an example</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setDescription(example)}
                    disabled={generate.isPending}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {generate.isError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {generate.error instanceof Error
                    ? generate.error.message
                    : 'Could not generate a workflow'}
                </span>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => generate.mutate()}
                loading={generate.isPending}
                disabled={!canGenerate}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    Generate workflow
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-muted/40 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{draft.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{draft.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {draft.tags.map((tag) => (
                  <Badge key={tag} variant="muted">
                    {tag}
                  </Badge>
                ))}
                {aiMeta?.heuristic ? (
                  <Badge variant="outline" title="Generated without a model provider">
                    offline planner
                  </Badge>
                ) : null}
              </div>
            </div>

            <WorkflowPreview graph={{ nodes: draft.nodes, edges: draft.edges }} />

            <p className="text-xs text-muted-foreground">
              {draft.nodes.length} steps · {draft.edges.length} connections · saving creates a draft
              workflow you can edit or delete.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDraft(null)} disabled={save.isPending}>
                Back
              </Button>
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save workflow'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
