import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { updateWorkspaceSchema } from '@/schemas/workspace.schema';
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/services/workspace.service';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** GET /api/workspaces/:workspaceId */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId } = await context.params;
  const workspace = await getWorkspace(session.user.id, workspaceId);
  return ok({ workspace });
});

/** PATCH /api/workspaces/:workspaceId */
export const PATCH = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId } = await context.params;
  const input = await parseJsonBody(request, updateWorkspaceSchema);
  const workspace = await updateWorkspace(session.user.id, workspaceId, input);
  return ok({ workspace });
});

/** DELETE /api/workspaces/:workspaceId — owner only, cascades workspace data. */
export const DELETE = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId } = await context.params;
  await deleteWorkspace(session.user.id, workspaceId);
  return ok({ deleted: true });
});
