import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { listUserWorkspaceIds } from '@/lib/permissions/guard';

/**
 * GET /api/users/me
 *
 * Returns the current session's user plus the workspaces they belong to, so the
 * dashboard can render its workspace switcher from one request instead of
 * guessing from client storage.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const workspaceIds = await listUserWorkspaceIds(session.user.id);

  return ok({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      plan: session.user.plan,
    },
    workspaceIds,
  });
});
