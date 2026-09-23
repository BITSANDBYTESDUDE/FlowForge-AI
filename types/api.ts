/**
 * API response types.
 *
 * These are re-exports of the shapes the service layer already produces, not
 * hand-maintained copies. Duplicating them would let the client drift out of
 * sync with the server, which is exactly the failure this file prevents.
 *
 * `import type` is fully erased during compilation, so referencing service
 * modules here does not pull Mongoose or any server-only code into the browser
 * bundle. Never change these to value imports.
 */
import type {
  ActivityFeedItem,
  AnalyticsOverview,
  DashboardMetrics,
  TrendPoint,
} from '@/services/analytics.service';
import type { SearchResponse, SearchResult, SearchResultType } from '@/services/search.service';
import type {
  TemplateDetail as ServiceTemplateDetail,
  TemplateSummary as ServiceTemplateSummary,
} from '@/services/template.service';
import type { NotificationItem } from '@/services/notification.service';

export type {
  ActivityFeedItem,
  AnalyticsOverview,
  DashboardMetrics,
  TrendPoint,
  SearchResponse,
  SearchResult,
  SearchResultType,
  NotificationItem,
};

export type TemplateSummary = ServiceTemplateSummary;
export type TemplateDetail = ServiceTemplateDetail;
