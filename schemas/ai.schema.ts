import { z } from 'zod';
import { objectIdSchema } from './workflow.schema';

/**
 * Request schemas for the AI endpoints.
 *
 * Descriptions are length-bounded because they are forwarded to a paid model:
 * an unbounded prompt is a direct cost and latency risk. The bounds are enforced
 * here (the trust boundary) rather than only in the UI.
 */

const descriptionSchema = z
  .string()
  .trim()
  .min(10, 'Describe the process in at least a few words')
  .max(4000, 'Keep the description under 4000 characters');

export const generateWorkflowSchema = z.object({
  workspaceId: objectIdSchema,
  description: descriptionSchema,
  /**
   * Returns the validated graph without persisting it, so a user can review a
   * generated workflow before it lands in their workspace.
   */
  dryRun: z.boolean().default(false),
});

export const improveWorkflowSchema = z
  .object({
    workspaceId: objectIdSchema,
    /** Either an existing workflow... */
    workflowId: objectIdSchema.optional(),
    /** ...or the graph itself, so unsaved builder edits can be analysed. */
    graph: z
      .object({
        nodes: z.array(z.unknown()).min(1, 'The workflow has no steps to analyse').max(200),
        edges: z.array(z.unknown()).max(400),
      })
      .optional(),
    /** Optional steering, e.g. "make this faster" or "add compliance checks". */
    goal: z.string().trim().max(500).optional(),
  })
  .refine((value) => Boolean(value.workflowId || value.graph), {
    message: 'Provide either a workflowId or a graph to analyse',
  });

export const generateTasksSchema = z.object({
  workspaceId: objectIdSchema,
  workflowId: objectIdSchema,
  /** Node ids to turn into tasks; omitted means every task-like node. */
  nodeIds: z.array(z.string().min(1).max(120)).max(100).optional(),
  /** Creates the tasks instead of only returning suggestions. */
  persist: z.boolean().default(false),
});

export const summarizeWorkflowSchema = z.object({
  workspaceId: objectIdSchema,
  workflowId: objectIdSchema.optional(),
  graph: z
    .object({
      nodes: z.array(z.unknown()).min(1).max(200),
      edges: z.array(z.unknown()).max(400),
    })
    .optional(),
});

export type GenerateWorkflowRequest = z.infer<typeof generateWorkflowSchema>;
export type ImproveWorkflowRequest = z.infer<typeof improveWorkflowSchema>;
export type GenerateTasksRequest = z.infer<typeof generateTasksSchema>;
export type SummarizeWorkflowRequest = z.infer<typeof summarizeWorkflowSchema>;
