import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { getUnreadCount, markAllAsRead } from '@/services/notification.service';

/**
 * POST /api/notifications/read-all
 *
 * Marks every unread notification for the caller as read and returns the
 * resulting count so the bell badge can update without a second request.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const updated = await markAllAsRead(session.user.id);
  const unreadCount = await getUnreadCount(session.user.id);
  return ok({ updated, unreadCount });
});
