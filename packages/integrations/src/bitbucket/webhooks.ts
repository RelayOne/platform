/**
 * @fileoverview Bitbucket webhook parsing and utilities
 * @module @relay/integrations/bitbucket/webhooks
 */

import type {
  BitbucketWebhookEvent,
  BitbucketWebhookEventType,
  BitbucketPullRequest,
  BitbucketComment,
  BitbucketRepository,
  BitbucketUser,
  BitbucketCommit,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource, WebhookVerificationResult } from '../common/types';

/**
 * Bitbucket integration source identifier
 */
const SOURCE: IntegrationSource = 'bitbucket';

/**
 * Bitbucket webhook headers
 */
export const BITBUCKET_HEADERS = {
  /** Event key header */
  EVENT_KEY: 'x-event-key',
  /** Request UUID header */
  REQUEST_UUID: 'x-request-uuid',
  /** Hook UUID header */
  HOOK_UUID: 'x-hook-uuid',
  /** Attempt number header */
  ATTEMPT_NUMBER: 'x-attempt-number',
} as const;

/**
 * Verifies a Bitbucket webhook request
 * Note: Bitbucket Cloud doesn't use HMAC signatures by default
 * This function validates the request structure and headers
 * @param payload - Raw webhook payload
 * @param headers - Request headers
 * @param options - Verification options
 * @returns Verification result
 */
export function verifyWebhook(
  payload: string | Buffer,
  headers: Record<string, string>,
  options?: {
    /** Expected hook UUID (optional, for additional validation) */
    hookUuid?: string;
    /** Expected event types to accept */
    allowedEvents?: BitbucketWebhookEventType[];
  }
): WebhookVerificationResult {
  try {
    // Check required headers
    const eventKey = headers[BITBUCKET_HEADERS.EVENT_KEY] || headers['x-event-key'];
    if (!eventKey) {
      return { valid: false, error: 'Missing X-Event-Key header' };
    }

    const requestUuid = headers[BITBUCKET_HEADERS.REQUEST_UUID] || headers['x-request-uuid'];
    if (!requestUuid) {
      return { valid: false, error: 'Missing X-Request-UUID header' };
    }

    // Validate hook UUID if provided
    if (options?.hookUuid) {
      const hookUuid = headers[BITBUCKET_HEADERS.HOOK_UUID] || headers['x-hook-uuid'];
      if (hookUuid !== options.hookUuid) {
        return { valid: false, error: 'Hook UUID mismatch' };
      }
    }

    // Validate event type if allowed list provided
    if (options?.allowedEvents && options.allowedEvents.length > 0) {
      if (!options.allowedEvents.includes(eventKey as BitbucketWebhookEventType)) {
        return { valid: false, error: `Event type not allowed: ${eventKey}` };
      }
    }

    // Verify payload is valid JSON
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    JSON.parse(payloadString);

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parses a Bitbucket webhook payload
 * @param payload - Raw webhook payload
 * @returns Parsed webhook event
 */
export function parseWebhookPayload(payload: string | Buffer): BitbucketWebhookEvent {
  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    return JSON.parse(payloadString) as BitbucketWebhookEvent;
  } catch (error) {
    throw new WebhookVerificationError(
      SOURCE,
      `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets the event type from headers
 * @param headers - Request headers
 * @returns Event type
 */
export function getEventType(headers: Record<string, string>): BitbucketWebhookEventType {
  const eventKey = headers[BITBUCKET_HEADERS.EVENT_KEY] || headers['x-event-key'];
  if (!eventKey) {
    throw new WebhookVerificationError(SOURCE, 'Missing X-Event-Key header');
  }
  return eventKey as BitbucketWebhookEventType;
}

/**
 * Checks if the webhook is a pull request event
 * @param eventType - Event type
 * @returns Whether the event is a PR event
 */
export function isPullRequestEvent(eventType: BitbucketWebhookEventType): boolean {
  return eventType.startsWith('pullrequest:');
}

/**
 * Checks if the webhook is a push event
 * @param eventType - Event type
 * @returns Whether the event is a push event
 */
export function isPushEvent(eventType: BitbucketWebhookEventType): boolean {
  return eventType === 'repo:push';
}

/**
 * Checks if the webhook is a repository event
 * @param eventType - Event type
 * @returns Whether the event is a repo event
 */
export function isRepositoryEvent(eventType: BitbucketWebhookEventType): boolean {
  return eventType.startsWith('repo:');
}

/**
 * Gets the PR action from an event type
 * @param eventType - Event type
 * @returns PR action or null if not a PR event
 */
export function getPullRequestAction(
  eventType: BitbucketWebhookEventType
): 'created' | 'updated' | 'approved' | 'unapproved' | 'fulfilled' | 'rejected' | 'comment' | null {
  switch (eventType) {
    case 'pullrequest:created':
      return 'created';
    case 'pullrequest:updated':
      return 'updated';
    case 'pullrequest:approved':
      return 'approved';
    case 'pullrequest:unapproved':
      return 'unapproved';
    case 'pullrequest:fulfilled':
      return 'fulfilled';
    case 'pullrequest:rejected':
      return 'rejected';
    case 'pullrequest:comment_created':
    case 'pullrequest:comment_updated':
    case 'pullrequest:comment_deleted':
      return 'comment';
    default:
      return null;
  }
}

/**
 * Gets repository info from webhook event
 * @param event - Webhook event
 * @returns Repository info
 */
export function getRepository(event: BitbucketWebhookEvent): BitbucketRepository {
  return event.repository;
}

/**
 * Gets actor info from webhook event
 * @param event - Webhook event
 * @returns Actor user info
 */
export function getActor(event: BitbucketWebhookEvent): BitbucketUser {
  return event.actor;
}

/**
 * Gets pull request from webhook event
 * @param event - Webhook event
 * @returns Pull request or undefined
 */
export function getPullRequest(event: BitbucketWebhookEvent): BitbucketPullRequest | undefined {
  return event.pullrequest;
}

/**
 * Gets comment from webhook event
 * @param event - Webhook event
 * @returns Comment or undefined
 */
export function getComment(event: BitbucketWebhookEvent): BitbucketComment | undefined {
  return event.comment;
}

/**
 * Gets push changes from webhook event
 * @param event - Webhook event
 * @returns Push changes or undefined
 */
export function getPushChanges(event: BitbucketWebhookEvent): BitbucketWebhookEvent['push'] {
  return event.push;
}

/**
 * Gets commits from a push event
 * @param event - Webhook event
 * @returns Commits array
 */
export function getPushCommits(event: BitbucketWebhookEvent): BitbucketCommit[] {
  if (!event.push?.changes) {
    return [];
  }

  const commits: BitbucketCommit[] = [];
  for (const change of event.push.changes) {
    if (change.commits) {
      commits.push(...change.commits);
    }
  }
  return commits;
}

/**
 * Gets the branch name from a push event
 * @param event - Webhook event
 * @returns Branch name or null
 */
export function getPushBranch(event: BitbucketWebhookEvent): string | null {
  if (!event.push?.changes || event.push.changes.length === 0) {
    return null;
  }

  const firstChange = event.push.changes[0];
  return firstChange.new?.name || firstChange.old?.name || null;
}

/**
 * Checks if a push event is a branch creation
 * @param event - Webhook event
 * @returns Whether a branch was created
 */
export function isBranchCreated(event: BitbucketWebhookEvent): boolean {
  if (!event.push?.changes) {
    return false;
  }
  return event.push.changes.some((change) => change.created);
}

/**
 * Checks if a push event is a branch deletion
 * @param event - Webhook event
 * @returns Whether a branch was deleted
 */
export function isBranchDeleted(event: BitbucketWebhookEvent): boolean {
  if (!event.push?.changes) {
    return false;
  }
  return event.push.changes.some((change) => change.closed);
}

/**
 * Checks if a push event was a force push
 * @param event - Webhook event
 * @returns Whether the push was forced
 */
export function isForcePush(event: BitbucketWebhookEvent): boolean {
  if (!event.push?.changes) {
    return false;
  }
  return event.push.changes.some((change) => change.forced);
}

/**
 * Type guard to check if event has pull request
 * @param event - Webhook event
 * @returns Whether the event has a pull request
 */
export function hasPullRequest(
  event: BitbucketWebhookEvent
): event is BitbucketWebhookEvent & { pullrequest: BitbucketPullRequest } {
  return event.pullrequest !== undefined;
}

/**
 * Type guard to check if event has comment
 * @param event - Webhook event
 * @returns Whether the event has a comment
 */
export function hasComment(
  event: BitbucketWebhookEvent
): event is BitbucketWebhookEvent & { comment: BitbucketComment } {
  return event.comment !== undefined;
}

/**
 * Type guard to check if event has push data
 * @param event - Webhook event
 * @returns Whether the event has push data
 */
export function hasPush(
  event: BitbucketWebhookEvent
): event is BitbucketWebhookEvent & { push: NonNullable<BitbucketWebhookEvent['push']> } {
  return event.push !== undefined;
}
