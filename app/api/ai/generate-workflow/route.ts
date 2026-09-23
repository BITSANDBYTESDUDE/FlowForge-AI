import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { generateWorkflowSchema } from '@/schemas/ai.schema';
import { createWorkflow } from '@/services/workflow.service';
import { generateWorkflow } from '@/services/ai.service';
import { recordActivity } from '@/lib/notifications';

/**
 * POST /api/ai/generate-workflow
 *
 * Pipeline: input validation -> permission check -> rate limit -> AI -> Zod
 * validation -> business validation -> persistence.
 *
 * The model never writes to MongoDB. It returns JSON that the AI service parses
 * and validates with Zod, and the resulting graph is persisted by
 * `createWorkflow` — the same service the manual builder uses. AI failures
 * surface as 502/503 rather than silently producing an empty workflow.
 *
 * `dryRun: true` returns the validated graph without persisting it, so a user can
 * review a generated workflow before it appears in their workspace.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, generateWorkflowSchema);

  await requirePermission(session.user.id, input.workspaceId, 'workflow:create');
  await enforceRateLimit('ai', session.user.id);

  // Throws AiUnavailableError / AiInvalidOutputError; `withApiErrorHandling`
  // maps both to the documented envelope.
  const result = await generateWorkflow(input.description);

  if (input.dryRun) {
    return ok({
      draft: {
        name: result.data.name,
        description: result.data.description,
        tags: result.data.tags,
        nodes: result.data.nodes,
        edges: result.data.edges,
      },
      meta: {
        model: result.usage.model,
        heuristic: result.heuristic,
        usage: result.usage,
      },
    });
  }

  const workflow = await createWorkflow(session.user.id, {
    workspaceId: input.workspaceId,
    name: result.data.name,
    description: result.data.description,
    status: 'DRAFT',
    tags: result.data.tags,
    graph: {
      nodes: result.data.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        description: node.description ?? '',
        position: node.position,
        assigneeId: null,
        dueDate: null,
        config: node.config ?? {},
        metadata: { generated: true },
      })),
      edges: result.data.edges.map((edge, index) => ({
        // The model is not asked for edge ids (they are meaningless to it), so
        // stable ids are generated here for React Flow.
        id: `edge-${index}-${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        condition: edge.condition ?? null,
        label: edge.label ?? null,
      })),
    },
  });

  await recordActivity({
    workspaceId: input.workspaceId,
    userId: session.user.id,
    action: 'WORKFLOW_GENERATED',
    entityType: 'WORKFLOW',
    entityId: workflow.id,
    metadata: { prompt: input.description.slice(0, 200), heuristic: result.heuristic },
  });

  return created({
    workflow,
    meta: {
      model: result.usage.model,
      heuristic: result.heuristic,
      usage: result.usage,
    },
  });
});
