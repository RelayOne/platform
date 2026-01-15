import { createHmac, timingSafeEqual } from 'crypto';
import type { TrackerProvider } from './types';

/**
 * @fileoverview Abstract base class for webhook handlers.
 * Provides signature verification and event dispatching for tracker webhooks.
 * @packageDocumentation
 */

/**
 * Webhook event payload structure
 */
export interface WebhookEventPayload<T = unknown> {
  /** Event type identifier */
  eventType: string;
  /** Event action (e.g., 'created', 'updated', 'deleted') */
  action?: string;
  /** Event timestamp */
  timestamp: Date;
  /** Source tracker provider */
  source: TrackerProvider;
  /** Resource type affected */
  resourceType: string;
  /** Resource ID */
  resourceId: string;
  /** Raw payload data */
  payload: T;
  /** Webhook signature for verification */
  signature?: string;
  /** Unique delivery ID for idempotency */
  deliveryId?: string;
}

/**
 * Webhook event handler callback type
 */
export type WebhookEventHandler<T = unknown> = (
  event: WebhookEventPayload<T>
) => void | Promise<void>;

/**
 * Signature verification strategies supported by various trackers
 */
export type SignatureStrategy =
  | 'hmac-sha256' // Linear, GitHub, Slack
  | 'hmac-sha1' // Trello
  | 'x-hook-secret' // Asana
  | 'verification-token' // Notion
  | 'none'; // ClickUp (uses URL verification)

/**
 * Webhook request structure
 */
export interface WebhookRequest {
  /** Raw request body as string */
  body: string;
  /** Request headers (lowercase keys) */
  headers: Record<string, string>;
}

/**
 * Webhook response structure
 */
export interface WebhookResponse {
  /** HTTP status code */
  status: number;
  /** Response body */
  body: string;
  /** Optional headers */
  headers?: Record<string, string>;
}

/**
 * Abstract base class for webhook handlers.
 * Handles signature verification and event dispatching.
 *
 * @example
 * ```typescript
 * class LinearWebhookHandler extends BaseWebhookHandler {
 *   get provider(): TrackerProvider {
 *     return 'linear';
 *   }
 *
 *   get signatureStrategy(): SignatureStrategy {
 *     return 'hmac-sha256';
 *   }
 *
 *   // ... implement abstract methods
 * }
 *
 * const handler = new LinearWebhookHandler(webhookSecret);
 * handler.on('Issue.created', async (event) => {
 *   console.log('Issue created:', event.payload);
 * });
 * ```
 */
export abstract class BaseWebhookHandler {
  /** Webhook secret for signature verification */
  protected secret: string;

  /** Registered event handlers */
  protected handlers: Map<string, Set<WebhookEventHandler>>;

  /**
   * Creates a new webhook handler.
   * @param secret - Webhook secret for signature verification
   */
  constructor(secret: string) {
    this.secret = secret;
    this.handlers = new Map();
  }

  /**
   * Get the tracker provider identifier.
   * @returns Provider name
   */
  abstract get provider(): TrackerProvider;

  /**
   * Get the signature verification strategy.
   * @returns Signature strategy
   */
  abstract get signatureStrategy(): SignatureStrategy;

  /**
   * Extract the signature from request headers.
   * @param headers - Request headers
   * @returns Signature string
   */
  protected abstract extractSignature(headers: Record<string, string>): string;

  /**
   * Extract the event type from the payload.
   * @param payload - Parsed webhook payload
   * @param headers - Request headers
   * @returns Event type string
   */
  protected abstract extractEventType(
    payload: unknown,
    headers: Record<string, string>
  ): string;

  /**
   * Extract the action from the payload.
   * @param payload - Parsed webhook payload
   * @returns Action string or undefined
   */
  protected abstract extractAction(payload: unknown): string | undefined;

  /**
   * Extract resource information from the payload.
   * @param payload - Parsed webhook payload
   * @returns Resource type and ID
   */
  protected abstract extractResource(payload: unknown): {
    type: string;
    id: string;
  };

  /**
   * Extract delivery ID for idempotency.
   * @param headers - Request headers
   * @returns Delivery ID or undefined
   */
  protected extractDeliveryId(headers: Record<string, string>): string | undefined {
    return (
      headers['x-delivery-id'] ||
      headers['x-webhook-delivery-id'] ||
      headers['x-request-id']
    );
  }

  /**
   * Verify the webhook signature.
   * @param payload - Raw request body
   * @param signature - Signature from headers
   * @returns True if signature is valid
   */
  async verify(payload: string, signature: string): Promise<boolean> {
    if (this.signatureStrategy === 'none') {
      return true;
    }

    if (!signature) {
      return false;
    }

    try {
      switch (this.signatureStrategy) {
        case 'hmac-sha256':
          return this.verifyHmacSha256(payload, signature);
        case 'hmac-sha1':
          return this.verifyHmacSha1(payload, signature);
        case 'x-hook-secret':
          return this.verifyXHookSecret(payload, signature);
        case 'verification-token':
          return this.verifyToken(signature);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Verify HMAC-SHA256 signature.
   * Used by: Linear, GitHub, Slack
   */
  protected verifyHmacSha256(payload: string, signature: string): boolean {
    const expectedSignature = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    // Handle signatures with or without 'sha256=' prefix
    const actualSignature = signature.replace(/^sha256=/, '');

    try {
      return timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(actualSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify HMAC-SHA1 signature.
   * Used by: Trello
   */
  protected verifyHmacSha1(payload: string, signature: string): boolean {
    const expectedSignature = createHmac('sha1', this.secret)
      .update(payload)
      .digest('base64');

    try {
      return timingSafeEqual(
        Buffer.from(expectedSignature, 'base64'),
        Buffer.from(signature, 'base64')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify X-Hook-Secret signature.
   * Used by: Asana
   */
  protected verifyXHookSecret(payload: string, signature: string): boolean {
    const expectedSignature = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify simple token match.
   * Used by: Notion
   */
  protected verifyToken(token: string): boolean {
    try {
      return timingSafeEqual(
        Buffer.from(this.secret),
        Buffer.from(token)
      );
    } catch {
      return false;
    }
  }

  /**
   * Register an event handler.
   * @param eventType - Event type to listen for (or '*' for all events)
   * @param handler - Handler callback function
   * @returns Unsubscribe function
   */
  on<T = unknown>(
    eventType: string,
    handler: WebhookEventHandler<T>
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const handlers = this.handlers.get(eventType)!;
    handlers.add(handler as WebhookEventHandler);

    return () => {
      handlers.delete(handler as WebhookEventHandler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    };
  }

  /**
   * Remove all handlers for an event type.
   * @param eventType - Event type
   */
  off(eventType: string): void {
    this.handlers.delete(eventType);
  }

  /**
   * Remove all registered handlers.
   */
  removeAllHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Dispatch an event to registered handlers.
   * @param event - Event payload to dispatch
   */
  protected async dispatch(event: WebhookEventPayload): Promise<void> {
    const specificHandlers = this.handlers.get(event.eventType) || new Set();
    const wildcardHandlers = this.handlers.get('*') || new Set();

    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    await Promise.all(
      allHandlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(
            `Error in webhook handler for ${event.eventType}:`,
            error
          );
        }
      })
    );
  }

  /**
   * Parse raw webhook payload into event structure.
   * @param body - Raw request body
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  parsePayload(body: string, headers: Record<string, string>): WebhookEventPayload {
    const payload = JSON.parse(body);
    const resource = this.extractResource(payload);

    return {
      eventType: this.extractEventType(payload, headers),
      action: this.extractAction(payload),
      timestamp: new Date(),
      source: this.provider,
      resourceType: resource.type,
      resourceId: resource.id,
      payload,
      deliveryId: this.extractDeliveryId(headers),
    };
  }

  /**
   * Process an incoming webhook request.
   * @param request - Webhook request with body and headers
   * @returns Webhook response
   */
  async handleRequest(request: WebhookRequest): Promise<WebhookResponse> {
    // Normalize headers to lowercase
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key.toLowerCase()] = value;
    }

    // Extract signature
    const signature = this.extractSignature(headers);

    // Verify signature
    const isValid = await this.verify(request.body, signature);
    if (!isValid) {
      return {
        status: 401,
        body: JSON.stringify({ error: 'Invalid webhook signature' }),
      };
    }

    try {
      // Parse and dispatch
      const event = this.parsePayload(request.body, headers);
      await this.dispatch(event);

      return {
        status: 200,
        body: JSON.stringify({
          success: true,
          eventType: event.eventType,
          deliveryId: event.deliveryId,
        }),
      };
    } catch (error) {
      console.error('Webhook processing error:', error);
      return {
        status: 500,
        body: JSON.stringify({
          error: 'Webhook processing failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }
  }

  /**
   * Handle challenge/verification requests.
   * Some trackers (Asana, Notion) send verification requests on webhook setup.
   * @param request - Webhook request
   * @returns Response if this is a challenge request, null otherwise
   */
  handleChallenge(request: WebhookRequest): WebhookResponse | null {
    // Override in subclasses that need challenge handling
    return null;
  }
}
