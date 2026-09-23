import type { ApiResponse } from '@/lib/utils/api';

/**
 * Browser API client.
 *
 * The server always answers with `{ success, data }` or `{ success, error }`,
 * so this module is the one place that unwraps that envelope. Callers get typed
 * data or a thrown `ApiError`, which means component code never has to inspect a
 * `success` flag or guess at an error shape.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.code === 'NETWORK_ERROR' || this.code === 'RATE_LIMITED';
  }

  /** Field-level messages, for surfacing validation errors next to inputs. */
  get fieldErrors(): Record<string, string> {
    const issues = this.details?.issues;
    if (!Array.isArray(issues)) return {};
    const out: Record<string, string> = {};
    for (const issue of issues) {
      if (typeof issue !== 'object' || issue === null) continue;
      const { path, message } = issue as { path?: unknown; message?: unknown };
      if (typeof path === 'string' && typeof message === 'string') out[path] = message;
    }
    return out;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  /** Serialised as JSON when present. */
  body?: unknown;
  /** Query parameters; `undefined` and `null` entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

function buildUrl(path: string, params?: RequestOptions['params']): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Performs a request and unwraps the API envelope.
 *
 * Network failures are normalised into `ApiError` so callers only ever handle
 * one error type. 401s are not auto-redirected here; the caller decides whether
 * a redirect is appropriate (a background query should not yank the page).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.', 0);
  }

  // A 204 or an empty body has nothing to unwrap.
  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'INTERNAL_ERROR',
      'The server returned an unreadable response',
      response.status,
    );
  }

  const envelope = payload as ApiResponse<T>;

  if (!envelope || typeof envelope !== 'object' || !('success' in envelope)) {
    throw new ApiError('INTERNAL_ERROR', 'The server returned an unexpected response', response.status);
  }

  if (!envelope.success) {
    throw new ApiError(
      envelope.error.code as ApiErrorCode,
      envelope.error.message,
      response.status,
      envelope.error.details,
    );
  }

  return envelope.data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

/** Extracts a user-facing message from any thrown value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
