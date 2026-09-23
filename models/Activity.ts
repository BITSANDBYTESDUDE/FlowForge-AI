import { Schema, model, models, type Model, type Types } from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'WORKFLOW_CREATED',
  'WORKFLOW_UPDATED',
  'WORKFLOW_DELETED',
  'WORKFLOW_STATUS_CHANGED',
  'WORKFLOW_VERSION_RESTORED',
  'WORKFLOW_GENERATED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_ASSIGNED',
  'EXECUTION_STARTED',
  'EXECUTION_COMPLETED',
  'MEMBER_INVITED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'WORKSPACE_UPDATED',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityDocument = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  action: ActivityAction;
  entityType: 'WORKFLOW' | 'TASK' | 'EXECUTION' | 'MEMBER' | 'WORKSPACE';
  entityId: Types.ObjectId | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const activitySchema = new Schema<ActivityDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    entityType: {
      type: String,
      enum: ['WORKFLOW', 'TASK', 'EXECUTION', 'MEMBER', 'WORKSPACE'],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

activitySchema.index({ workspaceId: 1, createdAt: -1 }, { name: 'activity_workspace_recent' });

export const Activity: Model<ActivityDocument> =
  (models.Activity as Model<ActivityDocument>) ?? model<ActivityDocument>('Activity', activitySchema);
