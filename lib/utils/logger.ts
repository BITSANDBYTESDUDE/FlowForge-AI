import { getEnv, isProduction } from '@/lib/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Keys whose values must never reach a log sink. Redaction happens before
 * serialisation so a stray `logger.info('ai call', { req })` cannot leak a key.
 */
const REDACTED_KEYS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'sessiontoken',
  'mongodb_uri',
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: isProduction() ? undefined : value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.includes(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  const env = getEnv();
  if (env.NODE_ENV === 'test' && level !== 'error') return;
  if (LEVEL_ORDER[level] < (env.NODE_ENV === 'production' ? LEVEL_ORDER.info : LEVEL_ORDER.debug)) {
    return;
  }

  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: redact(context) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
