import { Schema, model, models, type Model, type Types } from 'mongoose';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/types/task';

export type TaskDocument = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  workflowId: Types.ObjectId | null;
  /** Links a task to the workflow node that spawned it. */
  nodeId: string | null;
  executionId: Types.ObjectId | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  dueDate: Date | null;
  completedAt: Date | null;
  dependencies: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

const taskSchema = new Schema<TaskDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    workflowId: { type: Schema.Types.ObjectId, ref: 'Workflow', default: null },
    nodeId: { type: String, default: null },
    executionId: { type: Schema.Types.ObjectId, ref: 'WorkflowExecution', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: null, maxlength: 4000 },
    status: { type: String, enum: TASK_STATUSES, default: 'TODO' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM' },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    dependencies: { type: [Schema.Types.ObjectId], ref: 'Task', default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Covers the workspace task board and the "overdue" aggregate.
taskSchema.index({ workspaceId: 1, status: 1, dueDate: 1 }, { name: 'task_workspace_status_due' });
taskSchema.index({ workflowId: 1 }, { name: 'task_workflow' });
taskSchema.index({ assigneeId: 1, status: 1 }, { name: 'task_assignee_status' });
taskSchema.index(
  { title: 'text', description: 'text' },
  { name: 'task_text_search', weights: { title: 5, description: 1 } },
);

export const Task: Model<TaskDocument> =
  (models.Task as Model<TaskDocument>) ?? model<TaskDocument>('Task', taskSchema);
