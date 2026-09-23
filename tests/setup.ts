/**
 * Vitest global setup.
 *
 * Unit tests target pure modules (permissions, graph helpers, condition
 * evaluation, Zod schemas, state machines), so no DOM or database is required.
 * Only the environment variables that modules read at import time are stubbed,
 * and they are obviously-fake values.
 */
// NODE_ENV is typed read-only by @types/node. Vitest already sets it to
// 'test'; this line only matters when a single file is run directly.
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = env.NODE_ENV ?? 'test';
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-not-used-for-anything-real';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/flowforge-test';
