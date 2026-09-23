import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { updateWorkflowSchema } from '@/schemas/workflow.schema';
import { ValidationError } from '@/lib/utils/errors';
import { deleteWorkflow, getWorkflow, updateWorkflow } from '@/services/workflow.service';

type RouteContext = { params: Promise<{ workflowId: string }> };

/** Requires the workspace scope, which every workflow operation is keyed on. */
function requireWorkspaceId(request: NextRequest): string {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    throw new ValidationError('The workspaceId query parameter is required');
  }
  return workspaceId;
}

/** GET /api/workflows/:workflowId?workspaceId=... */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId } = await context.params;
  const workflow = await getWorkflow(session.user.id, workflowId, requireWorkspaceId(request));
  return ok({ workflow });
});

/**
 * PATCH /api/workflows/:workflowId — full graph replacement.
 *
 * The graph is replaced wholesale rather than patched node-by-node: the builder
 * holds the authoritative graph in memory, so a merge would risk resurrecting
 * nodes the user just deleted.
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId } = await context.params;
  const input = await parseJsonBody(request, updateWorkflowSchema);
  const workflow = await updateWorkflow(session.user.id, workflowId, input.workspaceId, input);
  return ok({ workflow });
});

/** DELETE /api/workflows/:workflowId?workspaceId=... */
export const DELETE = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId } = await context.params;
  await deleteWorkflow(session.user.id, workflowId, requireWorkspaceId(request));
  return ok({ deleted: true });
});
