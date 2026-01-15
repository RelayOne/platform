/**
 * @fileoverview Google Drive webhook (push notification) handling
 * @module @relay/integrations/google-drive/webhooks
 */

import type { GoogleDriveWebhookHeaders, GoogleDriveFile } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { WebhookVerificationResult, WebhookEvent } from '../common/types';

/**
 * Google Drive resource states
 */
export type GoogleDriveResourceState = 'sync' | 'add' | 'remove' | 'update' | 'trash' | 'untrash' | 'change';

/**
 * Parsed Google Drive webhook event
 */
export interface GoogleDriveWebhookEvent extends WebhookEvent<GoogleDriveWebhookHeaders> {
  /** Channel ID */
  channelId: string;
  /** Channel token (arbitrary string you provided when creating the channel) */
  channelToken?: string;
  /** Channel expiration timestamp (ms) */
  channelExpiration?: number;
  /** Resource ID */
  resourceId: string;
  /** Resource URI */
  resourceUri: string;
  /** Resource state/change type */
  resourceState: GoogleDriveResourceState;
  /** Message number in sequence */
  messageNumber?: number;
  /** Changed fields (for update events) */
  changedFields?: string[];
}

/**
 * Verifies a Google Drive push notification
 *
 * Google Drive notifications don't use signatures, but we verify:
 * 1. Required headers are present
 * 2. Channel ID matches expected (if provided)
 * 3. Channel token matches expected (if provided)
 *
 * @param headers - Request headers (lowercase keys)
 * @param expectedChannelId - Optional expected channel ID
 * @param expectedToken - Optional expected channel token
 * @returns Verification result
 */
export function verifyGoogleDriveWebhook(
  headers: Record<string, string | undefined>,
  expectedChannelId?: string,
  expectedToken?: string
): WebhookVerificationResult {
  try {
    // Check for required headers
    const channelId = headers['x-goog-channel-id'];
    if (!channelId) {
      return {
        valid: false,
        error: 'Missing x-goog-channel-id header',
      };
    }

    const resourceId = headers['x-goog-resource-id'];
    if (!resourceId) {
      return {
        valid: false,
        error: 'Missing x-goog-resource-id header',
      };
    }

    const resourceState = headers['x-goog-resource-state'];
    if (!resourceState) {
      return {
        valid: false,
        error: 'Missing x-goog-resource-state header',
      };
    }

    // Validate channel ID if expected value provided
    if (expectedChannelId && channelId !== expectedChannelId) {
      return {
        valid: false,
        error: `Channel ID mismatch: expected ${expectedChannelId}, got ${channelId}`,
      };
    }

    // Validate token if expected value provided
    if (expectedToken) {
      const token = headers['x-goog-channel-token'];
      if (token !== expectedToken) {
        return {
          valid: false,
          error: 'Channel token mismatch',
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Webhook verification failed',
    };
  }
}

/**
 * Verifies a Google Drive webhook and throws on failure
 * @param headers - Request headers
 * @param expectedChannelId - Optional expected channel ID
 * @param expectedToken - Optional expected channel token
 * @throws WebhookVerificationError if verification fails
 */
export function assertGoogleDriveWebhook(
  headers: Record<string, string | undefined>,
  expectedChannelId?: string,
  expectedToken?: string
): void {
  const result = verifyGoogleDriveWebhook(headers, expectedChannelId, expectedToken);
  if (!result.valid) {
    throw new WebhookVerificationError('google-drive', result.error);
  }
}

/**
 * Parses Google Drive webhook headers into a structured event
 * @param headers - Request headers (case-insensitive keys accepted)
 * @returns Parsed webhook event
 */
export function parseGoogleDriveWebhookHeaders(
  headers: Record<string, string | undefined>
): GoogleDriveWebhookEvent {
  // Normalize headers to lowercase
  const normalizedHeaders: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const channelId = normalizedHeaders['x-goog-channel-id'];
  const resourceId = normalizedHeaders['x-goog-resource-id'];
  const resourceState = normalizedHeaders['x-goog-resource-state'] as GoogleDriveResourceState;

  if (!channelId || !resourceId || !resourceState) {
    throw new WebhookVerificationError(
      'google-drive',
      'Missing required Google Drive webhook headers'
    );
  }

  const expiration = normalizedHeaders['x-goog-channel-expiration'];
  const messageNumber = normalizedHeaders['x-goog-message-number'];
  const changed = normalizedHeaders['x-goog-changed'];

  return {
    id: `${channelId}-${messageNumber || Date.now()}`,
    type: resourceState,
    timestamp: new Date(),
    source: 'google-drive',
    channelId,
    channelToken: normalizedHeaders['x-goog-channel-token'],
    channelExpiration: expiration ? parseInt(expiration, 10) : undefined,
    resourceId,
    resourceUri: normalizedHeaders['x-goog-resource-uri'] || '',
    resourceState,
    messageNumber: messageNumber ? parseInt(messageNumber, 10) : undefined,
    changedFields: changed ? changed.split(',') : undefined,
    payload: normalizedHeaders as GoogleDriveWebhookHeaders,
  };
}

/**
 * Event handler function type
 */
type WebhookEventHandler = (event: GoogleDriveWebhookEvent) => void | Promise<void>;

/**
 * Google Drive webhook handler class
 */
export class GoogleDriveWebhookHandler {
  private expectedChannelIds: Set<string>;
  private expectedToken?: string;
  private eventHandlers: Map<GoogleDriveResourceState | '*', WebhookEventHandler[]>;
  private syncHandlers: WebhookEventHandler[];

  /**
   * Creates a new Google Drive webhook handler
   * @param options - Handler options
   */
  constructor(options?: {
    expectedChannelIds?: string[];
    expectedToken?: string;
  }) {
    this.expectedChannelIds = new Set(options?.expectedChannelIds || []);
    this.expectedToken = options?.expectedToken;
    this.eventHandlers = new Map();
    this.syncHandlers = [];
  }

  /**
   * Adds an expected channel ID
   * @param channelId - Channel ID to expect
   */
  addExpectedChannel(channelId: string): void {
    this.expectedChannelIds.add(channelId);
  }

  /**
   * Removes an expected channel ID
   * @param channelId - Channel ID to remove
   */
  removeExpectedChannel(channelId: string): void {
    this.expectedChannelIds.delete(channelId);
  }

  /**
   * Registers an event handler for a specific resource state
   * @param state - Resource state to handle (or '*' for all)
   * @param handler - Handler function
   */
  on(state: GoogleDriveResourceState | '*', handler: WebhookEventHandler): void {
    const handlers = this.eventHandlers.get(state) || [];
    handlers.push(handler);
    this.eventHandlers.set(state, handlers);
  }

  /**
   * Registers a handler for sync events (channel confirmation)
   * @param handler - Handler function
   */
  onSync(handler: WebhookEventHandler): void {
    this.syncHandlers.push(handler);
  }

  /**
   * Registers a handler for add events (new file)
   * @param handler - Handler function
   */
  onAdd(handler: WebhookEventHandler): void {
    this.on('add', handler);
  }

  /**
   * Registers a handler for remove events (file deleted)
   * @param handler - Handler function
   */
  onRemove(handler: WebhookEventHandler): void {
    this.on('remove', handler);
  }

  /**
   * Registers a handler for update events (file modified)
   * @param handler - Handler function
   */
  onUpdate(handler: WebhookEventHandler): void {
    this.on('update', handler);
  }

  /**
   * Registers a handler for trash events (file trashed)
   * @param handler - Handler function
   */
  onTrash(handler: WebhookEventHandler): void {
    this.on('trash', handler);
  }

  /**
   * Registers a handler for untrash events (file restored)
   * @param handler - Handler function
   */
  onUntrash(handler: WebhookEventHandler): void {
    this.on('untrash', handler);
  }

  /**
   * Registers a handler for change events (changes list update)
   * @param handler - Handler function
   */
  onChange(handler: WebhookEventHandler): void {
    this.on('change', handler);
  }

  /**
   * Registers a handler for all events
   * @param handler - Handler function
   */
  onAll(handler: WebhookEventHandler): void {
    this.on('*', handler);
  }

  /**
   * Handles a webhook request
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  async handle(headers: Record<string, string | undefined>): Promise<GoogleDriveWebhookEvent> {
    // Normalize headers
    const normalizedHeaders: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    // Verify if we have expected channels
    if (this.expectedChannelIds.size > 0) {
      const channelId = normalizedHeaders['x-goog-channel-id'];
      if (channelId && !this.expectedChannelIds.has(channelId)) {
        throw new WebhookVerificationError(
          'google-drive',
          `Unexpected channel ID: ${channelId}`
        );
      }
    }

    // Verify token if expected
    assertGoogleDriveWebhook(normalizedHeaders, undefined, this.expectedToken);

    // Parse event
    const event = parseGoogleDriveWebhookHeaders(normalizedHeaders);

    // Handle sync events specially
    if (event.resourceState === 'sync') {
      for (const handler of this.syncHandlers) {
        await handler(event);
      }
    }

    // Call specific handlers
    const specificHandlers = this.eventHandlers.get(event.resourceState) || [];
    for (const handler of specificHandlers) {
      await handler(event);
    }

    // Call wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      await handler(event);
    }

    return event;
  }
}

/**
 * Creates a standardized webhook response
 * Google Drive expects a 200 OK with no body
 * @returns Empty response
 */
export function createWebhookResponse(): { status: number } {
  return { status: 200 };
}

/**
 * Checks if a channel is about to expire
 * @param expirationMs - Channel expiration timestamp in milliseconds
 * @param bufferMs - Buffer time before expiration (default: 1 hour)
 * @returns Whether the channel should be renewed
 */
export function shouldRenewChannel(
  expirationMs: number,
  bufferMs: number = 60 * 60 * 1000
): boolean {
  return Date.now() >= expirationMs - bufferMs;
}
