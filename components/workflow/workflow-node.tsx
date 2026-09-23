'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
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
import { cn } from '@/lib/utils/cn';

/**
 * Workflow node renderer.
 *
 * One component handles every node type: the visual differences are a colour
 * accent, an icon, and which handles exist. Registering eight near-identical
 * node components would be more code for the same result.
 *
 * Handles are the connection points. DECISION nodes keep both the source and
 * target handles (they receive flow and branch out), START has no target, END
 * has no source — which prevents most invalid connections by construction.
 */

type NodeVisual = {
  icon: LucideIcon;
  accent: string;
  ring: string;
  label: string;
};

/** Fallback for an unrecognised node type. Guarantees a complete visual. */
const FALLBACK_VISUAL: NodeVisual = {
  icon: Flag,
  accent: 'bg-primary/10 text-primary',
  ring: 'border-primary/40',
  label: 'Task',
};

const VISUALS: Record<string, NodeVisual> = {
  START: {
    icon: Play,
    accent: 'bg-success/10 text-success',
    ring: 'border-success/40',
    label: 'Start',
  },
  END: {
    icon: Square,
    accent: 'bg-muted text-muted-foreground',
    ring: 'border-muted-foreground/30',
    label: 'End',
  },
  TASK: FALLBACK_VISUAL,
  DECISION: {
    icon: GitBranch,
    accent: 'bg-warning/15 text-warning-foreground dark:text-warning',
    ring: 'border-warning/50',
    label: 'Decision',
  },
  APPROVAL: {
    icon: ShieldCheck,
    accent: 'bg-warning/15 text-warning-foreground dark:text-warning',
    ring: 'border-warning/50',
    label: 'Approval',
  },
  DELAY: {
    icon: Clock,
    accent: 'bg-muted text-muted-foreground',
    ring: 'border-muted-foreground/30',
    label: 'Delay',
  },
  NOTIFICATION: {
    icon: Megaphone,
    accent: 'bg-primary/10 text-primary',
    ring: 'border-primary/40',
    label: 'Notification',
  },
  AI_ACTION: {
    icon: Bot,
    accent: 'bg-primary/10 text-primary',
    ring: 'border-primary/40',
    label: 'AI action',
  },
};

function WorkflowNodeComponent({ data, selected, type }: NodeProps) {
  const nodeType = (data.nodeType as string) ?? type ?? 'TASK';
  const visual = VISUALS[nodeType] ?? FALLBACK_VISUAL;
  const Icon = visual.icon;

  const title = typeof data.title === 'string' ? data.title : 'Untitled step';
  const description = typeof data.description === 'string' ? data.description : '';

  const config = data.config as Record<string, unknown> | undefined;
  const detail =
    nodeType === 'DELAY' && typeof config?.delayMinutes === 'number'
      ? `Wait ${config.delayMinutes} min`
      : nodeType === 'DECISION' && Array.isArray(config?.conditions)
        ? `${config.conditions.length} branches`
        : null;

  return (
    <div
      className={cn(
        'min-w-[190px] max-w-[240px] rounded-lg border bg-card p-3 shadow-sm transition-shadow',
        visual.ring,
        selected && 'shadow-md ring-2 ring-primary',
      )}
    >
      {nodeType !== 'START' ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
        />
      ) : null}

      <div className="flex items-start gap-2.5">
        <span
          className={cn('flex size-6 shrink-0 items-center justify-center rounded', visual.accent)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {visual.label}
            {detail ? ` · ${detail}` : ''}
          </p>
        </div>
      </div>

      {description ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}

      {data.assigneeId ? (
        <p className="mt-2 truncate text-[10px] text-muted-foreground">Assigned</p>
      ) : null}

      {nodeType !== 'END' ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-background !bg-primary"
        />
      ) : null}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);

/** Shared node type registry, passed to React Flow once. */
export const NODE_TYPES = {
  START: WorkflowNode,
  END: WorkflowNode,
  TASK: WorkflowNode,
  DECISION: WorkflowNode,
  APPROVAL: WorkflowNode,
  DELAY: WorkflowNode,
  NOTIFICATION: WorkflowNode,
  AI_ACTION: WorkflowNode,
} as const;

