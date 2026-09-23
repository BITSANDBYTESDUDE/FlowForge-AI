import { describe, expect, it } from 'vitest';
import { findCycle, reachableFromStart, validateExecutable } from '@/lib/workflow/graph';
import { evaluateCondition } from '@/lib/workflow/conditions';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '@/types/workflow';

/**
 * Graph and execution-logic tests.
 *
 * These target the topology rules the execution engine depends on: it walks
 * forward from START, so a graph that is unreachable, cyclic, or malformed will
 * either stall or loop forever at runtime. Validating here means a bad graph is
 * rejected at save time rather than mid-run.
 */

let counter = 0;
function node(type: WorkflowNode['type'], overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  counter += 1;
  return {
    id: `n${counter}`,
    type,
    title: `${type} node`,
    description: '',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function edge(source: string, target: string, overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return { id: `${source}->${target}`, source, target, ...overrides };
}

function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges };
}

describe('reachableFromStart', () => {
  it('finds every node in a linear chain', () => {
    const start = node('START');
    const middle = node('TASK');
    const end = node('END');

    const reachable = reachableFromStart(
      graph([start, middle, end], [edge(start.id, middle.id), edge(middle.id, end.id)]),
    );

    expect(reachable).toEqual(new Set([start.id, middle.id, end.id]));
  });

  it('follows branching edges', () => {
    const start = node('START');
    const decision = node('DECISION');
    const yes = node('TASK');
    const no = node('TASK');
    const join = node('END');

    const reachable = reachableFromStart(
      graph(
        [start, decision, yes, no, join],
        [
          edge(start.id, decision.id),
          edge(decision.id, yes.id),
          edge(decision.id, no.id),
          edge(yes.id, join.id),
          edge(no.id, join.id),
        ],
      ),
    );

    expect(reachable.size).toBe(5);
  });

  it('excludes an orphan node', () => {
    const start = node('START');
    const connected = node('TASK');
    const orphan = node('TASK');

    const reachable = reachableFromStart(
      graph([start, connected, orphan], [edge(start.id, connected.id)]),
    );

    expect(reachable.has(orphan.id)).toBe(false);
  });

  it('returns an empty set when there is no START node', () => {
    const a = node('TASK');
    const b = node('TASK');
    expect(reachableFromStart(graph([a, b], [edge(a.id, b.id)])).size).toBe(0);
  });

  it('terminates on a cycle rather than looping forever', () => {
    const start = node('START');
    const a = node('TASK');
    const b = node('TASK');

    const reachable = reachableFromStart(
      graph([start, a, b], [edge(start.id, a.id), edge(a.id, b.id), edge(b.id, a.id)]),
    );

    expect(reachable).toEqual(new Set([start.id, a.id, b.id]));
  });

  it('handles an edge pointing at a node that does not exist', () => {
    // Defensive: the schema rejects dangling edges, but the traversal must not
    // throw if one slips through from older data.
    const start = node('START');
    expect(() =>
      reachableFromStart(graph([start], [edge(start.id, 'ghost')])),
    ).not.toThrow();
  });
});

describe('findCycle', () => {
  it('returns null for an acyclic graph', () => {
    const start = node('START');
    const a = node('TASK');
    const end = node('END');
    const result = findCycle(
      graph([start, a, end], [edge(start.id, a.id), edge(a.id, end.id)]),
    );
    expect(result).toBeNull();
  });

  it('detects a two-node cycle', () => {
    const start = node('START');
    const a = node('TASK');
    const b = node('TASK');
    const result = findCycle(
      graph([start, a, b], [edge(start.id, a.id), edge(a.id, b.id), edge(b.id, a.id)]),
    );
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('detects a self-loop', () => {
    const start = node('START');
    const a = node('TASK');
    const result = findCycle(graph([start, a], [edge(start.id, a.id), edge(a.id, a.id)]));
    expect(result).not.toBeNull();
  });

  it('allows a diamond, which is a DAG even though paths reconverge', () => {
    const start = node('START');
    const left = node('TASK');
    const right = node('TASK');
    const join = node('END');
    const result = findCycle(
      graph(
        [start, left, right, join],
        [
          edge(start.id, left.id),
          edge(start.id, right.id),
          edge(left.id, join.id),
          edge(right.id, join.id),
        ],
      ),
    );
    expect(result).toBeNull();
  });
});

describe('validateExecutable', () => {
  it('accepts a well-formed workflow', () => {
    const start = node('START');
    const task = node('TASK', { title: 'Do the thing' });
    const end = node('END');
    const issues = validateExecutable(
      graph([start, task, end], [edge(start.id, task.id), edge(task.id, end.id)]),
    );
    expect(issues).toEqual([]);
  });

  it('reports a missing START node', () => {
    const a = node('TASK');
    const end = node('END');
    const issues = validateExecutable(graph([a, end], [edge(a.id, end.id)]));
    expect(issues.some((issue) => issue.code === 'NO_START')).toBe(true);
  });

  it('reports a missing END node', () => {
    const start = node('START');
    const a = node('TASK');
    const issues = validateExecutable(graph([start, a], [edge(start.id, a.id)]));
    expect(issues.some((issue) => issue.code === 'NO_END')).toBe(true);
  });

  it('reports a cycle', () => {
    const start = node('START');
    const a = node('TASK');
    const b = node('TASK');
    const end = node('END');
    const issues = validateExecutable(
      graph(
        [start, a, b, end],
        [
          edge(start.id, a.id),
          edge(a.id, b.id),
          edge(b.id, a.id),
          edge(b.id, end.id),
        ],
      ),
    );
    expect(issues.some((issue) => issue.code === 'CYCLE')).toBe(true);
  });

  it('reports a task node with no title', () => {
    const start = node('START');
    const untitled = node('TASK', { title: '' });
    const end = node('END');
    const issues = validateExecutable(
      graph([start, untitled, end], [edge(start.id, untitled.id), edge(untitled.id, end.id)]),
    );
    expect(issues.some((issue) => issue.code === 'TASK_NEEDS_TITLE')).toBe(true);
  });

  it('reports a decision with fewer than two branches', () => {
    // A decision with one exit is just a task, and with none it dead-ends the
    // run — both are authoring mistakes worth flagging.
    const start = node('START');
    const decision = node('DECISION');
    const end = node('END');
    const issues = validateExecutable(
      graph([start, decision, end], [edge(start.id, decision.id), edge(decision.id, end.id)]),
    );
    expect(issues.some((issue) => issue.code === 'DECISION_NEEDS_BRANCHES')).toBe(true);
  });

  it('reports a node that cannot continue execution', () => {
    const start = node('START');
    const deadEnd = node('TASK');
    const end = node('END');
    const issues = validateExecutable(
      graph([start, deadEnd, end], [edge(start.id, deadEnd.id)]),
    );
    expect(issues.some((issue) => issue.code === 'DEAD_END')).toBe(true);
  });

  it('reports an END node with outgoing edges', () => {
    const start = node('START');
    const end = node('END');
    const extra = node('TASK');
    const issues = validateExecutable(
      graph(
        [start, end, extra],
        [edge(start.id, end.id), edge(end.id, extra.id), edge(start.id, extra.id)],
      ),
    );
    expect(issues.some((issue) => issue.code === 'END_HAS_OUTGOING')).toBe(true);
  });

  it('reports unreachable nodes', () => {
    const start = node('START');
    const end = node('END');
    const orphan = node('TASK');
    const issues = validateExecutable(
      graph([start, end, orphan], [edge(start.id, end.id), edge(orphan.id, end.id)]),
    );
    expect(issues.some((issue) => issue.code === 'UNREACHABLE_NODES')).toBe(true);
  });

  it('reports multiple independent problems at once', () => {
    // Returning the first issue only would make the builder point at one
    // problem, the user fix it, then be told about the next.
    const a = node('TASK', { title: '' });
    const b = node('TASK');
    const issues = validateExecutable(graph([a, b], [edge(a.id, b.id)]));
    expect(issues.length).toBeGreaterThan(1);
    expect(issues.some((issue) => issue.code === 'NO_START')).toBe(true);
    expect(issues.some((issue) => issue.code === 'TASK_NEEDS_TITLE')).toBe(true);
  });
});

/**
 * Dangling edges are rejected by the Zod schema rather than the graph walker.
 * That split is deliberate: the schema is the single gate every write passes
 * through, so referential integrity is enforced there and the traversal helpers
 * stay simple. Documented here so the division is not mistaken for a gap.
 */
describe('edge referential integrity lives in the schema', () => {
  it('is not part of validateExecutable', () => {
    const start = node('START');
    const end = node('END');
    const issues = validateExecutable(
      graph([start, end], [edge(start.id, end.id), edge(end.id, 'ghost')]),
    );
    expect(issues.some((issue) => issue.code === 'DANGLING_EDGE')).toBe(false);
    // The real guard is workflowGraphSchema.superRefine, covered in
    // tests/unit/workflow-schema.test.ts.
  });
});

describe('evaluateCondition', () => {
  const facts = { status: 'COMPLETED', priority: 'HIGH', title: 'Design review' } as never;

  it('reports a failure result for an empty expression', () => {
    const result = evaluateCondition('', facts);
    expect(result.ok).toBe(false);
  });

  it('never throws on a malformed expression', () => {
    // Conditions come from stored workflow config, so a parse failure must be a
    // result the engine can log and route around, not an exception that kills
    // the whole run.
    for (const expression of ['((', '==', 'status ==', '&&&', 'status ===== "x"']) {
      expect(() => evaluateCondition(expression, facts)).not.toThrow();
      expect(evaluateCondition(expression, facts).ok).toBe(false);
    }
  });

  it('evaluates a valid comparison to a boolean', () => {
    const result = evaluateCondition('status == "COMPLETED"', facts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value).toBe('boolean');
  });

  it('gives an unmatched condition ok:true with value false', () => {
    // "did not match" and "could not be parsed" are different outcomes: the
    // engine takes the other branch for the first, and the default branch for
    // the second. Collapsing them would hide authoring errors.
    const result = evaluateCondition('status == "PENDING"', facts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  it('rejects an expression that is too long', () => {
    expect(evaluateCondition('a'.repeat(600), facts).ok).toBe(false);
  });
});
