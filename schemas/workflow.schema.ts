import { z } from 'zod';
import {
  AUTOMATIC_NODE_TYPES,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_STATUSES,
} from '@/types/workflow';

/** Mongo ObjectId as a 24-character hex string. */
export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid identifier');

export const nodeIdSchema = z
  .string()
  .min(1, 'Node id is required')
  .max(80, 'Node id is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'Node id may only contain letters, numbers, dashes and underscores');

/**
 * Node positions come from React Flow and are floats in practice; we round on
 * write so snapshots diff cleanly and version comparison stays meaningful.
 */
export const positionSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});

export const nodeConfigSchema = z
  .object({
    conditions: z
      .array(
        z.object({
          label: z.string().min(1).max(200),
          expression: z.string().min(1).max(500),
        }),
      )
      .max(20)
      .optional(),
    approvers: z.array(objectIdSchema).max(50).optional(),
    delayMinutes: z.number().int().min(0).max(525_600).optional(),
    message: z.string().max(1000).optional(),
    prompt: z.string().max(4000).optional(),
  })
  // Unknown keys are stripped rather than rejected: integration configs are
  // additive and a newer client must not be blocked by an older server.
  .passthrough();

export const workflowNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.enum(WORKFLOW_NODE_TYPES),
  title: z.string().min(1, 'Every node needs a title').max(200),
  // `.default()` alone keeps the *output* type required while the input stays
  // optional. Chaining `.optional().default()` would widen the output back to
  // `string | undefined`, which then leaks into every consumer.
  description: z.string().max(2000).default(''),
  position: positionSchema,
  assigneeId: objectIdSchema.nullish(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .nullish()
    .or(z.literal('').transform(() => null)),
  config: nodeConfigSchema.default({}),
  metadata: z.record(z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(80),
  source: nodeIdSchema,
  target: nodeIdSchema,
  condition: z.string().max(500).nullish(),
  label: z.string().max(200).nullish(),
});

/**
 * Graph-level validation beyond per-field shapes.
 *
 * These are the invariants that make a workflow *executable*: edges must
 * reference real nodes, exactly one START is allowed, ids are unique, and there
 * are no self-loops. Rejecting them here keeps the execution engine free of
 * defensive branches.
 */
export const workflowGraphSchema = z
  .object({
    nodes: z.array(workflowNodeSchema).min(1, 'A workflow needs at least one node').max(200),
    edges: z.array(workflowEdgeSchema).max(500),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes'],
          message: `Duplicate node id "${node.id}"`,
        });
      }
      ids.add(node.id);
    }

    const starts = graph.nodes.filter((n) => n.type === 'START');
    if (starts.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: 'A workflow may contain at most one START node',
      });
    }

    const edgeIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Duplicate edge id "${edge.id}"`,
        });
      }
      edgeIds.add(edge.id);

      if (!ids.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Edge "${edge.id}" references unknown source "${edge.source}"`,
        });
      }
      if (!ids.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Edge "${edge.id}" references unknown target "${edge.target}"`,
        });
      }
      if (edge.source === edge.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Edge "${edge.id}" connects a node to itself`,
        });
      }
    }

    // DECISION nodes branch, so they need at least one outgoing edge; otherwise
    // an execution would silently stall.
    for (const node of graph.nodes) {
      if (node.type === 'DECISION') {
        const outgoing = graph.edges.filter((e) => e.source === node.id);
        if (outgoing.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes'],
            message: `Decision "${node.title}" needs at least two outgoing branches`,
          });
        }
      }
    }
  });

export const createWorkflowSchema = z.object({
  workspaceId: objectIdSchema,
  name: z.string().min(1, 'Name is required').max(160),
  description: z.string().max(2000).optional(),
  status: z.enum(WORKFLOW_STATUSES).default('DRAFT'),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  graph: workflowGraphSchema.optional(),
});

export const updateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).nullish(),
    status: z.enum(WORKFLOW_STATUSES).optional(),
    tags: z.array(z.string().min(1).max(40)).max(12).optional(),
    graph: workflowGraphSchema.optional(),
    changeSummary: z.string().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listWorkflowsQuerySchema = z.object({
  workspaceId: objectIdSchema,
  status: z.enum(WORKFLOW_STATUSES).optional(),
  tag: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const restoreVersionSchema = z.object({
  version: z.coerce.number().int().min(1),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type WorkflowGraphInput = z.infer<typeof workflowGraphSchema>;
export type WorkflowNodeInput = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdgeInput = z.infer<typeof workflowEdgeSchema>;

export { AUTOMATIC_NODE_TYPES };
