import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { listUserWorkspaceIds } from '@/lib/permissions/guard';
import { ValidationError } from '@/lib/utils/errors';
import { deleteTemplate, getTemplate } from '@/services/template.service';

type RouteContext = { params: Promise<{ templateId: string }> };

/** GET /api/templates/:templateId */
export const GET = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { templateId } = await context.params;
  const workspaceIds = await listUserWorkspaceIds(session.user.id);
  const template = await getTemplate(workspaceIds, templateId);
  return ok({ template });
});

/**
 * DELETE /api/templates/:templateId?workspaceId=...
 *
 * Built-in templates are rejected by the service; only a workspace's own
 * templates can be removed.
 */
export const DELETE = withApiErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const session = await requireApiSession(request);
  const { templateId } = await context.params;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  await deleteTemplate(session.user.id, workspaceId, templateId);
  return ok({ deleted: true });
});
