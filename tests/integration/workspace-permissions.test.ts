/**
 * Workspace and permission integration tests.
 *
 * Every assertion here is about what happens *after* the database is involved:
 * the central guard reads membership rows, so the tested behaviour is the real
 * enforcement path rather than a re-implementation of the role matrix.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  clearDatabase,
  connectTestDatabase,
  createTestUser,
  createTestWorkspace,
  disconnectTestDatabase,
  findMembershipId,
  linearGraph,
  taskQuery,
} from './harness';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  inviteMember,
  listMembers,
  listWorkspaces,
  removeMember,
  updateMemberRole,
  updateWorkspace,
} from '@/services/workspace.service';
import { listWorkflows, createWorkflow } from '@/services/workflow.service';
import { listTasks, createTask } from '@/services/task.service';
import { ForbiddenError, NotFoundError } from '@/lib/utils/errors';

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(clearDatabase);

describe('workspace creation', () => {
  it('makes the creator the owner and lists the workspace for them', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    expect(workspace.ownerId).toBe(user.id);

    const visible = await listWorkspaces(user.id);
    expect(visible.map((w) => w.id)).toContain(workspace.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.role).toBe('OWNER');
  });

  it('does not list a workspace the user is not a member of', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    await createTestWorkspace(owner.id);

    expect(await listWorkspaces(stranger.id)).toEqual([]);
  });

  it('enforces slug uniqueness', async () => {
    const owner = await createTestUser();
    await createTestWorkspace(owner.id, { slug: 'taken-slug' });

    await expect(
      createWorkspace(owner.id, { name: 'Another', slug: 'taken-slug' }),
    ).rejects.toThrow(/already taken/i);
  });

  it('gives two workspaces distinct slugs when none is supplied', async () => {
    const owner = await createTestUser();
    const first = await createTestWorkspace(owner.id, { name: 'Same Name' });
    const second = await createTestWorkspace(owner.id, { name: 'Same Name' });

    expect(first.slug).not.toBe(second.slug);
  });
});

describe('tenant isolation', () => {
  it('refuses to read a workspace the caller does not belong to', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    await expect(getWorkspace(stranger.id, workspace.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('reports an unknown workspace as not found rather than forbidden', async () => {
    const user = await createTestUser();

    await expect(
      getWorkspace(user.id, '0123456789abcdef01234567'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a malformed workspace id without touching the database', async () => {
    const user = await createTestUser();

    await expect(getWorkspace(user.id, 'not-an-object-id')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps workflows scoped to their workspace', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const workspaceA = await createTestWorkspace(owner.id, { name: 'A' });
    const workspaceB = await createTestWorkspace(other.id, { name: 'B' });

    await createWorkflow(owner.id, {
      workspaceId: workspaceA.id,
      name: 'In A',
      status: 'DRAFT',
      tags: [],
      graph: linearGraph(),
    });

    const inB = await listWorkflows(other.id, { workspaceId: workspaceB.id, page: 1, limit: 20 });
    expect(inB.items).toHaveLength(0);

    const inA = await listWorkflows(owner.id, { workspaceId: workspaceA.id, page: 1, limit: 20 });
    expect(inA.items.map((w) => w.name)).toEqual(['In A']);
  });
});

describe('role permissions', () => {
  it('lets a MEMBER create a workflow but a VIEWER not', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const viewer = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');
    await addMember(workspace.id, viewer.id, 'VIEWER');

    const created = await createWorkflow(member.id, {
      workspaceId: workspace.id,
      name: 'Member workflow',
      status: 'DRAFT',
      tags: [],
      graph: linearGraph(),
    });
    expect(created.name).toBe('Member workflow');

    await expect(
      createWorkflow(viewer.id, {
        workspaceId: workspace.id,
        name: 'Viewer workflow',
        status: 'DRAFT',
        tags: [],
        graph: linearGraph(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets a MEMBER create a task but a VIEWER not', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const viewer = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');
    await addMember(workspace.id, viewer.id, 'VIEWER');

    const task = await createTask(member.id, {
      workspaceId: workspace.id,
      title: 'Member task',
      priority: 'MEDIUM',
      status: 'TODO',
      dependencies: [],
    });
    expect(task.title).toBe('Member task');

    await expect(
      createTask(viewer.id, {
        workspaceId: workspace.id,
        title: 'Viewer task',
        priority: 'MEDIUM',
        status: 'TODO',
        dependencies: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids a MEMBER from updating workspace settings', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');

    await expect(
      updateWorkspace(member.id, workspace.id, { name: 'Renamed by member' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an ADMIN invite members and a MEMBER not', async () => {
    const owner = await createTestUser();
    const admin = await createTestUser();
    const member = await createTestUser();
    const invitee = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, admin.id, 'ADMIN');
    await addMember(workspace.id, member.id, 'MEMBER');

    await expect(
      inviteMember(member.id, workspace.id, { email: invitee.email, role: 'MEMBER' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const invited = await inviteMember(admin.id, workspace.id, {
      email: invitee.email,
      role: 'MEMBER',
    });
    expect(invited.userId).toBe(invitee.id);
  });
});

describe('membership lifecycle', () => {
  it('transfers access when a role changes', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const membershipId = await addMember(workspace.id, member.id, 'VIEWER');

    // A VIEWER cannot create workflows...
    await expect(
      createWorkflow(member.id, {
        workspaceId: workspace.id,
        name: 'Blocked while viewer',
        status: 'DRAFT',
        tags: [],
        graph: linearGraph(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await updateMemberRole(owner.id, workspace.id, membershipId, 'MEMBER');

    // ...and can once promoted, which proves the guard reads live membership
    // rather than a cached or client-supplied claim.
    const workflow = await createWorkflow(member.id, {
      workspaceId: workspace.id,
      name: 'Allowed as member',
      status: 'DRAFT',
      tags: [],
      graph: linearGraph(),
    });
    expect(workflow.name).toBe('Allowed as member');
  });

  it('revokes access immediately when a member is removed', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const membershipId = await addMember(workspace.id, member.id, 'MEMBER');

    expect(
      (await listTasks(member.id, taskQuery(workspace.id))).items,
    ).toEqual([]);

    await removeMember(owner.id, workspace.id, membershipId);

    await expect(
      listTasks(member.id, taskQuery(workspace.id)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to remove the last owner', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const ownerMembership = await findMembershipId(workspace.id, owner.id);

    await expect(removeMember(owner.id, workspace.id, ownerMembership)).rejects.toThrow(/owner/i);
  });

  it('refuses to demote the last owner', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const ownerMembership = await findMembershipId(workspace.id, owner.id);

    await expect(
      updateMemberRole(owner.id, workspace.id, ownerMembership, 'ADMIN'),
    ).rejects.toThrow(/owner/i);
  });

  it('rejects a membership id belonging to another workspace', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const workspaceA = await createTestWorkspace(owner.id, { name: 'A' });
    const workspaceB = await createTestWorkspace(other.id, { name: 'B' });
    const foreignMembership = await findMembershipId(workspaceB.id, other.id);

    await expect(
      removeMember(owner.id, workspaceA.id, foreignMembership),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists members with their roles', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');

    const members = await listMembers(owner.id, workspace.id);
    const byId = new Map(members.map((m) => [m.userId, m.role]));
    expect(byId.get(owner.id)).toBe('OWNER');
    expect(byId.get(member.id)).toBe('MEMBER');
  });
});

describe('workspace deletion', () => {
  it('is restricted to the owner', async () => {
    const owner = await createTestUser();
    const admin = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, admin.id, 'ADMIN');

    await expect(deleteWorkspace(admin.id, workspace.id)).rejects.toBeInstanceOf(ForbiddenError);

    await deleteWorkspace(owner.id, workspace.id);
    expect(await listWorkspaces(owner.id)).toEqual([]);
  });

  it('cascades to workflows, tasks and memberships', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');

    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Doomed workflow',
      status: 'DRAFT',
      tags: [],
      graph: linearGraph(),
    });
    await createTask(owner.id, {
      workspaceId: workspace.id,
      workflowId: workflow.id,
      title: 'Doomed task',
      priority: 'LOW',
      status: 'TODO',
      dependencies: [],
    });

    await deleteWorkspace(owner.id, workspace.id);

    const { Workflow, Task, Membership } = await import('@/models');
    expect(await Workflow.countDocuments({ workspaceId: workspace.id })).toBe(0);
    expect(await Task.countDocuments({ workspaceId: workspace.id })).toBe(0);
    expect(await Membership.countDocuments({ workspaceId: workspace.id })).toBe(0);
  });
});
