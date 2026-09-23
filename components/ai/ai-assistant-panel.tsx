'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Lightbulb,
  Loader2,
  ListPlus,
  Sparkles,
  Unlink,
  Wand2,
} from 'lucide-react';
import { aiApi, type AiImprovement, type AiSummary, type AiTaskSuggestion } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils/cn';

/**
 * AI assistant for the builder.
 *
 * Three capabilities against the *current editor state*, not the saved workflow,
 * so a user can get feedback before committing anything.
 *
 * - Improve: analyses the graph and returns structured suggestions.
 * - Summarize: plain-language description for stakeholders.
 * - Tasks: proposes tasks from task-like nodes, creating them only on request.
 *
 * Task creation writes to the workflow id, so it is disabled until the workflow
 * has been saved at least once.
 */

const KIND_META: Record<
  AiImprovement['suggestions'][number]['kind'],
  { icon: typeof Lightbulb; label: string }
> = {
  MISSING_STEP: { icon: ListPlus, label: 'Missing step' },
  UNNECESSARY_STEP: { icon: AlertTriangle, label: 'Possibly unnecessary' },
  BOTTLENECK: { icon: Loader2, label: 'Bottleneck' },
  UNCLEAR_DEPENDENCY: { icon: Unlink, label: 'Unclear dependency' },
  IMPROVEMENT: { icon: Lightbulb, label: 'Improvement' },
};

export function AiAssistantPanel({
  workflowId,
  className,
}: {
  workflowId: string | null;
  className?: string;
}) {
  const { activeWorkspace } = useWorkspace();
  const toGraph = useBuilderStore((state) => state.toGraph);
  const nodeCount = useBuilderStore((state) => state.nodes.length);

  const [goal, setGoal] = useState('');
  const [improvement, setImprovement] = useState<AiImprovement | null>(null);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [suggestions, setSuggestions] = useState<AiTaskSuggestion[] | null>(null);

  const improve = useMutation({
    mutationFn: () =>
      aiApi.improveWorkflow({
        workspaceId: activeWorkspace!.id,
        graph: toGraph(),
        ...(goal.trim() ? { goal: goal.trim() } : {}),
      }),
    onSuccess: (data) => {
      setImprovement(data.analysis);
      toast.success('Analysis complete');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summarize = useMutation({
    mutationFn: () =>
      aiApi.summarizeWorkflow({
        workspaceId: activeWorkspace!.id,
        ...(workflowId ? { workflowId } : { graph: toGraph() }),
      }),
    onSuccess: (data) => {
      setSummary(data.summary);
      toast.success('Summary ready');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewTasks = useMutation({
    mutationFn: () =>
      aiApi.generateTasks({
        workspaceId: activeWorkspace!.id,
        workflowId: workflowId!,
        persist: false,
      }),
    onSuccess: (data) => {
      setSuggestions(data.suggestions ?? []);
      toast.success(
        data.suggestions?.length
          ? `${data.suggestions.length} tasks suggested`
          : 'No new tasks suggested',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createTasks = useMutation({
    mutationFn: () =>
      aiApi.generateTasks({
        workspaceId: activeWorkspace!.id,
        workflowId: workflowId!,
        persist: true,
      }),
    onSuccess: (data) => {
      toast.success(`Created ${data.tasks?.length ?? 0} task${data.tasks?.length === 1 ? '' : 's'}`);
      setSuggestions(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (nodeCount === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="Nothing to analyse yet"
        description="Add steps to the canvas first, then ask the assistant to review the workflow."
        className={cn('border-0 py-8', className)}
      />
    );
  }

  return (
    <Tabs defaultValue="improve" className={className}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="improve" className="text-xs">
          Improve
        </TabsTrigger>
        <TabsTrigger value="summary" className="text-xs">
          Summary
        </TabsTrigger>
        <TabsTrigger value="tasks" className="text-xs">
          Tasks
        </TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------------ improve */}
      <TabsContent value="improve" className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ai-goal" className="text-xs">
            Goal (optional)
          </Label>
          <Textarea
            id="ai-goal"
            rows={2}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={500}
            placeholder="e.g. make this faster, or add compliance checks"
            className="text-xs"
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => improve.mutate()}
          loading={improve.isPending}
        >
          <Wand2 className="size-3.5" />
          {improve.isPending ? 'Analysing…' : 'Analyse workflow'}
        </Button>

        {improvement ? (
          <div className="space-y-3">
            <Separator />
            <p className="text-xs leading-relaxed text-muted-foreground">{improvement.summary}</p>

            {improvement.suggestions.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/5 p-2.5 text-xs">
                <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                No issues found in this workflow.
              </div>
            ) : (
              <ul className="space-y-2">
                {improvement.suggestions.map((suggestion, index) => {
                  const meta = KIND_META[suggestion.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={index} className="rounded-md border p-2.5">
                      <div className="flex items-start gap-2">
                        <Icon
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-xs font-medium">{suggestion.title}</p>
                            <Badge
                              variant={
                                suggestion.severity === 'HIGH'
                                  ? 'destructive'
                                  : suggestion.severity === 'LOW'
                                    ? 'muted'
                                    : 'secondary'
                              }
                              className="text-[10px]"
                            >
                              {meta.label}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {suggestion.detail}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </TabsContent>

      {/* ------------------------------------------------------------ summary */}
      <TabsContent value="summary" className="mt-3 space-y-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => summarize.mutate()}
          loading={summarize.isPending}
        >
          <Sparkles className="size-3.5" />
          {summarize.isPending ? 'Summarising…' : 'Summarise workflow'}
        </Button>

        {summary ? (
          <div className="space-y-3">
            <Separator />
            <p className="text-xs leading-relaxed">{summary.summary}</p>

            {summary.highlights.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Highlights
                </p>
                <ul className="space-y-1">
                  {summary.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-2 text-xs text-muted-foreground">
                      <CheckCircle2
                        className="mt-0.5 size-3 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.risks.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Risks
                </p>
                <ul className="space-y-1">
                  {summary.risks.map((risk) => (
                    <li key={risk} className="flex gap-2 text-xs text-muted-foreground">
                      <AlertTriangle
                        className="mt-0.5 size-3 shrink-0 text-warning-foreground dark:text-warning"
                        aria-hidden="true"
                      />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </TabsContent>

      {/* -------------------------------------------------------------- tasks */}
      <TabsContent value="tasks" className="mt-3 space-y-3">
        {!workflowId ? (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-muted-foreground">
            Save the workflow first. Tasks are linked to a workflow, so they need one to exist.
          </p>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => previewTasks.mutate()}
              loading={previewTasks.isPending}
            >
              <ListPlus className="size-3.5" />
              {previewTasks.isPending ? 'Generating…' : 'Suggest tasks from steps'}
            </Button>

            {suggestions ? (
              suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Every task-like step already has a task, or no steps were suitable.
                </p>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.nodeId} className="rounded-md border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">{suggestion.title}</p>
                          <Badge variant="muted" className="shrink-0 text-[10px]">
                            {suggestion.priority.toLowerCase()}
                          </Badge>
                        </div>
                        {suggestion.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {suggestion.description}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => createTasks.mutate()}
                    loading={createTasks.isPending}
                  >
                    Create {suggestions.length} task{suggestions.length === 1 ? '' : 's'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Created unassigned. The model cannot know who owns the work, so assignment stays
                    a human decision.
                  </p>
                </div>
              )
            ) : null}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
