/**
 * @fileoverview Jira webhook verification and parsing
 * @module @relay/integrations/jira/webhooks
 */

import crypto from 'crypto';
import type {
  JiraWebhookEvent,
  JiraWebhookEventType,
  JiraIssue,
  JiraComment,
  JiraUser,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource, WebhookVerificationResult } from '../common/types';

/**
 * Jira integration source identifier
 */
const SOURCE: IntegrationSource = 'jira';

/**
 * Verifies a Jira webhook signature
 * Jira Cloud uses HMAC-SHA256 signatures
 * @param payload - Raw webhook payload (string or Buffer)
 * @param signature - Signature from X-Hub-Signature header
 * @param secret - Webhook secret
 * @returns Verification result
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): WebhookVerificationResult {
  if (!signature) {
    return { valid: false, error: 'Missing signature header' };
  }

  if (!secret) {
    return { valid: false, error: 'Webhook secret not configured' };
  }

  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');

    // Jira uses sha256=<signature> format
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      return { valid: false, error: 'Invalid signature format' };
    }

    const expectedSignature = signatureParts[1];
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );

    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Parses a Jira webhook payload
 * @param payload - Raw webhook payload
 * @returns Parsed webhook event
 */
export function parseWebhookPayload(payload: string | Buffer): JiraWebhookEvent {
  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    const data = JSON.parse(payloadString);

    return {
      timestamp: data.timestamp,
      webhookEvent: data.webhookEvent as JiraWebhookEventType,
      user: data.user as JiraUser | undefined,
      issue: data.issue as JiraIssue | undefined,
      changelog: data.changelog,
      comment: data.comment as JiraComment | undefined,
      sprint: data.sprint,
      worklog: data.worklog,
    };
  } catch (error) {
    throw new WebhookVerificationError(
      SOURCE,
      `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts the event type from a Jira webhook
 * @param payload - Parsed webhook payload
 * @returns Event type string
 */
export function getEventType(payload: JiraWebhookEvent): string {
  return payload.webhookEvent;
}

/**
 * Checks if the webhook is an issue event
 * @param event - Webhook event
 * @returns Whether the event is an issue event
 */
export function isIssueEvent(event: JiraWebhookEvent): boolean {
  return event.webhookEvent.startsWith('jira:issue_');
}

/**
 * Checks if the webhook is a comment event
 * @param event - Webhook event
 * @returns Whether the event is a comment event
 */
export function isCommentEvent(event: JiraWebhookEvent): boolean {
  return event.webhookEvent.startsWith('comment_');
}

/**
 * Checks if the webhook is a sprint event
 * @param event - Webhook event
 * @returns Whether the event is a sprint event
 */
export function isSprintEvent(event: JiraWebhookEvent): boolean {
  return event.webhookEvent.startsWith('sprint_');
}

/**
 * Gets the action from an issue event
 * @param event - Webhook event
 * @returns Action (created, updated, deleted)
 */
export function getIssueAction(
  event: JiraWebhookEvent
): 'created' | 'updated' | 'deleted' | null {
  switch (event.webhookEvent) {
    case 'jira:issue_created':
      return 'created';
    case 'jira:issue_updated':
      return 'updated';
    case 'jira:issue_deleted':
      return 'deleted';
    default:
      return null;
  }
}

/**
 * Gets changed fields from an issue update event
 * @param event - Webhook event
 * @returns Map of field names to their changes
 */
export function getChangedFields(
  event: JiraWebhookEvent
): Map<string, { from: string | null; to: string | null }> {
  const changes = new Map<string, { from: string | null; to: string | null }>();

  if (!event.changelog?.items) {
    return changes;
  }

  for (const item of event.changelog.items) {
    changes.set(item.field, {
      from: item.fromString ?? null,
      to: item.toString ?? null,
    });
  }

  return changes;
}

/**
 * Checks if a specific field was changed in an update event
 * @param event - Webhook event
 * @param fieldName - Field name to check
 * @returns Whether the field was changed
 */
export function wasFieldChanged(
  event: JiraWebhookEvent,
  fieldName: string
): boolean {
  if (!event.changelog?.items) {
    return false;
  }

  return event.changelog.items.some(
    (item) => item.field.toLowerCase() === fieldName.toLowerCase()
  );
}

/**
 * Gets the new status from a status change event
 * @param event - Webhook event
 * @returns New status name or null if no status change
 */
export function getNewStatus(event: JiraWebhookEvent): string | null {
  if (!event.changelog?.items) {
    return null;
  }

  const statusChange = event.changelog.items.find(
    (item) => item.field === 'status'
  );

  return statusChange?.toString ?? null;
}

/**
 * Gets the new assignee from an assignee change event
 * @param event - Webhook event
 * @returns New assignee name or null if no assignee change
 */
export function getNewAssignee(event: JiraWebhookEvent): string | null {
  if (!event.changelog?.items) {
    return null;
  }

  const assigneeChange = event.changelog.items.find(
    (item) => item.field === 'assignee'
  );

  return assigneeChange?.toString ?? null;
}

/**
 * Type guard to check if issue exists in event
 * @param event - Webhook event
 * @returns Whether the event has issue data
 */
export function hasIssue(
  event: JiraWebhookEvent
): event is JiraWebhookEvent & { issue: JiraIssue } {
  return event.issue !== undefined;
}

/**
 * Type guard to check if comment exists in event
 * @param event - Webhook event
 * @returns Whether the event has comment data
 */
export function hasComment(
  event: JiraWebhookEvent
): event is JiraWebhookEvent & { comment: JiraComment } {
  return event.comment !== undefined;
}
