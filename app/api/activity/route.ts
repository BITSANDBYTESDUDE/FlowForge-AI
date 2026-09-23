import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { getActivityFeed } from '@/services/analytics.service';

/** GET /api/activity?workspaceId=...&limit=25 — workspace activity feed. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 25;

  const activity = await getActivityFeed(session.user.id, workspaceId, limit);
  return ok({ activity });
});
