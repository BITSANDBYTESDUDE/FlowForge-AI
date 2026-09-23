import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { listExecutions } from '@/services/execution.service';

/**
 * GET /api/executions?workspaceId=...&workflowId=...
 *
 * Lists recent runs, optionally narrowed to one workflow definition.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const workflowId = request.nextUrl.searchParams.get('workflowId') ?? undefined;

  const executions = await listExecutions(session.user.id, workspaceId, workflowId);
  return ok({ executions });
});
