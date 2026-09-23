import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { pauseExecution } from '@/services/execution.service';

type RouteContext = { params: Promise<{ executionId: string }> };

/** POST /api/executions/:executionId/pause — halts traversal without cancelling work. */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { executionId } = await context.params;
  const execution = await pauseExecution(session.user.id, executionId);
  return ok({ execution });
});
