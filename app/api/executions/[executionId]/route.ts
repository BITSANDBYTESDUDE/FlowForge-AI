import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { getExecution } from '@/services/execution.service';

type RouteContext = { params: Promise<{ executionId: string }> };

/**
 * GET /api/executions/:executionId
 *
 * Includes the run log. Authorization is derived from the execution's own
 * workspace, so an id from another tenant resolves to 404 rather than leaking
 * that the run exists.
 */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { executionId } = await context.params;
  const execution = await getExecution(session.user.id, executionId);
  return ok({ execution });
});
