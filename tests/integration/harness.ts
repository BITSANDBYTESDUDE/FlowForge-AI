/**
 * Integration test harness.
 *
 * These tests run against a real MongoDB instance: no mocks, no in-memory
 * substitute. The behaviours worth testing here — tenant isolation, permission
 * enforcement after a membership changes, the unique index on Workspace.slug,
 * execution state transitions driven by task completion — are produced by
 * MongoDB semantics and the service layer together. A stubbed database would
 * assert that our fakes behave like our fakes.
 *
 * The database name comes from `MONGODB_URI`, which tests/setup.ts points at a
 * throwaway `flowforge-test` database — never the development one, since
 * `clearDatabase` deletes everything it can find. Every test file clears between
 * cases, so the suite leaves no state behind.
 */
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase, ensureIndexes } from '@/lib/db/connect';
import type { WorkflowGraphInput } from '@/schemas/workflow.schema';
import { listTasksQuerySchema } from '@/schemas/task.schema';

/**
 * Collections that hold tenant data; cleared between tests for isolation.
 *
 * Names are read from the models themselves rather than hardcoded. Hand-written
 * names have to match Mongoose's pluralisation exactly, and a typo fails
 * silently: `deleteMany` on a collection that does not exist is a no-op, so the
 * data simply survives and later assertions compare against stale rows. Only the
 * Better Auth collections (`session`, `account`, `verification`) are named
 * literally, since this app declares no models for them.
 */
const AUTH_COLLECTIONS = ['session', 'account', 'verification'];

async function tenantCollections(): Promise<string[]> {
  const models = await import('@/models');

  // `@/models` exports both Mongoose models and plain values (enums, category
  // tuples, types are erased at runtime). Mongoose models are the only exports
  // carrying a `collection`, which is what distinguishes them.
  const owned = Object.values(models).flatMap((value) => {
    if (typeof value !== 'function') return [];
    const candidate = value as { collection?: { name?: string } };
    const name = candidate.collection?.name;
    return typeof name === 'string' ? [name] : [];
  });

  return [...new Set([...owned, ...AUTH_COLLECTIONS])];
}

export async function connectTestDatabase(): Promise<void> {
  await connectToDatabase();

  // `clearDatabase` routinely deletes every document it can reach. Pointing
  // MONGODB_URI at a development or production database would silently destroy
  // real data on the first test, so refuse rather than trust the caller.
  const databaseName = mongoose.connection.db?.databaseName ?? '';
  if (!databaseName.endsWith('-test')) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}". ` +
        'Set MONGODB_URI to a database whose name ends in "-test" (e.g. flowforge-test).',
    );
  }

  // Unique indexes are what several assertions rely on, and Mongoose builds them
  // in the background; without this a test could pass before the index exists.
  await ensureIndexes();
}

export async function disconnectTestDatabase(): Promise<void> {
  await disconnectFromDatabase();
}

/**
 * Removes every document but keeps the collections and their indexes, which is
 * faster than dropping the database and preserves index-based assertions.
 */
export async function clearDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const names = await tenantCollections();
  await Promise.all(names.map((name) => db.collection(name).deleteMany({})));
}

let userCounter = 0;

/** Creates a real user document. Credentials are not needed for service tests. */
export async function createTestUser(
  overrides: Partial<{ name: string; email: string; plan: 'FREE' | 'PRO' | 'TEAM' }> = {},
): Promise<{ id: string; email: string; name: string }> {
  userCounter += 1;
  const email = overrides.email ?? `user-${userCounter}-${Date.now()}@example.test`;
  const name = overrides.name ?? `Test User ${userCounter}`;

  const { User } = await import('@/models');
  const user = await User.create({ name, email, plan: overrides.plan ?? 'FREE' });
  return { id: user._id.toString(), email: user.email, name: user.name };
}

/**
 * A workspace plus its owner membership, created through the service so the
 * ownership row and audit trail are exactly what a real signup produces.
 */
export async function createTestWorkspace(
  ownerId: string,
  overrides: Partial<{ name: string; slug: string }> = {},
): Promise<{ id: string; ownerId: string; name: string; slug: string }> {
  const { createWorkspace } = await import('@/services/workspace.service');
  const workspace = await createWorkspace(ownerId, {
    name: overrides.name ?? 'Integration Workspace',
    slug: overrides.slug,
  });
  return {
    id: workspace.id,
    ownerId: workspace.ownerId,
    name: workspace.name,
    slug: workspace.slug,
  };
}

/**
 * Adds a member at the given role directly, standing in for a prior invite.
 *
 * Returns the *membership* id, not the user id: role changes and removals in the
 * service layer identify a member by their membership row.
 */
export async function addMember(
  workspaceId: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER' | 'VIEWER',
): Promise<string> {
  const { Membership } = await import('@/models');
  const membership = await Membership.create({ workspaceId, userId, role, permissions: [] });
  return membership._id.toString();
}

/** Looks up an existing membership row's id for a user in a workspace. */
export async function findMembershipId(workspaceId: string, userId: string): Promise<string> {
  const { Membership } = await import('@/models');
  const membership = await Membership.findOne({ workspaceId, userId }).select('_id').lean();
  if (!membership) throw new Error(`No membership for user ${userId} in workspace ${workspaceId}`);
  return membership._id.toString();
}

/**
 * Builds list-query options the way the API route does.
 *
 * Parsed through `listTasksQuerySchema` so the tests inherit the real defaults
 * (sort, order, overdue, page, limit). Hand-copying them here would let a schema
 * change silently desync the tests from request handling.
 */
export function taskQuery(workspaceId: string) {
  const parsed = listTasksQuerySchema.safeParse({ workspaceId, page: '1', limit: '20' });
  if (!parsed.success) {
    throw new Error(`Invalid test task query: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

/**
 * A minimal executable graph: START -> TASK -> END.
 *
 * Small on purpose — these tests target permissions and state transitions, and a
 * larger graph would only add noise to a failure.
 */
export function linearGraph(): WorkflowGraphInput {
  return {
    nodes: [
      {
        id: 'start',
        type: 'START',
        title: 'Start',
        description: '',
        position: { x: 0, y: 0 },
        config: {},
        metadata: {},
      },
      {
        id: 'work',
        type: 'TASK',
        title: 'Do the work',
        description: '',
        position: { x: 0, y: 120 },
        config: {},
        metadata: {},
      },
      {
        id: 'end',
        type: 'END',
        title: 'End',
        description: '',
        position: { x: 0, y: 240 },
        config: {},
        metadata: {},
      },
    ],
    edges: [
      { id: 'e-start-work', source: 'start', target: 'work' },
      { id: 'e-work-end', source: 'work', target: 'end' },
    ],
  };
}
