/**
 * @fileoverview Bitbucket type definitions
 * @module @relay/integrations/bitbucket/types
 */

import type { IntegrationConfig } from '../common/types';

/**
 * Bitbucket Cloud API configuration (App password auth)
 */
export interface BitbucketConfig extends IntegrationConfig {
  /** Bitbucket username */
  username: string;
  /** App password for API authentication */
  appPassword: string;
  /** Workspace slug (optional, for workspace-scoped operations) */
  workspace?: string;
}

/**
 * Bitbucket OAuth configuration
 */
export interface BitbucketOAuthConfig extends IntegrationConfig {
  /** OAuth access token */
  accessToken: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** Token expiration time */
  expiresAt?: Date;
}

/**
 * Bitbucket user/account
 */
export interface BitbucketUser {
  /** Account ID (UUID format) */
  uuid: string;
  /** Username */
  username?: string;
  /** Display name */
  display_name: string;
  /** Nickname */
  nickname?: string;
  /** Account type */
  type: 'user' | 'team';
  /** Account ID (numeric) */
  account_id?: string;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    avatar: { href: string };
  };
}

/**
 * Bitbucket workspace
 */
export interface BitbucketWorkspace {
  /** Workspace UUID */
  uuid: string;
  /** Workspace slug */
  slug: string;
  /** Workspace name */
  name: string;
  /** Type */
  type: 'workspace';
  /** Whether the workspace is private */
  is_private: boolean;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    avatar: { href: string };
  };
}

/**
 * Bitbucket repository
 */
export interface BitbucketRepository {
  /** Repository UUID */
  uuid: string;
  /** Repository name */
  name: string;
  /** Full name (workspace/repo) */
  full_name: string;
  /** Repository slug */
  slug: string;
  /** Description */
  description?: string;
  /** SCM type (always 'git') */
  scm: 'git';
  /** Whether the repo is private */
  is_private: boolean;
  /** Whether fork policy allows forking */
  fork_policy: 'allow_forks' | 'no_public_forks' | 'no_forks';
  /** Workspace */
  workspace: BitbucketWorkspace;
  /** Owner */
  owner: BitbucketUser;
  /** Project */
  project?: {
    uuid: string;
    key: string;
    name: string;
    type: 'project';
  };
  /** Default branch (mainbranch) */
  mainbranch?: {
    type: 'branch';
    name: string;
  };
  /** Language */
  language: string;
  /** Size in bytes */
  size: number;
  /** Created date */
  created_on: string;
  /** Updated date */
  updated_on: string;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    clone: Array<{ name: string; href: string }>;
    pullrequests: { href: string };
    commits: { href: string };
    branches: { href: string };
    tags: { href: string };
    downloads: { href: string };
  };
}

/**
 * Bitbucket branch
 */
export interface BitbucketBranch {
  /** Branch name */
  name: string;
  /** Branch type */
  type: 'branch';
  /** Default merge strategy */
  default_merge_strategy?: string;
  /** Merge strategies */
  merge_strategies?: string[];
  /** Target commit */
  target: BitbucketCommit;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    commits: { href: string };
  };
}

/**
 * Bitbucket commit
 */
export interface BitbucketCommit {
  /** Commit hash */
  hash: string;
  /** Commit type */
  type: 'commit';
  /** Commit message */
  message: string;
  /** Author */
  author: {
    raw: string;
    user?: BitbucketUser;
  };
  /** Date */
  date: string;
  /** Parent commits */
  parents: Array<{ hash: string; type: 'commit' }>;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    diff: { href: string };
    patch: { href: string };
  };
  /** Repository */
  repository?: BitbucketRepository;
}

/**
 * Bitbucket pull request state
 */
export type BitbucketPrState = 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';

/**
 * Bitbucket pull request
 */
export interface BitbucketPullRequest {
  /** PR ID */
  id: number;
  /** PR type */
  type: 'pullrequest';
  /** PR title */
  title: string;
  /** PR description (Markdown) */
  description?: string;
  /** PR state */
  state: BitbucketPrState;
  /** Source branch info */
  source: {
    branch: { name: string };
    commit: { hash: string };
    repository: BitbucketRepository;
  };
  /** Destination/target branch info */
  destination: {
    branch: { name: string };
    commit: { hash: string };
    repository: BitbucketRepository;
  };
  /** Author */
  author: BitbucketUser;
  /** Reviewers */
  reviewers: BitbucketUser[];
  /** Participants with approval status */
  participants: BitbucketParticipant[];
  /** Merge commit (if merged) */
  merge_commit?: { hash: string };
  /** Close source branch on merge */
  close_source_branch: boolean;
  /** Closed by (if closed) */
  closed_by?: BitbucketUser;
  /** Task count */
  task_count?: number;
  /** Comment count */
  comment_count: number;
  /** Created date */
  created_on: string;
  /** Updated date */
  updated_on: string;
  /** Reason (for declined PRs) */
  reason?: string;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
    commits: { href: string };
    approve: { href: string };
    diff: { href: string };
    diffstat: { href: string };
    comments: { href: string };
    activity: { href: string };
    merge: { href: string };
    decline: { href: string };
  };
}

/**
 * Bitbucket PR participant
 */
export interface BitbucketParticipant {
  /** Participant type */
  type: 'participant';
  /** User */
  user: BitbucketUser;
  /** Role */
  role: 'PARTICIPANT' | 'REVIEWER';
  /** Whether they approved */
  approved: boolean;
  /** State */
  state?: 'approved' | 'changes_requested' | null;
  /** Participated on date */
  participated_on: string;
}

/**
 * Bitbucket diff stat entry
 */
export interface BitbucketDiffStat {
  /** Diff stat type */
  type: 'diffstat';
  /** Status */
  status: 'added' | 'removed' | 'modified' | 'renamed';
  /** Lines added */
  lines_added: number;
  /** Lines removed */
  lines_removed: number;
  /** Old path (for renames) */
  old?: { path: string };
  /** New path */
  new?: { path: string };
}

/**
 * Bitbucket comment
 */
export interface BitbucketComment {
  /** Comment ID */
  id: number;
  /** Comment type */
  type: 'pullrequest_comment' | 'repository_comment';
  /** Content */
  content: {
    raw: string;
    markup: 'markdown' | 'creole' | 'plaintext';
    html: string;
  };
  /** Inline position (for inline comments) */
  inline?: {
    from?: number;
    to?: number;
    path: string;
  };
  /** Author */
  user: BitbucketUser;
  /** Parent comment (for replies) */
  parent?: { id: number };
  /** Whether it's deleted */
  deleted: boolean;
  /** Created date */
  created_on: string;
  /** Updated date */
  updated_on: string;
  /** Links */
  links: {
    self: { href: string };
    html: { href: string };
  };
}

/**
 * Bitbucket commit status state
 */
export type BitbucketStatusState = 'SUCCESSFUL' | 'FAILED' | 'INPROGRESS' | 'STOPPED';

/**
 * Bitbucket commit status (build status)
 */
export interface BitbucketCommitStatus {
  /** Status UUID */
  uuid: string;
  /** Status key */
  key: string;
  /** Status name */
  name: string;
  /** Status state */
  state: BitbucketStatusState;
  /** Description */
  description?: string;
  /** Target URL */
  url?: string;
  /** Refname (branch) */
  refname?: string;
  /** Created date */
  created_on: string;
  /** Updated date */
  updated_on: string;
  /** Links */
  links: {
    self: { href: string };
    commit: { href: string };
  };
}

/**
 * Bitbucket paginated response
 */
export interface BitbucketPaginatedResponse<T> {
  /** Items per page */
  pagelen: number;
  /** Total size */
  size?: number;
  /** Page number */
  page?: number;
  /** Next page URL */
  next?: string;
  /** Previous page URL */
  previous?: string;
  /** Items */
  values: T[];
}

/**
 * Create PR input
 */
export interface CreateBitbucketPrInput {
  /** PR title */
  title: string;
  /** Source branch */
  sourceBranch: string;
  /** Target branch */
  targetBranch: string;
  /** Description (Markdown) */
  description?: string;
  /** Close source branch on merge */
  closeSourceBranch?: boolean;
  /** Reviewer account IDs */
  reviewers?: string[];
}

/**
 * Update PR input
 */
export interface UpdateBitbucketPrInput {
  /** PR title */
  title?: string;
  /** Description */
  description?: string;
  /** Reviewers */
  reviewers?: string[];
  /** Target branch */
  targetBranch?: string;
}

/**
 * Create commit status input
 */
export interface CreateBitbucketStatusInput {
  /** Status key (unique identifier for this status check) */
  key: string;
  /** Status state */
  state: BitbucketStatusState;
  /** Status name (displayed in UI) */
  name?: string;
  /** Description */
  description?: string;
  /** Target URL */
  url?: string;
}

/**
 * Bitbucket webhook event
 */
export interface BitbucketWebhookEvent {
  /** Repository */
  repository: BitbucketRepository;
  /** Actor who triggered the event */
  actor: BitbucketUser;
  /** Event-specific data */
  pullrequest?: BitbucketPullRequest;
  comment?: BitbucketComment;
  push?: {
    changes: Array<{
      old?: { type: string; name: string; target: BitbucketCommit };
      new?: { type: string; name: string; target: BitbucketCommit };
      created: boolean;
      closed: boolean;
      forced: boolean;
      commits: BitbucketCommit[];
    }>;
  };
}

/**
 * Bitbucket webhook event types
 */
export type BitbucketWebhookEventType =
  | 'repo:push'
  | 'repo:fork'
  | 'repo:updated'
  | 'repo:commit_comment_created'
  | 'repo:commit_status_created'
  | 'repo:commit_status_updated'
  | 'pullrequest:created'
  | 'pullrequest:updated'
  | 'pullrequest:approved'
  | 'pullrequest:unapproved'
  | 'pullrequest:fulfilled'
  | 'pullrequest:rejected'
  | 'pullrequest:comment_created'
  | 'pullrequest:comment_updated'
  | 'pullrequest:comment_deleted';
