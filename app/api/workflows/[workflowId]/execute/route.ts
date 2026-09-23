import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { z } from 'zod';
import { startExecution } from '@/services/execution.service';

type RouteContext = { params: Promise<{ workflowId: string }> };

const executeSchema = z.object({
  workspaceId: z.string().min(1),
  /** Distinguishes concurrent runs of the same workflow ("Client A", "Q3"). */
  label: z.string().trim().max(120).nullish(),
});

/**
 * POST /api/workflows/:workflowId/execute
 *
 * Starts a new run of a workflow definition. The graph must pass the executable
 * check (single START, at least one END, no orphans) before any execution row is
 * written, so a broken workflow fails with a 400 explaining why rather than
 * producing a run that immediately stalls.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { workflowId } = await context.params;
  const input = await parseJsonBody(request, executeSchema);

  if (!input.workspaceId) throw new ValidationError('workspaceId is required');

  const execution = await startExecution(
    session.user.id,
    workflowId,
    input.workspaceId,
    input.label ?? null,
  );

  return created({ execution });
});
