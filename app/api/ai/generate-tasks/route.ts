import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { generateTasksSchema } from '@/schemas/ai.schema';
import { generateTasks } from '@/services/ai.service';
import { loadWorkflowScoped } from '@/services/workflow.service';
import { createTasksBulk } from '@/services/task.service';
import { ValidationError } from '@/lib/utils/errors';
import type { WorkflowNodeDocument } from '@/models/Workflow';

/**
 * POST /api/ai/generate-tasks
 *
 * Turns workflow nodes into concrete tasks. By default this only returns
 * suggestions; with `persist: true` the validated tasks are written through
 * `createTasksBulk`, which re-checks workspace membership and reference
 * integrity. The model proposes; the service validates and writes.
 *
 * Only nodes that represent human work (TASK and APPROVAL) are eligible — asking
 * the model to create tasks for START/END nodes would produce noise.
 */
const TASKABLE_NODE_TYPES = ['TASK', 'APPROVAL'] as const;

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, generateTasksSchema);

  await requirePermission(session.user.id, input.workspaceId, 'task:create');
  await enforceRateLimit('ai', session.user.id);

  const workflow = await loadWorkflowScoped(input.workflowId ?? '', input.workspaceId);

  const eligible = (workflow.nodes as WorkflowNodeDocument[]).filter((node) =>
    (TASKABLE_NODE_TYPES as readonly string[]).includes(node.type),
  );

  const selected = input.nodeIds
    ? eligible.filter((node) => input.nodeIds!.includes(node.id))
    : eligible;

  if (selected.length === 0) {
    throw new ValidationError('This workflow has no task or approval steps to convert');
  }

  const result = await generateTasks(
    JSON.stringify(
      selected.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        description: node.description ?? '',
      })),
    ),
  );

  // The model may reference a node id that does not exist (or hallucinate one).
  // Unknown ids are dropped rather than written, so a bad suggestion cannot
  // create a task pointing at nothing.
  const nodeIds = new Set(selected.map((node) => node.id));
  const validSuggestions = result.data.tasks.filter((task) => nodeIds.has(task.nodeId));
  const droppedCount = result.data.tasks.length - validSuggestions.length;

  if (!input.persist) {
    return ok({
      suggestions: validSuggestions,
      dropped: droppedCount,
      meta: { model: result.usage.model, heuristic: result.heuristic, usage: result.usage },
    });
  }

  const tasks = await createTasksBulk(
    session.user.id,
    input.workspaceId,
    validSuggestions.map((suggestion) => ({
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      workflowId: workflow._id.toString(),
      nodeId: suggestion.nodeId,
      // No assignee: the model cannot know who owns the work, and guessing would
      // notify the wrong person. Assignment stays a human decision.
      assigneeId: null,
    })),
  );

  return created({
    tasks,
    dropped: droppedCount,
    meta: { model: result.usage.model, heuristic: result.heuristic, usage: result.usage },
  });
});
