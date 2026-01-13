/**
 * @fileoverview GitLab webhook handling utilities
 * Token validation and event parsing
 * @module @relay/integrations/gitlab/webhooks
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  GitLabWebhookEvent,
  GitLabWebhookPayload,
  GitLabMergeRequest,
  GitLabProject,
  GitLabUser,
  MrAction,
  WebhookResponse,
} from './types';
import { parseMrAction, shouldAnalyzeMrAction } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource } from '../common/types';

/**
 * GitLab integration source identifier
 */
const SOURCE: IntegrationSource = 'gitlab';

/**
 * Verifies GitLab webhook token
 * GitLab uses a simple secret token header, not HMAC signature
 * @param headerToken - X-Gitlab-Token header value
 * @param secret - Configured webhook secret
 * @returns True if token is valid
 * @throws {WebhookVerificationError} If token is invalid
 */
export function verifyWebhookToken(
  headerToken: string,
  secret: string
): boolean {
  if (!headerToken) {
    throw new WebhookVerificationError(SOURCE, 'Missing webhook token header');
  }

  // Use constant-time comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(headerToken);
  const secretBuffer = Buffer.from(secret);

  if (tokenBuffer.length !== secretBuffer.length) {
    throw new WebhookVerificationError(SOURCE, 'Webhook token verification failed');
  }

  if (!timingSafeEqual(tokenBuffer, secretBuffer)) {
    throw new WebhookVerificationError(SOURCE, 'Webhook token verification failed');
  }

  return true;
}

/**
 * Parses a raw webhook request into a typed GitLabWebhookEvent
 * @param objectKind - X-Gitlab-Event header or object_kind from body
 * @param body - Request body (parsed JSON)
 * @returns Parsed webhook event
 */
export function parseWebhookEvent(
  objectKind: string,
  body: Record<string, unknown>
): GitLabWebhookEvent {
  return {
    eventType: objectKind,
    objectKind: (body.object_kind as string) || objectKind,
    payload: parseWebhookPayload(body),
  };
}

/**
 * Parses webhook payload body into typed structure
 * @param body - Raw webhook body
 * @returns Parsed webhook payload
 */
function parseWebhookPayload(body: Record<string, unknown>): GitLabWebhookPayload {
  const payload: GitLabWebhookPayload = {
    objectKind: body.object_kind as string,
  };

  // Parse project
  if (body.project && typeof body.project === 'object') {
    payload.project = parseProject(body.project as Record<string, unknown>);
  }

  // Parse user
  if (body.user && typeof body.user === 'object') {
    payload.user = parseUser(body.user as Record<string, unknown>);
  }

  // Parse object attributes (MR details)
  if (body.object_attributes && typeof body.object_attributes === 'object') {
    const attrs = body.object_attributes as Record<string, unknown>;
    payload.objectAttributes = {
      id: attrs.id as number,
      iid: attrs.iid as number,
      projectId: attrs.target_project_id as number,
      title: attrs.title as string,
      description: attrs.description as string | undefined,
      state: attrs.state as GitLabMergeRequest['state'],
      draft: (attrs.draft as boolean) || (attrs.work_in_progress as boolean) || false,
      targetBranch: attrs.target_branch as string,
      sourceBranch: attrs.source_branch as string,
      targetProjectId: attrs.target_project_id as number,
      sourceProjectId: attrs.source_project_id as number,
      sha: attrs.last_commit?.id as string || '',
      webUrl: attrs.url as string,
      action: attrs.action as string,
      createdAt: new Date(attrs.created_at as string),
      updatedAt: new Date(attrs.updated_at as string),
    } as Partial<GitLabMergeRequest> & { action?: string; url?: string };
  }

  // Parse labels
  if (Array.isArray(body.labels)) {
    payload.labels = body.labels.map((label: Record<string, unknown>) => ({
      id: label.id as number,
      name: label.title as string,
      color: label.color as string | undefined,
      description: label.description as string | undefined,
    }));
  }

  // Parse changes
  if (body.changes && typeof body.changes === 'object') {
    payload.changes = body.changes as Record<string, { previous?: unknown; current?: unknown }>;
  }

  return payload;
}

/**
 * Parses user object from webhook payload
 * @param data - Raw user data
 * @returns Parsed GitLab user
 */
function parseUser(data: Record<string, unknown>): GitLabUser {
  return {
    id: data.id as number,
    username: data.username as string,
    name: data.name as string,
    avatarUrl: data.avatar_url as string | undefined,
    email: data.email as string | undefined,
  };
}

/**
 * Parses project object from webhook payload
 * @param data - Raw project data
 * @returns Parsed GitLab project
 */
function parseProject(data: Record<string, unknown>): GitLabProject {
  return {
    id: data.id as number,
    name: data.name as string,
    pathWithNamespace: data.path_with_namespace as string,
    description: data.description as string | undefined,
    webUrl: data.web_url as string,
    httpUrlToRepo: data.http_url as string || data.git_http_url as string,
    sshUrlToRepo: data.ssh_url as string || data.git_ssh_url as string,
    defaultBranch: data.default_branch as string,
    visibility: data.visibility as 'private' | 'internal' | 'public',
    namespace: data.namespace ? {
      id: (data.namespace as Record<string, unknown>).id as number,
      name: (data.namespace as Record<string, unknown>).name as string,
      path: (data.namespace as Record<string, unknown>).path as string,
    } : undefined,
  };
}

/**
 * Checks if a webhook event is an MR event that should trigger analysis
 * @param event - Webhook event
 * @returns True if event should trigger analysis
 */
export function isMrAnalysisEvent(event: GitLabWebhookEvent): boolean {
  if (event.objectKind !== 'merge_request') {
    return false;
  }

  const action = parseMrAction(event.payload.objectAttributes?.action);
  return shouldAnalyzeMrAction(action);
}

/**
 * Extracts essential MR information from a webhook event
 * @param event - Webhook event
 * @returns MR info or null if not an MR event
 */
export function extractMrInfo(event: GitLabWebhookEvent): {
  projectId: number;
  mrIid: number;
  action: MrAction;
  projectPath: string;
} | null {
  if (event.objectKind !== 'merge_request') {
    return null;
  }

  const { payload } = event;
  if (!payload.project || !payload.objectAttributes) {
    return null;
  }

  return {
    projectId: payload.project.id,
    mrIid: payload.objectAttributes.iid as number,
    action: parseMrAction(payload.objectAttributes.action),
    projectPath: payload.project.pathWithNamespace,
  };
}

/**
 * Creates a webhook response
 * @param accepted - Whether webhook was accepted
 * @param message - Response message
 * @param options - Additional options
 * @returns Webhook response
 */
export function createWebhookResponse(
  accepted: boolean,
  message: string,
  options?: {
    jobId?: string;
    filterInfo?: { skipped: boolean; filterName: string; reason: string };
  }
): WebhookResponse {
  return {
    accepted,
    message,
    jobId: options?.jobId,
    filterInfo: options?.filterInfo,
  };
}

/**
 * GitLab event type constants
 */
export const GitLabEventTypes = {
  MERGE_REQUEST: 'merge_request',
  PUSH: 'push',
  NOTE: 'note',
  PIPELINE: 'pipeline',
  JOB: 'job',
  TAG_PUSH: 'tag_push',
} as const;

export type GitLabEventType = typeof GitLabEventTypes[keyof typeof GitLabEventTypes];
