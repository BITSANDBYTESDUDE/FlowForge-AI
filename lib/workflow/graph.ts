import type { WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowNodeType } from '@/types/workflow';

/**
 * Pure graph helpers.
 *
 * Kept free of database and React dependencies so the same topology logic backs
 * the builder's validation, the execution engine's traversal, and the unit
 * tests. Node ids are treated as opaque strings throughout.
 */

export function findStartNode(nodes: WorkflowNode[]): WorkflowNode | undefined {
  return nodes.find((node) => node.type === 'START');
}

export function findEndNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.filter((node) => node.type === 'END');
}

export function getOutgoingEdges(edges: WorkflowEdge[], nodeId: string): WorkflowEdge[] {
  return edges.filter((edge) => edge.source === nodeId);
}

export function getIncomingEdges(edges: WorkflowEdge[], nodeId: string): WorkflowEdge[] {
  return edges.filter((edge) => edge.target === nodeId);
}

export function getNodeById(graph: WorkflowGraph, nodeId: string): WorkflowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function buildAdjacency(edges: WorkflowEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }
  return adjacency;
}

/**
 * Nodes reachable from START.
 *
 * A node that is not reachable can never execute, so the builder and the AI
 * validator both reject graphs containing one.
 */
export function reachableFromStart(graph: WorkflowGraph): Set<string> {
  const start = findStartNode(graph.nodes);
  if (!start) return new Set();

  const adjacency = buildAdjacency(graph.edges);
  const visited = new Set<string>([start.id]);
  const queue = [start.id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * Detects a cycle.
 *
 * The execution engine advances node by node, so a cycle would let a run loop
 * forever without a human completing anything. Detected with iterative DFS
 * (recursion would overflow on a large generated graph).
 */
export function findCycle(graph: WorkflowGraph): string[] | null {
  const adjacency = buildAdjacency(graph.edges);
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const node of graph.nodes) colour.set(node.id, WHITE);

  for (const root of graph.nodes) {
    if (colour.get(root.id) !== WHITE) continue;

    const stack: { id: string; path: string[] }[] = [{ id: root.id, path: [root.id] }];
    const iterators = new Map<string, number>();

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const { id } = frame;

      if (colour.get(id) === WHITE) colour.set(id, GREY);

      const neighbours = adjacency.get(id) ?? [];
      const index = iterators.get(id) ?? 0;

      if (index >= neighbours.length) {
        colour.set(id, BLACK);
        stack.pop();
        continue;
      }

      iterators.set(id, index + 1);
      const next = neighbours[index]!;
      const nextColour = colour.get(next) ?? WHITE;

      if (nextColour === GREY) {
        const cycleStart = frame.path.indexOf(next);
        return cycleStart >= 0 ? frame.path.slice(cycleStart).concat(next) : [next];
      }
      if (nextColour === WHITE) {
        stack.push({ id: next, path: [...frame.path, next] });
      }
    }
  }
  return null;
}

/** Structural problems that make a workflow non-executable. */
export type GraphValidationIssue = { code: string; message: string; nodeIds?: string[] };

export function validateExecutable(graph: WorkflowGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];

  const start = findStartNode(graph.nodes);
  if (!start) {
    issues.push({ code: 'NO_START', message: 'Workflow has no START node' });
  }

  if (findEndNodes(graph.nodes).length === 0) {
    issues.push({ code: 'NO_END', message: 'Workflow has no END node' });
  }

  const reachable = reachableFromStart(graph);
  const orphans = graph.nodes.filter((node) => !reachable.has(node.id));
  if (start && orphans.length > 0) {
    issues.push({
      code: 'UNREACHABLE_NODES',
      message: `${orphans.length} node(s) cannot be reached from START`,
      nodeIds: orphans.map((n) => n.id),
    });
  }

  const cycle = findCycle(graph);
  if (cycle) {
    issues.push({
      code: 'CYCLE',
      message: `Workflow contains a loop: ${cycle.join(' -> ')}`,
      nodeIds: cycle,
    });
  }

  for (const node of graph.nodes) {
    const outgoing = getOutgoingEdges(graph.edges, node.id);
    if (node.type === 'DECISION' && outgoing.length < 2) {
      issues.push({
        code: 'DECISION_NEEDS_BRANCHES',
        message: `Decision "${node.title}" needs at least two outgoing branches`,
        nodeIds: [node.id],
      });
    }
    if (node.type !== 'END' && outgoing.length === 0) {
      issues.push({
        code: 'DEAD_END',
        message: `"${node.title}" has no outgoing connection, so execution cannot continue`,
        nodeIds: [node.id],
      });
    }
    if (node.type === 'END' && outgoing.length > 0) {
      issues.push({
        code: 'END_HAS_OUTGOING',
        message: `END node "${node.title}" must not have outgoing connections`,
        nodeIds: [node.id],
      });
    }
    if (node.type === 'TASK' && !node.title.trim()) {
      issues.push({
        code: 'TASK_NEEDS_TITLE',
        message: 'Every task node needs a title',
        nodeIds: [node.id],
      });
    }
  }

  return issues;
}

/** Human-readable label for a node type, used across the builder and execution UI. */
export const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  START: 'Start',
  END: 'End',
  TASK: 'Task',
  DECISION: 'Decision',
  APPROVAL: 'Approval',
  DELAY: 'Delay',
  NOTIFICATION: 'Notification',
  AI_ACTION: 'AI Action',
};
