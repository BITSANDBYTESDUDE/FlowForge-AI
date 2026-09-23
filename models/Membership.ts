import { Schema, model, models, type Model, type Types } from 'mongoose';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@/types/workspace';

export type MembershipDocument = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
};

const membershipSchema = new Schema<MembershipDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: WORKSPACE_ROLES, required: true },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// One membership per (workspace, user). The compound key also serves the
// authorization lookup, which always filters on both fields.
membershipSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true, name: 'membership_workspace_user_unique' },
);
membershipSchema.index({ userId: 1 }, { name: 'membership_user' });

export const Membership: Model<MembershipDocument> =
  (models.Membership as Model<MembershipDocument>) ??
  model<MembershipDocument>('Membership', membershipSchema);
