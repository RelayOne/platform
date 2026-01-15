/**
 * @fileoverview OneDrive/Microsoft Graph webhook handling
 * @module @relay/integrations/onedrive/webhooks
 */

import * as crypto from 'crypto';
import type { OneDriveWebhookPayload, OneDriveWebhookNotification } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { WebhookVerificationResult, WebhookEvent } from '../common/types';

/**
 * OneDrive webhook change types
 */
export type OneDriveChangeType = 'created' | 'updated' | 'deleted';

/**
 * Parsed OneDrive webhook event
 */
export interface OneDriveWebhookEvent extends WebhookEvent<OneDriveWebhookNotification> {
  /** Subscription ID */
  subscriptionId: string;
  /** Subscription expiration */
  subscriptionExpiration: Date;
  /** Change type */
  changeType: OneDriveChangeType;
  /** Resource path */
  resource: string;
  /** Client state (your validation token) */
  clientState?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Resource data (if includeResourceData was enabled) */
  resourceData?: {
    type?: string;
    id?: string;
    etag?: string;
  };
}

/**
 * Verifies a Microsoft Graph webhook validation request
 *
 * When you create a subscription, Microsoft sends a validation request
 * with a validationToken query parameter that must be echoed back.
 *
 * @param validationToken - The validation token from the query string
 * @returns Whether this is a valid validation request
 */
export function isValidationRequest(validationToken: string | undefined): boolean {
  return typeof validationToken === 'string' && validationToken.length > 0;
}

/**
 * Creates a response for the validation request
 * @param validationToken - The validation token to echo back
 * @returns Response with the validation token
 */
export function createValidationResponse(validationToken: string): {
  statusCode: number;
  body: string;
  contentType: string;
} {
  return {
    statusCode: 200,
    body: validationToken,
    contentType: 'text/plain',
  };
}

/**
 * Verifies a OneDrive webhook notification
 *
 * Microsoft Graph webhooks can be verified by:
 * 1. Checking the clientState matches what you provided when creating the subscription
 * 2. Optionally validating the encrypted content signature (if using resource data)
 *
 * @param payload - Raw or parsed request body
 * @param expectedClientState - The client state you provided when creating the subscription
 * @returns Verification result
 */
export function verifyOneDriveWebhook(
  payload: string | Buffer | OneDriveWebhookPayload,
  expectedClientState?: string
): WebhookVerificationResult {
  try {
    // Parse payload if needed
    let parsedPayload: OneDriveWebhookPayload;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      parsedPayload = JSON.parse(payloadString) as OneDriveWebhookPayload;
    } else {
      parsedPayload = payload;
    }

    // Validate structure
    if (!parsedPayload.value || !Array.isArray(parsedPayload.value)) {
      return {
        valid: false,
        error: 'Invalid payload: missing value array',
      };
    }

    // Validate client state if expected
    if (expectedClientState) {
      for (const notification of parsedPayload.value) {
        if (notification.clientState !== expectedClientState) {
          return {
            valid: false,
            error: 'Client state mismatch',
          };
        }
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
 * Verifies encrypted resource data in a notification
 *
 * When includeResourceData is enabled, the resource data is encrypted.
 * This function verifies the signature using your certificate.
 *
 * @param encryptedContent - The encrypted content from the notification
 * @param publicKey - Your public key (PEM format)
 * @returns Whether the signature is valid
 */
export function verifyEncryptedContent(
  encryptedContent: {
    data: string;
    dataSignature: string;
    dataKey: string;
    encryptionCertificateId: string;
    encryptionCertificateThumbprint: string;
  },
  publicKey: string
): boolean {
  try {
    // Verify the signature using the public key
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(encryptedContent.data);

    return verify.verify(publicKey, encryptedContent.dataSignature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Decrypts resource data from a notification
 *
 * @param encryptedContent - The encrypted content from the notification
 * @param privateKey - Your private key (PEM format)
 * @returns Decrypted resource data
 */
export function decryptResourceData(
  encryptedContent: {
    data: string;
    dataSignature: string;
    dataKey: string;
    encryptionCertificateId: string;
    encryptionCertificateThumbprint: string;
  },
  privateKey: string
): unknown {
  // Decrypt the symmetric key using RSA
  const encryptedKey = Buffer.from(encryptedContent.dataKey, 'base64');
  const decryptedKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    encryptedKey
  );

  // Decrypt the data using AES
  const encryptedData = Buffer.from(encryptedContent.data, 'base64');
  const iv = encryptedData.subarray(0, 16);
  const ciphertext = encryptedData.subarray(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', decryptedKey, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Verifies a OneDrive webhook and throws on failure
 * @param payload - Raw or parsed request body
 * @param expectedClientState - Expected client state
 * @throws WebhookVerificationError if verification fails
 */
export function assertOneDriveWebhook(
  payload: string | Buffer | OneDriveWebhookPayload,
  expectedClientState?: string
): void {
  const result = verifyOneDriveWebhook(payload, expectedClientState);
  if (!result.valid) {
    throw new WebhookVerificationError('onedrive', result.error);
  }
}

/**
 * Parses OneDrive webhook notifications into structured events
 * @param payload - Raw or parsed webhook payload
 * @returns Array of webhook events
 */
export function parseOneDriveWebhookPayload(
  payload: string | Buffer | OneDriveWebhookPayload
): OneDriveWebhookEvent[] {
  let parsedPayload: OneDriveWebhookPayload;
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    parsedPayload = JSON.parse(payloadString) as OneDriveWebhookPayload;
  } else {
    parsedPayload = payload;
  }

  return parsedPayload.value.map((notification) => ({
    id: `${notification.subscriptionId}-${Date.now()}`,
    type: notification.changeType,
    timestamp: new Date(),
    source: 'onedrive',
    subscriptionId: notification.subscriptionId,
    subscriptionExpiration: new Date(notification.subscriptionExpirationDateTime),
    changeType: notification.changeType,
    resource: notification.resource,
    clientState: notification.clientState,
    tenantId: notification.tenantId,
    resourceData: notification.resourceData ? {
      type: notification.resourceData['@odata.type'],
      id: notification.resourceData.id,
      etag: notification.resourceData['@odata.etag'],
    } : undefined,
    payload: notification,
  }));
}

/**
 * Event handler function type
 */
type WebhookEventHandler = (event: OneDriveWebhookEvent) => void | Promise<void>;

/**
 * OneDrive webhook handler class
 */
export class OneDriveWebhookHandler {
  private expectedClientState?: string;
  private eventHandlers: Map<OneDriveChangeType | '*', WebhookEventHandler[]>;
  private privateKey?: string;

  /**
   * Creates a new OneDrive webhook handler
   * @param options - Handler options
   */
  constructor(options?: {
    expectedClientState?: string;
    privateKey?: string;
  }) {
    this.expectedClientState = options?.expectedClientState;
    this.privateKey = options?.privateKey;
    this.eventHandlers = new Map();
  }

  /**
   * Registers an event handler for a specific change type
   * @param changeType - Change type to handle (or '*' for all)
   * @param handler - Handler function
   */
  on(changeType: OneDriveChangeType | '*', handler: WebhookEventHandler): void {
    const handlers = this.eventHandlers.get(changeType) || [];
    handlers.push(handler);
    this.eventHandlers.set(changeType, handlers);
  }

  /**
   * Registers a handler for created events
   * @param handler - Handler function
   */
  onCreated(handler: WebhookEventHandler): void {
    this.on('created', handler);
  }

  /**
   * Registers a handler for updated events
   * @param handler - Handler function
   */
  onUpdated(handler: WebhookEventHandler): void {
    this.on('updated', handler);
  }

  /**
   * Registers a handler for deleted events
   * @param handler - Handler function
   */
  onDeleted(handler: WebhookEventHandler): void {
    this.on('deleted', handler);
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
   * @param payload - Raw or parsed request body
   * @param validationToken - Validation token from query string (for subscription validation)
   * @returns Response to send back
   */
  async handle(
    payload: string | Buffer | OneDriveWebhookPayload,
    validationToken?: string
  ): Promise<{
    statusCode: number;
    body?: string;
    contentType?: string;
    events?: OneDriveWebhookEvent[];
  }> {
    // Handle validation request
    if (isValidationRequest(validationToken)) {
      return createValidationResponse(validationToken!);
    }

    // Verify webhook
    assertOneDriveWebhook(payload, this.expectedClientState);

    // Parse events
    const events = parseOneDriveWebhookPayload(payload);

    // Process each event
    for (const event of events) {
      // Call specific handlers
      const specificHandlers = this.eventHandlers.get(event.changeType) || [];
      for (const handler of specificHandlers) {
        await handler(event);
      }

      // Call wildcard handlers
      const wildcardHandlers = this.eventHandlers.get('*') || [];
      for (const handler of wildcardHandlers) {
        await handler(event);
      }
    }

    return {
      statusCode: 202,
      events,
    };
  }
}

/**
 * Creates a standardized webhook response
 * Microsoft Graph expects a 202 Accepted for notifications
 * @returns Response object
 */
export function createWebhookResponse(): { statusCode: number } {
  return { statusCode: 202 };
}

/**
 * Checks if a subscription is about to expire
 * @param expirationDateTime - Subscription expiration date/time string
 * @param bufferMs - Buffer time before expiration (default: 1 hour)
 * @returns Whether the subscription should be renewed
 */
export function shouldRenewSubscription(
  expirationDateTime: string,
  bufferMs: number = 60 * 60 * 1000
): boolean {
  const expiration = new Date(expirationDateTime).getTime();
  return Date.now() >= expiration - bufferMs;
}

/**
 * Calculates subscription expiration date
 * Microsoft Graph subscriptions can be up to 4230 minutes (about 3 days) for drive items
 * @param durationMinutes - Duration in minutes (max 4230 for drive items)
 * @returns Expiration date/time string in ISO format
 */
export function calculateSubscriptionExpiration(durationMinutes: number = 4230): string {
  const expiration = new Date(Date.now() + durationMinutes * 60 * 1000);
  return expiration.toISOString();
}
