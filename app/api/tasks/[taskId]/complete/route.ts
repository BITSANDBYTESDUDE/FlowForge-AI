import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { updateTask } from '@/services/task.service';
import { completeNodeTask } from '@/services/execution.service';
import { z } from 'zod';

type RouteContext = { params: Promise<{ taskId: string }> };

const completeSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * POST /api/tasks/:taskId/complete
 *
 * Completing a task that backs a workflow node also advances the execution.
 * Both effects happen here rather than in two client calls, so the task board
 * and the run can never disagree about what is finished.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { taskId } = await context.params;
  const input = await parseJsonBody(request, completeSchema);

  if (!input.workspaceId) throw new ValidationError('workspaceId is required');

  // Status transition and authorization are enforced inside the service.
  const task = await updateTask(session.user.id, taskId, input.workspaceId, {
    status: 'COMPLETED',
  });

  const { execution, advanced } = await completeNodeTask(session.user.id, taskId);

  return ok({ task, execution, advanced });
});
