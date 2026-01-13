/**
 * @fileoverview Error classes for the Relay Platform
 * @module @relay/platform/utils/errors
 */

/**
 * Base error for all Relay Platform errors
 */
export class RelayError extends Error {
  /** Error code */
  code: string;
  /** HTTP status code */
  statusCode: number;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether this error is operational (expected) vs programming error */
  isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RelayError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends RelayError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_REQUIRED', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends RelayError {
  constructor(message: string = 'Permission denied', details?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends RelayError {
  constructor(resource: string = 'Resource', details?: Record<string, unknown>) {
    super(`${resource} not found`, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends RelayError {
  /** Field-specific errors */
  fieldErrors: Record<string, string[]>;

  constructor(message: string = 'Validation failed', fieldErrors: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR', 400, { fieldErrors });
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends RelayError {
  constructor(message: string = 'Resource conflict', details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends RelayError {
  /** When rate limit resets */
  retryAfter: number;

  constructor(retryAfter: number = 60, details?: Record<string, unknown>) {
    super('Too many requests', 'RATE_LIMIT_EXCEEDED', 429, { ...details, retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends RelayError {
  constructor(message: string = 'Service temporarily unavailable', details?: Record<string, unknown>) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends RelayError {
  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Quota exceeded error (402)
 */
export class QuotaExceededError extends RelayError {
  /** Quota type that was exceeded */
  quotaType: string;
  /** Current usage */
  currentUsage: number;
  /** Maximum allowed */
  maxAllowed: number;

  constructor(quotaType: string, currentUsage: number, maxAllowed: number) {
    super(
      `${quotaType} quota exceeded (${currentUsage}/${maxAllowed})`,
      'QUOTA_EXCEEDED',
      402,
      { quotaType, currentUsage, maxAllowed },
    );
    this.name = 'QuotaExceededError';
    this.quotaType = quotaType;
    this.currentUsage = currentUsage;
    this.maxAllowed = maxAllowed;
  }
}

/**
 * Token error (401)
 */
export class TokenError extends RelayError {
  constructor(
    message: string,
    code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_REVOKED' | 'TOKEN_MISSING' = 'TOKEN_INVALID',
  ) {
    super(message, code, 401);
    this.name = 'TokenError';
  }
}

/**
 * Check if an error is a Relay error
 */
export function isRelayError(error: unknown): error is RelayError {
  return error instanceof RelayError;
}

/**
 * Check if an error is operational (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (isRelayError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap an unknown error into a RelayError
 */
export function wrapError(error: unknown): RelayError {
  if (isRelayError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, { originalError: error.name });
  }

  return new InternalError('An unknown error occurred');
}

/**
 * Create an error response object
 */
export function createErrorResponse(error: RelayError): {
  statusCode: number;
  body: Record<string, unknown>;
} {
  return {
    statusCode: error.statusCode,
    body: error.toJSON(),
  };
}
