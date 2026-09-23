'use client';

import { create } from 'zustand';
import type { Edge, Node, XYPosition } from '@xyflow/react';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowNodeType } from '@/types/workflow';
import { DEFAULT_NODE_CONFIG, NODE_DEFAULTS } from '@/lib/workflow/node-defaults';

/**
 * Builder state.
 *
 * Two graphs are kept side by side:
 *
 *  - `nodes`/`edges` are the live React Flow model and change on every drag.
 *  - `history` holds committed snapshots, pushed only when an edit *finishes*
 *    (drag stop, field blur, structural change).
 *
 * Pushing on every intermediate frame would make undo step through hundreds of
 * pixel positions, which is useless. `takeSnapshot` is what the caller decides
 * counts as one undoable action.
 *
 * The canonical persisted shape is `WorkflowNode`/`WorkflowEdge` — React Flow's
 * `data` bag is only a rendering convenience and is flattened on save.
 */

export type BuilderNodeData = {
  title: string;
  description: string;
  nodeType: WorkflowNodeType;
  assigneeId: string | null;
  dueDate: string | null;
  config: Record<string, unknown>;
};

export type BuilderNode = Node<BuilderNodeData>;
export type BuilderEdge = Edge;

type Snapshot = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

type BuilderState = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  history: Snapshot[];
  future: Snapshot[];
  dirty: boolean;

  setGraph: (graph: WorkflowGraph) => void;
  onNodesChange: (changes: Parameters<typeof applyNodeChanges<BuilderNode>>[0]) => void;
  onEdgesChange: (changes: Parameters<typeof applyEdgeChanges<BuilderEdge>>[0]) => void;
  onConnect: (connection: Parameters<typeof addEdge<BuilderEdge>>[0]) => void;

  addNode: (type: WorkflowNodeType, position: XYPosition) => string;
  updateNodeData: (nodeId: string, patch: Partial<BuilderNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;

  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;

  takeSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  markClean: () => void;
  autoLayout: () => void;
  toGraph: () => WorkflowGraph;
};

const MAX_HISTORY = 50;

/** React Flow's `Node`/`Edge` objects carry runtime fields we do not persist. */
function cloneSnapshot(state: Pick<BuilderState, 'nodes' | 'edges'>): Snapshot {
  return {
    nodes: state.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data, config: { ...node.data.config } },
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

function toBuilderNode(node: WorkflowNode): BuilderNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      title: node.title,
      description: node.description ?? '',
      nodeType: node.type,
      assigneeId: node.assigneeId ?? null,
      dueDate: node.dueDate ?? null,
      config: node.config ?? {},
    },
  };
}

function toBuilderEdge(edge: WorkflowEdge): BuilderEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined,
    data: { condition: edge.condition ?? null },
  };
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  history: [],
  future: [],
  dirty: false,

  setGraph: (graph) =>
    set({
      nodes: graph.nodes.map(toBuilderNode),
      edges: graph.edges.map(toBuilderEdge),
      history: [],
      future: [],
      dirty: false,
      selectedNodeId: null,
      selectedEdgeId: null,
    }),

  onNodesChange: (changes) => {
    // Position changes stream continuously during a drag; `dragging` false marks
    // the commit, and that is when a snapshot is worth taking.
    const finishedDrag = changes.some(
      (change) => change.type === 'position' && change.dragging === false,
    );
    const removed = changes.some((change) => change.type === 'remove');

    if (finishedDrag || removed) get().takeSnapshot();

    set({
      nodes: applyNodeChanges(changes, get().nodes),
      dirty: true,
    });
  },

  onEdgesChange: (changes) => {
    if (changes.some((change) => change.type === 'remove')) get().takeSnapshot();
    set({
      edges: applyEdgeChanges(changes, get().edges),
      dirty: true,
    });
  },

  onConnect: (connection) => {
    // Reject self-loops here as well as in the schema; React Flow allows them by
    // default and a self-loop stalls the execution engine.
    if (connection.source === connection.target) return;

    get().takeSnapshot();
    const edges = addEdge(
      { ...connection, id: `edge-${crypto.randomUUID()}` },
      get().edges,
    );
    set({ edges, dirty: true });
  },

  addNode: (type, position) => {
    get().takeSnapshot();

    const id = `node-${crypto.randomUUID()}`;
    const defaults = NODE_DEFAULTS[type];
    const node: BuilderNode = {
      id,
      type,
      position,
      data: {
        title: defaults.title,
        description: '',
        nodeType: type,
        assigneeId: null,
        dueDate: null,
        config: { ...DEFAULT_NODE_CONFIG[type] },
      },
    };

    set({
      nodes: [...get().nodes, node],
      selectedNodeId: id,
      selectedEdgeId: null,
      dirty: true,
    });
    return id;
  },

  updateNodeData: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
      dirty: true,
    });
  },

  deleteNode: (nodeId) => {
    get().takeSnapshot();
    set({
      // Removing a node must also remove its edges; leaving them would persist
      // edges referencing a node that no longer exists, which the schema rejects.
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      selectedNodeId: null,
      dirty: true,
    });
  },

  duplicateNode: (nodeId) => {
    const source = get().nodes.find((node) => node.id === nodeId);
    if (!source) return;

    get().takeSnapshot();
    const id = `node-${crypto.randomUUID()}`;
    set({
      nodes: [
        ...get().nodes,
        {
          ...source,
          id,
          position: { x: source.position.x + 40, y: source.position.y + 40 },
          selected: false,
          data: {
            ...source.data,
            title: `${source.data.title} (copy)`,
            config: { ...source.data.config },
          },
        },
      ],
      selectedNodeId: id,
      dirty: true,
    });
  },

  deleteEdge: (edgeId) => {
    get().takeSnapshot();
    set({ edges: get().edges.filter((edge) => edge.id !== edgeId), dirty: true });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

  takeSnapshot: () => {
    const snapshot = cloneSnapshot(get());
    set({
      history: [...get().history, snapshot].slice(-MAX_HISTORY),
      // Any new edit invalidates the redo stack.
      future: [],
    });
  },

  undo: () => {
    const history = get().history;
    const previous = history[history.length - 1];
    if (!previous) return;

    const current = cloneSnapshot(get());

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      history: history.slice(0, -1),
      future: [current, ...get().future].slice(0, MAX_HISTORY),
      dirty: true,
      // The restored graph may not contain the previously selected ids.
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  redo: () => {
    const future = get().future;
    const next = future[0];
    if (!next) return;

    const current = cloneSnapshot(get());

    set({
      nodes: next.nodes,
      edges: next.edges,
      future: future.slice(1),
      history: [...get().history, current].slice(-MAX_HISTORY),
      dirty: true,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  markClean: () =>
    set({
      dirty: false,
      history: [],
      future: [],
      // Positions are rounded on save, so the stored snapshot must reflect that
      // or the next save would look like a change.
      nodes: get().nodes.map((node) => ({
        ...node,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      })),
    }),

  /**
   * Single-pass layered layout.
   *
   * Nodes are assigned a depth by longest path from a START node, then stacked
   * within each layer. A full graph-layout library would be overkill for graphs
   * that are typically a few dozen nodes.
   */
  autoLayout: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;

    get().takeSnapshot();

    const depth = new Map<string, number>();

    const roots = nodes.filter((node) => node.data.nodeType === 'START').map((node) => node.id);
    const seeds = roots.length > 0 ? roots : nodes[0] ? [nodes[0].id] : [];
    const queue: { id: string; level: number }[] = seeds.map((id) => ({ id, level: 0 }));

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      const current = depth.get(id);
      if (current !== undefined && current >= level) continue;
      depth.set(id, level);

      for (const edge of edges.filter((candidate) => candidate.source === id)) {
        queue.push({ id: edge.target, level: level + 1 });
      }
    }

    // Unreached nodes (orphans, cycles) go after everything that was reachable.
    const maxReached = depth.size > 0 ? Math.max(...depth.values()) : 0;
    for (const node of nodes) {
      if (!depth.has(node.id)) depth.set(node.id, maxReached + 1);
    }

    const COLUMN_WIDTH = 260;
    const ROW_HEIGHT = 130;
    const rowCounts = new Map<number, number>();

    set({
      nodes: nodes.map((node) => {
        const level = depth.get(node.id) ?? 0;
        const row = rowCounts.get(level) ?? 0;
        rowCounts.set(level, row + 1);
        return { ...node, position: { x: level * COLUMN_WIDTH, y: row * ROW_HEIGHT } };
      }),
      dirty: true,
    });
  },

  toGraph: () => ({
    nodes: get().nodes.map((node) => {
      const dueDate = node.data.dueDate;
      return {
        id: node.id,
        type: node.data.nodeType,
        title: node.data.title.trim() || 'Untitled step',
        description: node.data.description,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        assigneeId: node.data.assigneeId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        config: node.data.config,
        metadata: {},
      };
    }),
    edges: get().edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition:
        typeof edge.data?.condition === 'string' && edge.data.condition
          ? edge.data.condition
          : null,
      label: typeof edge.label === 'string' && edge.label ? edge.label : null,
    })),
  }),
}));
