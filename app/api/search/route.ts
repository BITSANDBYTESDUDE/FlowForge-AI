import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { listUserWorkspaceIds } from '@/lib/permissions/guard';
import { search } from '@/services/search.service';

/**
 * GET /api/search?q=...&types=workflow,task,template&workspaceId=...
 *
 * Search is limited to the caller's workspaces, so results can never cross a
 * tenant boundary. Short queries return an empty result set rather than scanning
 * the collection.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const typesParam = request.nextUrl.searchParams.get('types');
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? undefined;

  const types = typesParam
    ? (typesParam
        .split(',')
        .map((type) => type.trim())
        .filter((type): type is 'workflow' | 'task' | 'template' =>
          ['workflow', 'task', 'template'].includes(type),
        ))
    : undefined;

  const workspaceIds = await listUserWorkspaceIds(session.user.id);
  const result = await search(session.user.id, workspaceIds, query, {
    ...(types && types.length > 0 ? { types } : {}),
    ...(workspaceId ? { workspaceId } : {}),
  });

  return ok(result);
});
