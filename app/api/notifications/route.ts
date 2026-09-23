import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { getUnreadCount, listNotifications } from '@/services/notification.service';

/**
 * GET /api/notifications?unread=true&limit=30
 *
 * Always scoped to the authenticated user; there is no way to read another
 * user's notifications.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const unreadOnly = request.nextUrl.searchParams.get('unread') === 'true';
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '30', 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 30;

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(session.user.id, { unreadOnly, limit }),
    getUnreadCount(session.user.id),
  ]);

  return ok({ notifications, unreadCount });
});
