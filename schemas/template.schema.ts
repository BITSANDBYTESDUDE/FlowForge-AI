import { z } from 'zod';
import { TEMPLATE_CATEGORIES } from '@/models/Template';
import { objectIdSchema } from './workflow.schema';

/**
 * Template request schemas.
 *
 * `category` is constrained to the known set so a typo cannot create a template
 * that no filter will ever surface.
 */

export const listTemplatesQuerySchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  search: z.string().trim().max(120).optional(),
  includeWorkspaceId: objectIdSchema.optional(),
});

export const applyTemplateSchema = z.object({
  workspaceId: objectIdSchema,
  /** Optional override; defaults to the template's own name. */
  name: z.string().trim().min(1).max(160).optional(),
});

export const createTemplateFromWorkflowSchema = z.object({
  workspaceId: objectIdSchema,
  workflowId: objectIdSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000),
  category: z.enum(TEMPLATE_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
export type CreateTemplateFromWorkflowInput = z.infer<typeof createTemplateFromWorkflowSchema>;
