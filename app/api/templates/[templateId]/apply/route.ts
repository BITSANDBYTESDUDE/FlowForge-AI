import type { NextRequest } from 'next/server';
import { requireApiSession, parseJsonBody } from '@/lib/api/request';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api';
import { listUserWorkspaceIds } from '@/lib/permissions/guard';
import { applyTemplateSchema } from '@/schemas/template.schema';
import { applyTemplate, getTemplate } from '@/services/template.service';

type RouteContext = { params: Promise<{ templateId: string }> };

/** GET /api/templates/:templateId — full graph, for preview before applying. */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { templateId } = await context.params;
  const workspaceIds = await listUserWorkspaceIds(session.user.id);
  const template = await getTemplate(workspaceIds, templateId);
  return ok({ template });
});

/**
 * POST /api/templates/:templateId/apply — copies the template into a workspace.
 *
 * The workspace is supplied in the body and re-checked by the permission guard;
 * the resulting workflow is a normal, fully editable workflow.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { templateId } = await context.params;
  const input = await parseJsonBody(request, applyTemplateSchema);
  const workflow = await applyTemplate(session.user.id, input.workspaceId, templateId, input.name);
  return created({ workflow });
});
