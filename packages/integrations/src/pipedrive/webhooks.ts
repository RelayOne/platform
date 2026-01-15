/**
 * @fileoverview Pipedrive webhook handling and signature verification
 * @module @relay/integrations/pipedrive/webhooks
 */

import * as crypto from 'crypto';
import type {
  PipedriveWebhookPayload,
  PipedriveWebhookAction,
  PipedriveWebhookObject,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { WebhookVerificationResult, WebhookEvent } from '../common/types';

/**
 * Pipedrive webhook event type string (action.object format)
 */
export type PipedriveWebhookEventType = `${PipedriveWebhookAction}.${PipedriveWebhookObject}`;

/**
 * Parsed Pipedrive webhook event
 */
export interface PipedriveWebhookEvent<T = unknown> extends WebhookEvent<PipedriveWebhookPayload<T>> {
  /** Event type (e.g., 'added.deal') */
  type: string;
  /** Action that triggered the webhook */
  action: PipedriveWebhookAction;
  /** Object type that was modified */
  object: PipedriveWebhookObject;
  /** Company ID */
  companyId: number;
  /** User ID who triggered the event */
  userId: number;
  /** Current state of the object */
  current: T;
  /** Previous state (for updates) */
  previous?: T;
}

/**
 * Verifies a Pipedrive webhook using HTTP Basic Auth credentials
 *
 * Pipedrive webhooks support HTTP Basic Authentication for verification.
 * The Authorization header contains Base64 encoded username:password.
 *
 * @param authorizationHeader - Authorization header from request
 * @param expectedUsername - Expected username for Basic Auth
 * @param expectedPassword - Expected password for Basic Auth
 * @returns Verification result
 */
export function verifyWebhookBasicAuth(
  authorizationHeader: string | undefined,
  expectedUsername: string,
  expectedPassword: string
): WebhookVerificationResult {
  try {
    if (!authorizationHeader) {
      return {
        valid: false,
        error: 'Missing Authorization header',
      };
    }

    // Check for Basic auth scheme
    if (!authorizationHeader.toLowerCase().startsWith('basic ')) {
      return {
        valid: false,
        error: 'Invalid authorization scheme (expected Basic)',
      };
    }

    // Extract and decode credentials
    const base64Credentials = authorizationHeader.slice(6); // Remove 'Basic '
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    // Use timing-safe comparison
    const usernameValid = crypto.timingSafeEqual(
      Buffer.from(username || ''),
      Buffer.from(expectedUsername)
    );
    const passwordValid = crypto.timingSafeEqual(
      Buffer.from(password || ''),
      Buffer.from(expectedPassword)
    );

    if (!usernameValid || !passwordValid) {
      return {
        valid: false,
        error: 'Invalid credentials',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Basic auth verification failed',
    };
  }
}

/**
 * Verifies a Pipedrive webhook payload structure
 *
 * Validates that the payload has the expected Pipedrive webhook structure.
 *
 * @param payload - Parsed webhook payload
 * @returns Verification result
 */
export function verifyWebhookPayloadStructure(
  payload: unknown
): WebhookVerificationResult {
  try {
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        error: 'Invalid payload: expected object',
      };
    }

    const data = payload as Record<string, unknown>;

    // Check for required meta field
    if (!data.meta || typeof data.meta !== 'object') {
      return {
        valid: false,
        error: 'Invalid payload: missing meta field',
      };
    }

    const meta = data.meta as Record<string, unknown>;

    // Verify required meta fields
    if (typeof meta.action !== 'string') {
      return {
        valid: false,
        error: 'Invalid payload: missing meta.action',
      };
    }

    if (typeof meta.object !== 'string') {
      return {
        valid: false,
        error: 'Invalid payload: missing meta.object',
      };
    }

    if (typeof meta.id !== 'number') {
      return {
        valid: false,
        error: 'Invalid payload: missing meta.id',
      };
    }

    if (typeof meta.company_id !== 'number') {
      return {
        valid: false,
        error: 'Invalid payload: missing meta.company_id',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payload structure verification failed',
    };
  }
}

/**
 * Verifies a Pipedrive webhook request
 *
 * Checks both Basic Auth (if credentials provided) and payload structure.
 *
 * @param payload - Raw or parsed request body
 * @param headers - Request headers (lowercase keys)
 * @param credentials - Optional Basic Auth credentials
 * @returns Verification result
 */
export function verifyPipedriveWebhook(
  payload: string | Buffer | object,
  headers: Record<string, string | undefined>,
  credentials?: { username: string; password: string }
): WebhookVerificationResult {
  // Verify Basic Auth if credentials provided
  if (credentials) {
    const authResult = verifyWebhookBasicAuth(
      headers['authorization'],
      credentials.username,
      credentials.password
    );
    if (!authResult.valid) {
      return authResult;
    }
  }

  // Parse payload if string/buffer
  let parsedPayload: unknown;
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    try {
      const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      parsedPayload = JSON.parse(payloadString);
    } catch {
      return {
        valid: false,
        error: 'Invalid JSON payload',
      };
    }
  } else {
    parsedPayload = payload;
  }

  // Verify payload structure
  return verifyWebhookPayloadStructure(parsedPayload);
}

/**
 * Verifies a Pipedrive webhook and throws on failure
 * @param payload - Raw or parsed request body
 * @param headers - Request headers
 * @param credentials - Optional Basic Auth credentials
 * @throws WebhookVerificationError if verification fails
 */
export function assertPipedriveWebhook(
  payload: string | Buffer | object,
  headers: Record<string, string | undefined>,
  credentials?: { username: string; password: string }
): void {
  const result = verifyPipedriveWebhook(payload, headers, credentials);
  if (!result.valid) {
    throw new WebhookVerificationError('pipedrive', result.error);
  }
}

/**
 * Event handler function type
 */
type WebhookEventHandler<T = unknown> = (
  event: PipedriveWebhookEvent<T>
) => void | Promise<void>;

/**
 * Pipedrive webhook handler class
 */
export class PipedriveWebhookHandler {
  private credentials?: { username: string; password: string };
  private eventHandlers: Map<string, WebhookEventHandler[]>;
  private globalHandlers: WebhookEventHandler[];

  /**
   * Creates a new Pipedrive webhook handler
   * @param credentials - Optional Basic Auth credentials for verification
   */
  constructor(credentials?: { username: string; password: string }) {
    this.credentials = credentials;
    this.eventHandlers = new Map();
    this.globalHandlers = [];
  }

  /**
   * Registers an event handler for specific action.object combination
   * @param action - Action type (added, updated, deleted, merged, or *)
   * @param object - Object type (deal, person, organization, etc., or *)
   * @param handler - Handler function
   */
  on<T = unknown>(
    action: PipedriveWebhookAction,
    object: PipedriveWebhookObject,
    handler: WebhookEventHandler<T>
  ): void {
    const key = `${action}.${object}`;
    const handlers = this.eventHandlers.get(key) || [];
    handlers.push(handler as WebhookEventHandler);
    this.eventHandlers.set(key, handlers);
  }

  /**
   * Registers a handler for deal events
   * @param action - Action type
   * @param handler - Handler function
   */
  onDeal(
    action: PipedriveWebhookAction,
    handler: WebhookEventHandler
  ): void {
    this.on(action, 'deal', handler);
  }

  /**
   * Registers a handler for person events
   * @param action - Action type
   * @param handler - Handler function
   */
  onPerson(
    action: PipedriveWebhookAction,
    handler: WebhookEventHandler
  ): void {
    this.on(action, 'person', handler);
  }

  /**
   * Registers a handler for organization events
   * @param action - Action type
   * @param handler - Handler function
   */
  onOrganization(
    action: PipedriveWebhookAction,
    handler: WebhookEventHandler
  ): void {
    this.on(action, 'organization', handler);
  }

  /**
   * Registers a handler for activity events
   * @param action - Action type
   * @param handler - Handler function
   */
  onActivity(
    action: PipedriveWebhookAction,
    handler: WebhookEventHandler
  ): void {
    this.on(action, 'activity', handler);
  }

  /**
   * Registers a handler for all events
   * @param handler - Handler function
   */
  onAll(handler: WebhookEventHandler): void {
    this.globalHandlers.push(handler);
  }

  /**
   * Handles a webhook request
   * @param payload - Raw or parsed request body
   * @param headers - Request headers (lowercase keys)
   * @returns Parsed webhook event
   */
  async handle<T = unknown>(
    payload: string | Buffer | object,
    headers: Record<string, string | undefined>
  ): Promise<PipedriveWebhookEvent<T>> {
    // Verify webhook
    assertPipedriveWebhook(payload, headers, this.credentials);

    // Parse payload
    let parsedPayload: PipedriveWebhookPayload<T>;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      parsedPayload = JSON.parse(payloadString) as PipedriveWebhookPayload<T>;
    } else {
      parsedPayload = payload as PipedriveWebhookPayload<T>;
    }

    // Create webhook event
    const event = this.toWebhookEvent<T>(parsedPayload);

    // Call specific handlers
    const specificKey = `${event.action}.${event.object}`;
    const wildcardActionKey = `*.${event.object}`;
    const wildcardObjectKey = `${event.action}.*`;
    const globalKey = '*.*';

    const handlerKeys = [specificKey, wildcardActionKey, wildcardObjectKey, globalKey];

    for (const key of handlerKeys) {
      const handlers = this.eventHandlers.get(key) || [];
      for (const handler of handlers) {
        await handler(event);
      }
    }

    // Call global handlers
    for (const handler of this.globalHandlers) {
      await handler(event);
    }

    return event;
  }

  /**
   * Converts Pipedrive payload to a webhook event
   * @param payload - Pipedrive webhook payload
   * @returns Webhook event
   */
  toWebhookEvent<T = unknown>(payload: PipedriveWebhookPayload<T>): PipedriveWebhookEvent<T> {
    return {
      id: payload.meta.webhook_id,
      type: `${payload.meta.action}.${payload.meta.object}`,
      timestamp: new Date(payload.meta.timestamp * 1000),
      source: 'pipedrive',
      action: payload.meta.action,
      object: payload.meta.object,
      companyId: payload.meta.company_id,
      userId: payload.meta.user_id,
      current: payload.current,
      previous: payload.previous,
      payload,
    };
  }
}

/**
 * Creates a standardized webhook response
 * @param success - Whether processing was successful
 * @returns Response body
 */
export function createWebhookResponse(success: boolean): { success: boolean } {
  return { success };
}
