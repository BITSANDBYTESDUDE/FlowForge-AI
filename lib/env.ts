import { z } from 'zod';

/**
 * Server-side environment contract.
 *
 * Everything is validated lazily so that a missing optional integration
 * (Redis, S3, OpenAI) never breaks an unrelated code path. `getEnv()` is the
 * only supported accessor — importing `process.env` directly in feature code
 * bypasses validation and is not allowed.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().optional(),
  /**
   * Development escape hatch: when OpenAI is not configured, the AI endpoints
   * fall back to a deterministic local generator instead of failing. Off unless
   * explicitly enabled, and it can only ever apply while no API key is present —
   * a configured key always takes precedence, so this can never mask a real
   * provider outage or silently substitute output in production.
   */
  AI_ALLOW_HEURISTIC_FALLBACK: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  RATE_LIMIT_AI_REQUESTS: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AI_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_REQUESTS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_API_REQUESTS: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_API_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  SEED_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Returns the validated server environment.
 *
 * In production a misconfigured environment fails loudly at first use rather
 * than silently degrading. In development we surface a readable message.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only hook so suites can inject a deterministic environment. */
export function resetEnvCache(): void {
  cached = null;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/** True when a real OpenAI key is configured. Gates AI endpoints. */
export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** True when Upstash REST credentials are present. */
export function hasRedis(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
