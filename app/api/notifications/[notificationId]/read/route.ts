import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { getUnreadCount, markAsRead } from '@/services/notification.service';

type RouteContext = { params: Promise<{ notificationId: string }> };

/**
 * POST /api/notifications/:notificationId/read
 *
 * The notification must belong to the caller; the user id is part of the query
 * filter, so a foreign id returns 404 rather than confirming it exists.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { notificationId } = await context.params;

  await markAsRead(session.user.id, notificationId);
  const unreadCount = await getUnreadCount(session.user.id);
  return ok({ read: true, unreadCount });
});
