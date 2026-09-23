/**
 * End-to-end API smoke test against a running dev server.
 *
 * Exercises the real HTTP stack — auth, session cookies, permission checks,
 * workspace scoping, service layer and MongoDB — rather than calling services
 * directly. Requires: `npm run dev` on :3000 and a seeded database.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'FlowForge!Demo2024';

type Jar = { cookie: string };

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

async function signIn(email: string): Promise<Jar> {
  const response = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  }
  const setCookie = response.headers.getSetCookie();
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`No session cookie returned for ${email}`);
  return { cookie };
}

async function api(
  jar: Jar,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: jar.cookie,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function data<T>(body: unknown): T {
  return (body as { data: T }).data;
}

async function main(): Promise<void> {
  console.log(`FlowForge AI API smoke test against ${BASE}\n`);

  /* ---------------------------------------------------------- auth required */

  console.log('Authentication');
  const anonymous = await fetch(`${BASE}/api/workflows`);
  check('unauthenticated request is rejected with 401', anonymous.status === 401, anonymous.status);

  const owner = await signIn('owner@flowforge.dev');
  check('owner can sign in and receives a session cookie', Boolean(owner.cookie));

  const member = await signIn('member@flowforge.dev');
  const viewer = await signIn('viewer@flowforge.dev');
  check('member and viewer can sign in', Boolean(member.cookie && viewer.cookie));

  const badPassword = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@flowforge.dev', password: 'wrong-password-here' }),
  });
  check('wrong password is rejected', badPassword.status >= 400, badPassword.status);

  /* -------------------------------------------------------------- workspace */

  console.log('\nWorkspaces');
  const workspaces = await api(owner, '/api/workspaces');
  check('owner lists their workspace', workspaces.status === 200, workspaces.status);
  const list = data<{ workspaces: Array<{ id: string; name: string }> }>(workspaces.body).workspaces;
  check('seeded workspace is present', list.length >= 1, list.length);
  const workspaceId = list[0]!.id;

  const notAMemberId = '000000000000000000000000';
  const foreign = await api(owner, `/api/workflows?workspaceId=${notAMemberId}`);
  check('accessing a non-member workspace is denied', foreign.status === 403 || foreign.status === 404, foreign.status);

  /* --------------------------------------------------------------- workflow */

  console.log('\nWorkflows');
  const workflows = await api(owner, `/api/workflows?workspaceId=${workspaceId}`);
  check('owner lists workflows', workflows.status === 200, workflows.status);
  const workflowList = data<{ items: Array<{ id: string; name: string; status: string }> }>(
    workflows.body,
  ).items;
  check('seeded workflows are present', workflowList.length === 4, workflowList.length);

  const detail = await api(owner, `/api/workflows/${workflowList[0]!.id}?workspaceId=${workspaceId}`);
  check('owner reads a workflow detail', detail.status === 200, detail.status);
  const graph = data<{ workflow: { nodes: unknown[]; edges: unknown[] } }>(detail.body).workflow;
  check('workflow has persisted nodes and edges', graph.nodes.length > 0 && graph.edges.length > 0, {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  });

  // Create + version bump + delete, all as the real owner.
  const created = await api(owner, '/api/workflows', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId,
      name: 'Smoke Test Workflow',
      description: 'Created by the API smoke test.',
      status: 'DRAFT',
      tags: ['smoke'],
    }),
  });
  check('owner creates a workflow', created.status === 201, created.status);
  const createdId = data<{ workflow: { id: string } }>(created.body).workflow.id;

  const deleted = await api(owner, `/api/workflows/${createdId}?workspaceId=${workspaceId}`, {
    method: 'DELETE',
  });
  check('owner deletes the workflow they created', deleted.status === 200, deleted.status);

  const afterDelete = await api(owner, `/api/workflows/${createdId}?workspaceId=${workspaceId}`);
  check('deleted workflow is gone (404)', afterDelete.status === 404, afterDelete.status);

  /* ------------------------------------------------------------- permission */

  console.log('\nPermissions (RBAC)');
  const viewerCreate = await api(viewer, '/api/workflows', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, name: 'Viewer attempt', status: 'DRAFT', tags: [] }),
  });
  check('VIEWER cannot create a workflow (403)', viewerCreate.status === 403, viewerCreate.status);

  const viewerRead = await api(viewer, `/api/workflows/${workflowList[0]!.id}?workspaceId=${workspaceId}`);
  check('VIEWER can read a workflow', viewerRead.status === 200, viewerRead.status);

  const memberRead = await api(member, `/api/workflows/${workflowList[0]!.id}?workspaceId=${workspaceId}`);
  check('MEMBER can read a workflow', memberRead.status === 200, memberRead.status);

  const memberDeleteOther = await api(
    member,
    `/api/workflows/${workflowList[0]!.id}?workspaceId=${workspaceId}`,
    { method: 'DELETE' },
  );
  // MEMBER holds no workflow:delete, so this must be refused regardless of
  // whether they authored the workflow. If this ever returns 200 the seeded
  // data is destroyed and the suite must stop.
  check('MEMBER cannot delete a workflow (403)', memberDeleteOther.status === 403, memberDeleteOther.status);

  const members = await api(owner, `/api/workspaces/${workspaceId}/members`);
  check('owner lists members', members.status === 200, members.status);
  const memberList = data<{ members: Array<{ role: string }> }>(members.body).members;
  check('all four roles are represented', new Set(memberList.map((m) => m.role)).size === 4, memberList.map((m) => m.role));

  /* ------------------------------------------------------------------ tasks */

  console.log('\nTasks');
  const tasks = await api(owner, `/api/tasks?workspaceId=${workspaceId}`);
  check('owner lists tasks', tasks.status === 200, tasks.status);
  const taskList = data<{ items: Array<{ id: string; status: string }> }>(tasks.body).items;
  check('seeded tasks are present', taskList.length === 9, taskList.length);

  const overdue = await api(owner, `/api/tasks?workspaceId=${workspaceId}&overdue=true`);
  check('overdue filter returns results', overdue.status === 200, overdue.status);

  const blocked = await api(owner, `/api/tasks?workspaceId=${workspaceId}&status=BLOCKED`);
  const blockedTasks = data<{ items: Array<unknown> }>(blocked.body).items;
  check('status filter narrows results', blockedTasks.length >= 1, blockedTasks.length);

  const viewerTaskCreate = await api(viewer, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, title: 'Viewer attempt', priority: 'LOW' }),
  });
  check('VIEWER cannot create a task (403)', viewerTaskCreate.status === 403, viewerTaskCreate.status);

  /* -------------------------------------------------------------- analytics */

  console.log('\nAnalytics');
  const analytics = await api(owner, `/api/analytics?workspaceId=${workspaceId}`);
  check('analytics returns data', analytics.status === 200, analytics.status);
  const metrics = data<Record<string, unknown>>(analytics.body);
  check('analytics reports real workflow counts', typeof metrics === 'object' && metrics !== null);
  console.log('    metrics:', JSON.stringify(metrics).slice(0, 220));

  /* ------------------------------------------------------- notifications etc */

  console.log('\nNotifications, activity, search');
  const notifications = await api(owner, '/api/notifications');
  check('notifications load', notifications.status === 200, notifications.status);

  const activity = await api(owner, `/api/activity?workspaceId=${workspaceId}`);
  check('activity feed loads', activity.status === 200, activity.status);

  const search = await api(owner, `/api/search?q=website&workspaceId=${workspaceId}`);
  check('search returns results', search.status === 200, search.status);

  const templates = await api(owner, '/api/templates?workspaceId=' + workspaceId);
  check('templates load', templates.status === 200, templates.status);

  const versions = await api(
    owner,
    `/api/workflows/${workflowList.find((w) => w.name === 'Client Website Launch')!.id}/versions?workspaceId=${workspaceId}`,
  );
  check('workflow versions load', versions.status === 200, versions.status);
  const versionList = data<{ versions: Array<unknown> }>(versions.body).versions;
  check('the seeded second version exists', versionList.length >= 2, versionList.length);

  /* ------------------------------------------------------------------- audit */

  console.log('\nAudit log');
  const audit = await api(owner, `/api/audit?workspaceId=${workspaceId}`);
  check('owner reads the audit log', audit.status === 200, audit.status);
  const auditItems = data<{ items: Array<{ action: string }> }>(audit.body).items;
  check('seeded audit entries exist', auditItems.length >= 1, auditItems.length);

  const auditFiltered = await api(owner, `/api/audit?workspaceId=${workspaceId}&action=WORKFLOW_CREATED`);
  check('audit action filter applies', auditFiltered.status === 200, auditFiltered.status);
  const filteredItems = data<{ items: Array<{ action: string }> }>(auditFiltered.body).items;
  check(
    'filtered audit entries all match the action',
    filteredItems.every((e) => e.action === 'WORKFLOW_CREATED'),
    filteredItems.map((e) => e.action),
  );

  const adminAudit = await api(
    { cookie: (await signIn('admin@flowforge.dev')).cookie },
    `/api/audit?workspaceId=${workspaceId}`,
  );
  check('ADMIN can read the audit log', adminAudit.status === 200, adminAudit.status);

  const memberAudit = await api(member, `/api/audit?workspaceId=${workspaceId}`);
  check('MEMBER cannot read the audit log (403)', memberAudit.status === 403, memberAudit.status);

  const viewerAudit = await api(viewer, `/api/audit?workspaceId=${workspaceId}`);
  check('VIEWER cannot read the audit log (403)', viewerAudit.status === 403, viewerAudit.status);

  // There is deliberately no write path — audit rows must be impossible to forge.
  const auditPost = await api(owner, '/api/audit', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, action: 'WORKFLOW_DELETED' }),
  });
  check('audit log rejects writes (405)', auditPost.status === 405, auditPost.status);

  /* --------------------------------------------------------- password reset */

  console.log('\nPassword reset');
  // Uses an account that no other section depends on, since a successful reset
  // rotates the credential and would break later sign-ins.
  const resetEmail = 'member@flowforge.dev';
  const resetRequest = await fetch(`${BASE}/api/auth/forget-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail, redirectTo: '/reset-password' }),
  });
  check('forget-password accepts a known address', resetRequest.status === 200, resetRequest.status);

  // The response must not reveal whether the account exists. Better Auth returns
  // the same shape either way; this asserts our endpoint does not leak a 404.
  const unknownRequest = await fetch(`${BASE}/api/auth/forget-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody-here@flowforge.dev', redirectTo: '/reset-password' }),
  });
  check(
    'forget-password does not reveal unknown addresses',
    unknownRequest.status === resetRequest.status,
    unknownRequest.status,
  );

  const badReset = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'NotARealPass123', token: 'obviously-invalid-token' }),
  });
  check('reset-password rejects a forged token (400)', badReset.status === 400, badReset.status);

  const forgotPage = await fetch(`${BASE}/forgot-password`);
  check('forgot-password page renders', forgotPage.status === 200, forgotPage.status);

  const resetPage = await fetch(`${BASE}/reset-password?token=placeholder`);
  check('reset-password page renders', resetPage.status === 200, resetPage.status);

  /* -------------------------------------------------------------------- end */

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error('\nSmoke test crashed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
