import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { createWorkflowSchema, listWorkflowsQuerySchema } from '@/schemas/workflow.schema';
import { createWorkflow, listWorkflows } from '@/services/workflow.service';
import { ValidationError } from '@/lib/utils/errors';

/** GET /api/workflows?workspaceId=... — paginated, workspace-scoped list. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const parsed = listWorkflowsQuerySchema.safeParse(
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

  const result = await listWorkflows(session.user.id, parsed.data);
  return ok(result);
});

/** POST /api/workflows */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, createWorkflowSchema);
  const workflow = await createWorkflow(session.user.id, input);
  return created({ workflow });
});
