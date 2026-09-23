import { Types } from 'mongoose';
import { Task, WorkflowExecution } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { assertObjectId, requirePermission } from '@/lib/permissions/guard';
import { notifyMany, recordActivity } from '@/lib/notifications';
import { recordAudit } from '@/lib/audit';
import { assertExecutable, loadWorkflowScoped } from '@/services/workflow.service';
import {
  getNodeById,
  getOutgoingEdges,
  validateExecutable,
} from '@/lib/workflow/graph';
import { evaluateCondition, type ConditionFacts } from '@/lib/workflow/conditions';
import { canTransitionExecution, type ExecutionStatus } from '@/types/execution';
import type { ExecutionSummary } from '@/types/execution';
import type { WorkflowDocument, WorkflowNodeDocument } from '@/models/Workflow';
import type { WorkflowExecutionDocument } from '@/models/WorkflowExecution';

/**
 * Workflow execution engine.
 *
 * A *definition* (Workflow) is separated from its *runs* (WorkflowExecution), so
 * the same workflow can be executed many times for different clients. The engine
 * advances one node at a time and is intentionally modular: node types with side
 * effects (DELAY, NOTIFICATION, AI_ACTION) are dispatched through
 * `applyAutomaticNode` so real automation can be added later without touching
 * the traversal logic.
 *
 * Design decisions worth noting:
 *  - Traversal is *pull-based*: each call to `advance` moves the run as far as it
 *    can without human input, then stops at the first node needing work. This
 *    avoids background workers while staying correct.
 *  - Manual nodes (TASK, APPROVAL) create a Task and wait. Completing that task
 *    is what advances the run.
 *  - DECISION branches are resolved from edge conditions evaluated against facts
 *    derived from the run; a malformed condition falls back to the first edge
 *    rather than failing the run.
 */

const MAX_AUTO_STEPS = 200;

/* ------------------------------------------------------------ Serialisation */

function progressOf(execution: WorkflowExecutionDocument, totalNodes: number): ExecutionSummary['progress'] {
  const completed = execution.completedNodeIds.length;
  const total = Math.max(1, totalNodes);
  return {
    total: totalNodes,
    completed,
    remaining: Math.max(0, totalNodes - completed),
    percent: Math.min(100, Math.round((completed / total) * 100)),
  };
}

function serialise(
  execution: WorkflowExecutionDocument,
  workflowName: string,
  totalNodes: number,
): ExecutionSummary {
  return {
    id: execution._id.toString(),
    workflowId: execution.workflowId.toString(),
    workflowName,
    workspaceId: execution.workspaceId.toString(),
    label: execution.label ?? null,
    startedBy: execution.startedBy.toString(),
    status: execution.status,
    currentNodeIds: execution.currentNodeIds,
    completedNodeIds: execution.completedNodeIds,
    startedAt: execution.startedAt ? new Date(execution.startedAt).toISOString() : null,
    completedAt: execution.completedAt ? new Date(execution.completedAt).toISOString() : null,
    createdAt: execution.createdAt.toISOString(),
    progress: progressOf(execution, totalNodes),
  };
}

async function log(
  executionId: Types.ObjectId,
  entry: { nodeId?: string | null; type: string; message: string },
): Promise<void> {
  await WorkflowExecution.updateOne(
    { _id: executionId },
    { $push: { log: { nodeId: entry.nodeId ?? null, type: entry.type, message: entry.message, at: new Date() } } },
  );
}

/* -------------------------------------------------------------- Node logic */

/**
 * True for node types the engine can pass through without human input.
 *
 * START and END are structural; DELAY/NOTIFICATION/AI_ACTION are automated.
 * TASK and APPROVAL require a person, so they create work and halt the advance.
 */
function isAutomatic(type: WorkflowNodeDocument['type']): boolean {
  return ['START', 'END', 'DELAY', 'NOTIFICATION', 'AI_ACTION'].includes(type);
}

/**
 * Side effects for automated nodes.
 *
 * Returns a log message. DELAY is recorded but not actually waited on: blocking a
 * request for an arbitrary duration is not viable, so the delay is represented
 * as a scheduled concept for a future worker. This is called out explicitly
 * rather than pretending the wait happened.
 */
async function applyAutomaticNode(
  node: WorkflowNodeDocument,
  execution: WorkflowExecutionDocument,
): Promise<string> {
  switch (node.type) {
    case 'START':
      return `Execution started at "${node.title}"`;

    case 'END':
      return `Execution reached "${node.title}"`;

    case 'NOTIFICATION': {
      const message =
        typeof node.config?.message === 'string' && node.config.message.trim().length > 0
          ? node.config.message
          : node.title;

      const recipients = new Set<string>();
      if (node.assigneeId) recipients.add(node.assigneeId.toString());
      recipients.add(execution.startedBy.toString());

      await notifyMany(
        Array.from(recipients).map((userId) => ({
          userId,
          workspaceId: execution.workspaceId.toString(),
          type: 'WORKFLOW_STARTED' as const,
          title: 'Workflow notification',
          message,
          data: {
            executionId: execution._id.toString(),
            workflowId: execution.workflowId.toString(),
            nodeId: node.id,
          },
        })),
      );
      return `Sent notification: ${message}`;
    }

    case 'DELAY': {
      const minutes =
        typeof node.config?.delayMinutes === 'number' ? node.config.delayMinutes : 0;
      // Recorded, not awaited — see the function comment.
      return minutes > 0
        ? `Delay of ${minutes} minute(s) recorded for "${node.title}" (non-blocking)`
        : `Delay node "${node.title}" had no duration configured`;
    }

    case 'AI_ACTION': {
      const prompt =
        typeof node.config?.prompt === 'string' && node.config.prompt.trim().length > 0
          ? node.config.prompt
          : node.title;
      // AI_ACTION nodes are recorded as queued work. Executing them inline would
      // put a multi-second model call inside a user request; a worker will pick
      // these up. Being explicit here prevents a false impression of automation.
      return `AI action queued: ${prompt}`;
    }

    default:
      return `Passed through "${node.title}"`;
  }
}

/** Creates the task that represents manual work at a node. */
async function createTaskForNode(
  node: WorkflowNodeDocument,
  execution: WorkflowExecutionDocument,
): Promise<void> {
  const existing = await Task.findOne({ executionId: execution._id, nodeId: node.id });
  if (existing) return;

  await Task.create({
    workspaceId: execution.workspaceId,
    workflowId: execution.workflowId,
    nodeId: node.id,
    executionId: execution._id,
    title: node.title,
    description: node.description ?? null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: node.assigneeId ?? null,
    createdBy: execution.startedBy,
    dueDate: node.dueDate ?? null,
    dependencies: [],
  });

  if (node.assigneeId && node.assigneeId.toString() !== execution.startedBy.toString()) {
    await notifyMany([
      {
        userId: node.assigneeId,
        workspaceId: execution.workspaceId.toString(),
        type: 'TASK_ASSIGNED',
        title: 'Workflow step assigned to you',
        message: node.title,
        data: {
          workflowId: execution.workflowId.toString(),
          executionId: execution._id.toString(),
          nodeId: node.id,
        },
      },
    ]);
  }
}

/**
 * Chooses the next node after `node`.
 *
 * DECISION nodes evaluate each outgoing edge condition; the first edge whose
 * condition is true wins, and an unconditional edge is the default. When no
 * condition evaluates true (including when all are malformed) the first edge is
 * taken so a run degrades to linear instead of stalling.
 */
function selectNextNode(
  workflow: WorkflowDocument,
  node: WorkflowNodeDocument,
  execution: WorkflowExecutionDocument,
): { nodeId: string | null; note?: string } {
  const outgoing = getOutgoingEdges(workflow.edges as never, node.id);
  if (outgoing.length === 0) return { nodeId: null };

  if (node.type !== 'DECISION') {
    // Non-decision nodes have a single successor by construction.
    return { nodeId: outgoing[0]!.target };
  }

  const facts: ConditionFacts = {
    executionId: execution._id.toString(),
    workflowId: execution.workflowId.toString(),
    completedCount: execution.completedNodeIds.length,
    ...(node.config && typeof node.config === 'object'
      ? Object.fromEntries(
          Object.entries(node.config).filter(
            ([, value]) =>
              typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
          ),
        )
      : {}),
  };

  const notes: string[] = [];

  for (const edge of outgoing) {
    if (!edge.condition || edge.condition.trim().length === 0) {
      notes.push(`No condition on "${edge.label ?? edge.id}"; treated as default branch`);
      return { nodeId: edge.target, note: notes.join('; ') };
    }

    const result = evaluateCondition(edge.condition, facts);
    if (!result.ok) {
      notes.push(`Condition "${edge.condition}" could not be evaluated (${result.error})`);
      continue;
    }
    if (result.value) {
      return {
        nodeId: edge.target,
        note: `Branch "${edge.label ?? edge.target}" matched: ${edge.condition}`,
      };
    }
  }

  const fallback = outgoing[0]!;
  return {
    nodeId: fallback.target,
    note: `No branch condition matched; falling back to "${fallback.label ?? fallback.target}". ${notes.join('; ')}`,
  };
}

/* -------------------------------------------------------------- Transitions */

async function requireExecution(
  userId: string,
  executionId: string,
  permission: 'workflow:read' | 'workflow:execute',
): Promise<{ execution: WorkflowExecutionDocument; workflow: WorkflowDocument }> {
  assertObjectId(executionId, 'executionId');

  const execution = await WorkflowExecution.findById(executionId).lean();
  if (!execution) throw new NotFoundError('Execution');

  // Authorization is derived from the execution's own workspace, so a client
  // cannot point at an execution in another tenant by supplying a different id.
  await requirePermission(userId, execution.workspaceId.toString(), permission);

  const workflow = await loadWorkflowScoped(
    execution.workflowId.toString(),
    execution.workspaceId.toString(),
  );

  return { execution: execution as WorkflowExecutionDocument, workflow };
}

function assertTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransitionExecution(from, to)) {
    throw new ValidationError(`An execution cannot move from ${from} to ${to}`);
  }
}

/**
 * Advances the run until it needs human input or reaches an END node.
 *
 * Exported because it is also called after a task completes, which is the event
 * that unblocks a paused traversal.
 */
async function advance(
  executionId: Types.ObjectId,
  workflow: WorkflowDocument,
): Promise<WorkflowExecutionDocument> {
  let steps = 0;

  // Re-read each iteration: a concurrent task completion may have changed state.
  for (;;) {
    steps += 1;
    if (steps > MAX_AUTO_STEPS) {
      await log(executionId, {
        type: 'GUARD',
        message: `Stopped after ${MAX_AUTO_STEPS} automatic steps to avoid a runaway loop`,
      });
      break;
    }

    const execution = (await WorkflowExecution.findById(executionId).lean()) as WorkflowExecutionDocument | null;
    if (!execution) throw new NotFoundError('Execution');
    if (execution.status !== 'RUNNING') return execution;

    const currentId = execution.currentNodeIds[0];
    if (!currentId) {
      // No active node: either nothing started, or everything converged.
      const completed = await finishIfDone(execution, workflow);
      return completed;
    }

    const node = getNodeById(workflow as never, currentId) as WorkflowNodeDocument | undefined;
    if (!node) {
      await log(executionId, {
        nodeId: currentId,
        type: 'ERROR',
        message: `Node "${currentId}" no longer exists in the workflow definition`,
      });
      return fail(execution, `Node "${currentId}" is missing from the workflow`);
    }

    if (!isAutomatic(node.type)) {
      // Manual node: create the work item and stop. The run resumes when the
      // corresponding task is completed.
      await createTaskForNode(node, execution);
      return (await WorkflowExecution.findById(executionId).lean()) as WorkflowExecutionDocument;
    }

    const message = await applyAutomaticNode(node, execution);
    await log(executionId, { nodeId: node.id, type: node.type, message });

    const { nodeId: nextId, note } = selectNextNode(workflow, node, execution);
    if (note) await log(executionId, { nodeId: node.id, type: 'BRANCH', message: note });

    const completedNodeIds = Array.from(new Set([...execution.completedNodeIds, node.id]));

    if (!nextId) {
      // No successor: an END node, or a graph that dead-ends (rejected at save
      // time, so reaching this means the definition changed mid-run).
      await WorkflowExecution.updateOne(
        { _id: executionId },
        {
          $set: {
            completedNodeIds,
            currentNodeIds: [],
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        },
      );
      await log(executionId, { type: 'COMPLETED', message: 'Execution completed' });
      const finished = (await WorkflowExecution.findById(executionId).lean()) as WorkflowExecutionDocument;
      await notifyMany([
        {
          userId: execution.startedBy,
          workspaceId: execution.workspaceId.toString(),
          type: 'WORKFLOW_COMPLETED',
          title: 'Workflow execution completed',
          message: `${workflow.name} finished successfully.`,
          data: {
            executionId: executionId.toString(),
            workflowId: workflow._id.toString(),
          },
        },
      ]);
      return finished;
    }

    const nextNode = getNodeById(workflow as never, nextId) as WorkflowNodeDocument | undefined;
    if (!nextNode) {
      await log(executionId, {
        nodeId: nextId,
        type: 'ERROR',
        message: `Next node "${nextId}" does not exist`,
      });
      return fail(execution, `Next node "${nextId}" is missing from the workflow`);
    }

    await WorkflowExecution.updateOne(
      { _id: executionId },
      { $set: { completedNodeIds, currentNodeIds: [nextId] } },
    );
  }

  return (await WorkflowExecution.findById(executionId).lean()) as WorkflowExecutionDocument;
}

async function finishIfDone(
  execution: WorkflowExecutionDocument,
  workflow: WorkflowDocument,
): Promise<WorkflowExecutionDocument> {
  const endIds = workflow.nodes.filter((n) => n.type === 'END').map((n) => n.id);
  const reachedEnd = endIds.some((id) => execution.completedNodeIds.includes(id));

  if (reachedEnd) {
    await WorkflowExecution.updateOne(
      { _id: execution._id },
      { $set: { status: 'COMPLETED', completedAt: new Date() } },
    );
    return (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
  }

  // Nothing running and no END reached: the run is stalled, which is a real
  // condition worth surfacing rather than hiding.
  await WorkflowExecution.updateOne(
    { _id: execution._id },
    { $set: { status: 'FAILED', completedAt: new Date() } },
  );
  await log(execution._id, {
    type: 'FAILED',
    message: 'Execution has no active node and never reached an END node',
  });
  return (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
}

async function fail(
  execution: WorkflowExecutionDocument,
  reason: string,
): Promise<WorkflowExecutionDocument> {
  await WorkflowExecution.updateOne(
    { _id: execution._id },
    { $set: { status: 'FAILED', completedAt: new Date() } },
  );
  await log(execution._id, { type: 'FAILED', message: reason });
  return (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
}

/* ------------------------------------------------------------- Public API */

export async function startExecution(
  userId: string,
  workflowId: string,
  workspaceId: string,
  label?: string | null,
): Promise<ExecutionSummary> {
  await requirePermission(userId, workspaceId, 'workflow:execute');

  const workflow = await loadWorkflowScoped(workflowId, workspaceId);

  const graph = { nodes: workflow.nodes as never, edges: workflow.edges as never };
  assertExecutable(graph as never);

  const startNode = workflow.nodes.find((node) => node.type === 'START');
  if (!startNode) throw new ValidationError('Workflow has no START node');

  const execution = await WorkflowExecution.create({
    workflowId: workflow._id,
    workspaceId: workflow.workspaceId,
    label: label ?? null,
    startedBy: new Types.ObjectId(userId),
    status: 'RUNNING',
    currentNodeIds: [startNode.id],
    completedNodeIds: [],
    startedAt: new Date(),
    completedAt: null,
    log: [],
  });

  await log(execution._id, { nodeId: startNode.id, type: 'START', message: 'Execution created' });

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'EXECUTION_STARTED',
      entityType: 'EXECUTION',
      entityId: execution._id,
      metadata: { workflowId, label: label ?? null },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'WORKFLOW_EXECUTED',
      entityType: 'EXECUTION',
      entityId: execution._id,
      metadata: { workflowId, label: label ?? null },
    }),
  ]);

  const advanced = await advance(execution._id, workflow);
  return serialise(advanced, workflow.name, workflow.nodes.length);
}

export async function getExecution(
  userId: string,
  executionId: string,
): Promise<ExecutionSummary & { log: WorkflowExecutionDocument['log'] }> {
  const { execution, workflow } = await requireExecution(userId, executionId, 'workflow:read');
  return {
    ...serialise(execution, workflow.name, workflow.nodes.length),
    log: execution.log ?? [],
  };
}

export async function listExecutions(
  userId: string,
  workspaceId: string,
  workflowId?: string,
): Promise<ExecutionSummary[]> {
  await requirePermission(userId, workspaceId, 'workflow:read');

  const filter: Record<string, unknown> = {
    workspaceId: new Types.ObjectId(assertObjectId(workspaceId, 'workspaceId')),
  };
  if (workflowId) filter.workflowId = new Types.ObjectId(assertObjectId(workflowId, 'workflowId'));

  const executions = await WorkflowExecution.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const { Workflow } = await import('@/models');
  const workflowIds = Array.from(new Set(executions.map((e) => e.workflowId.toString())));
  const workflows = await Workflow.find({ _id: { $in: workflowIds } })
    .select('name nodes')
    .lean();
  const byId = new Map(workflows.map((w) => [w._id.toString(), w]));

  return executions.map((execution) => {
    const workflow = byId.get(execution.workflowId.toString());
    return serialise(
      execution as WorkflowExecutionDocument,
      workflow?.name ?? 'Unknown workflow',
      workflow?.nodes.length ?? 0,
    );
  });
}

export async function pauseExecution(userId: string, executionId: string): Promise<ExecutionSummary> {
  const { execution, workflow } = await requireExecution(userId, executionId, 'workflow:execute');
  assertTransition(execution.status, 'PAUSED');

  await WorkflowExecution.updateOne({ _id: execution._id }, { $set: { status: 'PAUSED' } });
  await log(execution._id, { type: 'PAUSED', message: 'Execution paused' });

  const updated = (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
  return serialise(updated, workflow.name, workflow.nodes.length);
}

export async function resumeExecution(userId: string, executionId: string): Promise<ExecutionSummary> {
  const { execution, workflow } = await requireExecution(userId, executionId, 'workflow:execute');
  assertTransition(execution.status, 'RUNNING');

  await WorkflowExecution.updateOne({ _id: execution._id }, { $set: { status: 'RUNNING' } });
  await log(execution._id, { type: 'RESUMED', message: 'Execution resumed' });

  const advanced = await advance(execution._id, workflow);
  return serialise(advanced, workflow.name, workflow.nodes.length);
}

export async function cancelExecution(userId: string, executionId: string): Promise<ExecutionSummary> {
  const { execution, workflow } = await requireExecution(userId, executionId, 'workflow:execute');
  assertTransition(execution.status, 'CANCELLED');

  // Outstanding work for this run is cancelled too, otherwise tasks would linger
  // in the board for an execution nobody is tracking.
  await Promise.all([
    WorkflowExecution.updateOne(
      { _id: execution._id },
      { $set: { status: 'CANCELLED', completedAt: new Date(), currentNodeIds: [] } },
    ),
    Task.updateMany(
      { executionId: execution._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } },
      { $set: { status: 'CANCELLED' } },
    ),
  ]);
  await log(execution._id, { type: 'CANCELLED', message: 'Execution cancelled' });

  const updated = (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
  return serialise(updated, workflow.name, workflow.nodes.length);
}

/**
 * Records completion of the task backing a node and advances the run.
 *
 * This is the bridge between the task board and the engine: completing the task
 * is what "answers" a TASK or APPROVAL node.
 */
export async function completeNodeTask(
  userId: string,
  taskId: string,
): Promise<{ execution: ExecutionSummary | null; advanced: boolean }> {
  assertObjectId(taskId, 'taskId');

  const task = await Task.findById(taskId).lean();
  if (!task) throw new NotFoundError('Task');

  await requirePermission(userId, task.workspaceId.toString(), 'task:update');

  if (!task.executionId || !task.nodeId) {
    // A standalone task (not part of a run) has nothing to advance.
    return { execution: null, advanced: false };
  }

  const execution = (await WorkflowExecution.findById(task.executionId).lean()) as
    | WorkflowExecutionDocument
    | null;
  if (!execution) throw new NotFoundError('Execution');

  if (execution.status !== 'RUNNING') {
    return {
      execution: null,
      advanced: false,
    };
  }

  // Only the node the run is currently waiting on can unblock it. This prevents
  // a stale task from a previous branch advancing the run out of order.
  if (!execution.currentNodeIds.includes(task.nodeId)) {
    return { execution: null, advanced: false };
  }

  const workflow = await loadWorkflowScoped(
    execution.workflowId.toString(),
    execution.workspaceId.toString(),
  );

  const node = getNodeById(workflow as never, task.nodeId) as WorkflowNodeDocument | undefined;
  if (!node) throw new NotFoundError('Workflow node');

  const message = await applyAutomaticNode(node, execution);
  void message;

  const { nodeId: nextId, note } = selectNextNode(workflow, node, execution);
  const completedNodeIds = Array.from(new Set([...execution.completedNodeIds, node.id]));

  await log(execution._id, {
    nodeId: node.id,
    type: 'NODE_COMPLETED',
    message: `Task "${task.title}" completed`,
  });
  if (note) await log(execution._id, { nodeId: node.id, type: 'BRANCH', message: note });

  if (!nextId) {
    await WorkflowExecution.updateOne(
      { _id: execution._id },
      { $set: { completedNodeIds, currentNodeIds: [], status: 'COMPLETED', completedAt: new Date() } },
    );
    await log(execution._id, { type: 'COMPLETED', message: 'Execution completed' });
    await notifyMany([
      {
        userId: execution.startedBy,
        workspaceId: execution.workspaceId.toString(),
        type: 'WORKFLOW_COMPLETED',
        title: 'Workflow execution completed',
        message: `${workflow.name} finished successfully.`,
        data: { executionId: execution._id.toString(), workflowId: workflow._id.toString() },
      },
    ]);

    const finished = (await WorkflowExecution.findById(execution._id).lean()) as WorkflowExecutionDocument;
    return { execution: serialise(finished, workflow.name, workflow.nodes.length), advanced: true };
  }

  await WorkflowExecution.updateOne(
    { _id: execution._id },
    { $set: { completedNodeIds, currentNodeIds: [nextId] } },
  );

  const advanced = await advance(execution._id, workflow);
  return {
    execution: serialise(advanced, workflow.name, workflow.nodes.length),
    advanced: true,
  };
}

/** Structural readiness check surfaced in the builder and before starting a run. */
export async function getExecutionReadiness(
  userId: string,
  workflowId: string,
  workspaceId: string,
): Promise<{ ready: boolean; issues: Array<{ code: string; message: string }> }> {
  await requirePermission(userId, workspaceId, 'workflow:read');
  const workflow = await loadWorkflowScoped(workflowId, workspaceId);
  const issues = validateExecutable({ nodes: workflow.nodes as never, edges: workflow.edges as never } as never);
  return {
    ready: issues.length === 0,
    issues: issues.map((issue) => ({ code: issue.code, message: issue.message })),
  };
}
