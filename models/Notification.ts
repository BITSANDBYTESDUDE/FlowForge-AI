import { Schema, model, models, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_COMPLETED',
  'TASK_OVERDUE',
  'WORKFLOW_STARTED',
  'WORKFLOW_COMPLETED',
  'APPROVAL_REQUESTED',
  'MEMBER_INVITED',
  'WORKFLOW_UPDATED',
  'EXECUTION_UPDATED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  workspaceId: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Serves the bell dropdown (unread first, newest first) and the unread count.
notificationSchema.index(
  { userId: 1, read: 1, createdAt: -1 },
  { name: 'notification_user_read_recent' },
);

export const Notification: Model<NotificationDocument> =
  (models.Notification as Model<NotificationDocument>) ??
  model<NotificationDocument>('Notification', notificationSchema);
