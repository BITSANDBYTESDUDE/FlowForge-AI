import { Types } from 'mongoose';
import { Task, Template, Workflow } from '@/models';
import { requirePermission } from '@/lib/permissions/guard';
import { assertObjectId } from '@/lib/permissions/guard';
import { TEMPLATE_CATEGORIES } from '@/models/Template';

/**
 * Search service.
 *
 * Uses MongoDB text indexes (declared on the models) for relevance ranking, with
 * a regex fallback for very short queries where text search would match nothing.
 * Every query is scoped to the caller's workspaces, so search can never cross a
 * tenant boundary.
 *
 * The result shape is deliberately flat and provider-agnostic: swapping in Atlas
 * Search later means replacing the query construction here, not the callers.
 */

export type SearchResultType = 'workflow' | 'task' | 'template';

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  workspaceId: string | null;
  url: string;
  updatedAt: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  counts: Record<SearchResultType, number>;
};

const MIN_QUERY_LENGTH = 2;

/** Escapes user input so it cannot alter the regex we build from it. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Text search is used for word-like queries. Single characters are handled with
 * an anchored regex instead, because MongoDB's `$text` matches whole terms and
 * would return nothing for "w".
 */
function buildTitleMatch(query: string): Record<string, unknown> {
  const trimmed = query.trim();
  if (trimmed.length >= 3) {
    return { $text: { $search: trimmed } };
  }
  const pattern = new RegExp(`^${escapeRegex(trimmed)}`, 'i');
  return { name: pattern };
}

export async function search(
  userId: string,
  workspaceIds: string[],
  query: string,
  options: { types?: SearchResultType[]; limit?: number; workspaceId?: string } = {},
): Promise<SearchResponse> {
  const trimmed = query.trim();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const types = options.types ?? ['workflow', 'task', 'template'];

  if (trimmed.length < MIN_QUERY_LENGTH || workspaceIds.length === 0) {
    return {
      query: trimmed,
      results: [],
      counts: { workflow: 0, task: 0, template: 0 },
    };
  }

  // When a specific workspace is requested, confirm membership before scoping.
  let scopedWorkspaceIds = workspaceIds;
  if (options.workspaceId) {
    await requirePermission(userId, options.workspaceId, 'workflow:read');
    scopedWorkspaceIds = [options.workspaceId];
  }

  const objectIds = scopedWorkspaceIds.map((id) => new Types.ObjectId(assertObjectId(id, 'workspaceId')));
  const pattern = new RegExp(escapeRegex(trimmed), 'i');

  const [workflows, tasks, templates] = await Promise.all([
    types.includes('workflow')
      ? Workflow.find({
          workspaceId: { $in: objectIds },
          ...buildTitleMatch(trimmed),
        })
          .select('name description status workspaceId updatedAt')
          .limit(limit)
          .lean()
      : Promise.resolve([]),
    types.includes('task')
      ? Task.find({
          workspaceId: { $in: objectIds },
          ...(trimmed.length >= 3 ? { $text: { $search: trimmed } } : { title: pattern }),
        })
          .select('title description status workspaceId updatedAt')
          .limit(limit)
          .lean()
      : Promise.resolve([]),
    types.includes('template')
      ? Template.find({
          $or: [
            { isSystem: true },
            { workspaceId: { $in: objectIds } },
          ],
          ...(trimmed.length >= 3 ? { $text: { $search: trimmed } } : { name: pattern }),
        })
          .select('name description category isSystem workspaceId updatedAt')
          .limit(limit)
          .lean()
      : Promise.resolve([]),
  ]);

  const results: SearchResult[] = [
    ...workflows.map((workflow) => ({
      id: workflow._id.toString(),
      type: 'workflow' as const,
      title: workflow.name,
      subtitle: workflow.description ?? null,
      workspaceId: workflow.workspaceId.toString(),
      url: `/workflow/${workflow._id.toString()}/builder`,
      updatedAt: workflow.updatedAt.toISOString(),
    })),
    ...tasks.map((task) => ({
      id: task._id.toString(),
      type: 'task' as const,
      title: task.title,
      subtitle: task.description ?? null,
      workspaceId: task.workspaceId.toString(),
      url: `/dashboard/tasks?taskId=${task._id.toString()}`,
      updatedAt: task.updatedAt.toISOString(),
    })),
    ...templates.map((template) => ({
      id: template._id.toString(),
      type: 'template' as const,
      title: template.name,
      subtitle: template.description,
      workspaceId: template.workspaceId ? template.workspaceId.toString() : null,
      url: `/dashboard/templates?templateId=${template._id.toString()}`,
      updatedAt: template.updatedAt.toISOString(),
    })),
  ];

  const counts: Record<SearchResultType, number> = {
    workflow: workflows.length,
    task: tasks.length,
    template: templates.length,
  };

  // Interleave by type so a single dominant type does not bury the others, then
  // cap to the requested limit.
  const ordered: SearchResult[] = [];
  const buckets: Record<SearchResultType, SearchResult[]> = {
    workflow: results.filter((r) => r.type === 'workflow'),
    task: results.filter((r) => r.type === 'task'),
    template: results.filter((r) => r.type === 'template'),
  };

  for (let index = 0; ordered.length < limit; index += 1) {
    let added = false;
    for (const type of ['workflow', 'task', 'template'] as SearchResultType[]) {
      const item = buckets[type][index];
      if (item) {
        ordered.push(item);
        added = true;
        if (ordered.length >= limit) break;
      }
    }
    if (!added) break;
  }

  return { query: trimmed, results: ordered, counts };
}

/** Template categories that exist, used by the template browser filters. */
export const TEMPLATE_CATEGORY_VALUES = TEMPLATE_CATEGORIES;
