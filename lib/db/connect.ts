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

/** Used by the health endpoint and test teardown. */
export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await mongoose.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
  cache.client = null;
}
