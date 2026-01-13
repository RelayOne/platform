/**
 * @fileoverview Shared error classes for the Relay Platform
 * @module @relay/errors
 *
 * Provides a unified error hierarchy for all Relay Platform applications
 * (Verity, NoteMan, ShipCheck) with consistent error codes, HTTP status
 * mappings, and serialization.
 *
 * @example
 * ```typescript
 * import {
 *   RelayError,
 *   AuthenticationError,
 *   ValidationError,
 *   isRelayError,
 *   wrapError,
 * } from '@relay/errors';
 *
 * // Throw typed errors
 * throw new AuthenticationError('Invalid credentials');
 *
 * // Throw validation errors with field details
 * throw new ValidationError('Invalid input', {
 *   email: ['Invalid email format'],
 *   password: ['Password too short', 'Must contain a number'],
 * });
 *
 * // Check if an error is a Relay error
 * if (isRelayError(error)) {
 *   console.log(error.code, error.statusCode);
 * }
 *
 * // Wrap unknown errors
 * const relayError = wrapError(unknownError);
 * ```
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes used across the Relay Platform.
 * These codes are consistent with HTTP status semantics.
 */
export const ErrorCodes = {
  // Authentication (401)
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_MISSING: 'TOKEN_MISSING',

  // Authorization (403)
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ORG_ACCESS_DENIED: 'ORG_ACCESS_DENIED',
  PROJECT_ACCESS_DENIED: 'PROJECT_ACCESS_DENIED',

  // Client Errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  BAD_REQUEST: 'BAD_REQUEST',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

  // Server Errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
} as const;

/**
 * Error code type
 */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error for all Relay Platform errors.
 *
 * All platform-specific errors extend this class, providing:
 * - Consistent error code system
 * - HTTP status code mapping
 * - Structured error details
 * - Operational vs programming error distinction
 * - JSON serialization for API responses
 */
export class RelayError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  /** HTTP status code */
  readonly statusCode: number;

  /** Additional error details */
  readonly details?: Record<string, unknown>;

  /**
   * Whether this error is operational (expected) vs a programming error.
   * Operational errors are expected conditions (invalid input, auth failure).
   * Non-operational errors indicate bugs that should be fixed.
   */
  readonly isOperational: boolean;

  /** Timestamp when the error occurred */
  readonly timestamp: Date;

  /**
   * Create a new RelayError.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param statusCode - HTTP status code (default: 500)
   * @param details - Additional error details
   */
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
    this.timestamp = new Date();

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON-serializable object for API responses.
   *
   * @returns Structured error object
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  /**
   * Create a copy with additional details merged.
   *
   * @param additionalDetails - Details to merge
   * @returns New error with merged details
   */
  withDetails(additionalDetails: Record<string, unknown>): RelayError {
    return new (this.constructor as new (
      message: string,
      code: string,
      statusCode: number,
      details?: Record<string, unknown>,
    ) => RelayError)(this.message, this.code, this.statusCode, {
      ...this.details,
      ...additionalDetails,
    });
  }
}

// ============================================================================
// Authentication Errors (401)
// ============================================================================

/**
 * Authentication error (HTTP 401).
 * Thrown when authentication is required but not provided or invalid.
 */
export class AuthenticationError extends RelayError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, ErrorCodes.AUTHENTICATION_REQUIRED, 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Token error (HTTP 401).
 * Thrown for JWT/token-specific authentication failures.
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

// ============================================================================
// Authorization Errors (403)
// ============================================================================

/**
 * Authorization error (HTTP 403).
 * Thrown when user is authenticated but lacks required permissions.
 */
export class AuthorizationError extends RelayError {
  constructor(message: string = 'Permission denied', details?: Record<string, unknown>) {
    super(message, ErrorCodes.PERMISSION_DENIED, 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Organization access error (HTTP 403).
 * Thrown when user lacks access to a specific organization.
 */
export class OrganizationAccessError extends RelayError {
  readonly organizationId: string;

  constructor(organizationId: string, details?: Record<string, unknown>) {
    super(
      `Access denied to organization ${organizationId}`,
      ErrorCodes.ORG_ACCESS_DENIED,
      403,
      { organizationId, ...details },
    );
    this.name = 'OrganizationAccessError';
    this.organizationId = organizationId;
  }
}

/**
 * Project access error (HTTP 403).
 * Thrown when user lacks access to a specific project.
 */
export class ProjectAccessError extends RelayError {
  readonly projectId: string;

  constructor(projectId: string, details?: Record<string, unknown>) {
    super(
      `Access denied to project ${projectId}`,
      ErrorCodes.PROJECT_ACCESS_DENIED,
      403,
      { projectId, ...details },
    );
    this.name = 'ProjectAccessError';
    this.projectId = projectId;
  }
}

// ============================================================================
// Client Errors (4xx)
// ============================================================================

/**
 * Not found error (HTTP 404).
 * Thrown when a requested resource does not exist.
 */
export class NotFoundError extends RelayError {
  readonly resource: string;

  constructor(resource: string = 'Resource', details?: Record<string, unknown>) {
    super(`${resource} not found`, ErrorCodes.NOT_FOUND, 404, { resource, ...details });
    this.name = 'NotFoundError';
    this.resource = resource;
  }
}

/**
 * Validation error (HTTP 400).
 * Thrown when input validation fails.
 */
export class ValidationError extends RelayError {
  /** Field-specific errors */
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string = 'Validation failed', fieldErrors: Record<string, string[]> = {}) {
    super(message, ErrorCodes.VALIDATION_ERROR, 400, { fieldErrors });
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }

  /**
   * Check if a specific field has errors.
   */
  hasFieldError(field: string): boolean {
    return field in this.fieldErrors && this.fieldErrors[field].length > 0;
  }

  /**
   * Get errors for a specific field.
   */
  getFieldErrors(field: string): string[] {
    return this.fieldErrors[field] ?? [];
  }
}

/**
 * Conflict error (HTTP 409).
 * Thrown when a resource conflict occurs (e.g., duplicate creation).
 */
export class ConflictError extends RelayError {
  constructor(message: string = 'Resource conflict', details?: Record<string, unknown>) {
    super(message, ErrorCodes.CONFLICT, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error (HTTP 429).
 * Thrown when too many requests are made.
 */
export class RateLimitError extends RelayError {
  /** Seconds until rate limit resets */
  readonly retryAfter: number;

  constructor(retryAfter: number = 60, details?: Record<string, unknown>) {
    super('Too many requests', ErrorCodes.RATE_LIMIT_EXCEEDED, 429, { ...details, retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Quota exceeded error (HTTP 402).
 * Thrown when a usage quota is exceeded.
 */
export class QuotaExceededError extends RelayError {
  /** Quota type that was exceeded */
  readonly quotaType: string;
  /** Current usage */
  readonly currentUsage: number;
  /** Maximum allowed */
  readonly maxAllowed: number;

  constructor(quotaType: string, currentUsage: number, maxAllowed: number) {
    super(
      `${quotaType} quota exceeded (${currentUsage}/${maxAllowed})`,
      ErrorCodes.QUOTA_EXCEEDED,
      402,
      { quotaType, currentUsage, maxAllowed },
    );
    this.name = 'QuotaExceededError';
    this.quotaType = quotaType;
    this.currentUsage = currentUsage;
    this.maxAllowed = maxAllowed;
  }

  /**
   * Get the percentage of quota used.
   */
  get usagePercentage(): number {
    return Math.round((this.currentUsage / this.maxAllowed) * 100);
  }

  /**
   * Get how much over the quota the user is.
   */
  get overage(): number {
    return Math.max(0, this.currentUsage - this.maxAllowed);
  }
}

/**
 * Bad request error (HTTP 400).
 * Thrown for malformed requests.
 */
export class BadRequestError extends RelayError {
  constructor(message: string = 'Bad request', details?: Record<string, unknown>) {
    super(message, ErrorCodes.BAD_REQUEST, 400, details);
    this.name = 'BadRequestError';
  }
}

// ============================================================================
// Server Errors (5xx)
// ============================================================================

/**
 * Internal server error (HTTP 500).
 * Thrown for unexpected server errors.
 */
export class InternalError extends RelayError {
  constructor(message: string = 'Internal server error', details?: Record<string, unknown>) {
    super(message, ErrorCodes.INTERNAL_ERROR, 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Service unavailable error (HTTP 503).
 * Thrown when the service is temporarily unavailable.
 */
export class ServiceUnavailableError extends RelayError {
  constructor(message: string = 'Service temporarily unavailable', details?: Record<string, unknown>) {
    super(message, ErrorCodes.SERVICE_UNAVAILABLE, 503, details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Gateway timeout error (HTTP 504).
 * Thrown when an upstream service times out.
 */
export class GatewayTimeoutError extends RelayError {
  readonly service: string;

  constructor(service: string, details?: Record<string, unknown>) {
    super(`${service} timed out`, ErrorCodes.GATEWAY_TIMEOUT, 504, { service, ...details });
    this.name = 'GatewayTimeoutError';
    this.service = service;
  }
}

/**
 * Dependency error (HTTP 502).
 * Thrown when an external dependency fails.
 */
export class DependencyError extends RelayError {
  readonly dependency: string;

  constructor(dependency: string, message?: string, details?: Record<string, unknown>) {
    super(message ?? `${dependency} failed`, ErrorCodes.DEPENDENCY_ERROR, 502, {
      dependency,
      ...details,
    });
    this.name = 'DependencyError';
    this.dependency = dependency;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if an error is a RelayError.
 *
 * @param error - The error to check
 * @returns True if the error is a RelayError instance
 */
export function isRelayError(error: unknown): error is RelayError {
  return error instanceof RelayError;
}

/**
 * Check if an error is operational (expected).
 * Operational errors are expected conditions that should be handled gracefully.
 * Non-operational errors indicate bugs that need investigation.
 *
 * @param error - The error to check
 * @returns True if the error is operational
 */
export function isOperationalError(error: unknown): boolean {
  if (isRelayError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap an unknown error into a RelayError.
 * Useful for catching external errors and converting them to platform errors.
 *
 * @param error - The error to wrap
 * @returns A RelayError instance
 */
export function wrapError(error: unknown): RelayError {
  if (isRelayError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  if (typeof error === 'string') {
    return new InternalError(error);
  }

  return new InternalError('An unknown error occurred', {
    originalValue: String(error),
  });
}

/**
 * Create an error response object suitable for HTTP responses.
 *
 * @param error - The RelayError to convert
 * @returns Object with statusCode and body
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

/**
 * Create an error from an HTTP status code.
 * Useful for converting HTTP responses to typed errors.
 *
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param details - Additional details
 * @returns Appropriate error type for the status code
 */
export function fromStatusCode(
  statusCode: number,
  message?: string,
  details?: Record<string, unknown>,
): RelayError {
  switch (statusCode) {
    case 400:
      return new BadRequestError(message, details);
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new AuthorizationError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 409:
      return new ConflictError(message, details);
    case 429:
      return new RateLimitError(60, details);
    case 500:
      return new InternalError(message, details);
    case 503:
      return new ServiceUnavailableError(message, details);
    default:
      return new RelayError(message ?? 'Unknown error', 'UNKNOWN_ERROR', statusCode, details);
  }
}

/**
 * Assert a condition, throwing a RelayError if false.
 *
 * @param condition - Condition to check
 * @param error - Error to throw or error factory
 */
export function assertRelay(
  condition: boolean,
  error: RelayError | (() => RelayError),
): asserts condition {
  if (!condition) {
    throw typeof error === 'function' ? error() : error;
  }
}
