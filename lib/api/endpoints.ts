import { api } from '@/lib/api/client';
import type {
  WorkflowDetail,
  WorkflowGraph,
  WorkflowStatus,
  WorkflowSummary,
  WorkflowVersionSummary,
} from '@/types/workflow';
import type { ExecutionSummary } from '@/types/execution';
import type { TaskSummary, TaskStatus, TaskPriority } from '@/types/task';
import type { MembershipSummary, WorkspaceDetail, WorkspaceRole, WorkspaceSummary } from '@/types/workspace';
import type { Paginated } from '@/lib/utils/pagination';
import type {
  ActivityFeedItem,
  AnalyticsOverview,
  AuditLogEntry,
  DashboardMetrics,
  NotificationItem,
  SearchResponse,
  TemplateDetail,
  TemplateSummary,
} from '@/types/api';

/**
 * Typed endpoint bindings.
 *
 * Every call into the REST API goes through this module. Components import
 * functions with real signatures instead of hand-writing fetch calls, so a
 * server-side contract change becomes a compile error rather than a runtime
 * surprise.
 */

/* ------------------------------------------------------------------ workspace */

export type CreateWorkspaceBody = { name: string; slug?: string };
export type UpdateWorkspaceBody = {
  name?: string;
  settings?: Partial<WorkspaceDetail['settings']>;
};

export const workspacesApi = {
  list: () => api.get<{ workspaces: WorkspaceSummary[] }>('/api/workspaces'),
  create: (body: CreateWorkspaceBody) =>
    api.post<{ workspace: WorkspaceDetail }>('/api/workspaces', body),
  get: (workspaceId: string) =>
    api.get<{ workspace: WorkspaceDetail }>(`/api/workspaces/${workspaceId}`),
  update: (workspaceId: string, body: UpdateWorkspaceBody) =>
    api.patch<{ workspace: WorkspaceDetail }>(`/api/workspaces/${workspaceId}`, body),
  remove: (workspaceId: string) => api.delete<{ deleted: boolean }>(`/api/workspaces/${workspaceId}`),

  members: (workspaceId: string) =>
    api.get<{ members: MembershipSummary[] }>(`/api/workspaces/${workspaceId}/members`),
  invite: (workspaceId: string, body: { email: string; role: WorkspaceRole }) =>
    api.post<{ member: MembershipSummary }>(`/api/workspaces/${workspaceId}/members`, body),
  updateMemberRole: (workspaceId: string, memberId: string, role: WorkspaceRole) =>
    api.patch<{ member: MembershipSummary }>(
      `/api/workspaces/${workspaceId}/members/${memberId}`,
      { role },
    ),
  removeMember: (workspaceId: string, memberId: string) =>
    api.delete<{ deleted: boolean }>(`/api/workspaces/${workspaceId}/members/${memberId}`),
};

/* ------------------------------------------------------------------- workflow */

export type WorkflowListParams = {
  workspaceId: string;
  status?: WorkflowStatus;
  tag?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type CreateWorkflowBody = {
  workspaceId: string;
  name: string;
  description?: string;
  status?: WorkflowStatus;
  tags?: string[];
  graph?: WorkflowGraph;
};

export type UpdateWorkflowBody = {
  workspaceId: string;
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  tags?: string[];
  graph?: WorkflowGraph;
  changeSummary?: string;
};

export const workflowsApi = {
  list: (params: WorkflowListParams) =>
    api.get<Paginated<WorkflowSummary>>('/api/workflows', { params }),
  create: (body: CreateWorkflowBody) => api.post<{ workflow: WorkflowDetail }>('/api/workflows', body),
  get: (workflowId: string, workspaceId: string) =>
    api.get<{ workflow: WorkflowDetail }>(`/api/workflows/${workflowId}`, {
      params: { workspaceId },
    }),
  update: (workflowId: string, body: UpdateWorkflowBody) =>
    api.patch<{ workflow: WorkflowDetail }>(`/api/workflows/${workflowId}`, body),
  remove: (workflowId: string, workspaceId: string) =>
    api.delete<{ deleted: boolean }>(`/api/workflows/${workflowId}`, { params: { workspaceId } }),

  versions: (workflowId: string, workspaceId: string) =>
    api.get<{ versions: WorkflowVersionSummary[] }>(`/api/workflows/${workflowId}/versions`, {
      params: { workspaceId },
    }),
  version: (workflowId: string, workspaceId: string, version: number) =>
    api.get<{ version: number; graph: WorkflowGraph }>(
      `/api/workflows/${workflowId}/versions/${version}`,
      { params: { workspaceId } },
    ),
  restoreVersion: (workflowId: string, workspaceId: string, version: number) =>
    api.post<{ workflow: WorkflowDetail }>(
      `/api/workflows/${workflowId}/versions/${version}/restore`,
      { version },
      { params: { workspaceId } },
    ),

  execute: (workflowId: string, workspaceId: string, label?: string | null) =>
    api.post<{ execution: ExecutionSummary }>(`/api/workflows/${workflowId}/execute`, {
      workspaceId,
      label: label ?? null,
    }),
};

/* ---------------------------------------------------------------- execution */

export const executionsApi = {
  list: (params: { workspaceId: string; workflowId?: string }) =>
    api.get<{ executions: ExecutionSummary[] }>('/api/executions', { params }),
  get: (executionId: string) => api.get<{ execution: ExecutionSummary }>(`/api/executions/${executionId}`),
  pause: (executionId: string) =>
    api.post<{ execution: ExecutionSummary }>(`/api/executions/${executionId}/pause`),
  resume: (executionId: string) =>
    api.post<{ execution: ExecutionSummary }>(`/api/executions/${executionId}/resume`),
  cancel: (executionId: string) =>
    api.post<{ execution: ExecutionSummary }>(`/api/executions/${executionId}/cancel`),
};

/* --------------------------------------------------------------------- task */

export type TaskListParams = {
  workspaceId: string;
  workflowId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  overdue?: boolean;
  search?: string;
  sort?: 'createdAt' | 'dueDate' | 'priority' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
};

export type CreateTaskBody = {
  workspaceId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  workflowId?: string | null;
  nodeId?: string | null;
  dueDate?: string | null;
  dependencies?: string[];
};

export type UpdateTaskBody = {
  workspaceId: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  dependencies?: string[];
};

export const tasksApi = {
  list: (params: TaskListParams) => api.get<Paginated<TaskSummary>>('/api/tasks', { params }),
  create: (body: CreateTaskBody) => api.post<{ task: TaskSummary }>('/api/tasks', body),
  get: (taskId: string, workspaceId: string) =>
    api.get<{ task: TaskSummary }>(`/api/tasks/${taskId}`, { params: { workspaceId } }),
  update: (taskId: string, body: UpdateTaskBody) =>
    api.patch<{ task: TaskSummary }>(`/api/tasks/${taskId}`, body),
  remove: (taskId: string, workspaceId: string) =>
    api.delete<{ deleted: boolean }>(`/api/tasks/${taskId}`, { params: { workspaceId } }),
  complete: (taskId: string, workspaceId: string) =>
    api.post<{ task: TaskSummary; execution: ExecutionSummary | null; advanced: boolean }>(
      `/api/tasks/${taskId}/complete`,
      { workspaceId },
    ),
};

/* ------------------------------------------------------------------- template */

export type { TemplateSummary, TemplateDetail } from '@/types/api';

export const templatesApi = {
  list: (params?: { category?: string; search?: string }) =>
    api.get<{
      templates: TemplateSummary[];
      categories: { category: string; count: number }[];
    }>('/api/templates', { params }),
  get: (templateId: string) => api.get<{ template: TemplateDetail }>(`/api/templates/${templateId}`),
  apply: (templateId: string, workspaceId: string, name?: string) =>
    api.post<{ workflow: WorkflowDetail }>(`/api/templates/${templateId}/apply`, {
      workspaceId,
      ...(name ? { name } : {}),
    }),
  remove: (templateId: string, workspaceId: string) =>
    api.delete<{ deleted: boolean }>(`/api/templates/${templateId}`, { params: { workspaceId } }),
  createFromWorkflow: (body: {
    workspaceId: string;
    workflowId: string;
    name: string;
    description: string;
    category: string;
    tags?: string[];
  }) => api.post<{ template: TemplateSummary }>('/api/templates', body),
};

/* ------------------------------------------------------------------ analytics */

export type { AnalyticsOverview, DashboardMetrics } from '@/types/api';

export const analyticsApi = {
  overview: (workspaceId: string, days = 30) =>
    api.get<AnalyticsOverview>('/api/analytics', { params: { workspaceId, days } }),
  metrics: (workspaceId: string) =>
    api.get<{ metrics: DashboardMetrics }>('/api/analytics', {
      params: { workspaceId, scope: 'metrics' },
    }),
};

/* ------------------------------------------------------------------- audit */

export type AuditListParams = {
  workspaceId: string;
  action?: string;
  actorId?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export const auditApi = {
  list: (params: AuditListParams) =>
    api.get<Paginated<AuditLogEntry>>('/api/audit', { params }),
};

/* -------------------------------------------------------------- notification */

export type { NotificationItem } from '@/types/api';

export const notificationsApi = {
  list: (params?: { unread?: boolean; limit?: number }) =>
    api.get<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications', {
      params,
    }),
  markRead: (notificationId: string) =>
    api.post<{ read: boolean; unreadCount: number }>(`/api/notifications/${notificationId}/read`),
  markAllRead: () => api.post<{ updated: number; unreadCount: number }>('/api/notifications/read-all'),
};

/* -------------------------------------------------------------------- search */

export type { SearchResponse } from '@/types/api';

export const searchApi = {
  query: (q: string, params?: { types?: string; workspaceId?: string }) =>
    api.get<SearchResponse>('/api/search', { params: { q, ...params } }),
};

/* ------------------------------------------------------------ activity/user */

export type { ActivityFeedItem } from '@/types/api';

export const activityApi = {
  feed: (workspaceId: string, limit = 25) =>
    api.get<{ activity: ActivityFeedItem[] }>('/api/activity', { params: { workspaceId, limit } }),
};

export const usersApi = {
  me: () =>
    api.get<{
      user: { id: string; name: string; email: string; image: string | null; plan: string };
      workspaceIds: string[];
    }>('/api/users/me'),
};

/* ------------------------------------------------------------------------ ai */

export type AiMeta = {
  model: string;
  heuristic: boolean;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
};

export type AiDraft = {
  name: string;
  description: string;
  tags: string[];
  nodes: WorkflowGraph['nodes'];
  edges: WorkflowGraph['edges'];
};

export type AiImprovement = {
  summary: string;
  suggestions: {
    kind: 'MISSING_STEP' | 'UNNECESSARY_STEP' | 'BOTTLENECK' | 'UNCLEAR_DEPENDENCY' | 'IMPROVEMENT';
    title: string;
    detail: string;
    nodeIds?: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
};

export type AiSummary = {
  summary: string;
  highlights: string[];
  risks: string[];
};

export type AiTaskSuggestion = {
  nodeId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedDays?: number;
};

export const aiApi = {
  generateWorkflow: (body: { workspaceId: string; description: string; dryRun?: boolean }) =>
    api.post<{ workflow: WorkflowDetail | null; draft: AiDraft; meta: AiMeta }>(
      '/api/ai/generate-workflow',
      body,
    ),
  improveWorkflow: (body: {
    workspaceId: string;
    workflowId?: string;
    graph?: WorkflowGraph;
    goal?: string;
  }) => api.post<{ analysis: AiImprovement; meta: AiMeta }>('/api/ai/improve-workflow', body),
  generateTasks: (body: {
    workspaceId: string;
    workflowId: string;
    nodeIds?: string[];
    persist?: boolean;
  }) =>
    api.post<{
      suggestions?: AiTaskSuggestion[];
      tasks?: TaskSummary[];
      dropped: number;
      meta: AiMeta;
    }>('/api/ai/generate-tasks', body),
  summarizeWorkflow: (body: { workspaceId: string; workflowId?: string; graph?: WorkflowGraph }) =>
    api.post<{ summary: AiSummary; meta: AiMeta }>('/api/ai/summarize-workflow', body),
};
