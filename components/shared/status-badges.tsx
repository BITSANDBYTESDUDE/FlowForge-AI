import { Badge } from '@/components/ui/badge';
import type { WorkflowStatus } from '@/types/workflow';
import type { TaskPriority, TaskStatus } from '@/types/task';
import type { ExecutionStatus } from '@/types/execution';
import { cn } from '@/lib/utils/cn';

/**
 * Status and priority badges.
 *
 * Centralised so a status reads the same everywhere it appears, and so adding a
 * new enum member forces a decision here rather than silently rendering raw text
 * somewhere.
 */

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const variant = status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'muted' : 'outline';
  return <Badge variant={variant}>{WORKFLOW_LABELS[status]}</Badge>;
}

const TASK_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variant =
    status === 'COMPLETED'
      ? 'success'
      : status === 'BLOCKED'
        ? 'destructive'
        : status === 'IN_PROGRESS'
          ? 'default'
          : status === 'CANCELLED'
            ? 'outline'
            : 'muted';
  return <Badge variant={variant}>{TASK_LABELS[status]}</Badge>;
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const variant =
    priority === 'URGENT'
      ? 'destructive'
      : priority === 'HIGH'
        ? 'warning'
        : priority === 'LOW'
          ? 'muted'
          : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {priority.toLowerCase()}
    </Badge>
  );
}

const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const variant =
    status === 'COMPLETED'
      ? 'success'
      : status === 'FAILED'
        ? 'destructive'
        : status === 'RUNNING'
          ? 'default'
          : status === 'PAUSED'
            ? 'warning'
            : 'outline';
  return <Badge variant={variant}>{EXECUTION_LABELS[status]}</Badge>;
}

/** Small status dot used in dense lists where a full badge would be noisy. */
export function StatusDot({ tone }: { tone: 'default' | 'success' | 'warning' | 'destructive' }) {
  const classes = {
    default: 'bg-muted-foreground',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
  } as const;
  return <span className={cn('size-1.5 shrink-0 rounded-full', classes[tone])} aria-hidden="true" />;
}
