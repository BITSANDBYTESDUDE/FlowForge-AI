/**
 * Workflow execution integration tests.
 *
 * Drives the engine end to end: start a run, complete the task it creates, and
 * assert where the run lands. The engine is pull-based, so each assertion after
 * a task completion is really asking "did traversal advance correctly?" — which
 * is exactly the part that cannot be verified by a unit test on a pure helper.
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
  cancelExecution,
  completeNodeTask,
  getExecution,
  listExecutions,
  pauseExecution,
  resumeExecution,
  startExecution,
} from '@/services/execution.service';
import { createWorkflow } from '@/services/workflow.service';
import { createTask, updateTask } from '@/services/task.service';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { Task, WorkflowExecution } from '@/models';
import type { WorkflowGraphInput } from '@/schemas/workflow.schema';

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(clearDatabase);

async function setupRun() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  const workflow = await createWorkflow(owner.id, {
    workspaceId: workspace.id,
    name: 'Launch',
    status: 'ACTIVE',
    tags: [],
    graph: linearGraph(),
  });
  return { owner, workspace, workflow };
}

/** Finds the single open task the engine created for the current node. */
async function currentTask(executionId: string) {
  const task = await Task.findOne({
    executionId,
    status: { $nin: ['COMPLETED', 'CANCELLED'] },
  }).lean();
  if (!task) throw new Error(`No open task for execution ${executionId}`);
  return task;
}

describe('starting an execution', () => {
  it('creates a run, skips START, and stops at the first manual node', async () => {
    const { owner, workspace, workflow } = await setupRun();

    const execution = await startExecution(owner.id, workflow.id, workspace.id, 'Client A');

    // START is automatic, so traversal passes through it and halts at `work`.
    expect(execution.status).toBe('RUNNING');
    expect(execution.completedNodeIds).toContain('start');
    expect(execution.completedNodeIds).not.toContain('work');
    expect(execution.currentNodeIds).toEqual(['work']);
    expect(execution.label).toBe('Client A');
    expect(execution.progress.completed).toBe(1);
    expect(execution.progress.percent).toBe(33);
  });

  it('creates a task for the manual node it stopped on', async () => {
    const { owner, workspace, workflow } = await setupRun();

    const execution = await startExecution(owner.id, workflow.id, workspace.id);
    const task = await currentTask(execution.id);

    expect(task.title).toBe('Do the work');
    expect(task.nodeId).toBe('work');
    expect(task.executionId?.toString()).toBe(execution.id);
    expect(task.status).toBe('TODO');
  });

  it('supports several runs of the same definition', async () => {
    const { owner, workspace, workflow } = await setupRun();

    const first = await startExecution(owner.id, workflow.id, workspace.id, 'Client A');
    const second = await startExecution(owner.id, workflow.id, workspace.id, 'Client B');

    expect(first.id).not.toBe(second.id);

    const runs = await listExecutions(owner.id, workspace.id, workflow.id);
    expect(runs.map((r) => r.label).sort()).toEqual(['Client A', 'Client B']);
  });

  it('requires the workflow:execute permission', async () => {
    const { workspace, workflow } = await setupRun();
    const viewer = await createTestUser();
    await addMember(workspace.id, viewer.id, 'VIEWER');

    await expect(
      startExecution(viewer.id, workflow.id, workspace.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to execute a workflow from another workspace', async () => {
    const { workflow } = await setupRun();
    const stranger = await createTestUser();
    const other = await createTestWorkspace(stranger.id, { name: 'Other' });

    await expect(
      startExecution(stranger.id, workflow.id, other.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('advancing an execution', () => {
  it('completes the run once the last manual node is done', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);

    const task = await currentTask(started.id);
    await updateTask(owner.id, task._id.toString(), workspace.id, { status: 'COMPLETED' });

    const { execution, advanced } = await completeNodeTask(owner.id, task._id.toString());
    expect(advanced).toBe(true);

    // After `work` comes END, which is automatic — so the run finishes outright.
    expect(execution?.status).toBe('COMPLETED');
    expect(execution?.progress.percent).toBe(100);
    expect(execution?.completedAt).not.toBeNull();
  });

  it('walks through multiple manual nodes in order', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    const twoStep: WorkflowGraphInput = {
      nodes: [
        { id: 'start', type: 'START', title: 'Start', description: '', position: { x: 0, y: 0 }, config: {}, metadata: {} },
        { id: 'first', type: 'TASK', title: 'First', description: '', position: { x: 0, y: 100 }, config: {}, metadata: {} },
        { id: 'second', type: 'TASK', title: 'Second', description: '', position: { x: 0, y: 200 }, config: {}, metadata: {} },
        { id: 'end', type: 'END', title: 'End', description: '', position: { x: 0, y: 300 }, config: {}, metadata: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'first' },
        { id: 'b', source: 'first', target: 'second' },
        { id: 'c', source: 'second', target: 'end' },
      ],
    };

    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Two step',
      status: 'ACTIVE',
      tags: [],
      graph: twoStep,
    });

    const started = await startExecution(owner.id, workflow.id, workspace.id);
    expect(started.currentNodeIds).toEqual(['first']);

    const firstTask = await currentTask(started.id);
    await updateTask(owner.id, firstTask._id.toString(), workspace.id, { status: 'COMPLETED' });
    const step1 = await completeNodeTask(owner.id, firstTask._id.toString());

    // Still running, now waiting on `second` — and a fresh task exists for it.
    expect(step1.execution?.status).toBe('RUNNING');
    expect(step1.execution?.currentNodeIds).toEqual(['second']);

    const secondTask = await currentTask(started.id);
    expect(secondTask.title).toBe('Second');
    expect(secondTask.nodeId).toBe('second');

    await updateTask(owner.id, secondTask._id.toString(), workspace.id, { status: 'COMPLETED' });
    const step2 = await completeNodeTask(owner.id, secondTask._id.toString());

    expect(step2.execution?.status).toBe('COMPLETED');
  });

  it('ignores a task that is not the node the run is waiting on', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);

    // A standalone task carries no execution link, so it must not advance a run.
    const loose = await createTask(owner.id, {
      workspaceId: workspace.id,
      title: 'Unrelated',
      priority: 'LOW',
      status: 'TODO',
      dependencies: [],
    });
    const result = await completeNodeTask(owner.id, loose.id);
    expect(result).toEqual({ execution: null, advanced: false });

    const stillWaiting = await getExecution(owner.id, started.id);
    expect(stillWaiting.status).toBe('RUNNING');
    expect(stillWaiting.currentNodeIds).toEqual(['work']);
  });

  it('does not advance a paused run when its task is completed', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);
    await pauseExecution(owner.id, started.id);

    const task = await currentTask(started.id);
    await updateTask(owner.id, task._id.toString(), workspace.id, { status: 'COMPLETED' });
    const result = await completeNodeTask(owner.id, task._id.toString());

    // The task is finished, but the run stays put until it is resumed.
    expect(result).toEqual({ execution: null, advanced: false });
    const paused = await getExecution(owner.id, started.id);
    expect(paused.status).toBe('PAUSED');
    expect(paused.currentNodeIds).toEqual(['work']);
  });
});

describe('pause, resume and cancel', () => {
  it('pauses and resumes without losing position', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);

    const paused = await pauseExecution(owner.id, started.id);
    expect(paused.status).toBe('PAUSED');

    const resumed = await resumeExecution(owner.id, started.id);
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.currentNodeIds).toEqual(['work']);
  });

  it('cancels the run and its outstanding tasks', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);

    const cancelled = await cancelExecution(owner.id, started.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.currentNodeIds).toEqual([]);

    const task = await Task.findOne({ executionId: started.id }).lean();
    expect(task?.status).toBe('CANCELLED');
  });

  it('rejects transitions the state machine disallows', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);
    await resumeExecution(owner.id, started.id).catch(() => undefined);

    // RUNNING -> RUNNING is not a transition, so resume must be refused.
    await expect(resumeExecution(owner.id, started.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps executions scoped to the workspace', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const stranger = await createTestUser();
    const started = await startExecution(owner.id, workflow.id, workspace.id);

    await expect(getExecution(stranger.id, started.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('records a log of what happened', async () => {
    const { owner, workspace, workflow } = await setupRun();
    const started = await startExecution(owner.id, workflow.id, workspace.id);
    const task = await currentTask(started.id);
    await updateTask(owner.id, task._id.toString(), workspace.id, { status: 'COMPLETED' });
    await completeNodeTask(owner.id, task._id.toString());

    const finished = await getExecution(owner.id, started.id);
    const types = finished.log.map((entry) => entry.type);

    expect(types).toContain('START');
    expect(types).toContain('NODE_COMPLETED');
    expect(types).toContain('COMPLETED');
  });
});

describe('decision branching', () => {
  function branchingGraph(): WorkflowGraphInput {
    return {
      nodes: [
        { id: 'start', type: 'START', title: 'Start', description: '', position: { x: 0, y: 0 }, config: {}, metadata: {} },
        { id: 'check', type: 'TASK', title: 'Check', description: '', position: { x: 0, y: 100 }, config: {}, metadata: {} },
        {
          id: 'decide',
          type: 'DECISION',
          title: 'Approved?',
          description: '',
          position: { x: 0, y: 200 },
          config: {
            conditions: [
              { label: 'Approved', expression: 'completedCount >= 1' },
              { label: 'Rejected', expression: 'completedCount < 1' },
            ],
          },
          metadata: {},
        },
        { id: 'happy', type: 'TASK', title: 'Ship it', description: '', position: { x: -120, y: 300 }, config: {}, metadata: {} },
        { id: 'sad', type: 'TASK', title: 'Rework', description: '', position: { x: 120, y: 300 }, config: {}, metadata: {} },
        { id: 'end', type: 'END', title: 'End', description: '', position: { x: 0, y: 400 }, config: {}, metadata: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'check' },
        { id: 'b', source: 'check', target: 'decide' },
        { id: 'c', source: 'decide', target: 'happy', condition: 'completedCount >= 1' },
        { id: 'd', source: 'decide', target: 'sad', condition: 'completedCount < 1' },
        { id: 'e', source: 'happy', target: 'end' },
        { id: 'f', source: 'sad', target: 'end' },
      ],
    };
  }

  /**
   * A DECISION node is a manual gate: the engine creates a task for it and waits
   * for someone to complete it. The branch is then chosen from the outgoing edge
   * conditions, evaluated against the run's facts. So a run crosses a decision in
   * two steps — complete the gate task, then the engine picks the branch.
   */
  it('follows the edge whose condition holds', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Branching',
      status: 'ACTIVE',
      tags: [],
      graph: branchingGraph(),
    });

    const started = await startExecution(owner.id, workflow.id, workspace.id);
    expect(started.currentNodeIds).toEqual(['check']);

    const check = await currentTask(started.id);
    await updateTask(owner.id, check._id.toString(), workspace.id, { status: 'COMPLETED' });
    const afterCheck = await completeNodeTask(owner.id, check._id.toString());

    // `check` is done, so the run arrives at the decision gate and stops there.
    expect(afterCheck.execution?.currentNodeIds).toEqual(['decide']);

    const gate = await currentTask(started.id);
    expect(gate.nodeId).toBe('decide');
    await updateTask(owner.id, gate._id.toString(), workspace.id, { status: 'COMPLETED' });
    const result = await completeNodeTask(owner.id, gate._id.toString());

    // Two nodes completed by now, so `completedCount >= 1` holds and the run
    // takes the "happy" branch rather than falling back to the first edge.
    expect(result.execution?.currentNodeIds).toEqual(['happy']);
    expect(result.execution?.status).toBe('RUNNING');
  });

  it('falls back to the first edge when no condition matches', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    // The decision's branches depend on a fact no run can satisfy, so both
    // conditions are false and the engine must degrade to the default edge
    // instead of stalling.
    const graph = branchingGraph();
    const decision = graph.nodes.find((n) => n.id === 'decide')!;
    decision.config = {
      conditions: [
        { label: 'Never', expression: 'completedCount < 0' },
        { label: 'Also never', expression: 'completedCount > 100000' },
      ],
    };
    for (const edge of graph.edges) {
      if (edge.source === 'decide') edge.condition = 'completedCount < 0';
    }

    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Dead branch',
      status: 'ACTIVE',
      tags: [],
      graph,
    });

    const started = await startExecution(owner.id, workflow.id, workspace.id);
    const check = await currentTask(started.id);
    await updateTask(owner.id, check._id.toString(), workspace.id, { status: 'COMPLETED' });
    await completeNodeTask(owner.id, check._id.toString());

    const gate = await currentTask(started.id);
    await updateTask(owner.id, gate._id.toString(), workspace.id, { status: 'COMPLETED' });
    const result = await completeNodeTask(owner.id, gate._id.toString());

    // "happy" is declared first, so it wins as the fallback.
    expect(result.execution?.currentNodeIds).toEqual(['happy']);
    expect(result.execution?.status).toBe('RUNNING');
  });
});

describe('execution robustness', () => {
  it('refuses to start a run whose definition has no END node', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    // Created with a valid graph, then broken directly in the database, standing
    // in for a definition edited while an older execution was live.
    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Degraded',
      status: 'ACTIVE',
      tags: [],
      graph: linearGraph(),
    });

    const { Workflow } = await import('@/models');
    await Workflow.updateOne({ _id: workflow.id }, { $set: { nodes: [], edges: [] } });

    await expect(
      startExecution(owner.id, workflow.id, workspace.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('never creates an execution for a workflow that failed validation', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Degraded',
      status: 'ACTIVE',
      tags: [],
      graph: linearGraph(),
    });

    const { Workflow } = await import('@/models');
    await Workflow.updateOne({ _id: workflow.id }, { $set: { nodes: [], edges: [] } });
    await startExecution(owner.id, workflow.id, workspace.id).catch(() => undefined);

    expect(await WorkflowExecution.countDocuments({ workflowId: workflow.id })).toBe(0);
  });
});
