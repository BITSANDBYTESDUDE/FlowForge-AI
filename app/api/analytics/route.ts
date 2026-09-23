import type { NextRequest } from 'next/server';
import { requireApiSession } from '@/lib/api/request';
import { ok, withApiErrorHandling } from '@/lib/utils/api';
import { ValidationError } from '@/lib/utils/errors';
import { getAnalyticsOverview, getDashboardMetrics } from '@/services/analytics.service';

/**
 * GET /api/analytics?workspaceId=...&days=30
 *
 * `scope=metrics` returns only the dashboard counters (cheaper); the default
 * returns the full overview with trends and breakdowns.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) throw new ValidationError('The workspaceId query parameter is required');

  const scope = request.nextUrl.searchParams.get('scope');
  if (scope === 'metrics') {
    const metrics = await getDashboardMetrics(session.user.id, workspaceId);
    return ok({ metrics });
  }

  const daysParam = Number.parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10);
  const days = Number.isFinite(daysParam) ? daysParam : 30;

  const overview = await getAnalyticsOverview(session.user.id, workspaceId, days);
  return ok(overview);
});
