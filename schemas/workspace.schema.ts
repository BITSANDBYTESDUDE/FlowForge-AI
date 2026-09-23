import { z } from 'zod';
import { WORKSPACE_ROLES } from '@/types/workspace';

export const workspaceSettingsSchema = z.object({
  defaultWorkflowStatus: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
  allowGuestViewers: z.boolean().default(false),
  aiEnabled: z.boolean().default(true),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
    .optional(),
  logo: z.string().url().max(500).nullish(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    logo: z.string().url().max(500).nullish(),
    settings: workspaceSettingsSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const inviteMemberSchema = z.object({
  /** Email of an existing FlowForge user. Invitation emails are out of scope. */
  email: z.string().email('Enter a valid email address').max(254),
  role: z.enum(WORKSPACE_ROLES).default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
