export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Allowed status transitions.
 *
 * Encoded as data (not if/else chains) so the same table drives the API guard,
 * the UI's status menu, and the unit tests. COMPLETED and CANCELLED are
 * terminal — reopening is an explicit product decision we have not taken.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  BLOCKED: ['TODO', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return TASK_TRANSITIONS[from].includes(to);
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export type TaskSummary = {
  id: string;
  workspaceId: string;
  workflowId: string | null;
  nodeId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdBy: string;
  dueDate: string | null;
  completedAt: string | null;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
};
