import { z } from 'zod';
import { WORKFLOW_NODE_TYPES } from '@/types/workflow';

/**
 * Contract for AI-produced workflow graphs.
 *
 * Model output is untrusted input. This schema is intentionally *stricter* than
 * the persistence schema: the model may not invent fields, positions are
 * required (so the canvas never has to guess a layout), ids must be simple, and
 * the graph must be connected enough to be executable. Anything that fails here
 * is rejected before it can reach the database.
 */
export const aiNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/, 'Node ids must be simple identifiers'),
  type: z.enum(WORKFLOW_NODE_TYPES),
  title: z.string().min(2).max(160),
  description: z.string().max(1200).default(''),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  config: z
    .object({
      conditions: z
        .array(z.object({ label: z.string().max(160), expression: z.string().max(400) }))
        .max(10)
        .optional(),
      delayMinutes: z.number().int().min(0).max(525_600).optional(),
      message: z.string().max(800).optional(),
      prompt: z.string().max(2000).optional(),
    })
    .default({}),
});

export const aiEdgeSchema = z.object({
  source: z.string().min(1).max(60),
  target: z.string().min(1).max(60),
  label: z.string().max(160).optional(),
  condition: z.string().max(400).optional(),
});

export const aiWorkflowSchema = z
  .object({
    name: z.string().min(2).max(160),
    description: z.string().max(1200).default(''),
    tags: z.array(z.string().min(1).max(40)).max(8).default([]),
    nodes: z.array(aiNodeSchema).min(2).max(40),
    edges: z.array(aiEdgeSchema).min(1).max(80),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const node of value.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes'],
          message: `Duplicate node id "${node.id}"`,
        });
      }
      ids.add(node.id);
    }

    if (value.nodes.filter((n) => n.type === 'START').length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: 'Generated workflow must contain exactly one START node',
      });
    }
    if (value.nodes.filter((n) => n.type === 'END').length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: 'Generated workflow must contain at least one END node',
      });
    }

    const reachable = new Set<string>();
    const start = value.nodes.find((n) => n.type === 'START');
    if (start) {
      // BFS from START. Unreachable nodes mean the model produced decorative
      // steps that the execution engine would never run.
      const queue = [start.id];
      reachable.add(start.id);
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of value.edges) {
          if (edge.source === current && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      for (const node of value.nodes) {
        if (!reachable.has(node.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes'],
            message: `Node "${node.title}" is not reachable from START`,
          });
        }
      }
    }

    for (const edge of value.edges) {
      if (!ids.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Edge references unknown source "${edge.source}"`,
        });
      }
      if (!ids.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: `Edge references unknown target "${edge.target}"`,
        });
      }
      if (edge.source === edge.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: 'Edge connects a node to itself',
        });
      }
    }
  });

export const aiTaskListSchema = z.object({
  tasks: z
    .array(
      z.object({
        nodeId: z.string().min(1).max(60),
        title: z.string().min(2).max(200),
        description: z.string().max(2000).default(''),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
        estimatedDays: z.number().min(0).max(365).optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const aiImprovementSchema = z.object({
  summary: z.string().min(1).max(1200),
  suggestions: z
    .array(
      z.object({
        kind: z.enum([
          'MISSING_STEP',
          'UNNECESSARY_STEP',
          'BOTTLENECK',
          'UNCLEAR_DEPENDENCY',
          'IMPROVEMENT',
        ]),
        title: z.string().min(2).max(160),
        detail: z.string().min(2).max(1200),
        nodeIds: z.array(z.string().max(60)).max(10).optional(),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
      }),
    )
    .max(20),
});

export const aiSummarySchema = z.object({
  summary: z.string().min(1).max(2000),
  highlights: z.array(z.string().max(300)).max(8).default([]),
  risks: z.array(z.string().max(300)).max(8).default([]),
});

export type AiWorkflowOutput = z.infer<typeof aiWorkflowSchema>;
export type AiTaskListOutput = z.infer<typeof aiTaskListSchema>;
export type AiImprovementOutput = z.infer<typeof aiImprovementSchema>;
export type AiSummaryOutput = z.infer<typeof aiSummarySchema>;
