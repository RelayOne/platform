/**
 * @fileoverview Common types shared across all integration clients
 * @module @relay/integrations/common
 */

import { z } from 'zod';

/**
 * Base configuration for all integration clients
 */
export interface IntegrationConfig {
  /** Base URL for the API */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * OAuth 2.0 token information
 */
export interface OAuthToken {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** Token type (usually "Bearer") */
  tokenType: string;
  /** Token expiration time in seconds */
  expiresIn?: number;
  /** Timestamp when token was obtained */
  obtainedAt: Date;
  /** Scopes granted with this token */
  scopes?: string[];
}

/**
 * OAuth token schema for validation
 */
export const OAuthTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenType: z.string().default('Bearer'),
  expiresIn: z.number().optional(),
  obtainedAt: z.date(),
  scopes: z.array(z.string()).optional(),
});

/**
 * Webhook event base structure
 */
export interface WebhookEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type/action */
  type: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Source integration */
  source: IntegrationSource;
  /** Event payload */
  payload: T;
  /** Raw headers from the webhook request */
  headers?: Record<string, string>;
  /** Signature for verification */
  signature?: string;
}

/**
 * Integration source identifiers
 */
export type IntegrationSource =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'jira'
  | 'linear'
  | 'slack'
  | 'teams'
  | 'discord'
  | 'asana'
  | 'clickup'
  | 'monday'
  | 'notion'
  | 'trello'
  | 'wrike'
  | 'salesforce'
  | 'hubspot'
  | 'pipedrive'
  | 'google-drive'
  | 'onedrive'
  | 'dropbox';

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  /** Whether the webhook signature is valid */
  valid: boolean;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Pull/Merge request base structure (common across Git providers)
 */
export interface PullRequest {
  /** PR number/ID */
  number: number;
  /** PR title */
  title: string;
  /** PR description/body */
  body?: string;
  /** PR state */
  state: 'open' | 'closed' | 'merged';
  /** Source branch */
  sourceBranch: string;
  /** Target branch */
  targetBranch: string;
  /** PR author */
  author: User;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Merged timestamp */
  mergedAt?: Date;
  /** Web URL to the PR */
  url: string;
  /** Whether the PR is a draft */
  isDraft: boolean;
}

/**
 * User structure (common across platforms)
 */
export interface User {
  /** User ID */
  id: string;
  /** Username/login */
  username: string;
  /** Display name */
  displayName?: string;
  /** Email address */
  email?: string;
  /** Avatar URL */
  avatarUrl?: string;
}

/**
 * Repository/Project structure (common across Git providers)
 */
export interface Repository {
  /** Repository ID */
  id: string;
  /** Repository name */
  name: string;
  /** Full name (org/repo) */
  fullName: string;
  /** Repository description */
  description?: string;
  /** Default branch */
  defaultBranch: string;
  /** Web URL */
  url: string;
  /** Clone URL (HTTPS) */
  cloneUrl: string;
  /** Whether the repo is private */
  isPrivate: boolean;
  /** Owner information */
  owner: User;
}

/**
 * Comment structure (common across platforms)
 */
export interface Comment {
  /** Comment ID */
  id: string;
  /** Comment body/content */
  body: string;
  /** Comment author */
  author: User;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt?: Date;
  /** Web URL to the comment */
  url?: string;
}

/**
 * Issue/Ticket structure (common across issue trackers)
 */
export interface Issue {
  /** Issue ID */
  id: string;
  /** Issue key/number */
  key: string;
  /** Issue title/summary */
  title: string;
  /** Issue description */
  description?: string;
  /** Issue status */
  status: string;
  /** Issue priority */
  priority?: string;
  /** Issue type */
  type?: string;
  /** Assignee */
  assignee?: User;
  /** Reporter/Creator */
  reporter: User;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Web URL */
  url: string;
  /** Labels/tags */
  labels?: string[];
}

/**
 * Commit status states
 */
export type CommitStatusState = 'pending' | 'success' | 'failure' | 'error';

/**
 * Commit status structure
 */
export interface CommitStatus {
  /** Status state */
  state: CommitStatusState;
  /** Context/name of the status */
  context: string;
  /** Description of the status */
  description?: string;
  /** URL for more details */
  targetUrl?: string;
}

/**
 * File change in a PR/commit
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Previous path (for renames) */
  previousPath?: string;
  /** Change status */
  status: 'added' | 'modified' | 'removed' | 'renamed';
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** File patch/diff */
  patch?: string;
}

/**
 * Message structure for chat platforms (Slack, Teams, Discord)
 */
export interface ChatMessage {
  /** Message ID */
  id?: string;
  /** Message text (plain text) */
  text: string;
  /** Channel/conversation ID */
  channelId: string;
  /** Thread ID for threaded replies */
  threadId?: string;
  /** Whether to post as a reply in thread */
  replyInThread?: boolean;
  /** Attachments/blocks for rich formatting */
  attachments?: unknown[];
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Rate limit information */
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: Date;
  };
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  perPage?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /** Items in this page */
  items: T[];
  /** Total count of items */
  totalCount?: number;
  /** Whether there are more pages */
  hasNextPage: boolean;
  /** Cursor for next page */
  nextCursor?: string;
}

/**
 * Integration client interface that all clients must implement
 */
export interface IntegrationClient {
  /** Integration source identifier */
  readonly source: IntegrationSource;
  /** Test the connection/authentication */
  testConnection(): Promise<boolean>;
}

/**
 * Git provider client interface
 */
export interface GitProviderClient extends IntegrationClient {
  /** Get repository information */
  getRepository(owner: string, repo: string): Promise<Repository>;
  /** Get pull request */
  getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest>;
  /** Create a comment on a PR */
  createPullRequestComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<Comment>;
  /** Set commit status */
  setCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    status: CommitStatus
  ): Promise<void>;
  /** Get files changed in a PR */
  getPullRequestFiles(
    owner: string,
    repo: string,
    number: number
  ): Promise<FileChange[]>;
  /** Verify webhook signature */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): WebhookVerificationResult;
}

/**
 * Issue tracker client interface
 */
export interface IssueTrackerClient extends IntegrationClient {
  /** Get issue by key/ID */
  getIssue(key: string): Promise<Issue>;
  /** Create a new issue */
  createIssue(issue: Partial<Issue>): Promise<Issue>;
  /** Update an existing issue */
  updateIssue(key: string, updates: Partial<Issue>): Promise<Issue>;
  /** Add a comment to an issue */
  addComment(key: string, body: string): Promise<Comment>;
  /** Verify webhook signature */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): WebhookVerificationResult;
}

/**
 * Chat platform client interface
 */
export interface ChatPlatformClient extends IntegrationClient {
  /** Send a message */
  sendMessage(message: ChatMessage): Promise<ChatMessage>;
  /** Update a message */
  updateMessage(channelId: string, messageId: string, text: string): Promise<void>;
  /** Delete a message */
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  /** Verify webhook/event signature */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): WebhookVerificationResult;
}
