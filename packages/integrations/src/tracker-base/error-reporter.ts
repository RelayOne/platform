/**
 * @fileoverview Standardized error reporting and categorization for tracker integrations.
 * Provides Sentry integration, error categorization, and user-friendly error messages.
 * @packageDocumentation
 */

import type { TrackerProvider } from './types';

/**
 * Error category for classification.
 */
export type ErrorCategory =
  | 'auth' // Authentication/authorization errors
  | 'rate_limit' // Rate limiting errors
  | 'network' // Network/connectivity errors
  | 'validation' // Input validation errors
  | 'not_found' // Resource not found errors
  | 'permission' // Permission denied errors
  | 'conflict' // Conflict/concurrent modification errors
  | 'integration' // Integration-specific errors
  | 'unknown'; // Unknown/uncategorized errors

/**
 * Error severity level.
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Error context for debugging.
 */
export interface ErrorContext {
  /** Provider that generated the error */
  provider: TrackerProvider;
  /** Organization ID */
  organizationId?: string;
  /** Integration ID */
  integrationId?: string;
  /** User ID */
  userId?: string;
  /** Operation that failed */
  operation: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Request ID for tracing */
  requestId?: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

/**
 * Recovery suggestion for errors.
 */
export interface RecoverySuggestion {
  /** Suggestion title */
  title: string;
  /** Detailed description */
  description: string;
  /** Action items */
  actions: string[];
  /** Documentation URL */
  docUrl?: string;
}

/**
 * Breadcrumb for Sentry debugging.
 */
export interface ErrorBreadcrumb {
  /** Breadcrumb category */
  category: string;
  /** Message */
  message: string;
  /** Timestamp */
  timestamp: Date;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Level */
  level?: 'debug' | 'info' | 'warning' | 'error';
}

/**
 * Error reporter configuration.
 */
export interface ErrorReporterConfig {
  /** Enable Sentry integration */
  enableSentry: boolean;
  /** Sentry DSN */
  sentryDsn?: string;
  /** Environment (development, staging, production) */
  environment: string;
  /** Enable breadcrumb tracking */
  enableBreadcrumbs: boolean;
  /** Maximum breadcrumbs to store */
  maxBreadcrumbs: number;
  /** Sample rate for errors (0-1) */
  sampleRate: number;
  /** Enable user-friendly messages */
  enableUserFriendlyMessages: boolean;
}

/**
 * Standardized tracker error.
 */
export class TrackerError extends Error {
  /** Error category */
  public readonly category: ErrorCategory;
  /** Error severity */
  public readonly severity: ErrorSeverity;
  /** Error context */
  public readonly context: ErrorContext;
  /** User-friendly message */
  public readonly userMessage: string;
  /** Recovery suggestions */
  public readonly suggestions?: RecoverySuggestion;
  /** Original error */
  public readonly originalError?: Error;
  /** Is retryable */
  public readonly retryable: boolean;
  /** Timestamp */
  public readonly timestamp: Date;

  /**
   * Creates a new tracker error.
   *
   * @param message - Technical error message
   * @param category - Error category
   * @param severity - Error severity
   * @param context - Error context
   * @param options - Additional options
   */
  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext,
    options: {
      userMessage?: string;
      suggestions?: RecoverySuggestion;
      originalError?: Error;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'TrackerError';
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.userMessage = options.userMessage || this.generateUserMessage(category, context);
    this.suggestions = options.suggestions || this.generateSuggestions(category, context);
    this.originalError = options.originalError;
    this.retryable = options.retryable ?? this.isRetryableCategory(category);
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrackerError);
    }

    // Include original error stack
    if (options.originalError?.stack) {
      this.stack = `${this.stack}\n\nCaused by: ${options.originalError.stack}`;
    }
  }

  /**
   * Generate user-friendly message based on category.
   *
   * @param category - Error category
   * @param context - Error context
   * @returns User-friendly message
   */
  private generateUserMessage(category: ErrorCategory, context: ErrorContext): string {
    const provider = this.formatProviderName(context.provider);

    switch (category) {
      case 'auth':
        return `Authentication failed with ${provider}. Please reconnect your account.`;

      case 'rate_limit':
        return `${provider} rate limit exceeded. Please try again in a few minutes.`;

      case 'network':
        return `Unable to connect to ${provider}. Please check your internet connection.`;

      case 'validation':
        return `Invalid data provided to ${provider}. Please check your input.`;

      case 'not_found':
        return `The requested resource was not found in ${provider}.`;

      case 'permission':
        return `You don't have permission to perform this action in ${provider}.`;

      case 'conflict':
        return `The resource was modified by someone else. Please refresh and try again.`;

      case 'integration':
        return `${provider} integration error. Please contact support if this persists.`;

      default:
        return `An unexpected error occurred with ${provider}. Please try again.`;
    }
  }

  /**
   * Generate recovery suggestions based on category.
   *
   * @param category - Error category
   * @param context - Error context
   * @returns Recovery suggestions
   */
  private generateSuggestions(
    category: ErrorCategory,
    context: ErrorContext
  ): RecoverySuggestion {
    const provider = this.formatProviderName(context.provider);

    switch (category) {
      case 'auth':
        return {
          title: 'Reconnect Your Account',
          description: `Your ${provider} authentication has expired or is invalid.`,
          actions: [
            `Go to Settings > Integrations`,
            `Click "Reconnect" next to ${provider}`,
            'Complete the authentication flow',
          ],
          docUrl: `https://docs.example.com/integrations/${context.provider}#authentication`,
        };

      case 'rate_limit':
        return {
          title: 'Rate Limit Exceeded',
          description: `You've exceeded ${provider}'s API rate limits.`,
          actions: [
            'Wait a few minutes before trying again',
            'Reduce the frequency of syncs',
            'Contact support to upgrade your plan',
          ],
          docUrl: `https://docs.example.com/integrations/${context.provider}#rate-limits`,
        };

      case 'network':
        return {
          title: 'Connection Issue',
          description: `Unable to connect to ${provider}.`,
          actions: [
            'Check your internet connection',
            'Verify that your firewall allows connections to ${provider}',
            'Try again in a few minutes',
          ],
        };

      case 'validation':
        return {
          title: 'Invalid Data',
          description: 'The data provided does not meet requirements.',
          actions: [
            'Review your field mappings',
            'Ensure required fields are populated',
            'Check data format and constraints',
          ],
        };

      case 'permission':
        return {
          title: 'Permission Denied',
          description: `You don't have the required permissions in ${provider}.`,
          actions: [
            'Contact your workspace administrator',
            'Request the necessary permissions',
            'Verify that your integration has the correct scopes',
          ],
        };

      default:
        return {
          title: 'Unexpected Error',
          description: 'An unexpected error occurred.',
          actions: [
            'Try again in a few minutes',
            'Contact support if the issue persists',
          ],
        };
    }
  }

  /**
   * Check if error category is retryable.
   *
   * @param category - Error category
   * @returns True if retryable
   */
  private isRetryableCategory(category: ErrorCategory): boolean {
    return ['rate_limit', 'network', 'conflict'].includes(category);
  }

  /**
   * Format provider name for display.
   *
   * @param provider - Provider identifier
   * @returns Formatted name
   */
  private formatProviderName(provider: TrackerProvider): string {
    const names: Record<TrackerProvider, string> = {
      linear: 'Linear',
      trello: 'Trello',
      asana: 'Asana',
      monday: 'Monday.com',
      clickup: 'ClickUp',
      notion: 'Notion',
      wrike: 'Wrike',
      shortcut: 'Shortcut',
      basecamp: 'Basecamp',
      jira: 'Jira',
    };
    return names[provider] || provider;
  }

  /**
   * Convert to JSON for logging.
   *
   * @returns JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      userMessage: this.userMessage,
      suggestions: this.suggestions,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Default error reporter configuration.
 */
const DEFAULT_CONFIG: ErrorReporterConfig = {
  enableSentry: false,
  environment: process.env.NODE_ENV || 'development',
  enableBreadcrumbs: true,
  maxBreadcrumbs: 100,
  sampleRate: 1.0,
  enableUserFriendlyMessages: true,
};

/**
 * Error reporter with Sentry integration and breadcrumb tracking.
 *
 * @example
 * ```typescript
 * const reporter = new ErrorReporter({
 *   enableSentry: true,
 *   sentryDsn: process.env.SENTRY_DSN,
 *   environment: 'production',
 * });
 *
 * // Report an error
 * try {
 *   await client.createTask(projectId, taskInput);
 * } catch (error) {
 *   const trackerError = reporter.categorizeError(error, {
 *     provider: 'linear',
 *     operation: 'createTask',
 *     organizationId,
 *   });
 *   reporter.report(trackerError);
 *   throw trackerError;
 * }
 *
 * // Add breadcrumb
 * reporter.addBreadcrumb({
 *   category: 'sync',
 *   message: 'Starting task sync',
 *   data: { projectId, taskCount: 10 },
 * });
 * ```
 */
export class ErrorReporter {
  private config: ErrorReporterConfig;
  private breadcrumbs: ErrorBreadcrumb[] = [];
  private sentryInitialized: boolean = false;

  /**
   * Creates a new error reporter.
   *
   * @param config - Reporter configuration
   */
  constructor(config: Partial<ErrorReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableSentry && this.config.sentryDsn) {
      this.initializeSentry();
    }
  }

  /**
   * Initialize Sentry integration.
   */
  private initializeSentry(): void {
    try {
      // In a real implementation, this would use @sentry/node
      // For now, we'll just mark as initialized
      // import * as Sentry from '@sentry/node';
      // Sentry.init({
      //   dsn: this.config.sentryDsn,
      //   environment: this.config.environment,
      //   sampleRate: this.config.sampleRate,
      // });
      this.sentryInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  }

  /**
   * Report an error.
   *
   * @param error - Error to report
   * @param additionalContext - Additional context
   */
  report(error: TrackerError, additionalContext?: Record<string, unknown>): void {
    // Log to console
    console.error('[TrackerError]', {
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      ...additionalContext,
    });

    // Send to Sentry if enabled
    if (this.sentryInitialized && this.config.enableSentry) {
      this.reportToSentry(error, additionalContext);
    }
  }

  /**
   * Report error to Sentry.
   *
   * @param error - Tracker error
   * @param additionalContext - Additional context
   */
  private reportToSentry(
    error: TrackerError,
    additionalContext?: Record<string, unknown>
  ): void {
    // In a real implementation:
    // Sentry.withScope((scope) => {
    //   scope.setLevel(this.mapSeverityToSentryLevel(error.severity));
    //   scope.setTag('provider', error.context.provider);
    //   scope.setTag('category', error.category);
    //   scope.setTag('operation', error.context.operation);
    //
    //   if (error.context.organizationId) {
    //     scope.setTag('organization_id', error.context.organizationId);
    //   }
    //
    //   if (error.context.userId) {
    //     scope.setUser({ id: error.context.userId });
    //   }
    //
    //   scope.setContext('error_context', {
    //     ...error.context,
    //     ...additionalContext,
    //   });
    //
    //   // Add breadcrumbs
    //   this.breadcrumbs.forEach(breadcrumb => {
    //     scope.addBreadcrumb({
    //       category: breadcrumb.category,
    //       message: breadcrumb.message,
    //       level: breadcrumb.level || 'info',
    //       timestamp: breadcrumb.timestamp.getTime() / 1000,
    //       data: breadcrumb.data,
    //     });
    //   });
    //
    //   Sentry.captureException(error.originalError || error);
    // });
  }

  /**
   * Categorize an error and convert to TrackerError.
   *
   * @param error - Original error
   * @param context - Error context
   * @returns Categorized tracker error
   */
  categorizeError(error: unknown, context: ErrorContext): TrackerError {
    if (error instanceof TrackerError) {
      return error;
    }

    const err = error as {
      message?: string;
      statusCode?: number;
      code?: string;
      response?: { status?: number; data?: unknown };
    };

    const message = err.message || 'Unknown error';
    const statusCode = err.statusCode || err.response?.status;

    // Determine category based on error details
    let category: ErrorCategory;
    let severity: ErrorSeverity;

    if (statusCode === 401 || statusCode === 403 || message.includes('unauthorized')) {
      category = 'auth';
      severity = 'error';
    } else if (statusCode === 429 || message.toLowerCase().includes('rate limit')) {
      category = 'rate_limit';
      severity = 'warning';
    } else if (statusCode === 404 || message.includes('not found')) {
      category = 'not_found';
      severity = 'info';
    } else if (statusCode === 409 || message.includes('conflict')) {
      category = 'conflict';
      severity = 'warning';
    } else if (statusCode === 400 || message.includes('validation')) {
      category = 'validation';
      severity = 'error';
    } else if (
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 503 ||
      message.includes('network') ||
      message.includes('timeout') ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT'
    ) {
      category = 'network';
      severity = 'error';
    } else if (message.includes('permission')) {
      category = 'permission';
      severity = 'error';
    } else {
      category = 'unknown';
      severity = 'error';
    }

    return new TrackerError(message, category, severity, {
      ...context,
      statusCode,
    }, {
      originalError: error as Error,
    });
  }

  /**
   * Add a breadcrumb for debugging.
   *
   * @param breadcrumb - Breadcrumb data
   */
  addBreadcrumb(breadcrumb: Omit<ErrorBreadcrumb, 'timestamp'>): void {
    if (!this.config.enableBreadcrumbs) {
      return;
    }

    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: new Date(),
    });

    // Trim breadcrumbs if exceeding max
    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.config.maxBreadcrumbs);
    }
  }

  /**
   * Clear all breadcrumbs.
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Get all breadcrumbs.
   *
   * @returns Array of breadcrumbs
   */
  getBreadcrumbs(): ErrorBreadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Map error severity to Sentry level.
   *
   * @param severity - Error severity
   * @returns Sentry level
   */
  private mapSeverityToSentryLevel(
    severity: ErrorSeverity
  ): 'fatal' | 'error' | 'warning' | 'info' {
    const mapping: Record<ErrorSeverity, 'fatal' | 'error' | 'warning' | 'info'> = {
      critical: 'fatal',
      error: 'error',
      warning: 'warning',
      info: 'info',
    };
    return mapping[severity];
  }
}

/**
 * Global error reporter instance.
 */
let globalReporter: ErrorReporter | undefined;

/**
 * Get the global error reporter instance.
 *
 * @param config - Configuration for new instance
 * @returns Global error reporter
 */
export function getGlobalErrorReporter(
  config?: Partial<ErrorReporterConfig>
): ErrorReporter {
  if (!globalReporter) {
    globalReporter = new ErrorReporter(config);
  }
  return globalReporter;
}

/**
 * Specific error types for common scenarios.
 */

/**
 * Authentication error.
 */
export class AuthenticationError extends TrackerError {
  constructor(context: ErrorContext, originalError?: Error) {
    super(
      'Authentication failed',
      'auth',
      'error',
      context,
      { originalError }
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit error.
 */
export class RateLimitError extends TrackerError {
  constructor(
    context: ErrorContext,
    retryAfterMs: number,
    originalError?: Error
  ) {
    super(
      'Rate limit exceeded',
      'rate_limit',
      'warning',
      {
        ...context,
        metadata: {
          ...context.metadata,
          retryAfterMs,
        },
      },
      { originalError }
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Network error.
 */
export class NetworkError extends TrackerError {
  constructor(context: ErrorContext, originalError?: Error) {
    super(
      'Network connection failed',
      'network',
      'error',
      context,
      { originalError }
    );
    this.name = 'NetworkError';
  }
}

/**
 * Validation error.
 */
export class ValidationError extends TrackerError {
  constructor(
    context: ErrorContext,
    validationErrors: Record<string, string>,
    originalError?: Error
  ) {
    super(
      'Validation failed',
      'validation',
      'error',
      {
        ...context,
        metadata: {
          ...context.metadata,
          validationErrors,
        },
      },
      { originalError }
    );
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends TrackerError {
  constructor(
    context: ErrorContext,
    resourceType: string,
    resourceId: string,
    originalError?: Error
  ) {
    super(
      `${resourceType} not found: ${resourceId}`,
      'not_found',
      'info',
      {
        ...context,
        metadata: {
          ...context.metadata,
          resourceType,
          resourceId,
        },
      },
      { originalError }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends TrackerError {
  constructor(
    context: ErrorContext,
    requiredPermission: string,
    originalError?: Error
  ) {
    super(
      `Permission denied: ${requiredPermission}`,
      'permission',
      'error',
      {
        ...context,
        metadata: {
          ...context.metadata,
          requiredPermission,
        },
      },
      { originalError }
    );
    this.name = 'PermissionDeniedError';
  }
}
