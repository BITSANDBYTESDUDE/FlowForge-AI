'use client';

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
import { useReactFlow } from '@xyflow/react';
import type { WorkflowNodeType } from '@/types/workflow';
import { NODE_DEFAULTS, PALETTE_ORDER } from '@/lib/workflow/node-defaults';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { cn } from '@/lib/utils/cn';

const ICONS: Record<WorkflowNodeType, LucideIcon> = {
  START: Play,
  END: Square,
  TASK: Flag,
  DECISION: GitBranch,
  APPROVAL: ShieldCheck,
  DELAY: Clock,
  NOTIFICATION: Megaphone,
  AI_ACTION: Bot,
};

/**
 * Node palette.
 *
 * Each entry is a real button that adds a node: click places it in the middle of
 * the current viewport, or drag drops it at the cursor. Nothing here is
 * decorative.
 */
export function NodePalette() {
  const addNode = useBuilderStore((state) => state.addNode);
  const { screenToFlowPosition, getViewport } = useReactFlow();

  function handleClick(type: WorkflowNodeType) {
    // Offset slightly per insertion so repeated clicks do not stack perfectly.
    const viewport = getViewport();
    const jitter = (Math.random() - 0.5) * 60;
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 + jitter - viewport.x * 0.1,
      y: window.innerHeight / 2.5 + jitter - viewport.y * 0.1,
    });
    addNode(type, position);
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, type: WorkflowNodeType) {
    event.dataTransfer.setData('application/flowforge-node', type);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Add step
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {PALETTE_ORDER.map((type) => {
          const Icon = ICONS[type];
          const defaults = NODE_DEFAULTS[type];
          return (
            <button
              key={type}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, type)}
              onClick={() => handleClick(type)}
              title={defaults.description}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-md border bg-card px-2 py-2 text-left transition-colors',
                'hover:border-primary/40 hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'cursor-grab active:cursor-grabbing',
              )}
            >
              <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-[11px] font-medium leading-tight">{defaults.label}</span>
            </button>
          );
        })}
      </div>
      <p className="px-1 pt-1 text-[10px] leading-relaxed text-muted-foreground">
        Click to add, or drag onto the canvas.
      </p>
    </div>
  );
}
