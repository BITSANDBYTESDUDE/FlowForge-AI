import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { restoreVersionSchema } from '@/schemas/workflow.schema';
import { ValidationError } from '@/lib/utils/errors';
import { restoreVersion } from '@/services/workflow.service';

type RouteContext = { params: Promise<{ workflowId: string; version: string }> };

/**
 * POST /api/workflows/:workflowId/versions/:version/restore
 *
 * Restoration is forward-only: the restored graph becomes a new version, so no
 * history is destroyed. The path version must match the body version to avoid a
 * client sending conflicting instructions.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId, version } = await context.params;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const input = await parseJsonBody(request, restoreVersionSchema);
  const pathVersion = Number.parseInt(version, 10);

  if (!Number.isInteger(pathVersion) || pathVersion < 1) {
    throw new ValidationError('The version must be a positive integer');
  }
  if (pathVersion !== input.version) {
    throw new ValidationError('The version in the URL and the request body must match');
  }

  const workflow = await restoreVersion(session.user.id, workflowId, workspaceId, input.version);
  return ok({ workflow });
});
