/**
 * Application error taxonomy.
 *
 * Every API route converts thrown errors into the uniform envelope described in
 * `lib/utils/api.ts`. Errors carry an HTTP status and a stable machine-readable
 * code so clients never have to string-match on messages, and internal details
 * (Mongo error text, stack traces) are never serialised to a response body.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCodeValue,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The submitted data is invalid', details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'You must be signed in to perform this action') {
    super(ErrorCode.UNAUTHENTICATED, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(ErrorCode.FORBIDDEN, message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The resource already exists') {
    super(ErrorCode.CONFLICT, message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please slow down and try again shortly.') {
    super(ErrorCode.RATE_LIMITED, message, 429);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(message = 'That state change is not allowed') {
    super(ErrorCode.INVALID_TRANSITION, message, 409);
  }
}

export class AiUnavailableError extends AppError {
  constructor(message = 'The AI service is not configured or temporarily unavailable') {
    super(ErrorCode.AI_UNAVAILABLE, message, 503);
  }
}

export class AiInvalidOutputError extends AppError {
  constructor(message = 'The AI returned a response that failed validation') {
    super(ErrorCode.AI_INVALID_OUTPUT, message, 502);
  }
}
