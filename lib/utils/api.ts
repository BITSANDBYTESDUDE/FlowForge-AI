import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ErrorCode, type ErrorCodeValue } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: ErrorCodeValue; message: string; details?: Record<string, unknown> };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, init);
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export function fail(
  code: ErrorCodeValue,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/**
 * Single funnel for every route handler.
 *
 * Anything that is not an `AppError` or `ZodError` is treated as an internal
 * fault: it is logged with full context server-side and reported to the client
 * as a generic 500 so Mongo/driver internals never leak.
 */
export function handleApiError(error: unknown, context?: Record<string, unknown>): NextResponse<ApiFailure> {
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error(error.message, { ...context, code: error.code });
    return fail(error.code, error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    const details: Record<string, unknown> = {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
    return fail(ErrorCode.VALIDATION_ERROR, 'The submitted data is invalid', 400, details);
  }

  // Duplicate key violations are a client-fixable conflict, not a server fault.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    return fail(ErrorCode.CONFLICT, 'That record already exists', 409);
  }

  logger.error('Unhandled API error', { ...context, error });
  return fail(ErrorCode.INTERNAL_ERROR, 'Something went wrong on our end', 500);
}

/** Wraps a route handler so thrown errors are always converted to the envelope. */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
  context?: Record<string, unknown>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}
