import { Types } from 'mongoose';
import { AuditLog, type AuditAction } from '@/models';
import { logger } from '@/lib/utils/logger';

export type AuditInput = {
  workspaceId: string | Types.ObjectId;
  actorId: string | Types.ObjectId;
  action: AuditAction;
  entityType: string;
  entityId?: string | Types.ObjectId | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Append-only audit trail for sensitive operations.
 *
 * Only `create` is exposed — there is intentionally no update or delete helper,
 * which is what makes the trail trustworthy. Failures are logged but never
 * propagated: losing an audit row is bad, failing a user's workflow because
 * auditing failed is worse.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      workspaceId: new Types.ObjectId(input.workspaceId.toString()),
      actorId: new Types.ObjectId(input.actorId.toString()),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ? new Types.ObjectId(input.entityId.toString()) : null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    });
  } catch (error) {
    logger.error('Failed to write audit log', { error, action: input.action });
  }
}
