import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { getVersion } from '@/services/workflow.service';

type RouteContext = { params: Promise<{ workflowId: string; version: string }> };

/** GET /api/workflows/:workflowId/versions/:version?workspaceId=... */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId, version } = await context.params;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const parsedVersion = Number.parseInt(version, 10);
  if (!Number.isInteger(parsedVersion) || parsedVersion < 1) {
    throw new ValidationError('The version must be a positive integer');
  }

  const graph = await getVersion(session.user.id, workflowId, workspaceId, parsedVersion);
  return ok({ version: parsedVersion, graph });
});
