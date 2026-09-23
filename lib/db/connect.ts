import mongoose from 'mongoose';
import { MongoClient, type Db } from 'mongodb';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

/**
 * Mongoose owns the application's domain models. Better Auth needs a raw
 * driver `Db`, so both share one underlying client — two pools against the same
 * cluster would double connection pressure for no benefit.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  client: MongoClient | null;
};

const globalForMongoose = globalThis as unknown as { __flowforgeMongoose?: MongooseCache };

const cache: MongooseCache = globalForMongoose.__flowforgeMongoose ?? {
  conn: null,
  promise: null,
  client: null,
};

// Next.js dev server re-evaluates modules on every HMR pass; without this the
// process would open a new pool per edit until Mongo refuses connections.
globalForMongoose.__flowforgeMongoose = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = getEnv().MONGODB_URI;
    mongoose.set('strictQuery', true);
    // Mongoose buffers commands by default, which turns a misconfigured URI into
    // a long hang per request. Failing fast surfaces the real problem immediately.
    mongoose.set('bufferCommands', false);

    cache.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8_000,
        socketTimeoutMS: 45_000,
      })
      .then((instance) => {
        cache.client = instance.connection.getClient() as unknown as MongoClient;
        logger.info('Connected to MongoDB');
        return instance;
      })
      .catch((error) => {
        cache.promise = null;
        logger.error('MongoDB connection failed', { error });
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/** Raw driver handle for Better Auth's adapter. */
export async function getMongoDb(): Promise<Db> {
  const instance = await connectToDatabase();
  if (!cache.client) {
    cache.client = instance.connection.getClient() as unknown as MongoClient;
  }
  const dbName = instance.connection.name;
  if (!dbName) throw new Error('MongoDB connection has no database name');
  return cache.client.db(dbName);
}

/** True once a connection has been established in this process. */
export function isDatabaseConnected(): boolean {
  return cache.conn !== null && mongoose.connection.readyState === 1;
}

/**
 * Ensures every registered model's declared indexes exist on the server.
 *
 * Mongoose builds indexes in the background after the first model use, so a
 * short-lived process that writes data and exits immediately (the seed script,
 * a migration) can finish with **no** indexes created — queries then fall back to
 * collection scans and the unique constraints that protect `User.email` and
 * `Workspace.slug` are not enforced at all.
 *
 * `syncIndexes` both creates missing indexes and drops ones no longer declared,
 * so it is the right tool for an explicit operator-run task. Callers should
 * await this before disconnecting.
 */
export async function ensureIndexes(): Promise<void> {
  const results = await Promise.all(
    Object.values(mongoose.models).map(async (model) => {
      try {
        const dropped = await model.syncIndexes();
        return { model: model.modelName, dropped: dropped.length, error: null as string | null };
      } catch (error) {
        // One model failing must not stop the others; report and continue.
        return {
          model: model.modelName,
          dropped: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  for (const result of results) {
    if (result.error) {
      logger.warn(`Index sync failed for ${result.model}: ${result.error}`);
    } else {
      logger.info(`Indexes synced for ${result.model}`);
    }
  }

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    throw new Error(`Index sync failed for ${failures.length} model(s)`);
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await mongoose.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
  cache.client = null;
}
