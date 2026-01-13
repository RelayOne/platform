/**
 * @fileoverview Integration error types and handling
 * @module @relay/integrations/common/errors
 */

import type { IntegrationSource } from './types';

/**
 * Error codes for integration failures
 */
export enum IntegrationErrorCode {
  /** Authentication failed (invalid credentials, expired token) */
  AUTH_FAILED = 'AUTH_FAILED',
  /** Authorization failed (insufficient permissions) */
  FORBIDDEN = 'FORBIDDEN',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Invalid request parameters */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** Webhook signature verification failed */
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  /** Network/connectivity error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Timeout error */
  TIMEOUT = 'TIMEOUT',
  /** Integration service unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Unexpected error from integration */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Configuration error */
  CONFIG_ERROR = 'CONFIG_ERROR',
  /** Unknown/internal error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * HTTP status code to error code mapping
 */
const HTTP_STATUS_TO_ERROR_CODE: Record<number, IntegrationErrorCode> = {
  400: IntegrationErrorCode.INVALID_REQUEST,
  401: IntegrationErrorCode.AUTH_FAILED,
  403: IntegrationErrorCode.FORBIDDEN,
  404: IntegrationErrorCode.NOT_FOUND,
  429: IntegrationErrorCode.RATE_LIMITED,
  500: IntegrationErrorCode.PROVIDER_ERROR,
  502: IntegrationErrorCode.SERVICE_UNAVAILABLE,
  503: IntegrationErrorCode.SERVICE_UNAVAILABLE,
  504: IntegrationErrorCode.TIMEOUT,
};

/**
 * Base error class for all integration errors
 */
export class IntegrationError extends Error {
  /** Error code */
  readonly code: IntegrationErrorCode;
  /** Integration source that produced the error */
  readonly source: IntegrationSource;
  /** HTTP status code if applicable */
  readonly statusCode?: number;
  /** Additional error details */
  readonly details?: unknown;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Suggested retry delay in milliseconds */
  readonly retryAfter?: number;

  constructor(
    message: string,
    code: IntegrationErrorCode,
    source: IntegrationSource,
    options?: {
      statusCode?: number;
      details?: unknown;
      retryable?: boolean;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'IntegrationError';
    this.code = code;
    this.source = source;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.retryable = options?.retryable ?? this.isRetryableCode(code);
    this.retryAfter = options?.retryAfter;
  }

  /**
   * Determines if an error code is generally retryable
   * @param code - The error code to check
   * @returns Whether the error is retryable
   */
  private isRetryableCode(code: IntegrationErrorCode): boolean {
    return [
      IntegrationErrorCode.RATE_LIMITED,
      IntegrationErrorCode.NETWORK_ERROR,
      IntegrationErrorCode.TIMEOUT,
      IntegrationErrorCode.SERVICE_UNAVAILABLE,
    ].includes(code);
  }

  /**
   * Creates an IntegrationError from an HTTP response
   * @param source - The integration source
   * @param statusCode - HTTP status code
   * @param message - Error message
   * @param details - Additional details
   * @returns IntegrationError instance
   */
  static fromHttpStatus(
    source: IntegrationSource,
    statusCode: number,
    message: string,
    details?: unknown
  ): IntegrationError {
    const code = HTTP_STATUS_TO_ERROR_CODE[statusCode] ?? IntegrationErrorCode.UNKNOWN;
    return new IntegrationError(message, code, source, {
      statusCode,
      details,
    });
  }

  /**
   * Creates an IntegrationError from an Axios error
   * @param source - The integration source
   * @param error - The axios error
   * @returns IntegrationError instance
   */
  static fromAxiosError(source: IntegrationSource, error: unknown): IntegrationError {
    // Check if it's an axios-like error
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as {
        response?: { status: number; data?: unknown };
        message: string;
        code?: string;
      };

      if (axiosError.response) {
        return IntegrationError.fromHttpStatus(
          source,
          axiosError.response.status,
          axiosError.message,
          axiosError.response.data
        );
      }

      // Network/timeout errors
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        return new IntegrationError(
          axiosError.message,
          IntegrationErrorCode.TIMEOUT,
          source,
          { cause: error instanceof Error ? error : undefined }
        );
      }

      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
        return new IntegrationError(
          axiosError.message,
          IntegrationErrorCode.NETWORK_ERROR,
          source,
          { cause: error instanceof Error ? error : undefined }
        );
      }
    }

    // Generic error handling
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new IntegrationError(message, IntegrationErrorCode.UNKNOWN, source, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  /**
   * Converts the error to a JSON-serializable object
   * @returns Plain object representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      source: this.source,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Error thrown when webhook signature verification fails
 */
export class WebhookVerificationError extends IntegrationError {
  constructor(source: IntegrationSource, message = 'Webhook signature verification failed') {
    super(message, IntegrationErrorCode.INVALID_SIGNATURE, source, {
      retryable: false,
    });
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends IntegrationError {
  constructor(source: IntegrationSource, message = 'Authentication failed') {
    super(message, IntegrationErrorCode.AUTH_FAILED, source, {
      statusCode: 401,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when rate limited
 */
export class RateLimitError extends IntegrationError {
  constructor(
    source: IntegrationSource,
    message = 'Rate limit exceeded',
    retryAfter?: number
  ) {
    super(message, IntegrationErrorCode.RATE_LIMITED, source, {
      statusCode: 429,
      retryable: true,
      retryAfter,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends IntegrationError {
  constructor(source: IntegrationSource, message: string) {
    super(message, IntegrationErrorCode.CONFIG_ERROR, source, {
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Type guard to check if an error is an IntegrationError
 * @param error - The error to check
 * @returns Whether the error is an IntegrationError
 */
export function isIntegrationError(error: unknown): error is IntegrationError {
  return error instanceof IntegrationError;
}

/**
 * Wraps an async function to catch and convert errors to IntegrationError
 * @param source - The integration source
 * @param fn - The async function to wrap
 * @returns The wrapped function
 */
export function wrapIntegrationError<T extends unknown[], R>(
  source: IntegrationSource,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (isIntegrationError(error)) {
        throw error;
      }
      throw IntegrationError.fromAxiosError(source, error);
    }
  };
}
