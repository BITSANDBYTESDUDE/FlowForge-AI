import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { updateTaskSchema } from '@/schemas/task.schema';
import { ValidationError } from '@/lib/utils/errors';
import { deleteTask, getTask, updateTask } from '@/services/task.service';

type RouteContext = { params: Promise<{ taskId: string }> };

function requireWorkspaceId(request: NextRequest): string {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');
  return workspaceId;
}

/** GET /api/tasks/:taskId?workspaceId=... */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { taskId } = await context.params;
  const task = await getTask(session.user.id, taskId, requireWorkspaceId(request));
  return ok({ task });
});

/** PATCH /api/tasks/:taskId — status changes go through the task state machine. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { taskId } = await context.params;
  const input = await parseJsonBody(request, updateTaskSchema);
  const task = await updateTask(session.user.id, taskId, requireWorkspaceId(request), input);
  return ok({ task });
});

/** DELETE /api/tasks/:taskId?workspaceId=... */
export const DELETE = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { taskId } = await context.params;
  await deleteTask(session.user.id, taskId, requireWorkspaceId(request));
  return ok({ deleted: true });
});
