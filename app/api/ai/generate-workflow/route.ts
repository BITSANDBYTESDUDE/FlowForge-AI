import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { generateWorkflowSchema } from '@/schemas/ai.schema';
import { createWorkflow } from '@/services/workflow.service';
import { generateWorkflow } from '@/services/ai.service';
import type { AiWorkflowOutput } from '@/lib/ai/schemas/workflow-output';
import type { WorkflowGraphInput } from '@/schemas/workflow.schema';
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

/**
 * Converts model output into a graph the workflow service accepts.
 *
 * The model is never asked for edge ids — they carry no meaning to it, and
 * constrained decoding would only be guessing at a format we control. It is the
 * API's job to mint them.
 *
 * Both the dryRun draft and the persisted graph go through here on purpose. The
 * draft is not a display-only artefact: the UI feeds it straight back into
 * `POST /api/workflows` when the user saves, so a draft whose edges lack ids
 * would be rejected by our own validation at save time. Building it once keeps
 * the two paths from drifting.
 */
function toPersistableGraph(output: AiWorkflowOutput): WorkflowGraphInput {
  return {
    nodes: output.nodes.map((node) => ({
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
    edges: output.edges.map((edge, index) => ({
      // Stable ids, derived from position and endpoints so the same graph
      // serialises identically across requests.
      id: `edge-${index}-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      condition: edge.condition ?? null,
      label: edge.label ?? null,
    })),
  };
}

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, generateWorkflowSchema);

  await requirePermission(session.user.id, input.workspaceId, 'workflow:create');
  await enforceRateLimit('ai', session.user.id);

  // Throws AiUnavailableError / AiInvalidOutputError; `withApiErrorHandling`
  // maps both to the documented envelope.
  const result = await generateWorkflow(input.description);
  const graph = toPersistableGraph(result.data);

  if (input.dryRun) {
    return ok({
      draft: {
        name: result.data.name,
        description: result.data.description,
        tags: result.data.tags,
        nodes: graph.nodes,
        edges: graph.edges,
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
    graph,
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
