import { Schema, model, models, type Model, type Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'WORKFLOW_CREATED',
  'WORKFLOW_UPDATED',
  'WORKFLOW_DELETED',
  'MEMBER_INVITED',
  'MEMBER_REMOVED',
  'ROLE_CHANGED',
  'WORKFLOW_EXECUTED',
  'WORKSPACE_CREATED',
  'WORKSPACE_DELETED',
  'TEMPLATE_APPLIED',
  'AI_GENERATION',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditLogDocument = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: AuditAction;
  entityType: string;
  entityId: Types.ObjectId | null;
  /** Request provenance, useful for incident review. */
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Append-only by convention: no application code path updates or deletes audit
 * rows, and there is deliberately no soft-delete flag or edit UI.
 */
const auditLogSchema = new Schema<AuditLogDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

auditLogSchema.index({ workspaceId: 1, createdAt: -1 }, { name: 'audit_workspace_recent' });
auditLogSchema.index({ actorId: 1, createdAt: -1 }, { name: 'audit_actor_recent' });

export const AuditLog: Model<AuditLogDocument> =
  (models.AuditLog as Model<AuditLogDocument>) ??
  model<AuditLogDocument>('AuditLog', auditLogSchema);
