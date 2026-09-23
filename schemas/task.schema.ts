import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/types/task';
import { objectIdSchema } from './workflow.schema';

export const taskSchema = z.object({
  workspaceId: objectIdSchema,
  workflowId: objectIdSchema.nullish(),
  nodeId: z.string().max(80).nullish(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(4000).nullish(),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  assigneeId: objectIdSchema.nullish(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .nullish()
    .or(z.literal('').transform(() => null)),
  dependencies: z.array(objectIdSchema).max(50).default([]),
});

export const createTaskSchema = taskSchema;

export const updateTaskSchema = taskSchema
  .omit({ workspaceId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listTasksQuerySchema = z.object({
  workspaceId: objectIdSchema,
  workflowId: objectIdSchema.optional(),
  assigneeId: objectIdSchema.optional(),
  status: z.union([z.enum(TASK_STATUSES), z.array(z.enum(TASK_STATUSES))]).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  /** `true` returns only tasks past their due date and not yet finished. */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().max(120).optional(),
  sort: z.enum(['createdAt', 'dueDate', 'priority', 'title']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
