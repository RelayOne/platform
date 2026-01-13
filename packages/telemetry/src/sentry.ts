import * as Sentry from '@sentry/node';
import type { TelemetryConfig, ErrorContext, Breadcrumb, TransactionContext } from './types';

/**
 * Sentry error tracking service.
 * Provides error capture, breadcrumbs, and performance monitoring.
 */
export class SentryService {
  private config: TelemetryConfig;
  private isInitialized = false;

  /**
   * Creates a new SentryService instance.
   * @param config - Telemetry configuration
   */
  constructor(config: TelemetryConfig) {
    this.config = config;
  }

  /**
   * Initializes Sentry with the provided configuration.
   * Call this once during application startup.
   */
  public initialize(): void {
    if (this.isInitialized || !this.config.sentryEnabled || !this.config.sentryDsn) {
      return;
    }

    Sentry.init({
      dsn: this.config.sentryDsn,
      environment: this.config.environment,
      release: this.config.serviceVersion
        ? `${this.config.serviceName}@${this.config.serviceVersion}`
        : undefined,
      sampleRate: this.config.sentrySampleRate ?? 1.0,
      tracesSampleRate: this.config.sentryTracesSampleRate ?? 0.1,
      debug: this.config.debug,
      integrations: [
        Sentry.httpIntegration(),
      ],
      beforeSend: (event) => {
        // Add service name tag
        event.tags = {
          ...event.tags,
          service: this.config.serviceName,
        };
        return event;
      },
    });

    // Set default tags
    Sentry.setTag('service', this.config.serviceName);
    Sentry.setTag('environment', this.config.environment);

    this.isInitialized = true;
  }

  /**
   * Shuts down Sentry and flushes pending events.
   * @param timeout - Maximum time to wait for flush in milliseconds
   */
  public async shutdown(timeout = 2000): Promise<void> {
    if (this.isInitialized) {
      await Sentry.close(timeout);
      this.isInitialized = false;
    }
  }

  /**
   * Captures an error and sends it to Sentry.
   * @param error - Error to capture
   * @param context - Additional context for the error
   * @returns The Sentry event ID
   */
  public captureError(error: Error, context?: ErrorContext): string | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    return Sentry.withScope((scope) => {
      if (context?.user) {
        scope.setUser(context.user);
      }

      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }

      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }

      if (context?.fingerprint) {
        scope.setFingerprint(context.fingerprint);
      }

      if (context?.level) {
        scope.setLevel(context.level);
      }

      return Sentry.captureException(error);
    });
  }

  /**
   * Captures a message and sends it to Sentry.
   * @param message - Message to capture
   * @param level - Severity level
   * @param context - Additional context
   * @returns The Sentry event ID
   */
  public captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: ErrorContext
  ): string | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    return Sentry.withScope((scope) => {
      scope.setLevel(level);

      if (context?.user) {
        scope.setUser(context.user);
      }

      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }

      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }

      return Sentry.captureMessage(message);
    });
  }

  /**
   * Adds a breadcrumb for error context.
   * @param breadcrumb - Breadcrumb to add
   */
  public addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.addBreadcrumb({
      category: breadcrumb.category,
      message: breadcrumb.message,
      data: breadcrumb.data,
      type: breadcrumb.type,
      level: breadcrumb.level,
      timestamp: breadcrumb.timestamp ?? Date.now() / 1000,
    });
  }

  /**
   * Sets the current user for error tracking.
   * @param user - User information
   */
  public setUser(user: { id?: string; email?: string; username?: string } | null): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Sets a tag that will be applied to all events.
   * @param key - Tag key
   * @param value - Tag value
   */
  public setTag(key: string, value: string): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.setTag(key, value);
  }

  /**
   * Sets extra context data that will be applied to all events.
   * @param key - Context key
   * @param value - Context value
   */
  public setExtra(key: string, value: unknown): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.setExtra(key, value);
  }

  /**
   * Sets context data for a specific category.
   * @param name - Context category name
   * @param context - Context data
   */
  public setContext(name: string, context: Record<string, unknown>): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.setContext(name, context);
  }

  /**
   * Starts a new transaction for performance monitoring.
   * @param context - Transaction context
   * @returns The transaction or undefined if not initialized
   */
  public startTransaction(context: TransactionContext): Sentry.Span | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    return Sentry.startInactiveSpan({
      name: context.name,
      op: context.op,
      attributes: context.tags as Record<string, string>,
    });
  }

  /**
   * Runs a function within a transaction context.
   * @param context - Transaction context
   * @param fn - Function to execute
   * @returns Result of the function
   */
  public async withTransaction<T>(
    context: TransactionContext,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.isInitialized) {
      return fn();
    }

    return Sentry.startSpan(
      {
        name: context.name,
        op: context.op,
        attributes: context.tags as Record<string, string>,
      },
      async () => {
        return fn();
      }
    );
  }

  /**
   * Creates a child span within the current transaction.
   * @param description - Span description
   * @param op - Span operation type
   * @returns The child span or undefined
   */
  public startSpan(description: string, op: string): Sentry.Span | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    return Sentry.startInactiveSpan({
      name: description,
      op,
    });
  }

  /**
   * Flushes pending events to Sentry.
   * @param timeout - Maximum time to wait in milliseconds
   */
  public async flush(timeout = 2000): Promise<boolean> {
    if (!this.isInitialized) {
      return true;
    }

    return Sentry.flush(timeout);
  }

  /**
   * Checks if Sentry is initialized.
   * @returns Whether Sentry is initialized
   */
  public isEnabled(): boolean {
    return this.isInitialized && !!this.config.sentryEnabled;
  }

  /**
   * Gets the current Sentry hub.
   * @returns The Sentry hub or undefined
   */
  public getCurrentScope(): Sentry.Scope | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    return Sentry.getCurrentScope();
  }
}

/**
 * Creates a new Sentry service instance.
 * @param config - Telemetry configuration
 * @returns A configured SentryService
 */
export function createSentryService(config: TelemetryConfig): SentryService {
  return new SentryService(config);
}
