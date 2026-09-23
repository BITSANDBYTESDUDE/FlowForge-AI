/** Node kinds supported by the workflow graph. Mirrors `WorkflowNodeType`. */
export const WORKFLOW_NODE_TYPES = [
  'START',
  'END',
  'TASK',
  'DECISION',
  'APPROVAL',
  'DELAY',
  'NOTIFICATION',
  'AI_ACTION',
] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Types that the execution engine can auto-resolve without human input. */
export const AUTOMATIC_NODE_TYPES: WorkflowNodeType[] = ['START', 'DELAY', 'NOTIFICATION', 'AI_ACTION'];

export type NodeConfig = {
  /** DECISION nodes: ordered conditions evaluated against execution context. */
  conditions?: { label: string; expression: string }[];
  /** APPROVAL nodes: who must approve. */
  approvers?: string[];
  /** DELAY nodes: how long to wait before continuing. */
  delayMinutes?: number;
  /** NOTIFICATION nodes: message template to emit. */
  message?: string;
  /** AI_ACTION nodes: prompt the agent should satisfy. */
  prompt?: string;
  /** Free-form, integration-specific settings. Kept for forward compatibility. */
  [key: string]: unknown;
};

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  title: string;
  description?: string;
  position: { x: number; y: number };
  assigneeId?: string | null;
  dueDate?: string | null;
  config?: NodeConfig;
  metadata?: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  condition?: string | null;
  label?: string | null;
};

/** Graph payload shared by workflows, versions and AI output. */
export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowSummary = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  tags: string[];
  currentVersion: number;
  createdBy: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDetail = WorkflowSummary & WorkflowGraph;

export type WorkflowVersionSummary = {
  id: string;
  workflowId: string;
  version: number;
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
};
