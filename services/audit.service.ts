import { Types } from 'mongoose';
import { AuditLog, User } from '@/models';
import type { ListAuditLogsQuery } from '@/schemas/audit.schema';
import { requirePermission } from '@/lib/permissions/guard';
import { paginate, type Paginated } from '@/lib/utils/pagination';

/**
 * Audit log reads.
 *
 * Writes happen exclusively through `recordAudit` at the point of the audited
 * action; this service is read-only, which is what makes the collection
 * append-only from the application's perspective.
 *
 * Reading requires `audit:read`, held by ADMIN and OWNER only — MEMBER and
 * VIEWER get a 403 rather than an empty list, so the difference between "no
 * entries" and "not allowed to look" stays explicit.
 */

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string; avatar: string | null };
};

export async function listAuditLogs(
  userId: string,
  query: ListAuditLogsQuery,
): Promise<Paginated<AuditLogEntry>> {
  await requirePermission(userId, query.workspaceId, 'audit:read');

  const filter: Record<string, unknown> = {
    workspaceId: new Types.ObjectId(query.workspaceId),
  };

  if (query.action) filter.action = query.action;
  if (query.actorId) filter.actorId = new Types.ObjectId(query.actorId);
  if (query.entityType) filter.entityType = query.entityType;

  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.$gte = new Date(query.from);
    if (query.to) createdAt.$lte = new Date(query.to);
    filter.createdAt = createdAt;
  }

  const [documents, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Resolve actors in one round trip rather than per row; audit pages are
  // typically a few dozen rows but that is still 25+ avoidable queries.
  const actorIds = Array.from(new Set(documents.map((d) => d.actorId.toString())));
  const actors = await User.find({ _id: { $in: actorIds.map((id) => new Types.ObjectId(id)) } })
    .select('name email image')
    .lean();
  const actorsById = new Map(actors.map((actor) => [actor._id.toString(), actor]));

  const items = documents.map((document) => {
    const actor = actorsById.get(document.actorId.toString());
    return {
      id: document._id.toString(),
      action: document.action,
      entityType: document.entityType,
      entityId: document.entityId ? document.entityId.toString() : null,
      metadata: document.metadata ?? {},
      ip: document.ip ?? null,
      userAgent: document.userAgent ?? null,
      createdAt: document.createdAt.toISOString(),
      actor: {
        id: document.actorId.toString(),
        // A deleted actor must not blank the whole row: an audit entry that
        // cannot name its actor is still evidence.
        name: actor?.name ?? 'Deleted user',
        email: actor?.email ?? '',
        avatar: actor?.image ?? null,
      },
    };
  });

  return paginate(items, total, { page: query.page, limit: query.limit });
}
