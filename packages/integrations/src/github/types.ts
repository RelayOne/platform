/**
 * @fileoverview GitHub-specific type definitions
 * @module @relay/integrations/github/types
 */

import { z } from 'zod';

/**
 * GitHub App configuration
 */
export interface GitHubAppConfig {
  /** GitHub App ID */
  appId: number;
  /** Private key (PEM format) for JWT signing */
  privateKey: string;
  /** Webhook secret for signature verification */
  webhookSecret: string;
  /** Optional custom GitHub API URL (for Enterprise) */
  apiUrl?: string;
  /** Filter configuration for PRs */
  filters?: GitHubFilterConfig;
}

/**
 * Filter configuration for PRs
 */
export interface GitHubFilterConfig {
  /** Skip draft PRs (default: true) */
  skipDraftPrs?: boolean;
  /** Regex patterns for target branches to skip */
  skipTargetBranches?: string[];
  /** Regex patterns for source branches to skip */
  skipSourceBranches?: string[];
  /** Labels that trigger skip */
  skipLabels?: string[];
  /** Labels that are required (skip if none present) */
  requireLabels?: string[];
  /** File path patterns to skip */
  skipPaths?: string[];
  /** File paths that must be present */
  requirePaths?: string[];
  /** Max files threshold (default: 500) */
  maxFilesThreshold?: number;
}

/**
 * Check status states
 */
export type CheckStatus = 'queued' | 'in_progress' | 'completed';

/**
 * Check run conclusions
 */
export type CheckConclusion =
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'success'
  | 'skipped'
  | 'stale'
  | 'timed_out';

/**
 * Commit status states
 */
export type CommitState = 'error' | 'failure' | 'pending' | 'success';

/**
 * PR actions from webhook events
 */
export type PrAction =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'edited'
  | 'synchronize'
  | 'ready_for_review'
  | 'converted_to_draft'
  | 'labeled'
  | 'unlabeled'
  | 'review_requested'
  | 'review_request_removed'
  | 'unknown';

/**
 * GitHub user information
 */
export interface GitHubUser {
  /** User ID */
  id: number;
  /** Username/login */
  login: string;
  /** User type (User, Organization, Bot) */
  type?: string;
  /** Avatar URL */
  avatarUrl?: string;
}

/**
 * GitHub repository information
 */
export interface GitHubRepository {
  /** Repository ID */
  id: number;
  /** Repository name */
  name: string;
  /** Full name (owner/repo) */
  fullName: string;
  /** Whether the repo is private */
  private: boolean;
  /** Repository owner */
  owner: GitHubUser;
  /** Default branch name */
  defaultBranch?: string;
  /** HTML URL */
  htmlUrl: string;
  /** Clone URL */
  cloneUrl: string;
}

/**
 * GitHub label
 */
export interface GitHubLabel {
  /** Label ID */
  id: number;
  /** Label name */
  name: string;
  /** Label color (hex without #) */
  color?: string;
  /** Label description */
  description?: string;
}

/**
 * Branch reference
 */
export interface BranchRef {
  /** Branch name */
  ref: string;
  /** Commit SHA */
  sha: string;
  /** Repository information */
  repo?: GitHubRepository;
}

/**
 * GitHub Pull Request
 */
export interface GitHubPullRequest {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body/description */
  body?: string;
  /** PR state */
  state: 'open' | 'closed';
  /** Whether the PR is a draft */
  draft: boolean;
  /** Target branch info */
  base: BranchRef;
  /** Source branch info */
  head: BranchRef;
  /** PR author */
  user: GitHubUser;
  /** PR labels */
  labels: GitHubLabel[];
  /** Number of commits */
  commits: number;
  /** Number of changed files */
  changedFiles: number;
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** Whether the PR is mergeable */
  mergeable?: boolean;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** HTML URL */
  htmlUrl: string;
}

/**
 * File change in a PR
 */
export interface GitHubPrFile {
  /** Commit SHA */
  sha: string;
  /** File path */
  filename: string;
  /** Change status */
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** Total changes */
  changes: number;
  /** File diff/patch */
  patch?: string;
  /** Previous filename (for renames) */
  previousFilename?: string;
  /** Raw file URL */
  rawUrl?: string;
  /** Contents URL */
  contentsUrl?: string;
}

/**
 * PR comment configuration
 */
export interface PrComment {
  /** Comment body (markdown) */
  body: string;
  /** Whether to update existing comment with same identifier */
  updateExisting?: boolean;
  /** Identifier marker for finding existing comments */
  identifier?: string;
}

/**
 * Commit status configuration
 */
export interface CommitStatusConfig {
  /** Status state */
  state: CommitState;
  /** Context/name of the status */
  context: string;
  /** Description of the status */
  description?: string;
  /** URL for more details */
  targetUrl?: string;
}

/**
 * Check run configuration
 */
export interface CheckRunConfig {
  /** Check run name */
  name: string;
  /** Head SHA to attach check to */
  headSha: string;
  /** Check status */
  status: CheckStatus;
  /** Check conclusion (when completed) */
  conclusion?: CheckConclusion;
  /** Summary text (markdown) */
  summary: string;
  /** Details URL */
  detailsUrl?: string;
}

/**
 * Installation token
 */
export interface InstallationToken {
  /** Access token */
  token: string;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Installation ID */
  installationId: number;
}

/**
 * Installation info from webhook
 */
export interface InstallationInfo {
  /** Installation ID */
  id: number;
  /** Account the app is installed on */
  account?: GitHubUser;
  /** Node ID */
  nodeId?: string;
}

/**
 * Webhook event structure
 */
export interface WebhookEvent {
  /** Event type from X-GitHub-Event header */
  eventType: string;
  /** Delivery ID from X-GitHub-Delivery header */
  deliveryId: string;
  /** Event payload */
  payload: WebhookPayload;
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  /** Action that triggered webhook */
  action?: string;
  /** Repository information */
  repository?: GitHubRepository;
  /** Event sender */
  sender?: GitHubUser;
  /** Installation information */
  installation?: InstallationInfo;
  /** Pull request (for PR events) */
  pullRequest?: GitHubPullRequest;
  /** PR/Issue number */
  number?: number;
  /** Changes for edited events */
  changes?: Record<string, unknown>;
}

/**
 * Webhook response
 */
export interface WebhookResponse {
  /** Whether the webhook was accepted */
  accepted: boolean;
  /** Job ID if analysis was triggered */
  jobId?: string;
  /** Response message */
  message: string;
  /** Filter info if PR was filtered */
  filterInfo?: FilterInfo;
}

/**
 * Filter information
 */
export interface FilterInfo {
  /** Whether the PR was skipped */
  skipped: boolean;
  /** Filter name that triggered skip */
  filterName: string;
  /** Reason for skip */
  reason: string;
}

/**
 * Filter result
 */
export type FilterResult =
  | { type: 'skip'; reason: string }
  | { type: 'process' };

/**
 * Zod schemas for validation
 */
export const GitHubAppConfigSchema = z.object({
  appId: z.number().positive(),
  privateKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  apiUrl: z.string().url().optional(),
  filters: z
    .object({
      skipDraftPrs: z.boolean().optional(),
      skipTargetBranches: z.array(z.string()).optional(),
      skipSourceBranches: z.array(z.string()).optional(),
      skipLabels: z.array(z.string()).optional(),
      requireLabels: z.array(z.string()).optional(),
      skipPaths: z.array(z.string()).optional(),
      requirePaths: z.array(z.string()).optional(),
      maxFilesThreshold: z.number().positive().optional(),
    })
    .optional(),
});

/**
 * Determines the commit state based on a score and threshold
 * @param score - The analysis score (0-100)
 * @param failThreshold - The threshold below which to fail
 * @returns The appropriate commit state
 */
export function getCommitStateFromScore(score: number, failThreshold: number): CommitState {
  if (score >= failThreshold) {
    return 'success';
  }
  return 'failure';
}

/**
 * Determines the check conclusion based on a score and threshold
 * @param score - The analysis score (0-100)
 * @param failThreshold - The threshold below which to fail
 * @returns The appropriate check conclusion
 */
export function getCheckConclusionFromScore(
  score: number,
  failThreshold: number
): CheckConclusion {
  if (score >= failThreshold) {
    return 'success';
  }
  return 'failure';
}

/**
 * Determines if a PR action should trigger analysis
 * @param action - The PR action
 * @returns Whether analysis should be triggered
 */
export function shouldAnalyzeAction(action: PrAction): boolean {
  return ['opened', 'synchronize', 'ready_for_review', 'reopened'].includes(action);
}

/**
 * Parses a PR action string
 * @param action - The action string from webhook
 * @returns The typed PR action
 */
export function parsePrAction(action?: string): PrAction {
  const validActions: PrAction[] = [
    'opened',
    'closed',
    'reopened',
    'edited',
    'synchronize',
    'ready_for_review',
    'converted_to_draft',
    'labeled',
    'unlabeled',
    'review_requested',
    'review_request_removed',
  ];

  if (action && validActions.includes(action as PrAction)) {
    return action as PrAction;
  }
  return 'unknown';
}

/**
 * Checks if a file is a source code file
 * @param filename - The filename to check
 * @returns Whether the file is a source file
 */
export function isSourceFile(filename: string): boolean {
  const sourceExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.rb',
    '.java', '.kt', '.kts',
    '.go',
    '.rs',
    '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
    '.cs',
    '.php',
    '.swift',
    '.scala',
    '.sh', '.bash',
    '.vue', '.svelte',
    '.sql',
  ];

  return sourceExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * Checks if a file is a test file
 * @param filename - The filename to check
 * @returns Whether the file is a test file
 */
export function isTestFile(filename: string): boolean {
  const testPatterns = [
    /\.test\.[jt]sx?$/i,
    /\.spec\.[jt]sx?$/i,
    /_test\.[jt]sx?$/i,
    /_spec\.[jt]sx?$/i,
    /test_.*\.[jt]sx?$/i,
    /spec_.*\.[jt]sx?$/i,
    /__tests__\//i,
    /tests?\//i,
    /spec\//i,
    /\.test\.py$/i,
    /_test\.py$/i,
    /test_.*\.py$/i,
    /_test\.go$/i,
    /test_.*\.go$/i,
    /_test\.rs$/i,
  ];

  return testPatterns.some(pattern => pattern.test(filename));
}
