/**
 * @fileoverview Salesforce webhook and Platform Event handling
 * @module @relay/integrations/salesforce/webhooks
 */

import * as crypto from 'crypto';
import type { SalesforceOutboundMessage, SalesforcePlatformEvent } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { WebhookVerificationResult, WebhookEvent } from '../common/types';

/**
 * Salesforce webhook event types
 */
export type SalesforceWebhookEventType =
  | 'outbound_message'
  | 'platform_event'
  | 'change_data_capture';

/**
 * Parsed Salesforce webhook event
 */
export interface SalesforceWebhookEvent extends WebhookEvent {
  /** Event subtype */
  subtype: SalesforceWebhookEventType;
  /** Organization ID */
  organizationId?: string;
  /** Object type (for CDC) */
  objectType?: string;
}

/**
 * Outbound Message handler for Salesforce Workflow Rules
 *
 * Note: Salesforce Outbound Messages use SOAP XML format and should be
 * verified using the session ID or IP whitelisting, not signature verification.
 */
export class SalesforceOutboundMessageHandler {
  private allowedOrgIds: Set<string>;
  private allowedIps: Set<string>;

  /**
   * Creates a new Outbound Message handler
   * @param options - Handler options
   */
  constructor(options?: {
    /** Allowed Salesforce organization IDs */
    allowedOrgIds?: string[];
    /** Allowed IP addresses (Salesforce IP ranges) */
    allowedIps?: string[];
  }) {
    this.allowedOrgIds = new Set(options?.allowedOrgIds || []);
    this.allowedIps = new Set(options?.allowedIps || []);
  }

  /**
   * Verifies an Outbound Message request
   * @param organizationId - Organization ID from the message
   * @param sourceIp - Source IP address
   * @returns Verification result
   */
  verify(organizationId: string, sourceIp?: string): WebhookVerificationResult {
    // Verify organization ID if configured
    if (this.allowedOrgIds.size > 0 && !this.allowedOrgIds.has(organizationId)) {
      return {
        valid: false,
        error: `Organization ID ${organizationId} not in allowed list`,
      };
    }

    // Verify source IP if configured
    if (sourceIp && this.allowedIps.size > 0 && !this.allowedIps.has(sourceIp)) {
      return {
        valid: false,
        error: `Source IP ${sourceIp} not in allowed list`,
      };
    }

    return { valid: true };
  }

  /**
   * Parses an Outbound Message from XML
   * @param xmlBody - Raw XML body
   * @returns Parsed outbound message
   */
  parseMessage(xmlBody: string): SalesforceOutboundMessage {
    // Basic XML parsing - in production, use a proper XML parser like fast-xml-parser
    const extractValue = (xml: string, tag: string): string | undefined => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const match = xml.match(regex);
      return match ? match[1] : undefined;
    };

    const extractAllNotifications = (xml: string): { Id: string; sObject: Record<string, unknown> }[] => {
      const notifications: { Id: string; sObject: Record<string, unknown> }[] = [];
      const notificationRegex = /<Notification>([\s\S]*?)<\/Notification>/gi;
      let match;

      while ((match = notificationRegex.exec(xml)) !== null) {
        const notificationXml = match[1];
        const id = extractValue(notificationXml, 'Id') || '';

        // Extract sObject - this is simplified; real implementation needs proper XML parsing
        const sObjectMatch = notificationXml.match(/<sObject[^>]*>([\s\S]*?)<\/sObject>/i);
        const sObject: Record<string, unknown> = {};

        if (sObjectMatch) {
          // Extract all fields from sObject
          const fieldRegex = /<sf:(\w+)[^>]*>([^<]*)<\/sf:\1>/gi;
          let fieldMatch;
          while ((fieldMatch = fieldRegex.exec(sObjectMatch[1])) !== null) {
            sObject[fieldMatch[1]] = fieldMatch[2];
          }
        }

        notifications.push({ Id: id, sObject });
      }

      return notifications;
    };

    return {
      OrganizationId: extractValue(xmlBody, 'OrganizationId') || '',
      ActionId: extractValue(xmlBody, 'ActionId') || '',
      SessionId: extractValue(xmlBody, 'SessionId'),
      EnterpriseUrl: extractValue(xmlBody, 'EnterpriseUrl') || '',
      PartnerUrl: extractValue(xmlBody, 'PartnerUrl') || '',
      Notification: extractAllNotifications(xmlBody),
    };
  }

  /**
   * Creates an acknowledgment response for Outbound Messages
   * @param success - Whether processing was successful
   * @returns SOAP XML response
   */
  createAcknowledgment(success: boolean): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>${success}</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  /**
   * Converts an Outbound Message to a webhook event
   * @param message - Parsed outbound message
   * @returns Webhook event
   */
  toWebhookEvent(message: SalesforceOutboundMessage): SalesforceWebhookEvent {
    return {
      id: message.ActionId,
      type: 'outbound_message',
      subtype: 'outbound_message',
      timestamp: new Date(),
      source: 'salesforce',
      organizationId: message.OrganizationId,
      payload: message,
    };
  }
}

/**
 * Platform Event handler for Salesforce streaming events
 *
 * Platform Events use the CometD protocol for real-time streaming.
 * This handler processes events received via the Streaming API.
 */
export class SalesforcePlatformEventHandler {
  private eventTypes: Set<string>;

  /**
   * Creates a new Platform Event handler
   * @param eventTypes - Event types to handle (e.g., ['MyEvent__e'])
   */
  constructor(eventTypes?: string[]) {
    this.eventTypes = new Set(eventTypes || []);
  }

  /**
   * Parses a Platform Event from the streaming payload
   * @param payload - Event payload from CometD
   * @returns Parsed platform event
   */
  parseEvent(payload: Record<string, unknown>): SalesforcePlatformEvent {
    const event = payload.event as Record<string, unknown> || {};

    return {
      type: (event.EventApiName as string) || 'Unknown',
      schema: payload.schema as string || '',
      payload: payload.payload as Record<string, unknown> || {},
      event: {
        replayId: event.replayId as number || 0,
        EventApiName: event.EventApiName as string || '',
        EventUuid: event.EventUuid as string || '',
        CreatedById: event.CreatedById as string || '',
        CreatedDate: event.CreatedDate as string || '',
      },
    };
  }

  /**
   * Checks if this handler should process the event
   * @param eventType - Event type name
   * @returns Whether to handle this event
   */
  shouldHandle(eventType: string): boolean {
    if (this.eventTypes.size === 0) {
      return true; // Handle all events if no filter configured
    }
    return this.eventTypes.has(eventType);
  }

  /**
   * Converts a Platform Event to a webhook event
   * @param event - Parsed platform event
   * @returns Webhook event
   */
  toWebhookEvent(event: SalesforcePlatformEvent): SalesforceWebhookEvent {
    return {
      id: event.event.EventUuid,
      type: event.type,
      subtype: 'platform_event',
      timestamp: new Date(event.event.CreatedDate || Date.now()),
      source: 'salesforce',
      payload: event,
    };
  }
}

/**
 * Change Data Capture (CDC) event handler
 *
 * CDC events are published when records are created, updated, deleted,
 * or undeleted in Salesforce.
 */
export class SalesforceChangeDataCaptureHandler {
  private objectTypes: Set<string>;

  /**
   * Creates a new CDC handler
   * @param objectTypes - Object types to handle (e.g., ['Account', 'Contact'])
   */
  constructor(objectTypes?: string[]) {
    this.objectTypes = new Set(objectTypes || []);
  }

  /**
   * Change types for CDC events
   */
  static readonly ChangeTypes = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    UNDELETE: 'UNDELETE',
  } as const;

  /**
   * Parses a CDC event from the streaming payload
   * @param payload - Event payload from CometD
   * @returns Parsed CDC event details
   */
  parseEvent(payload: Record<string, unknown>): {
    objectType: string;
    changeType: string;
    recordIds: string[];
    changedFields: string[];
    replayId: number;
    transactionKey: string;
  } {
    const changeEventHeader = payload.ChangeEventHeader as Record<string, unknown> || {};

    return {
      objectType: changeEventHeader.entityName as string || '',
      changeType: changeEventHeader.changeType as string || '',
      recordIds: changeEventHeader.recordIds as string[] || [],
      changedFields: changeEventHeader.changedFields as string[] || [],
      replayId: changeEventHeader.replayId as number || 0,
      transactionKey: changeEventHeader.transactionKey as string || '',
    };
  }

  /**
   * Checks if this handler should process the event
   * @param objectType - Object type name
   * @returns Whether to handle this event
   */
  shouldHandle(objectType: string): boolean {
    if (this.objectTypes.size === 0) {
      return true; // Handle all objects if no filter configured
    }
    return this.objectTypes.has(objectType);
  }

  /**
   * Converts a CDC event to a webhook event
   * @param payload - Raw CDC payload
   * @returns Webhook event
   */
  toWebhookEvent(payload: Record<string, unknown>): SalesforceWebhookEvent {
    const parsed = this.parseEvent(payload);

    return {
      id: `${parsed.transactionKey}-${parsed.replayId}`,
      type: `${parsed.objectType}.${parsed.changeType}`,
      subtype: 'change_data_capture',
      timestamp: new Date(),
      source: 'salesforce',
      objectType: parsed.objectType,
      payload: {
        ...payload,
        _parsed: parsed,
      },
    };
  }
}

/**
 * Verifies a Salesforce webhook signature (for custom implementations)
 *
 * Note: Standard Salesforce Outbound Messages don't use HMAC signatures.
 * This is for custom webhook implementations that add signature verification.
 *
 * @param payload - Raw payload string
 * @param signature - Signature from request header
 * @param secret - Shared secret
 * @returns Verification result
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): WebhookVerificationResult {
  try {
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature mismatch',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Verifies a Salesforce webhook and throws on failure
 * @param payload - Raw payload
 * @param signature - Signature to verify
 * @param secret - Shared secret
 * @throws WebhookVerificationError if verification fails
 */
export function assertWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): void {
  const result = verifyWebhookSignature(payload, signature, secret);
  if (!result.valid) {
    throw new WebhookVerificationError('salesforce', result.error);
  }
}

/**
 * Salesforce IP ranges for webhook source verification
 * These should be updated periodically from Salesforce documentation
 * @see https://help.salesforce.com/s/articleView?id=000384438&type=1
 */
export const SALESFORCE_IP_RANGES = {
  /** Production IP ranges */
  production: [
    '96.43.144.0/20',
    '136.146.0.0/15',
    '161.71.0.0/17',
    '204.14.232.0/21',
  ],
  /** Sandbox IP ranges */
  sandbox: [
    '96.43.144.0/20',
    '136.146.0.0/15',
  ],
} as const;
