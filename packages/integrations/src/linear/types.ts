/**
 * @fileoverview Linear-specific type definitions
 * @module @relay/integrations/linear/types
 */

import { z } from 'zod';

/**
 * Linear configuration
 */
export interface LinearConfig {
  /** Linear API key */
  apiKey: string;
  /** Webhook signing secret */
  webhookSecret?: string;
}

/**
 * Issue state type
 */
export type IssueStateType =
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled';

/**
 * Issue priority (0-4, where 0 is no priority)
 */
export type IssuePriority = 0 | 1 | 2 | 3 | 4;

/**
 * Linear user
 */
export interface LinearUser {
  /** User ID */
  id: string;
  /** User name */
  name: string;
  /** User email */
  email: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Whether user is active */
  active: boolean;
  /** Whether user is admin */
  admin?: boolean;
  /** User timezone */
  timezone?: string;
}

/**
 * Linear team
 */
export interface LinearTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Team key (used in issue identifiers) */
  key: string;
  /** Team description */
  description?: string;
  /** Team icon */
  icon?: string;
  /** Team color */
  color?: string;
  /** Private team */
  private: boolean;
  /** Timezone */
  timezone?: string;
}

/**
 * Linear project
 */
export interface LinearProject {
  /** Project ID */
  id: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Project slug */
  slugId: string;
  /** Project icon */
  icon?: string;
  /** Project color */
  color?: string;
  /** Project state */
  state: string;
  /** Start date */
  startDate?: string;
  /** Target date */
  targetDate?: string;
  /** Progress (0-100) */
  progress?: number;
  /** Project URL */
  url: string;
}

/**
 * Linear workflow state
 */
export interface LinearState {
  /** State ID */
  id: string;
  /** State name */
  name: string;
  /** State color */
  color: string;
  /** State description */
  description?: string;
  /** State type */
  type: IssueStateType;
  /** State position */
  position: number;
  /** Team ID */
  teamId: string;
}

/**
 * Linear label
 */
export interface LinearLabel {
  /** Label ID */
  id: string;
  /** Label name */
  name: string;
  /** Label color */
  color: string;
  /** Label description */
  description?: string;
  /** Parent label ID */
  parentId?: string;
  /** Team ID (undefined for organization labels) */
  teamId?: string;
}

/**
 * Linear cycle
 */
export interface LinearCycle {
  /** Cycle ID */
  id: string;
  /** Cycle number */
  number: number;
  /** Cycle name */
  name?: string;
  /** Start date */
  startsAt: string;
  /** End date */
  endsAt: string;
  /** Completion progress */
  progress?: number;
  /** Team ID */
  teamId: string;
}

/**
 * Linear issue
 */
export interface LinearIssue {
  /** Issue ID */
  id: string;
  /** Issue identifier (e.g., ENG-123) */
  identifier: string;
  /** Issue title */
  title: string;
  /** Issue description (markdown) */
  description?: string;
  /** Priority (0-4) */
  priority: IssuePriority;
  /** Priority label */
  priorityLabel: string;
  /** Estimate (story points) */
  estimate?: number;
  /** Sort order */
  sortOrder: number;
  /** Branch name */
  branchName?: string;
  /** Due date */
  dueDate?: string;
  /** Started at */
  startedAt?: string;
  /** Completed at */
  completedAt?: string;
  /** Canceled at */
  canceledAt?: string;
  /** Auto-closed at */
  autoClosedAt?: string;
  /** Auto-archived at */
  autoArchivedAt?: string;
  /** Trashed flag */
  trashed?: boolean;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Issue URL */
  url: string;
  /** Assignee */
  assignee?: LinearUser;
  /** Creator */
  creator?: LinearUser;
  /** Team */
  team?: LinearTeam;
  /** Project */
  project?: LinearProject;
  /** Workflow state */
  state?: LinearState;
  /** Labels */
  labels: LinearLabel[];
  /** Cycle */
  cycle?: LinearCycle;
  /** Parent issue ID */
  parentId?: string;
  /** Subscriber IDs */
  subscriberIds?: string[];
}

/**
 * Linear comment
 */
export interface LinearComment {
  /** Comment ID */
  id: string;
  /** Comment body (markdown) */
  body: string;
  /** User who created comment */
  user?: LinearUser;
  /** Issue ID */
  issueId: string;
  /** Parent comment ID (for threads) */
  parentId?: string;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Whether comment was edited */
  edited: boolean;
  /** Comment URL */
  url?: string;
}

/**
 * Webhook event action types
 */
export type WebhookAction =
  | 'create'
  | 'update'
  | 'remove';

/**
 * Webhook event types
 */
export type WebhookType =
  | 'Issue'
  | 'Comment'
  | 'Project'
  | 'Cycle'
  | 'IssueLabel'
  | 'Reaction';

/**
 * Linear webhook event
 */
export interface LinearWebhookEvent {
  /** Webhook action */
  action: WebhookAction;
  /** Actor user */
  actor?: LinearUser;
  /** Created at */
  createdAt: string;
  /** Webhook data */
  data: LinearWebhookData;
  /** Webhook type */
  type: WebhookType;
  /** URL of the resource */
  url?: string;
  /** Updated from (for updates) */
  updatedFrom?: Record<string, unknown>;
  /** Webhook delivery ID */
  webhookId?: string;
  /** Webhook timestamp */
  webhookTimestamp?: number;
}

/**
 * Webhook data payload
 */
export interface LinearWebhookData {
  /** Issue ID */
  id: string;
  /** Issue identifier */
  identifier?: string;
  /** Issue title */
  title?: string;
  /** Description */
  description?: string;
  /** Priority */
  priority?: IssuePriority;
  /** State ID */
  stateId?: string;
  /** Assignee ID */
  assigneeId?: string;
  /** Team ID */
  teamId?: string;
  /** Project ID */
  projectId?: string;
  /** Labels */
  labelIds?: string[];
  /** Parent issue ID */
  parentId?: string;
  /** Cycle ID */
  cycleId?: string;
  /** Due date */
  dueDate?: string;
  /** Estimate */
  estimate?: number;
  /** Created at */
  createdAt?: string;
  /** Updated at */
  updatedAt?: string;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Issue creation input
 */
export interface CreateIssueInput {
  /** Team ID */
  teamId: string;
  /** Issue title */
  title: string;
  /** Issue description */
  description?: string;
  /** Priority */
  priority?: IssuePriority;
  /** State ID */
  stateId?: string;
  /** Assignee ID */
  assigneeId?: string;
  /** Project ID */
  projectId?: string;
  /** Cycle ID */
  cycleId?: string;
  /** Label IDs */
  labelIds?: string[];
  /** Parent issue ID */
  parentId?: string;
  /** Due date */
  dueDate?: string;
  /** Estimate */
  estimate?: number;
}

/**
 * Issue update input
 */
export interface UpdateIssueInput {
  /** Issue title */
  title?: string;
  /** Issue description */
  description?: string;
  /** Priority */
  priority?: IssuePriority;
  /** State ID */
  stateId?: string;
  /** Assignee ID */
  assigneeId?: string;
  /** Project ID */
  projectId?: string;
  /** Cycle ID */
  cycleId?: string;
  /** Label IDs */
  labelIds?: string[];
  /** Parent issue ID */
  parentId?: string;
  /** Due date */
  dueDate?: string;
  /** Estimate */
  estimate?: number;
  /** Trashed flag */
  trashed?: boolean;
}

/**
 * Comment creation input
 */
export interface CreateCommentInput {
  /** Issue ID */
  issueId: string;
  /** Comment body */
  body: string;
  /** Parent comment ID (for threads) */
  parentId?: string;
}

/**
 * Issue filter options
 */
export interface IssueFilterOptions {
  /** Filter by team ID */
  teamId?: string;
  /** Filter by assignee ID */
  assigneeId?: string;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by state ID */
  stateId?: string;
  /** Filter by state types */
  stateTypes?: IssueStateType[];
  /** Filter by priority */
  priority?: IssuePriority;
  /** Filter by labels */
  labelIds?: string[];
  /** Filter by cycle ID */
  cycleId?: string;
  /** Include trashed issues */
  includeTrashed?: boolean;
  /** Search query */
  query?: string;
  /** First N results */
  first?: number;
  /** Cursor for pagination */
  after?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /** Nodes */
  nodes: T[];
  /** Page info */
  pageInfo: {
    /** Has next page */
    hasNextPage: boolean;
    /** End cursor */
    endCursor?: string;
  };
}

/**
 * Zod schema for configuration validation
 */
export const LinearConfigSchema = z.object({
  apiKey: z.string().min(1),
  webhookSecret: z.string().optional(),
});

/**
 * Priority labels
 */
export const PriorityLabels: Record<IssuePriority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/**
 * Gets priority label
 * @param priority - Priority number
 * @returns Priority label string
 */
export function getPriorityLabel(priority: IssuePriority): string {
  return PriorityLabels[priority] || 'Unknown';
}
