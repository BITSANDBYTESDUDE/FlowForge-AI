import { Types } from 'mongoose';
import { Workflow, WorkflowVersion } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { assertObjectId, requirePermission } from '@/lib/permissions/guard';
import { recordActivity } from '@/lib/notifications';
import { recordAudit } from '@/lib/audit';
import { validateExecutable } from '@/lib/workflow/graph';
import { createEdgeId, createNodeId } from '@/lib/utils/id';
import { buildPagination, paginate, type Paginated } from '@/lib/utils/pagination';
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '@/schemas/workflow.schema';
import type {
  WorkflowDetail,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowStatus,
  WorkflowSummary,
  WorkflowVersionSummary,
} from '@/types/workflow';
import type { WorkflowDocument, WorkflowEdgeDocument, WorkflowNodeDocument } from '@/models/Workflow';

/**
 * Workflow service.
 *
 * Two responsibilities are deliberately separated: the *definition* (nodes and
 * edges, versioned) and its *executions* (owned by execution.service). Every
 * read and write is scoped by workspaceId, which is resolved through the
 * permission guard — never taken from the request body.
 */

/* ------------------------------------------------------------ Serialisation */

function serialiseNode(node: WorkflowNodeDocument): WorkflowNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    description: node.description ?? '',
    position: { x: node.position.x, y: node.position.y },
    assigneeId: node.assigneeId ? node.assigneeId.toString() : null,
    dueDate: node.dueDate ? new Date(node.dueDate).toISOString() : null,
    config: (node.config ?? {}) as WorkflowNode['config'],
    metadata: (node.metadata ?? {}) as Record<string, unknown>,
  };
}

function serialiseEdge(edge: WorkflowEdgeDocument): WorkflowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    condition: edge.condition ?? null,
    label: edge.label ?? null,
  };
}

function serialiseSummary(workflow: WorkflowDocument): WorkflowSummary {
  return {
    id: workflow._id.toString(),
    workspaceId: workflow.workspaceId.toString(),
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    tags: workflow.tags,
    currentVersion: workflow.currentVersion,
    createdBy: workflow.createdBy.toString(),
    nodeCount: workflow.nodes.length,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}

export function serialiseWorkflow(workflow: WorkflowDocument): WorkflowDetail {
  return {
    ...serialiseSummary(workflow),
    nodes: workflow.nodes.map(serialiseNode),
    edges: workflow.edges.map(serialiseEdge),
  };
}

/** Converts validated input into the stored subdocument shape. */
function toNodeDocuments(graph: WorkflowGraph): WorkflowNodeDocument[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    description: node.description ?? '',
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    assigneeId: node.assigneeId ? new Types.ObjectId(node.assigneeId) : null,
    dueDate: node.dueDate ? new Date(node.dueDate) : null,
    config: (node.config ?? {}) as Record<string, unknown>,
    metadata: (node.metadata ?? {}) as Record<string, unknown>,
  }));
}

function toEdgeDocuments(graph: WorkflowGraph): WorkflowEdgeDocument[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    condition: edge.condition ?? null,
    label: edge.label ?? null,
  }));
}

/** An empty graph is valid for a new draft: a lone START node. */
export function emptyGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: createNodeId(),
        type: 'START',
        title: 'Start',
        description: 'Where the workflow begins.',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  };
}

/**
 * Guarantees a graph is executable before it can be activated or run.
 *
 * Called on every graph write rather than only on activation, so the stored
 * graph is always runnable and the execution engine needs no defensive checks.
 */
export function assertExecutable(graph: WorkflowGraph): void {
  const issues = validateExecutable(graph);
  if (issues.length > 0) {
    throw new ValidationError('The workflow is not executable yet', {
      issues: issues.map((issue) => ({ code: issue.code, message: issue.message })),
    });
  }
}

/* -------------------------------------------------------------------- CRUD */

export async function createWorkflow(
  userId: string,
  input: CreateWorkflowInput,
): Promise<WorkflowDetail> {
  await requirePermission(userId, input.workspaceId, 'workflow:create');

  const graph = input.graph
    ? { nodes: input.graph.nodes, edges: input.graph.edges }
    : emptyGraph();

  const nodes = toNodeDocuments(graph);
  const edges = toEdgeDocuments(graph);

  const workflow = await Workflow.create({
    workspaceId: new Types.ObjectId(input.workspaceId),
    name: input.name,
    description: input.description ?? null,
    status: input.status,
    createdBy: new Types.ObjectId(userId),
    nodes,
    edges,
    currentVersion: 1,
    tags: input.tags,
    templateId: null,
  });

  // Version 1 is the initial snapshot, so history is never empty.
  await WorkflowVersion.create({
    workflowId: workflow._id,
    workspaceId: workflow.workspaceId,
    version: 1,
    nodes,
    edges,
    createdBy: new Types.ObjectId(userId),
    changeSummary: 'Initial version',
  });

  await Promise.all([
    recordActivity({
      workspaceId: input.workspaceId,
      userId,
      action: 'WORKFLOW_CREATED',
      entityType: 'WORKFLOW',
      entityId: workflow._id,
      metadata: { name: workflow.name },
    }),
    recordAudit({
      workspaceId: input.workspaceId,
      actorId: userId,
      action: 'WORKFLOW_CREATED',
      entityType: 'WORKFLOW',
      entityId: workflow._id,
      metadata: { name: workflow.name },
    }),
  ]);

  return serialiseWorkflow(workflow.toObject() as WorkflowDocument);
}

export async function listWorkflows(
  userId: string,
  params: {
    workspaceId: string;
    status?: WorkflowStatus;
    tag?: string;
    search?: string;
    page: number;
    limit: number;
  },
): Promise<Paginated<WorkflowSummary>> {
  await requirePermission(userId, params.workspaceId, 'workflow:read');

  const filter: Record<string, unknown> = {
    workspaceId: new Types.ObjectId(assertObjectId(params.workspaceId, 'workspaceId')),
  };
  if (params.status) filter.status = params.status;
  if (params.tag) filter.tags = params.tag;
  if (params.search) {
    // Anchored regex on an indexed field for short queries; the text index is
    // reserved for global search where relevance ranking matters.
    filter.name = { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const { skip, limit, page } = buildPagination({ page: params.page, limit: params.limit });

  const [documents, total] = await Promise.all([
    Workflow.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Workflow.countDocuments(filter),
  ]);

  return paginate(documents.map(serialiseSummary), total, { page, limit });
}

/**
 * Loads a workflow and confirms it belongs to the workspace.
 *
 * The workspace id is part of the query, not a post-hoc assertion, so a
 * mismatched pair simply finds nothing.
 */
export async function getWorkflow(
  userId: string,
  workflowId: string,
  workspaceId: string,
): Promise<WorkflowDetail> {
  await requirePermission(userId, workspaceId, 'workflow:read');
  assertObjectId(workflowId, 'workflowId');

  const workflow = await Workflow.findOne({
    _id: new Types.ObjectId(workflowId),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();

  if (!workflow) throw new NotFoundError('Workflow');
  return serialiseWorkflow(workflow as WorkflowDocument);
}

/** Internal loader used by services that already hold an authorized context. */
export async function loadWorkflowScoped(
  workflowId: string,
  workspaceId: string,
): Promise<WorkflowDocument> {
  assertObjectId(workflowId, 'workflowId');
  const workflow = await Workflow.findOne({
    _id: new Types.ObjectId(workflowId),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();
  if (!workflow) throw new NotFoundError('Workflow');
  return workflow as WorkflowDocument;
}

export async function updateWorkflow(
  userId: string,
  workflowId: string,
  workspaceId: string,
  input: UpdateWorkflowInput,
): Promise<WorkflowDetail> {
  await requirePermission(userId, workspaceId, 'workflow:update');

  const existing = await loadWorkflowScoped(workflowId, workspaceId);

  const update: Record<string, unknown> = {};
  let graphChanged = false;

  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description ?? null;
  if (input.status !== undefined) update.status = input.status;
  if (input.tags !== undefined) update.tags = input.tags;

  if (input.graph) {
    const graph: WorkflowGraph = { nodes: input.graph.nodes, edges: input.graph.edges };
    // A graph write is only accepted if the result is runnable, so a
    // half-finished edit cannot be saved into an unexecutable state.
    assertExecutable(graph);
    update.nodes = toNodeDocuments(input.graph);
    update.edges = toEdgeDocuments(input.graph);
    graphChanged = true;
  }

  if (!graphChanged) {
    const updated = await Workflow.findByIdAndUpdate(workflowId, { $set: update }, { new: true }).lean();
    if (!updated) throw new NotFoundError('Workflow');

    await recordActivity({
      workspaceId,
      userId,
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { fields: Object.keys(update) },
    });

    return serialiseWorkflow(updated as WorkflowDocument);
  }

  // A graph change is a version boundary: snapshot the new state and increment.
  const nextVersion = existing.currentVersion + 1;
  update.currentVersion = nextVersion;

  const updated = await Workflow.findByIdAndUpdate(workflowId, { $set: update }, { new: true }).lean();
  if (!updated) throw new NotFoundError('Workflow');

  await WorkflowVersion.create({
    workflowId: updated._id,
    workspaceId: updated.workspaceId,
    version: nextVersion,
    nodes: update.nodes,
    edges: update.edges,
    createdBy: new Types.ObjectId(userId),
    changeSummary: input.changeSummary ?? `Updated workflow (v${nextVersion})`,
  });

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { version: nextVersion, graph: true },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { version: nextVersion, changeSummary: input.changeSummary ?? null },
    }),
  ]);

  return serialiseWorkflow(updated as WorkflowDocument);
}

export async function deleteWorkflow(
  userId: string,
  workflowId: string,
  workspaceId: string,
): Promise<void> {
  await requirePermission(userId, workspaceId, 'workflow:delete');
  assertObjectId(workflowId, 'workflowId');

  const workflow = await Workflow.findOne({
    _id: new Types.ObjectId(workflowId),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();
  if (!workflow) throw new NotFoundError('Workflow');

  const { Task, WorkflowVersion: Version, WorkflowExecution } = await import('@/models');

  await Promise.all([
    Workflow.findByIdAndDelete(workflowId),
    Version.deleteMany({ workflowId }),
    WorkflowExecution.deleteMany({ workflowId }),
    // Tasks survive their workflow but lose the link, so users do not silently
    // lose work they created.
    Task.updateMany({ workflowId }, { $set: { workflowId: null, nodeId: null } }),
  ]);

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'WORKFLOW_DELETED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { name: workflow.name },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'WORKFLOW_DELETED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { name: workflow.name },
    }),
  ]);
}

/* ---------------------------------------------------------------- Versions */

export async function listVersions(
  userId: string,
  workflowId: string,
  workspaceId: string,
): Promise<WorkflowVersionSummary[]> {
  await requirePermission(userId, workspaceId, 'workflow:read');
  assertObjectId(workflowId, 'workflowId');

  // Confirms the workflow is in this workspace before exposing its history.
  await loadWorkflowScoped(workflowId, workspaceId);

  const versions = await WorkflowVersion.find({ workflowId })
    .sort({ version: -1 })
    .limit(50)
    .lean();

  return versions.map((version) => ({
    id: version._id.toString(),
    workflowId: version.workflowId.toString(),
    version: version.version,
    changeSummary: version.changeSummary,
    createdBy: version.createdBy.toString(),
    createdAt: version.createdAt.toISOString(),
  }));
}

export async function getVersion(
  userId: string,
  workflowId: string,
  workspaceId: string,
  version: number,
): Promise<WorkflowGraph> {
  await requirePermission(userId, workspaceId, 'workflow:read');
  await loadWorkflowScoped(workflowId, workspaceId);

  const snapshot = await WorkflowVersion.findOne({ workflowId, version }).lean();
  if (!snapshot) throw new NotFoundError('Workflow version');

  return {
    nodes: (snapshot.nodes ?? []) as WorkflowNode[],
    edges: (snapshot.edges ?? []) as WorkflowEdge[],
  };
}

/**
 * Restores a historical version.
 *
 * Restoration is a *forward* operation: the old graph is written as a new
 * version rather than rewinding `currentVersion`, so history stays linear and
 * nothing is lost by restoring.
 */
export async function restoreVersion(
  userId: string,
  workflowId: string,
  workspaceId: string,
  version: number,
): Promise<WorkflowDetail> {
  await requirePermission(userId, workspaceId, 'workflow:update');

  const workflow = await loadWorkflowScoped(workflowId, workspaceId);

  const snapshot = await WorkflowVersion.findOne({ workflowId, version }).lean();
  if (!snapshot) throw new NotFoundError('Workflow version');

  const nodes = (snapshot.nodes ?? []) as WorkflowNodeDocument[];
  const edges = (snapshot.edges ?? []) as WorkflowEdgeDocument[];

  const graph: WorkflowGraph = {
    nodes: nodes.map(serialiseNode),
    edges: edges.map(serialiseEdge),
  };
  assertExecutable(graph);

  const nextVersion = workflow.currentVersion + 1;

  const updated = await Workflow.findByIdAndUpdate(
    workflowId,
    { $set: { nodes, edges, currentVersion: nextVersion } },
    { new: true },
  ).lean();
  if (!updated) throw new NotFoundError('Workflow');

  await WorkflowVersion.create({
    workflowId: updated._id,
    workspaceId: updated.workspaceId,
    version: nextVersion,
    nodes,
    edges,
    createdBy: new Types.ObjectId(userId),
    changeSummary: `Restored from v${version}`,
  });

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'WORKFLOW_VERSION_RESTORED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { restoredFrom: version, newVersion: nextVersion },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: workflowId,
      metadata: { restoredFrom: version, newVersion: nextVersion },
    }),
  ]);

  return serialiseWorkflow(updated as WorkflowDocument);
}

/** Utility used when importing a template or AI output into a workflow. */
export function ensureEdgeIds(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges.map((edge) => ({
      ...edge,
      id: edge.id || createEdgeId(),
    })),
  };
}
