export const EXECUTION_STATUSES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * Execution state machine. Enforced in `services/execution.service.ts`; kept here
 * so the UI can disable impossible actions without duplicating the rules.
 */
export const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  PENDING: ['RUNNING', 'CANCELLED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PAUSED: ['RUNNING', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean {
  if (from === to) return false;
  return EXECUTION_TRANSITIONS[from].includes(to);
}

export type ExecutionProgress = {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
};

export type ExecutionSummary = {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  label: string | null;
  startedBy: string;
  status: ExecutionStatus;
  currentNodeIds: string[];
  completedNodeIds: string[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  progress: ExecutionProgress;
};
