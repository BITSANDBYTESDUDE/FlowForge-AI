'use client';

import { useMemo } from 'react';
import {
  Bot,
  Clock,
  Flag,
  GitBranch,
  Megaphone,
  Play,
  ShieldCheck,
  Square,
  type LucideIcon,
} from 'lucide-react';
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from '@/types/workflow';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

/**
 * Read-only workflow preview.
 *
 * Deliberately not React Flow. A full editor instance is heavy to mount, and the
 * point of a preview is to answer "does this match what I described?" at a
 * glance. Nodes are laid out in dependency order so the sequence reads top to
 * bottom, and the panel stays usable on a phone.
 */

const NODE_META: Record<WorkflowNodeType, { icon: LucideIcon; label: string; tone: string }> = {
  START: { icon: Play, label: 'Start', tone: 'text-success bg-success/10' },
  END: { icon: Square, label: 'End', tone: 'text-muted-foreground bg-muted' },
  TASK: { icon: Flag, label: 'Task', tone: 'text-primary bg-primary/10' },
  DECISION: { icon: GitBranch, label: 'Decision', tone: 'text-warning-foreground bg-warning/15 dark:text-warning' },
  APPROVAL: { icon: ShieldCheck, label: 'Approval', tone: 'text-warning-foreground bg-warning/15 dark:text-warning' },
  DELAY: { icon: Clock, label: 'Delay', tone: 'text-muted-foreground bg-muted' },
  NOTIFICATION: { icon: Megaphone, label: 'Notify', tone: 'text-primary bg-primary/10' },
  AI_ACTION: { icon: Bot, label: 'AI action', tone: 'text-primary bg-primary/10' },
};

/**
 * Orders nodes by following edges from the START node.
 *
 * Falls back to the original array order for any node the traversal does not
 * reach (an orphan, or a graph with no START), so a malformed graph still renders
 * every node instead of silently dropping them.
 */
export function orderNodes(graph: WorkflowGraph): WorkflowNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }

  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];

  const start = graph.nodes.find((node) => node.type === 'START');
  queue.push(start ? start.id : (graph.nodes[0]?.id ?? ''));

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);

    const node = byId.get(id);
    if (node) ordered.push(node);

    for (const next of outgoing.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  for (const node of graph.nodes) {
    if (!seen.has(node.id)) ordered.push(node);
  }

  return ordered;
}

export function WorkflowPreview({ graph }: { graph: WorkflowGraph }) {
  const ordered = useMemo(() => orderNodes(graph), [graph]);

  return (
    <ol className="space-y-2" aria-label="Workflow steps">
      {ordered.map((node, index) => {
        const meta = NODE_META[node.type];
        const Icon = meta.icon;
        const branching = node.type === 'DECISION';

        return (
          <li key={node.id} className="relative">
            <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md',
                  meta.tone,
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{node.title}</p>
                  <Badge variant="muted" className="text-[10px]">
                    {meta.label}
                  </Badge>
                </div>
                {node.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{node.description}</p>
                ) : null}
                {branching && node.config?.conditions?.length ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {node.config.conditions.map((condition) => (
                      <li key={condition.label} className="text-xs text-muted-foreground">
                        <span className="font-mono">{condition.expression}</span>
                        {' → '}
                        {condition.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                {index + 1}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
