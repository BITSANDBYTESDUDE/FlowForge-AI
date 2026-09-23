import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { improveWorkflowSchema } from '@/schemas/ai.schema';
import { improveWorkflow } from '@/services/ai.service';
import { loadWorkflowScoped } from '@/services/workflow.service';

/**
 * POST /api/ai/improve-workflow
 *
 * Analyses an existing workflow and returns advisory suggestions (missing steps,
 * bottlenecks, unclear dependencies). Suggestions are read-only: they are never
 * applied automatically, because silently rewriting a user's process is worse
 * than asking. The caller supplies either a graph (unsaved builder state) or a
 * workflow id, which is loaded through the workspace guard.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, improveWorkflowSchema);

  await requirePermission(session.user.id, input.workspaceId, 'workflow:read');
  await enforceRateLimit('ai', session.user.id);

  let graphJson: string;

  if (input.graph) {
    graphJson = JSON.stringify(input.graph);
  } else {
    // Loaded server-side so the client cannot analyse a workflow it cannot read.
    const workflow = await loadWorkflowScoped(input.workflowId!, input.workspaceId);
    graphJson = JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges });
  }

  const result = await improveWorkflow(graphJson, input.goal);

  return ok({
    analysis: result.data,
    meta: {
      model: result.usage.model,
      heuristic: result.heuristic,
      usage: result.usage,
    },
  });
});
