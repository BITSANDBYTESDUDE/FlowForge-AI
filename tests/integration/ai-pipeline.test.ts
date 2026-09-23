/**
 * AI pipeline integration tests.
 *
 * These exercise the deterministic half of the AI feature — the part that runs
 * without a model: prompt validation, the heuristic fallback, graph layout, and
 * the fact that a generated workflow is persisted through the same service the
 * manual builder uses and is therefore subject to the same validation.
 *
 * The provider call itself is not mocked. Instead these tests run with no
 * OPENAI_API_KEY and `AI_ALLOW_HEURISTIC_FALLBACK` enabled, which is the
 * documented local-development path. That keeps the assertions honest: the code
 * under test is the real pipeline, not a stub.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  clearDatabase,
  connectTestDatabase,
  createTestUser,
  createTestWorkspace,
  disconnectTestDatabase,
} from './harness';
import {
  allowHeuristicFallback,
  generateWorkflow,
  layoutGraph,
  summarizeWorkflow,
} from '@/services/ai.service';
import { createWorkflow, getWorkflow } from '@/services/workflow.service';
import { requirePermission } from '@/lib/permissions/guard';
import { resetEnvCache } from '@/lib/env';
import { AiUnavailableError, ForbiddenError, ValidationError } from '@/lib/utils/errors';
import { aiWorkflowSchema } from '@/lib/ai/schemas/workflow-output';

beforeAll(async () => {
  // Deterministic behaviour without a model. The fallback is opt-in precisely so
  // a deployment cannot silently serve rules as if they were model output.
  process.env.AI_ALLOW_HEURISTIC_FALLBACK = 'true';
  delete process.env.OPENAI_API_KEY;
  resetEnvCache();
  await connectTestDatabase();
});
afterAll(disconnectTestDatabase);
beforeEach(clearDatabase);

describe('generation guardrails', () => {
  it('rejects a description that is too short to act on', async () => {
    await expect(generateWorkflow('site')).rejects.toBeInstanceOf(ValidationError);
  });

  it('reports that the fallback is active and labels its output as heuristic', async () => {
    expect(allowHeuristicFallback()).toBe(true);

    const result = await generateWorkflow('I want to launch a website for a client');
    expect(result.heuristic).toBe(true);
    expect(result.usage.model).toBe('heuristic');
  });

  it('produces a draft that satisfies the same schema strict decoding enforces', async () => {
    const result = await generateWorkflow('I want to launch a website for a client');

    // Any drift between the heuristic fixture and the schema would mean the
    // offline path emits graphs the model path is required to reject.
    const parsed = aiWorkflowSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
  });

  it('never returns a graph without a start and an end', async () => {
    const result = await generateWorkflow('Plan a product launch for a new mobile app');
    const types = result.data.nodes.map((node) => node.type);

    expect(types).toContain('START');
    expect(types).toContain('END');
  });

  it('gives every edge endpoints that exist in the node set', async () => {
    const result = await generateWorkflow('Onboard a new employee into the engineering team');
    const ids = new Set(result.data.nodes.map((node) => node.id));

    for (const edge of result.data.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it('degrades the summary endpoint gracefully rather than throwing', async () => {
    const result = await summarizeWorkflow(JSON.stringify({ nodes: [], edges: [] }));

    expect(result.heuristic).toBe(true);
    expect(result.data.summary).toMatch(/unavailable/i);
    expect(Array.isArray(result.data.highlights)).toBe(true);
    expect(Array.isArray(result.data.risks)).toBe(true);
  });
});

describe('layout', () => {
  it('assigns distinct positions so nodes do not stack on the canvas', async () => {
    const generated = await generateWorkflow('Run a social media campaign for a product');
    const laidOut = layoutGraph(generated.data);

    const seen = new Set<string>();
    for (const node of laidOut.nodes) {
      const key = `${node.position.x}:${node.position.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });
});

describe('persisting a generated workflow', () => {
  it('saves through createWorkflow so the graph is validated and versioned', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    const generated = await generateWorkflow('Launch a client website end to end');

    const workflow = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: generated.data.name,
      description: generated.data.description,
      status: 'DRAFT',
      tags: generated.data.tags,
      graph: {
        nodes: generated.data.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          title: node.title,
          description: node.description ?? '',
          position: node.position,
          config: node.config ?? {},
          metadata: { generated: true },
        })),
        edges: generated.data.edges.map((edge, index) => ({
          id: `edge-${index}-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          condition: edge.condition ?? null,
          label: edge.label ?? null,
        })),
      },
    });

    // The persisted graph carries a version snapshot like any hand-built one.
    expect(workflow.currentVersion).toBe(1);
    const stored = await getWorkflow(owner.id, workflow.id, workspace.id);
    expect(stored.nodes.length).toBe(generated.data.nodes.length);
  });

  it('lets an incomplete draft be saved but refuses to run it', async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);

    // A draft is allowed to be incomplete — that is the whole point of a draft,
    // and a new workflow starts as a lone START node. Executability is enforced
    // at run time instead, so the AI path and the manual builder share one rule.
    const draft = await createWorkflow(owner.id, {
      workspaceId: workspace.id,
      name: 'Incomplete',
      status: 'DRAFT',
      tags: [],
      graph: {
        nodes: [
          { id: 'start', type: 'START', title: 'Start', description: '', position: { x: 0, y: 0 }, config: {}, metadata: {} },
          { id: 'end', type: 'END', title: 'End', description: '', position: { x: 0, y: 100 }, config: {}, metadata: {} },
        ],
        // END -> START leaves START with no outgoing edge and END with one.
        edges: [{ id: 'e', source: 'end', target: 'start' }],
      },
    });
    expect(draft.id).toBeDefined();

    const { startExecution } = await import('@/services/execution.service');
    await expect(
      startExecution(owner.id, draft.id, workspace.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires workflow:create in the target workspace', async () => {
    const owner = await createTestUser();
    const viewer = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, viewer.id, 'VIEWER');

    await expect(
      requirePermission(viewer.id, workspace.id, 'workflow:create'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('blocks generation entirely when no provider is configured and fallback is off', async () => {
    process.env.AI_ALLOW_HEURISTIC_FALLBACK = 'false';
    // getEnv() memoises, so the flag change only takes effect after a reset.
    resetEnvCache();
    expect(allowHeuristicFallback()).toBe(false);

    await expect(generateWorkflow('Launch a website for a client')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );

    process.env.AI_ALLOW_HEURISTIC_FALLBACK = 'true';
    resetEnvCache();
  });
});
