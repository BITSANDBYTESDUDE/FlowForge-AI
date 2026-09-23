import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { summarizeWorkflowSchema } from '@/schemas/ai.schema';
import { summarizeWorkflow } from '@/services/ai.service';
import { loadWorkflowScoped } from '@/services/workflow.service';

/**
 * POST /api/ai/summarize-workflow
 *
 * Produces a plain-language summary of a workflow for stakeholders who will not
 * read the graph. Read-only: nothing is persisted.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, summarizeWorkflowSchema);

  await requirePermission(session.user.id, input.workspaceId, 'workflow:read');
  await enforceRateLimit('ai', session.user.id);

  const graphJson = input.graph
    ? JSON.stringify(input.graph)
    : await loadWorkflowScoped(input.workflowId!, input.workspaceId).then((workflow) =>
        JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }),
      );

  const result = await summarizeWorkflow(graphJson);

  return ok({
    summary: result.data,
    meta: { model: result.usage.model, heuristic: result.heuristic, usage: result.usage },
  });
});
