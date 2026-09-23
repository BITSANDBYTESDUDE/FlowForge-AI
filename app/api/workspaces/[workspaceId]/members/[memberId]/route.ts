import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { updateMemberRoleSchema } from '@/schemas/workspace.schema';
import { removeMember, updateMemberRole } from '@/services/workspace.service';

type RouteContext = { params: Promise<{ workspaceId: string; memberId: string }> };

/** PATCH /api/workspaces/:workspaceId/members/:memberId — change a member's role. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId, memberId } = await context.params;
  const input = await parseJsonBody(request, updateMemberRoleSchema);
  await updateMemberRole(session.user.id, workspaceId, memberId, input.role);
  return ok({ updated: true });
});

/** DELETE /api/workspaces/:workspaceId/members/:memberId */
export const DELETE = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId, memberId } = await context.params;
  await removeMember(session.user.id, workspaceId, memberId);
  return ok({ removed: true });
});
