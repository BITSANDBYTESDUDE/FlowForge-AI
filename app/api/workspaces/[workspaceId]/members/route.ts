import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { inviteMemberSchema } from '@/schemas/workspace.schema';
import { inviteMember, listMembers } from '@/services/workspace.service';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** GET /api/workspaces/:workspaceId/members */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId } = await context.params;
  const members = await listMembers(session.user.id, workspaceId);
  return ok({ members });
});

/** POST /api/workspaces/:workspaceId/members — adds an existing user by email. */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workspaceId } = await context.params;
  const input = await parseJsonBody(request, inviteMemberSchema);
  const member = await inviteMember(session.user.id, workspaceId, input);
  return created({ member });
});
