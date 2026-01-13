/**
 * @fileoverview GitLab-specific type definitions
 * @module @relay/integrations/gitlab/types
 */

import { z } from 'zod';

/**
 * GitLab configuration for OAuth or Personal Access Token
 */
export interface GitLabConfig {
  /** GitLab instance URL (e.g., https://gitlab.com) */
  baseUrl: string;
  /** Personal access token or OAuth token */
  accessToken: string;
  /** Webhook secret token */
  webhookSecret?: string;
  /** Filter configuration for MRs */
  filters?: GitLabFilterConfig;
}

/**
 * Filter configuration for MRs
 */
export interface GitLabFilterConfig {
  /** Skip WIP/draft MRs (default: true) */
  skipDraftMrs?: boolean;
  /** Regex patterns for target branches to skip */
  skipTargetBranches?: string[];
  /** Regex patterns for source branches to skip */
  skipSourceBranches?: string[];
  /** Labels that trigger skip */
  skipLabels?: string[];
  /** Labels that are required (skip if none present) */
  requireLabels?: string[];
  /** Max files threshold (default: 500) */
  maxFilesThreshold?: number;
}

/**
 * Merge request state
 */
export type MrState = 'opened' | 'closed' | 'merged' | 'all';

/**
 * Merge request actions from webhook events
 */
export type MrAction =
  | 'open'
  | 'close'
  | 'reopen'
  | 'update'
  | 'merge'
  | 'approved'
  | 'unapproved'
  | 'unknown';

/**
 * Pipeline status
 */
export type PipelineStatus =
  | 'created'
  | 'waiting_for_resource'
  | 'preparing'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'manual'
  | 'scheduled';

/**
 * Commit status states
 */
export type CommitStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled';

/**
 * GitLab user information
 */
export interface GitLabUser {
  /** User ID */
  id: number;
  /** Username */
  username: string;
  /** Display name */
  name: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Email address */
  email?: string;
  /** Web URL */
  webUrl?: string;
}

/**
 * GitLab project information
 */
export interface GitLabProject {
  /** Project ID */
  id: number;
  /** Project name */
  name: string;
  /** Project path with namespace */
  pathWithNamespace: string;
  /** Project description */
  description?: string;
  /** Web URL */
  webUrl: string;
  /** Git HTTP URL */
  httpUrlToRepo: string;
  /** Git SSH URL */
  sshUrlToRepo: string;
  /** Default branch */
  defaultBranch: string;
  /** Project visibility */
  visibility: 'private' | 'internal' | 'public';
  /** Namespace info */
  namespace?: {
    id: number;
    name: string;
    path: string;
  };
}

/**
 * GitLab label
 */
export interface GitLabLabel {
  /** Label ID */
  id: number;
  /** Label name */
  name: string;
  /** Label color */
  color?: string;
  /** Label description */
  description?: string;
}

/**
 * GitLab merge request
 */
export interface GitLabMergeRequest {
  /** MR ID */
  id: number;
  /** MR IID (project-scoped ID) */
  iid: number;
  /** Project ID */
  projectId: number;
  /** MR title */
  title: string;
  /** MR description */
  description?: string;
  /** MR state */
  state: MrState;
  /** Whether MR is a draft/WIP */
  draft: boolean;
  /** Target branch */
  targetBranch: string;
  /** Source branch */
  sourceBranch: string;
  /** Target project ID */
  targetProjectId: number;
  /** Source project ID */
  sourceProjectId: number;
  /** MR author */
  author: GitLabUser;
  /** Assigned reviewers */
  reviewers?: GitLabUser[];
  /** Assignees */
  assignees?: GitLabUser[];
  /** MR labels */
  labels: string[];
  /** SHA of the merge request HEAD */
  sha: string;
  /** Diff refs */
  diffRefs?: {
    baseSha: string;
    headSha: string;
    startSha: string;
  };
  /** Number of changes */
  changesCount?: string;
  /** Whether MR has conflicts */
  hasConflicts: boolean;
  /** Merge status */
  mergeStatus: string;
  /** Web URL */
  webUrl: string;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Merged timestamp */
  mergedAt?: Date;
  /** Closed timestamp */
  closedAt?: Date;
}

/**
 * MR diff file
 */
export interface GitLabDiff {
  /** Old path */
  oldPath: string;
  /** New path */
  newPath: string;
  /** Old file mode */
  aMode?: string;
  /** New file mode */
  bMode?: string;
  /** Whether file is new */
  newFile: boolean;
  /** Whether file was renamed */
  renamedFile: boolean;
  /** Whether file was deleted */
  deletedFile: boolean;
  /** File diff content */
  diff: string;
}

/**
 * MR changes response
 */
export interface GitLabMrChanges extends GitLabMergeRequest {
  /** File changes */
  changes: GitLabDiff[];
}

/**
 * Note/comment on MR
 */
export interface GitLabNote {
  /** Note ID */
  id: number;
  /** Note body */
  body: string;
  /** Note author */
  author: GitLabUser;
  /** Whether note is system-generated */
  system: boolean;
  /** Note type */
  noteableType: string;
  /** Noteable ID */
  noteableId: number;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Whether note is resolvable */
  resolvable?: boolean;
  /** Whether note is resolved */
  resolved?: boolean;
}

/**
 * Commit status configuration
 */
export interface GitLabCommitStatusConfig {
  /** Status state */
  state: CommitStatus;
  /** Status name/context */
  name: string;
  /** Status description */
  description?: string;
  /** Target URL */
  targetUrl?: string;
  /** Pipeline ID to associate with */
  pipelineId?: number;
  /** Coverage percentage */
  coverage?: number;
}

/**
 * Webhook event
 */
export interface GitLabWebhookEvent {
  /** Event type */
  eventType: string;
  /** Webhook event kind */
  objectKind: string;
  /** Event payload */
  payload: GitLabWebhookPayload;
}

/**
 * Webhook payload
 */
export interface GitLabWebhookPayload {
  /** Action that triggered webhook */
  action?: string;
  /** Object kind */
  objectKind: string;
  /** Project info */
  project?: GitLabProject;
  /** User who triggered */
  user?: GitLabUser;
  /** Merge request object attributes */
  objectAttributes?: Partial<GitLabMergeRequest> & {
    action?: string;
    url?: string;
  };
  /** Labels */
  labels?: GitLabLabel[];
  /** Changes in the event */
  changes?: Record<string, { previous?: unknown; current?: unknown }>;
}

/**
 * Filter result
 */
export type FilterResult =
  | { type: 'skip'; reason: string }
  | { type: 'process' };

/**
 * Webhook response
 */
export interface WebhookResponse {
  /** Whether webhook was accepted */
  accepted: boolean;
  /** Job ID if analysis triggered */
  jobId?: string;
  /** Response message */
  message: string;
  /** Filter info if skipped */
  filterInfo?: {
    skipped: boolean;
    filterName: string;
    reason: string;
  };
}

/**
 * Zod schema for configuration validation
 */
export const GitLabConfigSchema = z.object({
  baseUrl: z.string().url(),
  accessToken: z.string().min(1),
  webhookSecret: z.string().optional(),
  filters: z.object({
    skipDraftMrs: z.boolean().optional(),
    skipTargetBranches: z.array(z.string()).optional(),
    skipSourceBranches: z.array(z.string()).optional(),
    skipLabels: z.array(z.string()).optional(),
    requireLabels: z.array(z.string()).optional(),
    maxFilesThreshold: z.number().positive().optional(),
  }).optional(),
});

/**
 * Parses MR action from webhook
 * @param action - Action string from webhook
 * @returns Typed MR action
 */
export function parseMrAction(action?: string): MrAction {
  const validActions: MrAction[] = [
    'open',
    'close',
    'reopen',
    'update',
    'merge',
    'approved',
    'unapproved',
  ];

  if (action && validActions.includes(action as MrAction)) {
    return action as MrAction;
  }
  return 'unknown';
}

/**
 * Determines if an MR action should trigger analysis
 * @param action - The MR action
 * @returns Whether analysis should be triggered
 */
export function shouldAnalyzeMrAction(action: MrAction): boolean {
  return ['open', 'update', 'reopen'].includes(action);
}
