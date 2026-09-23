import { Schema, model, models, type Model, type Types } from 'mongoose';

export type WorkflowVersionDocument = {
  _id: Types.ObjectId;
  workflowId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  version: number;
  /** Untyped on purpose — see the schema comment below. */
  nodes: unknown[];
  edges: unknown[];
  createdBy: Types.ObjectId;
  changeSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Snapshots use a permissive schema on purpose: a version must stay readable
 * after the graph schema evolves, otherwise restoring an old version would fail.
 */
const workflowVersionSchema = new Schema<WorkflowVersionDocument>(
  {
    workflowId: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    version: { type: Number, required: true, min: 1 },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changeSummary: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

workflowVersionSchema.index(
  { workflowId: 1, version: -1 },
  { unique: true, name: 'workflow_version_unique' },
);

export const WorkflowVersion: Model<WorkflowVersionDocument> =
  (models.WorkflowVersion as Model<WorkflowVersionDocument>) ??
  model<WorkflowVersionDocument>('WorkflowVersion', workflowVersionSchema);
