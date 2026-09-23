import { z } from 'zod';
import { AUDIT_ACTIONS } from '@/models/AuditLog';
import { objectIdSchema } from './workflow.schema';

/**
 * Audit log request schemas.
 *
 * There is deliberately no write schema: audit rows are produced only as a side
 * effect of the actions being audited, never by a client. The absence of a
 * create/update schema is what keeps the collection append-only from the API's
 * point of view.
 */

export const listAuditLogsQuerySchema = z.object({
  workspaceId: objectIdSchema,
  /** Narrows to a single action, e.g. `ROLE_CHANGED`. */
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: objectIdSchema.optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  /** Inclusive lower bound, ISO 8601. */
  from: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  /** Inclusive upper bound, ISO 8601. */
  to: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
