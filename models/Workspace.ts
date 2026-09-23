import { Schema, model, models, type Model, type Types } from 'mongoose';

export type WorkspacePlan = 'FREE' | 'PRO' | 'TEAM';

export type WorkspaceSettings = {
  defaultWorkflowStatus: 'DRAFT' | 'ACTIVE';
  allowGuestViewers: boolean;
  aiEnabled: boolean;
};

export type WorkspaceDocument = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  ownerId: Types.ObjectId;
  logo: string | null;
  plan: WorkspacePlan;
  settings: WorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
};

const workspaceSchema = new Schema<WorkspaceDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    logo: { type: String, default: null },
    plan: { type: String, enum: ['FREE', 'PRO', 'TEAM'], default: 'FREE' },
    settings: {
      defaultWorkflowStatus: { type: String, enum: ['DRAFT', 'ACTIVE'], default: 'DRAFT' },
      allowGuestViewers: { type: Boolean, default: false },
      aiEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true, versionKey: false },
);

workspaceSchema.index({ slug: 1 }, { unique: true, name: 'workspace_slug_unique' });

export const Workspace: Model<WorkspaceDocument> =
  (models.Workspace as Model<WorkspaceDocument>) ??
  model<WorkspaceDocument>('Workspace', workspaceSchema);
