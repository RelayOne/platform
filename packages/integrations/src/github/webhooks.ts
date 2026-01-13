/**
 * @fileoverview GitHub webhook handling utilities
 * Signature verification and event parsing
 * @module @relay/integrations/github/webhooks
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  WebhookEvent,
  WebhookPayload,
  WebhookResponse,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  GitHubLabel,
  BranchRef,
  InstallationInfo,
  PrAction,
  FilterInfo,
} from './types';
import { parsePrAction, shouldAnalyzeAction } from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource } from '../common/types';

/**
 * GitHub integration source identifier
 */
const SOURCE: IntegrationSource = 'github';

/**
 * Verifies the GitHub webhook signature using HMAC-SHA256
 * Uses constant-time comparison to prevent timing attacks
 * @param payload - Raw request body
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret
 * @returns True if signature is valid
 * @throws {WebhookVerificationError} If signature is invalid
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    throw new WebhookVerificationError(SOURCE, 'Missing or invalid signature format');
  }

  const expectedSignature = signature.slice(7); // Remove 'sha256=' prefix

  const hmac = createHmac('sha256', secret);
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  hmac.update(payloadBuffer);
  const calculatedSignature = hmac.digest('hex');

  // Use constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');

  if (expectedBuffer.length !== calculatedBuffer.length) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  if (!timingSafeEqual(expectedBuffer, calculatedBuffer)) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  return true;
}

/**
 * Parses a raw webhook request into a typed WebhookEvent
 * @param eventType - X-GitHub-Event header value
 * @param deliveryId - X-GitHub-Delivery header value
 * @param body - Request body (parsed JSON)
 * @returns Parsed webhook event
 */
export function parseWebhookEvent(
  eventType: string,
  deliveryId: string,
  body: Record<string, unknown>
): WebhookEvent {
  return {
    eventType,
    deliveryId,
    payload: parseWebhookPayload(body),
  };
}

/**
 * Parses webhook payload body into typed structure
 * @param body - Raw webhook body
 * @returns Parsed webhook payload
 */
function parseWebhookPayload(body: Record<string, unknown>): WebhookPayload {
  const payload: WebhookPayload = {
    action: body.action as string | undefined,
  };

  // Parse repository
  if (body.repository && typeof body.repository === 'object') {
    payload.repository = parseRepository(body.repository as Record<string, unknown>);
  }

  // Parse sender
  if (body.sender && typeof body.sender === 'object') {
    payload.sender = parseUser(body.sender as Record<string, unknown>);
  }

  // Parse installation
  if (body.installation && typeof body.installation === 'object') {
    payload.installation = parseInstallation(body.installation as Record<string, unknown>);
  }

  // Parse pull request
  if (body.pull_request && typeof body.pull_request === 'object') {
    payload.pullRequest = parsePullRequest(body.pull_request as Record<string, unknown>);
  }

  // Parse number
  if (typeof body.number === 'number') {
    payload.number = body.number;
  }

  // Parse changes
  if (body.changes && typeof body.changes === 'object') {
    payload.changes = body.changes as Record<string, unknown>;
  }

  return payload;
}

/**
 * Parses user object from webhook payload
 * @param data - Raw user data
 * @returns Parsed GitHub user
 */
function parseUser(data: Record<string, unknown>): GitHubUser {
  return {
    id: data.id as number,
    login: data.login as string,
    type: data.type as string | undefined,
    avatarUrl: data.avatar_url as string | undefined,
  };
}

/**
 * Parses repository object from webhook payload
 * @param data - Raw repository data
 * @returns Parsed GitHub repository
 */
function parseRepository(data: Record<string, unknown>): GitHubRepository {
  return {
    id: data.id as number,
    name: data.name as string,
    fullName: data.full_name as string,
    private: data.private as boolean,
    owner: parseUser(data.owner as Record<string, unknown>),
    defaultBranch: data.default_branch as string | undefined,
    htmlUrl: data.html_url as string,
    cloneUrl: data.clone_url as string,
  };
}

/**
 * Parses installation object from webhook payload
 * @param data - Raw installation data
 * @returns Parsed installation info
 */
function parseInstallation(data: Record<string, unknown>): InstallationInfo {
  const installation: InstallationInfo = {
    id: data.id as number,
    nodeId: data.node_id as string | undefined,
  };

  if (data.account && typeof data.account === 'object') {
    installation.account = parseUser(data.account as Record<string, unknown>);
  }

  return installation;
}

/**
 * Parses label object from webhook payload
 * @param data - Raw label data
 * @returns Parsed GitHub label
 */
function parseLabel(data: Record<string, unknown>): GitHubLabel {
  return {
    id: data.id as number,
    name: data.name as string,
    color: data.color as string | undefined,
    description: data.description as string | undefined,
  };
}

/**
 * Parses branch reference from webhook payload
 * @param data - Raw branch ref data
 * @returns Parsed branch reference
 */
function parseBranchRef(data: Record<string, unknown>): BranchRef {
  const ref: BranchRef = {
    ref: data.ref as string,
    sha: data.sha as string,
  };

  if (data.repo && typeof data.repo === 'object') {
    ref.repo = parseRepository(data.repo as Record<string, unknown>);
  }

  return ref;
}

/**
 * Parses pull request object from webhook payload
 * @param data - Raw pull request data
 * @returns Parsed GitHub pull request
 */
function parsePullRequest(data: Record<string, unknown>): GitHubPullRequest {
  const labels = Array.isArray(data.labels)
    ? data.labels.map((l) => parseLabel(l as Record<string, unknown>))
    : [];

  return {
    number: data.number as number,
    title: data.title as string,
    body: data.body as string | undefined,
    state: data.state as 'open' | 'closed',
    draft: data.draft as boolean,
    base: parseBranchRef(data.base as Record<string, unknown>),
    head: parseBranchRef(data.head as Record<string, unknown>),
    user: parseUser(data.user as Record<string, unknown>),
    labels,
    commits: data.commits as number,
    changedFiles: data.changed_files as number,
    additions: data.additions as number,
    deletions: data.deletions as number,
    mergeable: data.mergeable as boolean | undefined,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
    htmlUrl: data.html_url as string,
  };
}

/**
 * Checks if a webhook event is a PR event that should trigger analysis
 * @param event - Webhook event
 * @returns True if event should trigger analysis
 */
export function isPrAnalysisEvent(event: WebhookEvent): boolean {
  if (event.eventType !== 'pull_request') {
    return false;
  }

  const action = parsePrAction(event.payload.action);
  return shouldAnalyzeAction(action);
}

/**
 * Extracts essential PR information from a webhook event
 * @param event - Webhook event
 * @returns PR info or null if not a PR event
 */
export function extractPrInfo(event: WebhookEvent): {
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  action: PrAction;
  pullRequest: GitHubPullRequest;
} | null {
  if (event.eventType !== 'pull_request') {
    return null;
  }

  const { payload } = event;
  if (!payload.installation || !payload.repository || !payload.pullRequest) {
    return null;
  }

  const [owner, repo] = payload.repository.fullName.split('/');

  return {
    installationId: payload.installation.id,
    owner,
    repo,
    prNumber: payload.pullRequest.number,
    action: parsePrAction(payload.action),
    pullRequest: payload.pullRequest,
  };
}

/**
 * Creates a webhook response
 * @param accepted - Whether the webhook was accepted
 * @param message - Response message
 * @param options - Additional options
 * @returns Webhook response
 */
export function createWebhookResponse(
  accepted: boolean,
  message: string,
  options?: {
    jobId?: string;
    filterInfo?: FilterInfo;
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
 * Event type constants for type safety
 */
export const GitHubEventTypes = {
  PULL_REQUEST: 'pull_request',
  PUSH: 'push',
  ISSUE_COMMENT: 'issue_comment',
  PULL_REQUEST_REVIEW: 'pull_request_review',
  PULL_REQUEST_REVIEW_COMMENT: 'pull_request_review_comment',
  CHECK_RUN: 'check_run',
  CHECK_SUITE: 'check_suite',
  INSTALLATION: 'installation',
  INSTALLATION_REPOSITORIES: 'installation_repositories',
} as const;

export type GitHubEventType = typeof GitHubEventTypes[keyof typeof GitHubEventTypes];
