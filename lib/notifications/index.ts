import { Types } from 'mongoose';
import { Activity, Notification, type NotificationType } from '@/models';
import { logger } from '@/lib/utils/logger';
import type { ActivityAction } from '@/models/Activity';

/**
 * Notification delivery.
 *
 * In-app notifications are persisted. Email is behind `sendEmail` so a real
 * provider (Resend/SES) can be dropped in without touching call sites — and so
 * the current no-op cannot be mistaken for working delivery.
 */
export type NotifyInput = {
  userId: string | Types.ObjectId;
  workspaceId?: string | Types.ObjectId | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Email transport placeholder.
 *
 * Deliberately does not pretend to send. When an email provider is configured
 * this is the single place to wire it up.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  logger.info('Email delivery is not configured; notification stored in-app only', {
    subject: message.subject,
  });
  return { delivered: false };
}

export async function createNotification(input: NotifyInput): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(input.userId.toString()),
    workspaceId: input.workspaceId ? new Types.ObjectId(input.workspaceId.toString()) : null,
    type: input.type,
    title: input.title,
    message: input.message,
    data: input.data ?? {},
    read: false,
  });
}

/**
 * Fan-out helper.
 *
 * Notifications are a side effect, never the point of a request: a failure to
 * notify must not fail the action that triggered it, so errors are logged and
 * swallowed. Duplicate recipients are collapsed to avoid double-notifying a
 * user who is both assignee and workspace owner.
 */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  const unique = new Map<string, NotifyInput>();
  for (const input of inputs) {
    const key = `${input.userId.toString()}:${input.type}:${input.title}`;
    if (!unique.has(key)) unique.set(key, input);
  }
  if (unique.size === 0) return;

  try {
    await Notification.insertMany(
      Array.from(unique.values()).map((input) => ({
        userId: new Types.ObjectId(input.userId.toString()),
        workspaceId: input.workspaceId ? new Types.ObjectId(input.workspaceId.toString()) : null,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data ?? {},
        read: false,
      })),
    );
  } catch (error) {
    logger.error('Failed to create notifications', { error });
  }
}

export type RecordActivityInput = {
  workspaceId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  action: ActivityAction;
  entityType: 'WORKFLOW' | 'TASK' | 'EXECUTION' | 'MEMBER' | 'WORKSPACE';
  entityId?: string | Types.ObjectId | null;
  metadata?: Record<string, unknown>;
};

/** Appends to the workspace activity feed. Never throws. */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await Activity.create({
      workspaceId: new Types.ObjectId(input.workspaceId.toString()),
      userId: new Types.ObjectId(input.userId.toString()),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ? new Types.ObjectId(input.entityId.toString()) : null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logger.error('Failed to record activity', { error, action: input.action });
  }
}
