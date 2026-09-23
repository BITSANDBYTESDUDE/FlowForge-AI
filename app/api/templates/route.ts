import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { requirePermission } from '@/lib/permissions/guard';
import { listUserWorkspaceIds } from '@/lib/permissions/guard';
import { createTemplateFromWorkflowSchema, listTemplatesQuerySchema } from '@/schemas/template.schema';
import {
  createTemplateFromWorkflow,
  listTemplateCategories,
  listTemplates,
} from '@/services/template.service';

/**
 * GET /api/templates — system templates plus those of the caller's workspaces.
 *
 * Visibility is computed from the caller's membership list, never from a
 * client-supplied workspace id, so one tenant cannot enumerate another's
 * templates.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const workspaceIds = await listUserWorkspaceIds(session.user.id);

  const parsed = listTemplatesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return ok({ templates: [], categories: [] });
  }

  const [templates, categories] = await Promise.all([
    listTemplates(workspaceIds, parsed.data),
    listTemplateCategories(workspaceIds),
  ]);

  return ok({ templates, categories });
});

/** POST /api/templates — saves a workflow's current graph as a reusable template. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);
  const input = await parseJsonBody(request, createTemplateFromWorkflowSchema);

  await requirePermission(session.user.id, input.workspaceId, 'template:create');

  const template = await createTemplateFromWorkflow(
    session.user.id,
    input.workspaceId,
    input.workflowId,
    {
      name: input.name,
      description: input.description,
      category: input.category,
      tags: input.tags,
    },
  );

  return created({ template });
});
