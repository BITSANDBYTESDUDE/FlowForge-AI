import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { resumeExecution } from '@/services/execution.service';

type RouteContext = { params: Promise<{ executionId: string }> };

/** POST /api/executions/:executionId/resume — continues traversal from the active node. */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { executionId } = await context.params;
  const execution = await resumeExecution(session.user.id, executionId);
  return ok({ execution });
});
