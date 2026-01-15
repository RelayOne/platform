/**
 * @fileoverview HubSpot webhook handling and signature verification
 * @module @relay/integrations/hubspot/webhooks
 */

import * as crypto from 'crypto';
import type { HubSpotWebhookPayload, HubSpotWebhookEventType } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { WebhookVerificationResult, WebhookEvent } from '../common/types';

/**
 * Parsed HubSpot webhook event
 */
export interface HubSpotWebhookEvent extends WebhookEvent<HubSpotWebhookPayload[]> {
  /** Event type (e.g., 'contact.creation') */
  type: HubSpotWebhookEventType;
  /** Portal ID */
  portalId: number;
}

/**
 * Verifies a HubSpot v1 webhook signature (deprecated, still supported)
 *
 * V1 signature uses: SHA256(client_secret + body)
 *
 * @param payload - Raw request body
 * @param signature - X-HubSpot-Signature header
 * @param clientSecret - HubSpot app client secret
 * @returns Verification result
 */
export function verifyWebhookSignatureV1(
  payload: string | Buffer,
  signature: string,
  clientSecret: string
): WebhookVerificationResult {
  try {
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

    const expectedSignature = crypto
      .createHash('sha256')
      .update(clientSecret + payloadString)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expectedSignature.toLowerCase())
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'V1 signature mismatch',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'V1 signature verification failed',
    };
  }
}

/**
 * Verifies a HubSpot v2 webhook signature
 *
 * V2 signature uses: SHA256(client_secret + method + uri + body)
 *
 * @param payload - Raw request body
 * @param signature - X-HubSpot-Signature-v2 header
 * @param clientSecret - HubSpot app client secret
 * @param method - HTTP method (e.g., 'POST')
 * @param uri - Full request URI (e.g., 'https://example.com/webhooks/hubspot')
 * @returns Verification result
 */
export function verifyWebhookSignatureV2(
  payload: string | Buffer,
  signature: string,
  clientSecret: string,
  method: string,
  uri: string
): WebhookVerificationResult {
  try {
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

    // V2: client_secret + method + URI + body
    const sourceString = clientSecret + method.toUpperCase() + uri + payloadString;
    const expectedSignature = crypto
      .createHash('sha256')
      .update(sourceString)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expectedSignature.toLowerCase())
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'V2 signature mismatch',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'V2 signature verification failed',
    };
  }
}

/**
 * Verifies a HubSpot v3 webhook signature (current standard)
 *
 * V3 signature uses: HMAC-SHA256(client_secret, method + uri + body + timestamp)
 *
 * @param payload - Raw request body
 * @param signature - X-HubSpot-Signature-v3 header
 * @param clientSecret - HubSpot app client secret
 * @param method - HTTP method (e.g., 'POST')
 * @param uri - Full request URI
 * @param timestamp - X-HubSpot-Request-Timestamp header
 * @param maxAgeMs - Maximum age of request in milliseconds (default: 5 minutes)
 * @returns Verification result
 */
export function verifyWebhookSignatureV3(
  payload: string | Buffer,
  signature: string,
  clientSecret: string,
  method: string,
  uri: string,
  timestamp: string,
  maxAgeMs: number = 5 * 60 * 1000
): WebhookVerificationResult {
  try {
    // Verify timestamp is not too old
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime)) {
      return {
        valid: false,
        error: 'Invalid timestamp',
      };
    }

    const now = Date.now();
    if (now - requestTime > maxAgeMs) {
      return {
        valid: false,
        error: `Request timestamp too old (${Math.round((now - requestTime) / 1000)}s ago)`,
      };
    }

    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

    // V3: HMAC-SHA256(client_secret, method + URI + body + timestamp)
    const sourceString = method.toUpperCase() + uri + payloadString + timestamp;
    const expectedSignature = crypto
      .createHmac('sha256', clientSecret)
      .update(sourceString)
      .digest('base64');

    // V3 signatures are base64 encoded
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'V3 signature mismatch',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'V3 signature verification failed',
    };
  }
}

/**
 * Verifies a HubSpot webhook using the appropriate version
 *
 * Automatically detects and uses V3, V2, or V1 signature based on headers
 *
 * @param payload - Raw request body
 * @param headers - Request headers (lowercase keys)
 * @param clientSecret - HubSpot app client secret
 * @param method - HTTP method
 * @param uri - Full request URI
 * @returns Verification result
 */
export function verifyHubSpotWebhook(
  payload: string | Buffer,
  headers: Record<string, string | undefined>,
  clientSecret: string,
  method: string,
  uri: string
): WebhookVerificationResult {
  // Try V3 first (recommended)
  const signatureV3 = headers['x-hubspot-signature-v3'];
  const timestamp = headers['x-hubspot-request-timestamp'];
  if (signatureV3 && timestamp) {
    return verifyWebhookSignatureV3(payload, signatureV3, clientSecret, method, uri, timestamp);
  }

  // Try V2
  const signatureV2 = headers['x-hubspot-signature-v2'];
  if (signatureV2) {
    return verifyWebhookSignatureV2(payload, signatureV2, clientSecret, method, uri);
  }

  // Fall back to V1
  const signatureV1 = headers['x-hubspot-signature'];
  if (signatureV1) {
    return verifyWebhookSignatureV1(payload, signatureV1, clientSecret);
  }

  return {
    valid: false,
    error: 'No HubSpot signature header found',
  };
}

/**
 * Verifies a HubSpot webhook and throws on failure
 * @param payload - Raw request body
 * @param headers - Request headers
 * @param clientSecret - HubSpot app client secret
 * @param method - HTTP method
 * @param uri - Full request URI
 * @throws WebhookVerificationError if verification fails
 */
export function assertHubSpotWebhook(
  payload: string | Buffer,
  headers: Record<string, string | undefined>,
  clientSecret: string,
  method: string,
  uri: string
): void {
  const result = verifyHubSpotWebhook(payload, headers, clientSecret, method, uri);
  if (!result.valid) {
    throw new WebhookVerificationError('hubspot', result.error);
  }
}

/**
 * HubSpot webhook handler class
 */
export class HubSpotWebhookHandler {
  private clientSecret: string;
  private eventHandlers: Map<HubSpotWebhookEventType, ((event: HubSpotWebhookPayload) => void | Promise<void>)[]>;

  /**
   * Creates a new HubSpot webhook handler
   * @param clientSecret - HubSpot app client secret
   */
  constructor(clientSecret: string) {
    this.clientSecret = clientSecret;
    this.eventHandlers = new Map();
  }

  /**
   * Registers an event handler
   * @param eventType - Event type to handle
   * @param handler - Handler function
   */
  on(
    eventType: HubSpotWebhookEventType,
    handler: (event: HubSpotWebhookPayload) => void | Promise<void>
  ): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Registers a handler for all events
   * @param handler - Handler function
   */
  onAll(handler: (event: HubSpotWebhookPayload) => void | Promise<void>): void {
    const allEventTypes: HubSpotWebhookEventType[] = [
      'contact.creation',
      'contact.deletion',
      'contact.propertyChange',
      'contact.merge',
      'company.creation',
      'company.deletion',
      'company.propertyChange',
      'company.merge',
      'deal.creation',
      'deal.deletion',
      'deal.propertyChange',
      'deal.merge',
    ];

    for (const eventType of allEventTypes) {
      this.on(eventType, handler);
    }
  }

  /**
   * Handles a webhook request
   * @param payload - Raw request body
   * @param headers - Request headers
   * @param method - HTTP method
   * @param uri - Full request URI
   * @returns Parsed webhook events
   */
  async handle(
    payload: string | Buffer,
    headers: Record<string, string | undefined>,
    method: string,
    uri: string
  ): Promise<HubSpotWebhookEvent[]> {
    // Verify signature
    assertHubSpotWebhook(payload, headers, this.clientSecret, method, uri);

    // Parse payload
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    const events = JSON.parse(payloadString) as HubSpotWebhookPayload[];

    const webhookEvents: HubSpotWebhookEvent[] = [];

    // Process each event
    for (const event of events) {
      const webhookEvent = this.toWebhookEvent([event]);
      webhookEvents.push(webhookEvent);

      // Call handlers
      const handlers = this.eventHandlers.get(event.subscriptionType) || [];
      for (const handler of handlers) {
        await handler(event);
      }
    }

    return webhookEvents;
  }

  /**
   * Converts HubSpot payloads to a webhook event
   * @param payloads - HubSpot webhook payloads
   * @returns Webhook event
   */
  toWebhookEvent(payloads: HubSpotWebhookPayload[]): HubSpotWebhookEvent {
    const firstPayload = payloads[0];
    return {
      id: String(firstPayload.eventId),
      type: firstPayload.subscriptionType,
      timestamp: new Date(firstPayload.occurredAt),
      source: 'hubspot',
      portalId: firstPayload.portalId,
      payload: payloads,
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
