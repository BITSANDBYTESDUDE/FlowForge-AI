import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { createTaskSchema, listTasksQuerySchema } from '@/schemas/task.schema';
import { createTask, listTasks } from '@/services/task.service';
import { ValidationError } from '@/lib/utils/errors';

/** GET /api/tasks?workspaceId=...&status=...&assigneeId=... */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const parsed = listTasksQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const result = await listTasks(session.user.id, parsed.data);
  return ok(result);
});

/** POST /api/tasks */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, createTaskSchema);
  const task = await createTask(session.user.id, input);
  return created({ task });
});
