import { Schema, model, models, type Model, type Types } from 'mongoose';
import { EXECUTION_STATUSES, type ExecutionStatus } from '@/types/execution';

export type ExecutionLogEntry = {
  nodeId: string | null;
  type: string;
  message: string;
  at: Date;
};

export type WorkflowExecutionDocument = {
  _id: Types.ObjectId;
  workflowId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  /** Distinguishes concurrent runs of the same workflow ("Client A", "Q3"). */
  label: string | null;
  startedBy: Types.ObjectId;
  status: ExecutionStatus;
  currentNodeIds: string[];
  completedNodeIds: string[];
  startedAt: Date | null;
  completedAt: Date | null;
  log: ExecutionLogEntry[];
  createdAt: Date;
  updatedAt: Date;
};

const logSchema = new Schema<ExecutionLogEntry>(
  {
    nodeId: { type: String, default: null },
    type: { type: String, required: true },
    message: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const executionSchema = new Schema<WorkflowExecutionDocument>(
  {
    workflowId: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    label: { type: String, default: null, maxlength: 120 },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: EXECUTION_STATUSES, default: 'PENDING' },
    currentNodeIds: { type: [String], default: [] },
    completedNodeIds: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    log: { type: [logSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

executionSchema.index({ workflowId: 1, status: 1 }, { name: 'execution_workflow_status' });
executionSchema.index({ workspaceId: 1, createdAt: -1 }, { name: 'execution_workspace_recent' });

export const WorkflowExecution: Model<WorkflowExecutionDocument> =
  (models.WorkflowExecution as Model<WorkflowExecutionDocument>) ??
  model<WorkflowExecutionDocument>('WorkflowExecution', executionSchema);
