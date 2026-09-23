import { Schema, model, models, type Model, type Types } from 'mongoose';
import {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_STATUSES,
  type WorkflowNodeType,
  type WorkflowStatus,
} from '@/types/workflow';

export type WorkflowNodeDocument = {
  id: string;
  type: WorkflowNodeType;
  title: string;
  description?: string;
  position: { x: number; y: number };
  assigneeId?: Types.ObjectId | null;
  dueDate?: Date | null;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type WorkflowEdgeDocument = {
  id: string;
  source: string;
  target: string;
  condition?: string | null;
  label?: string | null;
};

export type WorkflowDocument = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdBy: Types.ObjectId;
  nodes: WorkflowNodeDocument[];
  edges: WorkflowEdgeDocument[];
  currentVersion: number;
  tags: string[];
  templateId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const nodeSchema = new Schema<WorkflowNodeDocument>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: WORKFLOW_NODE_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    config: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const edgeSchema = new Schema<WorkflowEdgeDocument>(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    condition: { type: String, default: null },
    label: { type: String, default: null },
  },
  { _id: false },
);

const workflowSchema = new Schema<WorkflowDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 2000 },
    status: { type: String, enum: WORKFLOW_STATUSES, default: 'DRAFT' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nodes: { type: [nodeSchema], default: [] },
    edges: { type: [edgeSchema], default: [] },
    currentVersion: { type: Number, default: 1, min: 1 },
    tags: { type: [String], default: [] },
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', default: null },
  },
  { timestamps: true, versionKey: false },
);

// Drives the workspace-scoped list view (filter by status, newest first).
workflowSchema.index(
  { workspaceId: 1, status: 1, updatedAt: -1 },
  { name: 'workflow_workspace_status' },
);
workflowSchema.index({ createdBy: 1 }, { name: 'workflow_created_by' });
// Text index backs global search until Atlas Search is introduced.
workflowSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { name: 'workflow_text_search', weights: { name: 5, tags: 3, description: 1 } },
);

export const Workflow: Model<WorkflowDocument> =
  (models.Workflow as Model<WorkflowDocument>) ??
  model<WorkflowDocument>('Workflow', workflowSchema);
