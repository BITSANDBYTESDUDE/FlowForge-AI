import { Types } from 'mongoose';
import { Template, Workflow } from '@/models';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { requirePermission } from '@/lib/permissions/guard';
import { recordActivity } from '@/lib/notifications';
import { createEdgeId, createNodeId, slugify } from '@/lib/utils/id';
import { assertExecutable } from '@/services/workflow.service';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@/models/Template';
import type { WorkflowDetail, WorkflowEdge, WorkflowGraph, WorkflowNode } from '@/types/workflow';

/**
 * Template service.
 *
 * Templates are graph blueprints. System templates are global and read-only;
 * workspace templates are created by members and scoped to their workspace. The
 * listing endpoint deliberately exposes system templates to any authenticated
 * user (they contain no tenant data) while workspace templates are filtered by
 * membership.
 */

export type TemplateSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  isSystem: boolean;
  workspaceId: string | null;
  tags: string[];
  nodeCount: number;
  usageCount: number;
  createdAt: string;
};

export type TemplateDetail = TemplateSummary & WorkflowGraph;

type TemplateLike = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  isSystem: boolean;
  workspaceId: Types.ObjectId | null;
  tags: string[];
  nodes: unknown[];
  edges: unknown[];
  usageCount: number;
  createdAt: Date;
};

function serialiseSummary(template: TemplateLike): TemplateSummary {
  return {
    id: template._id.toString(),
    name: template.name,
    slug: template.slug,
    description: template.description,
    category: template.category,
    isSystem: template.isSystem,
    workspaceId: template.workspaceId ? template.workspaceId.toString() : null,
    tags: template.tags,
    nodeCount: template.nodes.length,
    usageCount: template.usageCount,
    createdAt: template.createdAt.toISOString(),
  };
}

export function serialiseTemplate(template: TemplateLike): TemplateDetail {
  return {
    ...serialiseSummary(template),
    nodes: (template.nodes ?? []) as WorkflowNode[],
    edges: (template.edges ?? []) as WorkflowEdge[],
  };
}

/**
 * Templates are visible when they are system templates or belong to a workspace
 * the caller is a member of. `workspaceIds` comes from the caller's membership
 * list, never from the request.
 */
function visibilityFilter(workspaceIds: string[]): Record<string, unknown> {
  return {
    $or: [
      { isSystem: true },
      { workspaceId: { $in: workspaceIds.map((id) => new Types.ObjectId(id)) } },
    ],
  };
}

export async function listTemplates(
  workspaceIds: string[],
  params: { category?: TemplateCategory; search?: string; includeWorkspaceId?: string },
): Promise<TemplateSummary[]> {
  const filter: Record<string, unknown> = visibilityFilter(workspaceIds);

  if (params.category) filter.category = params.category;
  if (params.includeWorkspaceId) {
    filter.$and = [
      { $or: [{ isSystem: true }, { workspaceId: new Types.ObjectId(params.includeWorkspaceId) }] },
    ];
    delete filter.$or;
  }
  if (params.search) {
    filter.name = { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const templates = await Template.find(filter).sort({ isSystem: -1, usageCount: -1, name: 1 }).limit(200).lean();
  return templates.map((t) => serialiseSummary(t as TemplateLike));
}

/** Categories actually present, so the UI never offers an empty filter. */
export async function listTemplateCategories(
  workspaceIds: string[],
): Promise<Array<{ category: TemplateCategory; count: number }>> {
  const counts = await Template.aggregate<{ _id: TemplateCategory; count: number }>([
    { $match: visibilityFilter(workspaceIds) },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  const byCategory = new Map(counts.map((c) => [c._id, c.count]));
  return TEMPLATE_CATEGORIES.map((category) => ({ category, count: byCategory.get(category) ?? 0 }));
}

export async function getTemplate(
  workspaceIds: string[],
  templateId: string,
): Promise<TemplateDetail> {
  const template = await Template.findOne({
    _id: new Types.ObjectId(templateId),
    ...visibilityFilter(workspaceIds),
  }).lean();

  if (!template) throw new NotFoundError('Template');
  return serialiseTemplate(template as TemplateLike);
}

export async function getTemplateBySlug(
  workspaceIds: string[],
  slug: string,
): Promise<TemplateDetail> {
  const template = await Template.findOne({
    slug: slug.toLowerCase(),
    ...visibilityFilter(workspaceIds),
  }).lean();

  if (!template) throw new NotFoundError('Template');
  return serialiseTemplate(template as TemplateLike);
}

/**
 * Copies a template into a workspace as a real workflow.
 *
 * Node ids are regenerated so the new workflow does not collide with the
 * template or with another workflow created from the same template, and edge
 * endpoints are remapped through the same table. The result must pass the
 * executable check before it is written — a malformed template fails loudly
 * here rather than producing an unrunnable workflow.
 */
export async function applyTemplate(
  userId: string,
  workspaceId: string,
  templateId: string,
  name?: string,
): Promise<WorkflowDetail> {
  await requirePermission(userId, workspaceId, 'template:apply');

  const template = await Template.findById(templateId).lean();
  if (!template) throw new NotFoundError('Template');

  const isVisible = template.isSystem || template.workspaceId?.toString() === workspaceId;
  if (!isVisible) throw new NotFoundError('Template');

  const sourceNodes = (template.nodes ?? []) as WorkflowNode[];
  const sourceEdges = (template.edges ?? []) as WorkflowEdge[];

  if (sourceNodes.length === 0) {
    throw new ValidationError('This template has no steps to apply');
  }

  const idMap = new Map<string, string>();
  for (const node of sourceNodes) idMap.set(node.id, createNodeId());

  const nodes: WorkflowNode[] = sourceNodes.map((node) => ({
    ...node,
    id: idMap.get(node.id)!,
    // Assignees from the template do not exist in the target workspace.
    assigneeId: null,
  }));

  const edges: WorkflowEdge[] = sourceEdges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: createEdgeId(),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }));

  const graph: WorkflowGraph = { nodes, edges };
  assertExecutable(graph);

  const { createWorkflow } = await import('@/services/workflow.service');

  const workflow = await createWorkflow(userId, {
    workspaceId,
    name: name ?? template.name,
    description: template.description,
    status: 'DRAFT',
    tags: template.tags,
    graph: {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        description: node.description ?? '',
        position: node.position,
        assigneeId: null,
        dueDate: null,
        config: node.config ?? {},
        metadata: node.metadata ?? {},
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        condition: edge.condition ?? null,
        label: edge.label ?? null,
      })),
    },
  });

  await Promise.all([
    Template.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } }),
    Workflow.updateOne({ _id: workflow.id }, { $set: { templateId: template._id } }),
    recordActivity({
      workspaceId,
      userId,
      action: 'TEMPLATE_APPLIED',
      entityType: 'WORKFLOW',
      entityId: workflow.id,
      metadata: { templateId, templateName: template.name },
    }),
  ]);

  return workflow;
}

/** Saves a workflow's current graph as a reusable workspace template. */
export async function createTemplateFromWorkflow(
  userId: string,
  workspaceId: string,
  workflowId: string,
  input: { name: string; description: string; category: TemplateCategory; tags?: string[] },
): Promise<TemplateSummary> {
  await requirePermission(userId, workspaceId, 'template:create');

  const workflow = await Workflow.findOne({
    _id: new Types.ObjectId(workflowId),
    workspaceId: new Types.ObjectId(workspaceId),
  }).lean();
  if (!workflow) throw new NotFoundError('Workflow');

  const baseSlug = slugify(`${input.name}-${workspaceId.slice(-6)}`);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (!(await Template.exists({ slug }))) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const template = await Template.create({
    name: input.name,
    slug,
    description: input.description,
    category: input.category,
    isSystem: false,
    workspaceId: new Types.ObjectId(workspaceId),
    createdBy: new Types.ObjectId(userId),
    nodes: workflow.nodes,
    edges: workflow.edges,
    tags: input.tags ?? workflow.tags,
    usageCount: 0,
  });

  await recordActivity({
    workspaceId,
    userId,
    action: 'TEMPLATE_APPLIED',
    entityType: 'WORKFLOW',
    entityId: workflowId,
    metadata: { createdTemplate: template.name },
  });

  return serialiseSummary(template.toObject() as TemplateLike);
}

export async function deleteTemplate(
  userId: string,
  workspaceId: string,
  templateId: string,
): Promise<void> {
  await requirePermission(userId, workspaceId, 'template:create');

  const template = await Template.findById(templateId).lean();
  if (!template) throw new NotFoundError('Template');
  if (template.isSystem) throw new ConflictError('Built-in templates cannot be deleted');
  if (template.workspaceId?.toString() !== workspaceId) throw new NotFoundError('Template');

  await Template.findByIdAndDelete(templateId);
}
