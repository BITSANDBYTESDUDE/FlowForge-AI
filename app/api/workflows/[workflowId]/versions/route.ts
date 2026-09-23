import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { listVersions } from '@/services/workflow.service';

type RouteContext = { params: Promise<{ workflowId: string }> };

/** GET /api/workflows/:workflowId/versions?workspaceId=... */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId } = await context.params;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const versions = await listVersions(session.user.id, workflowId, workspaceId);
  return ok({ versions });
});
