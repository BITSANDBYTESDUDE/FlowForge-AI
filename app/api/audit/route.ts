import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { listAuditLogsQuerySchema } from '@/schemas/audit.schema';
import { listAuditLogs } from '@/services/audit.service';

/**
 * GET /api/audit?workspaceId=...&action=...&actorId=...&entityType=...&page=1
 *
 * Read-only by design. There is no POST: audit entries are written by
 * `recordAudit` as a side effect of the action being audited, so a client can
 * never fabricate or forge one.
 *
 * Requires `audit:read` (ADMIN or OWNER); the service enforces it after
 * resolving workspace membership.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const parsed = listAuditLogsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const result = await listAuditLogs(session.user.id, parsed.data);
  return ok(result);
});
