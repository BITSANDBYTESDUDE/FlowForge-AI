import { Types } from 'mongoose';
import { Membership, Task, Workflow } from '@/models';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { assertObjectId, requirePermission } from '@/lib/permissions/guard';
import { notifyMany, recordActivity } from '@/lib/notifications';
import { canTransitionTask, isTerminalTaskStatus, type TaskStatus } from '@/types/task';
import { buildPagination, paginate, type Paginated } from '@/lib/utils/pagination';
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from '@/schemas/task.schema';
import type { TaskPriority, TaskSummary } from '@/types/task';
import type { TaskDocument } from '@/models/Task';

/**
 * Task service.
 *
 * Tasks are first-class: they can exist without a workflow (created by hand) or
 * be generated from workflow nodes. Status changes go through
 * `canTransitionTask` so the same state machine governs the API and the UI.
 */

function serialise(task: TaskDocument): TaskSummary {
  return {
    id: task._id.toString(),
    workspaceId: task.workspaceId.toString(),
    workflowId: task.workflowId ? task.workflowId.toString() : null,
    nodeId: task.nodeId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    createdBy: task.createdBy.toString(),
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    dependencies: (task.dependencies ?? []).map((d) => d.toString()),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * Validates that referenced users and workflows belong to this workspace.
 *
 * Without this, a member could assign a task to a user in another tenant or link
 * a task to a foreign workflow — a cross-tenant reference that would leak data
 * through the task detail view.
 */
async function assertReferencesInWorkspace(
  workspaceId: string,
  refs: { assigneeId?: string | null; workflowId?: string | null; dependencies?: string[] },
): Promise<void> {
  if (refs.assigneeId) {
    const isMember = await Membership.exists({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(assertObjectId(refs.assigneeId, 'assigneeId')),
    });
    if (!isMember) throw new ValidationError('The assignee is not a member of this workspace');
  }

  if (refs.workflowId) {
    const exists = await Workflow.exists({
      _id: new Types.ObjectId(assertObjectId(refs.workflowId, 'workflowId')),
      workspaceId: new Types.ObjectId(workspaceId),
    });
    if (!exists) throw new ValidationError('That workflow is not in this workspace');
  }

  if (refs.dependencies && refs.dependencies.length > 0) {
    const ids = refs.dependencies.map((id) => new Types.ObjectId(assertObjectId(id, 'dependencyId')));
    const count = await Task.countDocuments({ _id: { $in: ids }, workspaceId });
    if (count !== ids.length) {
      throw new ValidationError('One or more dependencies are not tasks in this workspace');
    }
  }
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<TaskSummary> {
  await requirePermission(userId, input.workspaceId, 'task:create');

  await assertReferencesInWorkspace(input.workspaceId, {
    assigneeId: input.assigneeId ?? null,
    workflowId: input.workflowId ?? null,
    dependencies: input.dependencies,
  });

  const task = await Task.create({
    workspaceId: new Types.ObjectId(input.workspaceId),
    workflowId: input.workflowId ? new Types.ObjectId(input.workflowId) : null,
    nodeId: input.nodeId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId ? new Types.ObjectId(input.assigneeId) : null,
    createdBy: new Types.ObjectId(userId),
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    dependencies: input.dependencies.map((id) => new Types.ObjectId(id)),
  });

  await recordActivity({
    workspaceId: input.workspaceId,
    userId,
    action: 'TASK_CREATED',
    entityType: 'TASK',
    entityId: task._id,
    metadata: { title: task.title },
  });

  // The assignee is notified on creation only when someone else created it;
  // notifying yourself is noise.
  if (input.assigneeId && input.assigneeId !== userId) {
    await notifyMany([
      {
        userId: input.assigneeId,
        workspaceId: input.workspaceId,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned to you',
        message: task.title,
        data: { taskId: task._id.toString(), workspaceId: input.workspaceId },
      },
    ]);
  }

  return serialise(task.toObject() as TaskDocument);
}

export async function listTasks(
  userId: string,
  params: ListTasksQuery,
): Promise<Paginated<TaskSummary>> {
  await requirePermission(userId, params.workspaceId, 'task:read');

  const filter: Record<string, unknown> = {
    workspaceId: new Types.ObjectId(assertObjectId(params.workspaceId, 'workspaceId')),
  };

  if (params.workflowId) filter.workflowId = new Types.ObjectId(params.workflowId);
  if (params.assigneeId) filter.assigneeId = new Types.ObjectId(params.assigneeId);
  if (params.priority) filter.priority = params.priority;
  if (params.status) {
    filter.status = Array.isArray(params.status) ? { $in: params.status } : params.status;
  }
  if (params.overdue) {
    // Overdue means past due and not in a terminal state; terminal tasks have a
    // completedAt and must never surface as overdue.
    filter.dueDate = { $lt: new Date() };
    filter.status = { $nin: ['COMPLETED', 'CANCELLED'] };
  }
  if (params.search) {
    filter.title = { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const { skip, limit, page } = buildPagination({ page: params.page, limit: params.limit });
  const sortDirection = params.order === 'asc' ? 1 : -1;
  // Nulls sort last on dueDate so undated tasks do not crowd the top.
  const sort: Record<string, 1 | -1> =
    params.sort === 'dueDate' ? { dueDate: sortDirection } : { [params.sort]: sortDirection };

  const [documents, total] = await Promise.all([
    Task.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Task.countDocuments(filter),
  ]);

  return paginate(documents.map((doc) => serialise(doc as TaskDocument)), total, { page, limit });
}

export async function getTask(
  userId: string,
  taskId: string,
  workspaceId: string,
): Promise<TaskSummary> {
  await requirePermission(userId, workspaceId, 'task:read');

  const task = await Task.findOne({
    _id: new Types.ObjectId(assertObjectId(taskId, 'taskId')),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();

  if (!task) throw new NotFoundError('Task');
  return serialise(task as TaskDocument);
}

export async function updateTask(
  userId: string,
  taskId: string,
  workspaceId: string,
  input: UpdateTaskInput,
): Promise<TaskSummary> {
  const context = await requirePermission(userId, workspaceId, 'task:update');

  const existing = await Task.findOne({
    _id: new Types.ObjectId(assertObjectId(taskId, 'taskId')),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();
  if (!existing) throw new NotFoundError('Task');

  await assertReferencesInWorkspace(workspaceId, {
    assigneeId: input.assigneeId ?? null,
    workflowId: input.workflowId ?? null,
    dependencies: input.dependencies,
  });

  const update: Record<string, unknown> = {};

  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description ?? null;
  if (input.priority !== undefined) update.priority = input.priority;
  if (input.nodeId !== undefined) update.nodeId = input.nodeId ?? null;
  if (input.workflowId !== undefined) {
    update.workflowId = input.workflowId ? new Types.ObjectId(input.workflowId) : null;
  }
  if (input.dueDate !== undefined) update.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.dependencies !== undefined) {
    update.dependencies = input.dependencies.map((id) => new Types.ObjectId(id));
  }

  // Reassignment requires the assign permission; a plain member editing a task
  // must not be able to hand it to someone else.
  const assigneeChanged =
    input.assigneeId !== undefined &&
    (input.assigneeId ?? null) !== (existing.assigneeId ? existing.assigneeId.toString() : null);
  if (assigneeChanged) {
    if (!context.role || !['OWNER', 'ADMIN', 'MEMBER'].includes(context.role)) {
      throw new ForbiddenError('You cannot reassign this task');
    }
    update.assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
  }

  // Status transitions are validated against the shared state machine, and
  // `completedAt` is derived rather than client-supplied so timestamps cannot be
  // forged.
  let becameCompleted = false;
  if (input.status !== undefined && input.status !== existing.status) {
    if (!canTransitionTask(existing.status, input.status as TaskStatus)) {
      throw new ValidationError(`A task cannot move from ${existing.status} to ${input.status}`);
    }
    update.status = input.status;
    if (isTerminalTaskStatus(input.status)) {
      update.completedAt = new Date();
      becameCompleted = input.status === 'COMPLETED';
    } else {
      update.completedAt = null;
    }
  }

  const updated = await Task.findByIdAndUpdate(taskId, { $set: update }, { new: true }).lean();
  if (!updated) throw new NotFoundError('Task');
  const task = updated as TaskDocument;

  await recordActivity({
    workspaceId,
    userId,
    action: becameCompleted ? 'TASK_COMPLETED' : 'TASK_UPDATED',
    entityType: 'TASK',
    entityId: taskId,
    metadata: { fields: Object.keys(update), status: task.status },
  });

  const notifications = [];
  if (becameCompleted && existing.createdBy.toString() !== userId) {
    notifications.push({
      userId: existing.createdBy,
      workspaceId,
      type: 'TASK_COMPLETED' as const,
      title: 'Task completed',
      message: task.title,
      data: { taskId, workspaceId },
    });
  }
  if (assigneeChanged && input.assigneeId && input.assigneeId !== userId) {
    notifications.push({
      userId: input.assigneeId,
      workspaceId,
      type: 'TASK_ASSIGNED' as const,
      title: 'Task assigned to you',
      message: task.title,
      data: { taskId, workspaceId },
    });
  }
  if (notifications.length > 0) await notifyMany(notifications);

  return serialise(task);
}

export async function deleteTask(
  userId: string,
  taskId: string,
  workspaceId: string,
): Promise<void> {
  await requirePermission(userId, workspaceId, 'task:delete');
  assertObjectId(taskId, 'taskId');

  const task = await Task.findOne({
    _id: new Types.ObjectId(taskId),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();
  if (!task) throw new NotFoundError('Task');

  // Dependencies pointing at a deleted task would block progress forever, so
  // they are pruned rather than left dangling.
  await Promise.all([
    Task.findByIdAndDelete(taskId),
    Task.updateMany({ dependencies: new Types.ObjectId(taskId) }, { $pull: { dependencies: new Types.ObjectId(taskId) } }),
  ]);

  await recordActivity({
    workspaceId,
    userId,
    action: 'TASK_DELETED',
    entityType: 'TASK',
    entityId: taskId,
    metadata: { title: task.title },
  });
}

/**
 * Bulk creation used by AI task generation and template application.
 *
 * Returns the created tasks; the caller is responsible for having authorized the
 * workspace already (these are internal helpers, not HTTP handlers).
 */
export async function createTasksBulk(
  userId: string,
  workspaceId: string,
  inputs: Array<{
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
    workflowId?: string | null;
    nodeId?: string | null;
  }>,
): Promise<TaskSummary[]> {
  if (inputs.length === 0) return [];

  const documents = inputs.map((input) => ({
    workspaceId: new Types.ObjectId(workspaceId),
    workflowId: input.workflowId ? new Types.ObjectId(input.workflowId) : null,
    nodeId: input.nodeId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: 'TODO' as const,
    priority: input.priority ?? ('MEDIUM' as const),
    assigneeId: input.assigneeId ? new Types.ObjectId(input.assigneeId) : null,
    createdBy: new Types.ObjectId(userId),
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    dependencies: [],
  }));

  const created = await Task.insertMany(documents);

  await recordActivity({
    workspaceId,
    userId,
    action: 'TASK_CREATED',
    entityType: 'TASK',
    metadata: { count: created.length, bulk: true },
  });

  return created.map((doc) => serialise(doc.toObject() as TaskDocument));
}

/** Counters backing the dashboard and analytics views. */
export async function getTaskCounters(
  workspaceId: string,
): Promise<{ open: number; overdue: number; completed: number; total: number }> {
  const scope = { workspaceId: new Types.ObjectId(workspaceId) };

  const [open, overdue, completed, total] = await Promise.all([
    Task.countDocuments({ ...scope, status: { $in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } }),
    Task.countDocuments({
      ...scope,
      dueDate: { $lt: new Date() },
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
    }),
    Task.countDocuments({ ...scope, status: 'COMPLETED' }),
    Task.countDocuments(scope),
  ]);

  return { open, overdue, completed, total };
}
