import { Types } from 'mongoose';
import { Activity, Task, Workflow, WorkflowExecution } from '@/models';
import { requirePermission } from '@/lib/permissions/guard';
import { assertObjectId } from '@/lib/permissions/guard';

/**
 * Analytics service.
 *
 * Every figure is computed by a MongoDB aggregation over real documents — there
 * are no hardcoded or estimated numbers. Counts are workspace-scoped, and each
 * entry point resolves membership through the permission guard first.
 *
 * Where a metric needs a window of time, the aggregation groups by day in the
 * database rather than pulling documents into Node, so cost stays flat as
 * history grows.
 */

export type DashboardMetrics = {
  workflows: { total: number; active: number; draft: number; archived: number; completed: number };
  tasks: { total: number; open: number; overdue: number; completed: number; completionRate: number };
  executions: { total: number; running: number; completed: number; failed: number };
  averageCompletionHours: number | null;
};

export type TrendPoint = { date: string; created: number; completed: number };

export type AnalyticsOverview = {
  metrics: DashboardMetrics;
  taskTrend: TrendPoint[];
  workflowTrend: TrendPoint[];
  tasksByStatus: Array<{ status: string; count: number }>;
  tasksByPriority: Array<{ priority: string; count: number }>;
  overdueByAssignee: Array<{ assigneeId: string | null; name: string; count: number }>;
  teamPerformance: Array<{
    userId: string;
    name: string;
    completed: number;
    open: number;
    overdue: number;
  }>;
};

function workspaceScope(workspaceId: string): { workspaceId: Types.ObjectId } {
  return { workspaceId: new Types.ObjectId(assertObjectId(workspaceId, 'workspaceId')) };
}

function buildDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

/** Fills gaps so charts render a continuous axis instead of collapsing empty days. */
function fillTrend(
  rows: Array<{ _id: string; count: number }>,
  dates: string[],
  key: 'created' | 'completed',
): TrendPoint[] {
  const byDate = new Map(rows.map((row) => [row._id, row.count]));
  return dates.map((date) => ({
    date,
    created: key === 'created' ? byDate.get(date) ?? 0 : 0,
    completed: key === 'completed' ? byDate.get(date) ?? 0 : 0,
  }));
}

function mergeTrends(created: TrendPoint[], completed: TrendPoint[]): TrendPoint[] {
  const completedByDate = new Map(completed.map((point) => [point.date, point.completed]));
  return created.map((point) => ({
    date: point.date,
    created: point.created,
    completed: completedByDate.get(point.date) ?? 0,
  }));
}

export async function getDashboardMetrics(
  userId: string,
  workspaceId: string,
): Promise<DashboardMetrics> {
  await requirePermission(userId, workspaceId, 'analytics:read');
  const scope = workspaceScope(workspaceId);

  const [
    workflowStatusCounts,
    completedWorkflowCount,
    taskStatusCounts,
    overdueTaskCount,
    executionStatusCounts,
    averageCompletion,
  ] = await Promise.all([
    Workflow.aggregate<{ _id: string; count: number }>([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // "Completed" workflows are those with at least one finished execution —
    // a workflow is a definition, so completion is a property of its runs.
    WorkflowExecution.distinct('workflowId', { ...scope, status: 'COMPLETED' }),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({
      ...scope,
      dueDate: { $lt: new Date() },
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
    }),
    WorkflowExecution.aggregate<{ _id: string; count: number }>([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    WorkflowExecution.aggregate<{ avgHours: number | null }>([
      { $match: { ...scope, status: 'COMPLETED', startedAt: { $ne: null }, completedAt: { $ne: null } } },
      {
        $project: {
          durationHours: { $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 3_600_000] },
        },
      },
      { $group: { _id: null, avgHours: { $avg: '$durationHours' } } },
    ]),
  ]);

  const workflowByStatus = new Map(workflowStatusCounts.map((row) => [row._id, row.count]));
  const taskByStatus = new Map(taskStatusCounts.map((row) => [row._id, row.count]));
  const executionByStatus = new Map(executionStatusCounts.map((row) => [row._id, row.count]));

  const totalTasks = taskStatusCounts.reduce((sum, row) => sum + row.count, 0);
  const completedTasks = taskByStatus.get('COMPLETED') ?? 0;
  const totalWorkflows = workflowStatusCounts.reduce((sum, row) => sum + row.count, 0);

  return {
    workflows: {
      total: totalWorkflows,
      active: workflowByStatus.get('ACTIVE') ?? 0,
      draft: workflowByStatus.get('DRAFT') ?? 0,
      archived: workflowByStatus.get('ARCHIVED') ?? 0,
      completed: completedWorkflowCount.length,
    },
    tasks: {
      total: totalTasks,
      open:
        (taskByStatus.get('TODO') ?? 0) +
        (taskByStatus.get('IN_PROGRESS') ?? 0) +
        (taskByStatus.get('BLOCKED') ?? 0),
      overdue: overdueTaskCount,
      completed: completedTasks,
      completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    },
    executions: {
      total: executionStatusCounts.reduce((sum, row) => sum + row.count, 0),
      running: executionByStatus.get('RUNNING') ?? 0,
      completed: executionByStatus.get('COMPLETED') ?? 0,
      failed: executionByStatus.get('FAILED') ?? 0,
    },
    averageCompletionHours:
      averageCompletion[0]?.avgHours != null
        ? Math.round(averageCompletion[0].avgHours * 10) / 10
        : null,
  };
}

export async function getAnalyticsOverview(
  userId: string,
  workspaceId: string,
  days = 30,
): Promise<AnalyticsOverview> {
  await requirePermission(userId, workspaceId, 'analytics:read');
  const scope = workspaceScope(workspaceId);
  const windowDays = Math.min(Math.max(days, 7), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  const dates = buildDateRange(windowDays);

  const [
    metrics,
    taskCreatedRows,
    taskCompletedRows,
    workflowCreatedRows,
    executionCompletedRows,
    tasksByStatusRows,
    tasksByPriorityRows,
    overdueRows,
    teamRows,
  ] = await Promise.all([
    getDashboardMetrics(userId, workspaceId),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: { ...scope, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: { ...scope, status: 'COMPLETED', completedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, count: { $sum: 1 } } },
    ]),
    Workflow.aggregate<{ _id: string; count: number }>([
      { $match: { ...scope, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    WorkflowExecution.aggregate<{ _id: string; count: number }>([
      { $match: { ...scope, status: 'COMPLETED', completedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, count: { $sum: 1 } } },
    ]),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: scope },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Task.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      {
        $match: {
          ...scope,
          dueDate: { $lt: new Date() },
          status: { $nin: ['COMPLETED', 'CANCELLED'] },
        },
      },
      { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Task.aggregate<{ _id: Types.ObjectId | null; completed: number; open: number; overdue: number }>([
      { $match: { ...scope, assigneeId: { $ne: null } } },
      {
        $group: {
          _id: '$assigneeId',
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          open: {
            $sum: {
              $cond: [{ $in: ['$status', ['TODO', 'IN_PROGRESS', 'BLOCKED']] }, 1, 0],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', new Date()] },
                    { $not: { $in: ['$status', ['COMPLETED', 'CANCELLED']] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { completed: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const userIds = new Set<string>();
  for (const row of [...overdueRows, ...teamRows]) {
    if (row._id) userIds.add(row._id.toString());
  }

  const { User } = await import('@/models');
  const users = await User.find({ _id: { $in: Array.from(userIds).map((id) => new Types.ObjectId(id)) } })
    .select('name')
    .lean();
  const nameById = new Map(users.map((user) => [user._id.toString(), user.name]));

  return {
    metrics,
    taskTrend: mergeTrends(
      fillTrend(taskCreatedRows, dates, 'created'),
      fillTrend(taskCompletedRows, dates, 'completed'),
    ),
    workflowTrend: mergeTrends(
      fillTrend(workflowCreatedRows, dates, 'created'),
      fillTrend(executionCompletedRows, dates, 'completed'),
    ),
    tasksByStatus: tasksByStatusRows
      .map((row) => ({ status: row._id, count: row.count }))
      .sort((a, b) => b.count - a.count),
    tasksByPriority: tasksByPriorityRows
      .map((row) => ({ priority: row._id, count: row.count }))
      .sort((a, b) => b.count - a.count),
    overdueByAssignee: overdueRows.map((row) => ({
      assigneeId: row._id ? row._id.toString() : null,
      name: row._id ? nameById.get(row._id.toString()) ?? 'Unknown' : 'Unassigned',
      count: row.count,
    })),
    teamPerformance: teamRows.map((row) => ({
      userId: row._id!.toString(),
      name: nameById.get(row._id!.toString()) ?? 'Unknown',
      completed: row.completed,
      open: row.open,
      overdue: row.overdue,
    })),
  };
}

/** Recent workspace activity, joined with actor names for display. */
export async function getActivityFeed(
  userId: string,
  workspaceId: string,
  limit = 25,
): Promise<
  Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    actor: { id: string; name: string; avatar: string | null };
  }>
> {
  await requirePermission(userId, workspaceId, 'workspace:read');

  const activities = await Activity.find({ workspaceId: new Types.ObjectId(workspaceId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();

  if (activities.length === 0) return [];

  const { User } = await import('@/models');
  const actorIds = Array.from(new Set(activities.map((a) => a.userId.toString())));
  const users = await User.find({ _id: { $in: actorIds.map((id) => new Types.ObjectId(id)) } })
    .select('name image')
    .lean();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));

  return activities.map((activity) => {
    const actor = byId.get(activity.userId.toString());
    return {
      id: activity._id.toString(),
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId ? activity.entityId.toString() : null,
      metadata: activity.metadata ?? {},
      createdAt: activity.createdAt.toISOString(),
      actor: {
        id: activity.userId.toString(),
        name: actor?.name ?? 'Unknown user',
        avatar: actor?.image ?? null,
      },
    };
  });
}
