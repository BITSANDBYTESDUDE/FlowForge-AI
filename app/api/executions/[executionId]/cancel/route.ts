import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { cancelExecution } from '@/services/execution.service';

type RouteContext = { params: Promise<{ executionId: string }> };

/**
 * POST /api/executions/:executionId/cancel
 *
 * Terminal. Outstanding tasks for the run are cancelled alongside it so the task
 * board does not keep showing work for a run nobody is tracking.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { executionId } = await context.params;
  const execution = await cancelExecution(session.user.id, executionId);
  return ok({ execution });
});
