import { Types } from 'mongoose';
import { Notification } from '@/models';
import { NotFoundError } from '@/lib/utils/errors';
import { assertObjectId } from '@/lib/permissions/guard';

/**
 * Notification service (read side).
 *
 * Creation lives in `lib/notifications` because it is a side effect of other
 * operations. Everything here is scoped to the authenticated user: a notification
 * id is never trusted, so marking one read requires it to belong to the caller.
 */

export type NotificationItem = {
  id: string;
  workspaceId: string | null;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

type NotificationLike = {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId | null;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
};

function serialise(notification: NotificationLike): NotificationItem {
  return {
    id: notification._id.toString(),
    workspaceId: notification.workspaceId ? notification.workspaceId.toString() : null,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data ?? {},
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationItem[]> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(assertObjectId(userId, 'userId')) };
  if (options.unreadOnly) filter.read = false;

  const notifications = await Notification.find(filter)
    .sort({ read: 1, createdAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 30, 1), 100))
    .lean();

  return notifications.map((n) => serialise(n as NotificationLike));
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({
    userId: new Types.ObjectId(assertObjectId(userId, 'userId')),
    read: false,
  });
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  const result = await Notification.updateOne(
    // The user id is part of the filter, so another user's id simply matches
    // nothing rather than being reported as forbidden (no existence leak).
    { _id: new Types.ObjectId(assertObjectId(notificationId, 'notificationId')), userId: new Types.ObjectId(userId) },
    { $set: { read: true, readAt: new Date() } },
  );

  if (result.matchedCount === 0) throw new NotFoundError('Notification');
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId: new Types.ObjectId(userId), read: false },
    { $set: { read: true, readAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  const result = await Notification.deleteOne({
    _id: new Types.ObjectId(assertObjectId(notificationId, 'notificationId')),
    userId: new Types.ObjectId(userId),
  });
  if (result.deletedCount === 0) throw new NotFoundError('Notification');
}

/**
 * Flags tasks past their due date and notifies their assignees.
 *
 * Intended to be invoked from a scheduled job (see README). It is idempotent per
 * day: a notification is only created when one has not already been sent for the
 * same task today, so running it repeatedly does not spam assignees.
 */
export async function notifyOverdueTasks(workspaceId: string): Promise<number> {
  const { Task } = await import('@/models');

  const overdue = await Task.find({
    workspaceId: new Types.ObjectId(workspaceId),
    assigneeId: { $ne: null },
    dueDate: { $lt: new Date() },
    status: { $nin: ['COMPLETED', 'CANCELLED'] },
  })
    .select('_id title assigneeId dueDate')
    .limit(500)
    .lean();

  if (overdue.length === 0) return 0;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const taskIds = overdue.map((task) => task._id);
  const alreadyNotified = await Notification.find({
    type: 'TASK_OVERDUE',
    createdAt: { $gte: startOfDay },
    'data.taskId': { $in: taskIds.map((id) => id.toString()) },
  })
    .select('data')
    .lean();
  const notifiedTaskIds = new Set(
    alreadyNotified.map((n) => String((n.data as { taskId?: string }).taskId)),
  );

  const pending = overdue.filter((task) => !notifiedTaskIds.has(task._id.toString()));
  if (pending.length === 0) return 0;

  await Notification.insertMany(
    pending.map((task) => ({
      userId: task.assigneeId,
      workspaceId: new Types.ObjectId(workspaceId),
      type: 'TASK_OVERDUE',
      title: 'Task is overdue',
      message: `${task.title} is past its due date.`,
      data: { taskId: task._id.toString(), workspaceId },
      read: false,
    })),
  );

  return pending.length;
}
