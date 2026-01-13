/**
 * @fileoverview Linear webhook handling utilities
 * Signature verification and event parsing
 * @module @relay/integrations/linear/webhooks
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  LinearWebhookEvent,
  LinearWebhookData,
  LinearUser,
  WebhookAction,
  WebhookType,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource } from '../common/types';

/**
 * Linear integration source identifier
 */
const SOURCE: IntegrationSource = 'linear';

/**
 * Verifies Linear webhook signature
 * @param payload - Raw request body (string)
 * @param signature - Linear-Signature header value
 * @param secret - Webhook signing secret
 * @returns True if signature is valid
 * @throws {WebhookVerificationError} If signature is invalid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) {
    throw new WebhookVerificationError(SOURCE, 'Missing webhook signature header');
  }

  // Linear uses HMAC-SHA256
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expectedSignature = hmac.digest('hex');

  // Compare signatures using constant-time comparison
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  return true;
}

/**
 * Parses a Linear webhook event
 * @param body - Parsed JSON body
 * @returns Parsed webhook event
 */
export function parseWebhookEvent(body: Record<string, unknown>): LinearWebhookEvent {
  return {
    action: body.action as WebhookAction,
    type: body.type as WebhookType,
    createdAt: body.createdAt as string,
    data: parseWebhookData(body.data as Record<string, unknown>),
    actor: body.actor ? parseActor(body.actor as Record<string, unknown>) : undefined,
    url: body.url as string | undefined,
    updatedFrom: body.updatedFrom as Record<string, unknown> | undefined,
    webhookId: body.webhookId as string | undefined,
    webhookTimestamp: body.webhookTimestamp as number | undefined,
  };
}

/**
 * Parses webhook data
 * @param data - Raw data object
 * @returns Parsed webhook data
 */
function parseWebhookData(data: Record<string, unknown>): LinearWebhookData {
  return {
    id: data.id as string,
    identifier: data.identifier as string | undefined,
    title: data.title as string | undefined,
    description: data.description as string | undefined,
    priority: data.priority as LinearWebhookData['priority'],
    stateId: data.stateId as string | undefined,
    assigneeId: data.assigneeId as string | undefined,
    teamId: data.teamId as string | undefined,
    projectId: data.projectId as string | undefined,
    labelIds: data.labelIds as string[] | undefined,
    parentId: data.parentId as string | undefined,
    cycleId: data.cycleId as string | undefined,
    dueDate: data.dueDate as string | undefined,
    estimate: data.estimate as number | undefined,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
    ...data, // Include any additional properties
  };
}

/**
 * Parses actor data
 * @param actor - Raw actor object
 * @returns Parsed actor
 */
function parseActor(actor: Record<string, unknown>): LinearUser {
  return {
    id: actor.id as string,
    name: actor.name as string,
    email: actor.email as string,
    displayName: actor.displayName as string || actor.name as string,
    avatarUrl: actor.avatarUrl as string | undefined,
    active: actor.active as boolean ?? true,
    admin: actor.admin as boolean | undefined,
    timezone: actor.timezone as string | undefined,
  };
}

/**
 * Checks if a webhook event is an issue event
 * @param event - Webhook event
 * @returns True if issue event
 */
export function isIssueEvent(event: LinearWebhookEvent): boolean {
  return event.type === 'Issue';
}

/**
 * Checks if a webhook event is a comment event
 * @param event - Webhook event
 * @returns True if comment event
 */
export function isCommentEvent(event: LinearWebhookEvent): boolean {
  return event.type === 'Comment';
}

/**
 * Checks if a webhook event is a project event
 * @param event - Webhook event
 * @returns True if project event
 */
export function isProjectEvent(event: LinearWebhookEvent): boolean {
  return event.type === 'Project';
}

/**
 * Checks if an issue was updated (changed state/assignee/etc.)
 * @param event - Webhook event
 * @returns True if issue was updated with notable changes
 */
export function isNotableIssueUpdate(event: LinearWebhookEvent): boolean {
  if (event.type !== 'Issue' || event.action !== 'update') {
    return false;
  }

  const updatedFrom = event.updatedFrom;
  if (!updatedFrom) {
    return false;
  }

  // Check for notable changes
  const notableFields = [
    'stateId',
    'assigneeId',
    'priority',
    'dueDate',
    'projectId',
    'cycleId',
  ];

  return notableFields.some((field) => field in updatedFrom);
}

/**
 * Gets the fields that changed in an update event
 * @param event - Webhook event
 * @returns Array of changed field names
 */
export function getChangedFields(event: LinearWebhookEvent): string[] {
  if (event.action !== 'update' || !event.updatedFrom) {
    return [];
  }

  return Object.keys(event.updatedFrom);
}

/**
 * Extracts issue identifier from webhook data
 * @param event - Webhook event
 * @returns Issue identifier (e.g., "ENG-123") or undefined
 */
export function getIssueIdentifier(event: LinearWebhookEvent): string | undefined {
  return event.data.identifier;
}

/**
 * Checks if state changed to completed
 * @param event - Webhook event
 * @param completedStateIds - Set of completed state IDs
 * @returns True if issue was marked complete
 */
export function isCompletedTransition(
  event: LinearWebhookEvent,
  completedStateIds: Set<string>
): boolean {
  if (event.type !== 'Issue' || event.action !== 'update') {
    return false;
  }

  const currentStateId = event.data.stateId;
  const previousStateId = event.updatedFrom?.stateId as string | undefined;

  if (!currentStateId || !previousStateId) {
    return false;
  }

  return (
    completedStateIds.has(currentStateId) &&
    !completedStateIds.has(previousStateId)
  );
}

/**
 * Linear webhook event types
 */
export const LinearWebhookTypes = {
  ISSUE: 'Issue',
  COMMENT: 'Comment',
  PROJECT: 'Project',
  CYCLE: 'Cycle',
  ISSUE_LABEL: 'IssueLabel',
  REACTION: 'Reaction',
} as const;

/**
 * Linear webhook actions
 */
export const LinearWebhookActions = {
  CREATE: 'create',
  UPDATE: 'update',
  REMOVE: 'remove',
} as const;
