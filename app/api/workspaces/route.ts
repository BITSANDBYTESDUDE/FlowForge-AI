import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { createWorkspaceSchema } from '@/schemas/workspace.schema';
import { createWorkspace, listWorkspaces } from '@/services/workspace.service';

/** GET /api/workspaces — workspaces the caller belongs to. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const workspaces = await listWorkspaces(session.user.id);
  return ok({ workspaces });
});

/** POST /api/workspaces — creates a workspace owned by the caller. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, createWorkspaceSchema);
  const workspace = await createWorkspace(session.user.id, input);
  return created({ workspace });
});
