/**
 * @fileoverview Jira type definitions
 * @module @relay/integrations/jira/types
 */

import type { IntegrationConfig } from '../common/types';

/**
 * Jira API configuration
 */
export interface JiraConfig extends IntegrationConfig {
  /** Jira instance base URL (e.g., https://company.atlassian.net) */
  baseUrl: string;
  /** Email address for API authentication */
  email: string;
  /** API token for authentication */
  apiToken: string;
}

/**
 * Jira OAuth configuration (for OAuth 2.0 apps)
 */
export interface JiraOAuthConfig extends IntegrationConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken?: string;
  /** Cloud ID for the Jira instance */
  cloudId: string;
}

/**
 * Jira user
 */
export interface JiraUser {
  /** Account ID */
  accountId: string;
  /** Account type */
  accountType: 'atlassian' | 'app' | 'customer';
  /** Display name */
  displayName: string;
  /** Email address (may not be available) */
  emailAddress?: string;
  /** Avatar URLs */
  avatarUrls: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  /** Whether the user is active */
  active: boolean;
  /** Timezone */
  timeZone?: string;
}

/**
 * Jira project
 */
export interface JiraProject {
  /** Project ID */
  id: string;
  /** Project key */
  key: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Project lead */
  lead?: JiraUser;
  /** Project URL */
  self: string;
  /** Project avatar URLs */
  avatarUrls: Record<string, string>;
  /** Project type */
  projectTypeKey: 'software' | 'service_desk' | 'business';
  /** Simplified project */
  simplified: boolean;
  /** Style (classic or next-gen) */
  style: 'classic' | 'next-gen';
}

/**
 * Jira issue type
 */
export interface JiraIssueType {
  /** Issue type ID */
  id: string;
  /** Issue type name */
  name: string;
  /** Issue type description */
  description?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Whether it's a subtask */
  subtask: boolean;
  /** Hierarchy level */
  hierarchyLevel?: number;
}

/**
 * Jira issue status
 */
export interface JiraStatus {
  /** Status ID */
  id: string;
  /** Status name */
  name: string;
  /** Status description */
  description?: string;
  /** Status category */
  statusCategory: {
    id: number;
    key: 'new' | 'indeterminate' | 'done';
    colorName: string;
    name: string;
  };
}

/**
 * Jira issue priority
 */
export interface JiraPriority {
  /** Priority ID */
  id: string;
  /** Priority name */
  name: string;
  /** Icon URL */
  iconUrl?: string;
  /** Self URL */
  self: string;
}

/**
 * Jira issue fields
 */
export interface JiraIssueFields {
  /** Issue summary/title */
  summary: string;
  /** Issue description (ADF format) */
  description?: JiraDocument;
  /** Issue status */
  status: JiraStatus;
  /** Issue type */
  issuetype: JiraIssueType;
  /** Project */
  project: JiraProject;
  /** Priority */
  priority?: JiraPriority;
  /** Assignee */
  assignee?: JiraUser;
  /** Reporter */
  reporter?: JiraUser;
  /** Creator */
  creator?: JiraUser;
  /** Labels */
  labels: string[];
  /** Components */
  components: Array<{ id: string; name: string }>;
  /** Fix versions */
  fixVersions: Array<{ id: string; name: string }>;
  /** Affected versions */
  versions: Array<{ id: string; name: string }>;
  /** Created date */
  created: string;
  /** Updated date */
  updated: string;
  /** Resolution date */
  resolutiondate?: string;
  /** Due date */
  duedate?: string;
  /** Resolution */
  resolution?: { id: string; name: string };
  /** Parent issue (for subtasks) */
  parent?: { id: string; key: string; fields: { summary: string } };
  /** Subtasks */
  subtasks?: JiraIssue[];
  /** Issue links */
  issuelinks?: JiraIssueLink[];
  /** Sprint information */
  sprint?: JiraSprint;
  /** Story points (custom field) */
  customfield_10016?: number;
  /** Epic link (custom field) */
  customfield_10014?: string;
  /** Epic name (for epics) */
  customfield_10011?: string;
  /** Watches */
  watches?: { watchCount: number; isWatching: boolean };
  /** Votes */
  votes?: { votes: number; hasVoted: boolean };
  /** Comments */
  comment?: {
    comments: JiraComment[];
    total: number;
  };
  /** Attachments */
  attachment?: JiraAttachment[];
  /** Worklogs */
  worklog?: {
    worklogs: JiraWorklog[];
    total: number;
  };
  /** Time tracking */
  timetracking?: {
    originalEstimate?: string;
    remainingEstimate?: string;
    timeSpent?: string;
    originalEstimateSeconds?: number;
    remainingEstimateSeconds?: number;
    timeSpentSeconds?: number;
  };
}

/**
 * Jira issue
 */
export interface JiraIssue {
  /** Issue ID */
  id: string;
  /** Issue key (e.g., PROJ-123) */
  key: string;
  /** Self URL */
  self: string;
  /** Issue fields */
  fields: JiraIssueFields;
  /** Changelog (when expand=changelog) */
  changelog?: {
    histories: JiraChangelogEntry[];
  };
  /** Rendered fields (when expand=renderedFields) */
  renderedFields?: Partial<JiraIssueFields>;
  /** Names of custom fields */
  names?: Record<string, string>;
}

/**
 * Jira Atlassian Document Format (ADF) document
 */
export interface JiraDocument {
  /** Document version (always 1) */
  version: 1;
  /** Document type (always "doc") */
  type: 'doc';
  /** Document content */
  content: JiraDocumentNode[];
}

/**
 * Jira ADF document node
 */
export interface JiraDocumentNode {
  /** Node type */
  type: string;
  /** Node text (for text nodes) */
  text?: string;
  /** Node attributes */
  attrs?: Record<string, unknown>;
  /** Node marks (formatting) */
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  /** Child nodes */
  content?: JiraDocumentNode[];
}

/**
 * Jira comment
 */
export interface JiraComment {
  /** Comment ID */
  id: string;
  /** Comment body (ADF format) */
  body: JiraDocument;
  /** Comment author */
  author: JiraUser;
  /** Update author */
  updateAuthor?: JiraUser;
  /** Created date */
  created: string;
  /** Updated date */
  updated: string;
  /** Self URL */
  self: string;
  /** Whether the comment is from Jira Service Desk */
  jsdPublic?: boolean;
}

/**
 * Jira issue link
 */
export interface JiraIssueLink {
  /** Link ID */
  id: string;
  /** Link type */
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  /** Inward issue (when this issue is the target) */
  inwardIssue?: {
    id: string;
    key: string;
    fields: { summary: string; status: JiraStatus };
  };
  /** Outward issue (when this issue is the source) */
  outwardIssue?: {
    id: string;
    key: string;
    fields: { summary: string; status: JiraStatus };
  };
}

/**
 * Jira sprint
 */
export interface JiraSprint {
  /** Sprint ID */
  id: number;
  /** Sprint name */
  name: string;
  /** Sprint state */
  state: 'future' | 'active' | 'closed';
  /** Sprint goal */
  goal?: string;
  /** Start date */
  startDate?: string;
  /** End date */
  endDate?: string;
  /** Complete date */
  completeDate?: string;
  /** Board ID */
  boardId?: number;
}

/**
 * Jira attachment
 */
export interface JiraAttachment {
  /** Attachment ID */
  id: string;
  /** Filename */
  filename: string;
  /** Author */
  author: JiraUser;
  /** Created date */
  created: string;
  /** File size */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Content URL */
  content: string;
  /** Thumbnail URL (for images) */
  thumbnail?: string;
}

/**
 * Jira worklog entry
 */
export interface JiraWorklog {
  /** Worklog ID */
  id: string;
  /** Author */
  author: JiraUser;
  /** Update author */
  updateAuthor?: JiraUser;
  /** Comment */
  comment?: JiraDocument;
  /** Started date */
  started: string;
  /** Time spent string */
  timeSpent: string;
  /** Time spent seconds */
  timeSpentSeconds: number;
  /** Created date */
  created: string;
  /** Updated date */
  updated: string;
}

/**
 * Jira changelog entry
 */
export interface JiraChangelogEntry {
  /** Changelog ID */
  id: string;
  /** Author */
  author: JiraUser;
  /** Created date */
  created: string;
  /** Items changed */
  items: Array<{
    field: string;
    fieldtype: string;
    fieldId?: string;
    from?: string;
    fromString?: string;
    to?: string;
    toString?: string;
  }>;
}

/**
 * Jira search results
 */
export interface JiraSearchResults {
  /** Start index */
  startAt: number;
  /** Max results */
  maxResults: number;
  /** Total results */
  total: number;
  /** Issues */
  issues: JiraIssue[];
  /** Warning messages */
  warningMessages?: string[];
}

/**
 * Issue creation input
 */
export interface CreateJiraIssueInput {
  /** Project key or ID */
  projectKey: string;
  /** Issue type name or ID */
  issueType: string;
  /** Issue summary */
  summary: string;
  /** Issue description (plain text or ADF) */
  description?: string | JiraDocument;
  /** Priority name or ID */
  priority?: string;
  /** Assignee account ID */
  assigneeId?: string;
  /** Labels */
  labels?: string[];
  /** Component names or IDs */
  components?: string[];
  /** Epic key (for stories) */
  epicKey?: string;
  /** Parent key (for subtasks) */
  parentKey?: string;
  /** Due date (YYYY-MM-DD) */
  dueDate?: string;
  /** Story points */
  storyPoints?: number;
  /** Custom fields */
  customFields?: Record<string, unknown>;
}

/**
 * Issue update input
 */
export interface UpdateJiraIssueInput {
  /** Issue summary */
  summary?: string;
  /** Issue description */
  description?: string | JiraDocument;
  /** Priority name or ID */
  priority?: string;
  /** Assignee account ID (null to unassign) */
  assigneeId?: string | null;
  /** Labels */
  labels?: string[];
  /** Due date (YYYY-MM-DD) */
  dueDate?: string | null;
  /** Custom fields */
  customFields?: Record<string, unknown>;
}

/**
 * Issue transition input
 */
export interface TransitionJiraIssueInput {
  /** Transition ID */
  transitionId: string;
  /** Comment to add */
  comment?: string | JiraDocument;
  /** Resolution (for closing transitions) */
  resolution?: string;
  /** Custom fields required for transition */
  fields?: Record<string, unknown>;
}

/**
 * Jira webhook event
 */
export interface JiraWebhookEvent {
  /** Event timestamp */
  timestamp: number;
  /** Webhook event type */
  webhookEvent: JiraWebhookEventType;
  /** Actor who triggered the event */
  user?: JiraUser;
  /** Issue data (for issue events) */
  issue?: JiraIssue;
  /** Changelog (for issue update events) */
  changelog?: JiraChangelogEntry;
  /** Comment (for comment events) */
  comment?: JiraComment;
  /** Sprint (for sprint events) */
  sprint?: JiraSprint;
  /** Worklog (for worklog events) */
  worklog?: JiraWorklog;
}

/**
 * Jira webhook event types
 */
export type JiraWebhookEventType =
  | 'jira:issue_created'
  | 'jira:issue_updated'
  | 'jira:issue_deleted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_deleted'
  | 'sprint_started'
  | 'sprint_closed'
  | 'worklog_created'
  | 'worklog_updated'
  | 'worklog_deleted'
  | 'issuelink_created'
  | 'issuelink_deleted';

/**
 * Jira transition
 */
export interface JiraTransition {
  /** Transition ID */
  id: string;
  /** Transition name */
  name: string;
  /** Target status */
  to: JiraStatus;
  /** Whether fields are required */
  hasScreen: boolean;
  /** Fields available/required for transition */
  fields?: Record<string, {
    required: boolean;
    name: string;
    schema: { type: string };
    allowedValues?: unknown[];
  }>;
}
