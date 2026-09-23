/**
 * Workflow CRUD and versioning integration tests.
 *
 * The interesting behaviour is what the service refuses to do: save an
 * unexecutable graph, leak a workflow across workspaces, or rewind history when
 * a version is restored.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  clearDatabase,
  connectTestDatabase,
  createTestUser,
  createTestWorkspace,
  disconnectTestDatabase,
  linearGraph,
} from './harness';
import {
  createWorkflow,
  deleteWorkflow,
  getVersion,
  getWorkflow,
  listVersions,
  listWorkflows,
  restoreVersion,
  updateWorkflow,
} from '@/services/workflow.service';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { Task } from '@/models';
import type { WorkflowGraphInput } from '@/schemas/workflow.schema';

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(clearDatabase);

async function seedWorkflow(ownerId: string, workspaceId: string, name = 'Website Launch') {
  return createWorkflow(ownerId, {
    workspaceId,
    name,
    description: 'A workflow used by the integration suite.',
    status: 'DRAFT',
    tags: ['test'],
    graph: linearGraph(),
  });
}

/** Same shape as `linearGraph`, with one extra task inserted before END. */
function extendedGraph(): WorkflowGraphInput {
  return {
    nodes: [
      {
        id: 'start',
        type: 'START',
        title: 'Start',
        description: '',
        position: { x: 0, y: 0 },
        config: {},
        metadata: {},
      },
      {
        id: 'work',
        type: 'TASK',
        title: 'Do the work',
        description: '',
        position: { x: 0, y: 120 },
        config: {},
        metadata: {},
      },
      {
        id: 'review',
        type: 'TASK',
        title: 'Review the work',
        description: '',
        position: { x: 0, y: 240 },
        config: {},
        metadata: {},
      },
      {
        id: 'end',
        type: 'END',
        title: 'End',
        description: '',
        position: { x: 0, y: 360 },
        config: {},
        metadata: {},
      },
    ],
    edges: [
      { id: 'e-start-work', source: 'start', target: 'work' },
      { id: 'e-work-review', source: 'work', target: 'review' },
      { id: 'e-review-end', source: 'review', target: 'end' },
    ],
  };
}

describe('workflow CRUD', () => {
  it('creates a workflow with an initial version snapshot', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    const workflow = await seedWorkflow(owner.id, workspace.id);

    expect(workflow.name).toBe('Website Launch');
    expect(workflow.currentVersion).toBe(1);
    expect(workflow.nodes).toHaveLength(3);

    const versions = await listVersions(owner.id, workflow.id, workspace.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
    expect(versions[0]?.changeSummary).toBe('Initial version');
  });

  it('reads a workflow back by id', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const created = await seedWorkflow(owner.id, workspace.id);

    const fetched = await getWorkflow(owner.id, created.id, workspace.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.edges).toHaveLength(2);
  });

  it('filters the list by status, tag and name', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Alpha Project',
      status: 'ACTIVE',
      tags: ['client'],
      graph: linearGraph(),
    });
    await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Beta Project',
      status: 'DRAFT',
      tags: ['internal'],
      graph: linearGraph(),
    });

    const active = await listWorkflows(owner.id, {
      workspaceId: workspace.id,
      status: 'ACTIVE',
      page: 1,
      limit: 20,
    });
    expect(active.items.map((w) => w.name)).toEqual(['Alpha Project']);

    const tagged = await listWorkflows(owner.id, {
      workspaceId: workspace.id,
      tag: 'internal',
      page: 1,
      limit: 20,
    });
    expect(tagged.items.map((w) => w.name)).toEqual(['Beta Project']);

    const searched = await listWorkflows(owner.id, {
      workspaceId: workspace.id,
      search: 'alpha',
      page: 1,
      limit: 20,
    });
    expect(searched.items.map((w) => w.name)).toEqual(['Alpha Project']);
  });

  it('allows two workflows to share a name', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    // Names are deliberately not unique: "Website Launch" is a reasonable name
    // per client, and identity is carried by the id, not the title.
    await seedWorkflow(owner.id, workspace.id, 'Duplicate');
    await expect(seedWorkflow(owner.id, workspace.id, 'Duplicate')).resolves.toBeDefined();

    const listed = await listWorkflows(owner.id, {
      workspaceId: workspace.id,
      page: 1,
      limit: 20,
    });
    expect(listed.items).toHaveLength(2);
  });

  it('refuses to save an unexecutable graph', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);

    // A graph with no END node can never finish, so the engine would stall.
    const broken: WorkflowGraphInput = {
      nodes: [
        {
          id: 'start',
          type: 'START',
          title: 'Start',
          description: '',
          position: { x: 0, y: 0 },
          config: {},
          metadata: {},
        },
        {
          id: 'work',
          type: 'TASK',
          title: 'Work',
          description: '',
          position: { x: 0, y: 120 },
          config: {},
          metadata: {},
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'work' }],
    };

    await expect(
      updateWorkflow(owner.id, workflow.id, workspace.id, { workspaceId: workspace.id, graph: broken }),
    ).rejects.toBeInstanceOf(ValidationError);

    // The rejection must not have partially written the graph.
    const after = await getWorkflow(owner.id, workflow.id, workspace.id);
    expect(after.nodes).toHaveLength(3);
    expect(after.currentVersion).toBe(1);
  });

  it('deletes a workflow and detaches its tasks rather than deleting them', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);

    const { createTask } = await import('@/services/task.service');
    const task = await createTask(owner.id, {
      workspaceId: workspace.id,
      workflowId: workflow.id,
      nodeId: 'work',
      title: 'Task bound to the workflow',
      priority: 'MEDIUM',
      status: 'TODO',
      dependencies: [],
    });

    await deleteWorkflow(owner.id, workflow.id, workspace.id);

    await expect(getWorkflow(owner.id, workflow.id, workspace.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const survivor = await Task.findById(task.id).lean();
    expect(survivor).not.toBeNull();
    expect(survivor?.workflowId).toBeNull();
    expect(survivor?.nodeId).toBeNull();
  });

  it('restricts deletion to roles with workflow:delete', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, member.id, 'MEMBER');
    const workflow = await seedWorkflow(owner.id, workspace.id);

    await expect(
      deleteWorkflow(member.id, workflow.id, workspace.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('workflow versioning', () => {
  it('creates a new version only when the graph changes', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);

    // Renaming is metadata only; bumping the version would bury real graph
    // changes under noise.
    await updateWorkflow(owner.id, workflow.id, workspace.id, { workspaceId: workspace.id, name: 'Renamed' });
    expect((await listVersions(owner.id, workflow.id, workspace.id))).toHaveLength(1);
    expect((await getWorkflow(owner.id, workflow.id, workspace.id)).currentVersion).toBe(1);

    await updateWorkflow(owner.id, workflow.id, workspace.id, {
      workspaceId: workspace.id,
      graph: extendedGraph(),
      changeSummary: 'Added a review step',
    });

    const versions = await listVersions(owner.id, workflow.id, workspace.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const current = await getWorkflow(owner.id, workflow.id, workspace.id);
    expect(current.currentVersion).toBe(2);
    expect(current.nodes).toHaveLength(4);
  });

  it('exposes the graph stored in a specific version', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);
    await updateWorkflow(owner.id, workflow.id, workspace.id, { workspaceId: workspace.id, graph: extendedGraph() });

    // v1 is the pre-edit snapshot, so it must still have the original 3 nodes.
    const v1 = await getVersion(owner.id, workflow.id, workspace.id, 1);
    expect(v1.nodes).toHaveLength(3);

    const v2 = await getVersion(owner.id, workflow.id, workspace.id, 2);
    expect(v2.nodes).toHaveLength(4);
  });

  it('restores forward instead of rewinding history', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);
    await updateWorkflow(owner.id, workflow.id, workspace.id, { workspaceId: workspace.id, graph: extendedGraph() });

    const restored = await restoreVersion(owner.id, workflow.id, workspace.id, 1);

    // Restoring v1 writes it as v3: the graph is back to 3 nodes, but the
    // version counter moved forward so nothing recorded in between is lost.
    expect(restored.nodes).toHaveLength(3);
    expect(restored.currentVersion).toBe(3);

    const versions = await listVersions(owner.id, workflow.id, workspace.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3]);
  });

  it('reports an unknown version as not found', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await seedWorkflow(owner.id, workspace.id);

    await expect(
      getVersion(owner.id, workflow.id, workspace.id, 99),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to read versions from another workspace', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const other = await createTestWorkspace(stranger.id, { name: 'Other' });
    const workflow = await seedWorkflow(owner.id, workspace.id);

    await expect(
      listVersions(stranger.id, workflow.id, other.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
