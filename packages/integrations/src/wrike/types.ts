import { z } from 'zod';

/**
 * @fileoverview Wrike-specific type definitions and Zod schemas.
 * Maps to Wrike's REST API data structures.
 * @packageDocumentation
 */

/**
 * Wrike user schema.
 */
export const WrikeUserSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  type: z.enum(['Person', 'Group', 'Collaborator']).optional(),
  profiles: z.array(z.object({
    accountId: z.string(),
    email: z.string().email().optional(),
    role: z.string().optional(),
    external: z.boolean().optional(),
    admin: z.boolean().optional(),
    owner: z.boolean().optional(),
  })).optional(),
  avatarUrl: z.string().url().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  deleted: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  myTeam: z.boolean().optional(),
  title: z.string().optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
});
export type WrikeUser = z.infer<typeof WrikeUserSchema>;

/**
 * Wrike account schema.
 */
export const WrikeAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  dateFormat: z.string().optional(),
  firstDayOfWeek: z.string().optional(),
  workDays: z.array(z.string()).optional(),
  rootFolderId: z.string().optional(),
  recycleBinId: z.string().optional(),
  createdDate: z.string().optional(),
  subscription: z.object({
    type: z.string(),
    paid: z.boolean().optional(),
    userLimit: z.number().optional(),
  }).optional(),
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  customFields: z.array(z.object({
    id: z.string(),
    accountId: z.string(),
    title: z.string(),
    type: z.string(),
    sharedIds: z.array(z.string()).optional(),
    settings: z.record(z.unknown()).optional(),
  })).optional(),
  joinedDate: z.string().optional(),
});
export type WrikeAccount = z.infer<typeof WrikeAccountSchema>;

/**
 * Wrike folder/project schema.
 */
export const WrikeFolderSchema = z.object({
  id: z.string(),
  accountId: z.string().optional(),
  title: z.string(),
  createdDate: z.string().optional(),
  updatedDate: z.string().optional(),
  briefDescription: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  sharedIds: z.array(z.string()).optional(),
  parentIds: z.array(z.string()).optional(),
  childIds: z.array(z.string()).optional(),
  superParentIds: z.array(z.string()).optional(),
  scope: z.enum(['WsRoot', 'RbRoot', 'WsFolder', 'RbFolder', 'WsTask', 'RbTask']).optional(),
  hasAttachments: z.boolean().optional(),
  attachmentCount: z.number().optional(),
  permalink: z.string().url().optional(),
  workflowId: z.string().optional(),
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  customFields: z.array(z.object({
    id: z.string(),
    value: z.unknown().optional(),
  })).optional(),
  customColumnIds: z.array(z.string()).optional(),
  project: z.object({
    authorId: z.string().optional(),
    ownerIds: z.array(z.string()).optional(),
    status: z.enum(['Green', 'Yellow', 'Red', 'Completed', 'OnHold', 'Cancelled']).optional(),
    customStatusId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    createdDate: z.string().optional(),
    completedDate: z.string().optional(),
  }).optional(),
  space: z.boolean().optional(),
});
export type WrikeFolder = z.infer<typeof WrikeFolderSchema>;

/**
 * Wrike workflow schema.
 */
export const WrikeWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  standard: z.boolean().optional(),
  hidden: z.boolean().optional(),
  customStatuses: z.array(z.object({
    id: z.string(),
    name: z.string(),
    standardName: z.boolean().optional(),
    color: z.string(),
    standard: z.boolean().optional(),
    group: z.enum(['Active', 'Completed', 'Deferred', 'Cancelled']),
    hidden: z.boolean().optional(),
  })).optional(),
});
export type WrikeWorkflow = z.infer<typeof WrikeWorkflowSchema>;

/**
 * Wrike custom status schema.
 */
export const WrikeCustomStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  standardName: z.boolean().optional(),
  color: z.string(),
  standard: z.boolean().optional(),
  group: z.enum(['Active', 'Completed', 'Deferred', 'Cancelled']),
  hidden: z.boolean().optional(),
});
export type WrikeCustomStatus = z.infer<typeof WrikeCustomStatusSchema>;

/**
 * Wrike task importance.
 */
export const WrikeImportanceSchema = z.enum(['High', 'Normal', 'Low']);
export type WrikeImportance = z.infer<typeof WrikeImportanceSchema>;

/**
 * Wrike task schema.
 */
export const WrikeTaskSchema = z.object({
  id: z.string(),
  accountId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  briefDescription: z.string().optional(),
  parentIds: z.array(z.string()).optional(),
  superParentIds: z.array(z.string()).optional(),
  sharedIds: z.array(z.string()).optional(),
  responsibleIds: z.array(z.string()).optional(),
  status: z.enum(['Active', 'Completed', 'Deferred', 'Cancelled']).optional(),
  importance: WrikeImportanceSchema.optional(),
  createdDate: z.string().optional(),
  updatedDate: z.string().optional(),
  completedDate: z.string().optional(),
  dates: z.object({
    type: z.enum(['Backlog', 'Milestone', 'Planned']).optional(),
    duration: z.number().optional(),
    start: z.string().optional(),
    due: z.string().optional(),
    workOnWeekends: z.boolean().optional(),
  }).optional(),
  scope: z.string().optional(),
  authorIds: z.array(z.string()).optional(),
  customStatusId: z.string().optional(),
  hasAttachments: z.boolean().optional(),
  attachmentCount: z.number().optional(),
  permalink: z.string().url().optional(),
  priority: z.string().optional(),
  followedByMe: z.boolean().optional(),
  followerIds: z.array(z.string()).optional(),
  recurrent: z.boolean().optional(),
  superTaskIds: z.array(z.string()).optional(),
  subTaskIds: z.array(z.string()).optional(),
  dependencyIds: z.array(z.string()).optional(),
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  customFields: z.array(z.object({
    id: z.string(),
    value: z.unknown().optional(),
  })).optional(),
  effortAllocation: z.object({
    mode: z.string().optional(),
    totalEffort: z.number().optional(),
  }).optional(),
  billingType: z.string().optional(),
});
export type WrikeTask = z.infer<typeof WrikeTaskSchema>;

/**
 * Wrike comment schema.
 */
export const WrikeCommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  text: z.string(),
  createdDate: z.string(),
  updatedDate: z.string().optional(),
  taskId: z.string().optional(),
  folderId: z.string().optional(),
});
export type WrikeComment = z.infer<typeof WrikeCommentSchema>;

/**
 * Wrike attachment schema.
 */
export const WrikeAttachmentSchema = z.object({
  id: z.string(),
  authorId: z.string().optional(),
  name: z.string(),
  createdDate: z.string().optional(),
  version: z.number().optional(),
  type: z.enum(['Wrike', 'Google', 'DropBox', 'OneDrive', 'Box', 'External']).optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  taskId: z.string().optional(),
  folderId: z.string().optional(),
  commentId: z.string().optional(),
  currentAttachmentId: z.string().optional(),
  previewUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  reviewIds: z.array(z.string()).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type WrikeAttachment = z.infer<typeof WrikeAttachmentSchema>;

/**
 * Wrike timelog schema.
 */
export const WrikeTimelogSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  categoryId: z.string().optional(),
  billingType: z.string().optional(),
  hours: z.number(),
  createdDate: z.string(),
  updatedDate: z.string().optional(),
  trackedDate: z.string(),
  comment: z.string().optional(),
});
export type WrikeTimelog = z.infer<typeof WrikeTimelogSchema>;

/**
 * Wrike space schema.
 */
export const WrikeSpaceSchema = z.object({
  id: z.string(),
  title: z.string(),
  avatarUrl: z.string().url().optional(),
  accessType: z.enum(['Personal', 'Private', 'Public']).optional(),
  archived: z.boolean().optional(),
  description: z.string().optional(),
  guestRoleId: z.string().optional(),
  defaultProjectWorkflowId: z.string().optional(),
  defaultTaskWorkflowId: z.string().optional(),
});
export type WrikeSpace = z.infer<typeof WrikeSpaceSchema>;

/**
 * Wrike webhook event types.
 */
export const WrikeWebhookEventTypeSchema = z.enum([
  'TaskCreated',
  'TaskDeleted',
  'TaskTitleChanged',
  'TaskDescriptionChanged',
  'TaskStatusChanged',
  'TaskImportanceChanged',
  'TaskDatesChanged',
  'TaskResponsiblesChanged',
  'TaskParentsAdded',
  'TaskParentsRemoved',
  'TaskCustomFieldChanged',
  'TaskCommentAdded',
  'TaskCommentDeleted',
  'TaskAttachmentAdded',
  'TaskAttachmentDeleted',
  'FolderCreated',
  'FolderDeleted',
  'FolderTitleChanged',
  'FolderDescriptionChanged',
  'FolderCommentAdded',
  'FolderCommentDeleted',
  'FolderAttachmentAdded',
  'FolderAttachmentDeleted',
  'ProjectStatusChanged',
  'ProjectDatesChanged',
  'ProjectOwnersChanged',
  'TimelogCreated',
  'TimelogDeleted',
  'TimelogChanged',
]);
export type WrikeWebhookEventType = z.infer<typeof WrikeWebhookEventTypeSchema>;

/**
 * Wrike webhook payload schema.
 */
export const WrikeWebhookPayloadSchema = z.object({
  webhookId: z.string(),
  eventAuthorId: z.string().optional(),
  eventType: WrikeWebhookEventTypeSchema,
  taskId: z.string().optional(),
  folderId: z.string().optional(),
  commentId: z.string().optional(),
  attachmentId: z.string().optional(),
  timelogId: z.string().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  lastUpdatedDate: z.string().optional(),
});
export type WrikeWebhookPayload = z.infer<typeof WrikeWebhookPayloadSchema>;

/**
 * Wrike OAuth 2.0 configuration.
 */
export interface WrikeOAuth2Config {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth redirect/callback URL */
  redirectUri: string;
  /** OAuth scopes */
  scopes?: string[];
}

/**
 * Wrike OAuth tokens.
 */
export interface WrikeOAuthTokens {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken: string;
  /** Token type */
  tokenType: string;
  /** Expiration time in seconds */
  expiresIn: number;
  /** Host for API calls (may vary by data center) */
  host: string;
}

/**
 * Input for creating a Wrike task.
 */
export const CreateWrikeTaskInputSchema = z.object({
  /** Task title */
  title: z.string().min(1),
  /** Task description */
  description: z.string().optional(),
  /** Task status */
  status: z.enum(['Active', 'Completed', 'Deferred', 'Cancelled']).optional(),
  /** Custom status ID */
  customStatus: z.string().optional(),
  /** Task importance */
  importance: WrikeImportanceSchema.optional(),
  /** Dates configuration */
  dates: z.object({
    type: z.enum(['Backlog', 'Milestone', 'Planned']).optional(),
    start: z.string().optional(),
    due: z.string().optional(),
    duration: z.number().optional(),
    workOnWeekends: z.boolean().optional(),
  }).optional(),
  /** Parent folder/project IDs */
  parents: z.array(z.string()).optional(),
  /** Responsible user IDs */
  responsibles: z.array(z.string()).optional(),
  /** Shared user IDs */
  shareds: z.array(z.string()).optional(),
  /** Follower user IDs */
  followers: z.array(z.string()).optional(),
  /** Follow the task */
  follow: z.boolean().optional(),
  /** Super task ID (for subtasks) */
  superTasks: z.array(z.string()).optional(),
  /** Metadata key-value pairs */
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  /** Custom field values */
  customFields: z.array(z.object({
    id: z.string(),
    value: z.unknown(),
  })).optional(),
  /** Priority before task ID */
  priorityBefore: z.string().optional(),
  /** Priority after task ID */
  priorityAfter: z.string().optional(),
});
export type CreateWrikeTaskInput = z.infer<typeof CreateWrikeTaskInputSchema>;

/**
 * Input for updating a Wrike task.
 */
export const UpdateWrikeTaskInputSchema = z.object({
  /** Task title */
  title: z.string().optional(),
  /** Task description */
  description: z.string().optional(),
  /** Task status */
  status: z.enum(['Active', 'Completed', 'Deferred', 'Cancelled']).optional(),
  /** Custom status ID */
  customStatus: z.string().optional(),
  /** Task importance */
  importance: WrikeImportanceSchema.optional(),
  /** Dates configuration */
  dates: z.object({
    type: z.enum(['Backlog', 'Milestone', 'Planned']).optional(),
    start: z.string().nullish(),
    due: z.string().nullish(),
    duration: z.number().optional(),
    workOnWeekends: z.boolean().optional(),
  }).optional(),
  /** Add parent folder/project IDs */
  addParents: z.array(z.string()).optional(),
  /** Remove parent folder/project IDs */
  removeParents: z.array(z.string()).optional(),
  /** Add responsible user IDs */
  addResponsibles: z.array(z.string()).optional(),
  /** Remove responsible user IDs */
  removeResponsibles: z.array(z.string()).optional(),
  /** Add shared user IDs */
  addShareds: z.array(z.string()).optional(),
  /** Remove shared user IDs */
  removeShareds: z.array(z.string()).optional(),
  /** Add follower user IDs */
  addFollowers: z.array(z.string()).optional(),
  /** Remove follower user IDs */
  removeFollowers: z.array(z.string()).optional(),
  /** Follow the task */
  follow: z.boolean().optional(),
  /** Add super task IDs */
  addSuperTasks: z.array(z.string()).optional(),
  /** Remove super task IDs */
  removeSuperTasks: z.array(z.string()).optional(),
  /** Metadata key-value pairs */
  metadata: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
  /** Custom field values */
  customFields: z.array(z.object({
    id: z.string(),
    value: z.unknown(),
  })).optional(),
  /** Restore from recycle bin */
  restore: z.boolean().optional(),
});
export type UpdateWrikeTaskInput = z.infer<typeof UpdateWrikeTaskInputSchema>;

/**
 * Options for listing tasks.
 */
export interface WrikeListTasksOptions {
  /** Descendants depth */
  descendants?: boolean;
  /** Page size */
  pageSize?: number;
  /** Next page token */
  nextPageToken?: string;
  /** Status filter */
  status?: ('Active' | 'Completed' | 'Deferred' | 'Cancelled')[];
  /** Custom status IDs */
  customStatuses?: string[];
  /** Importance filter */
  importance?: WrikeImportance[];
  /** Updated date range start */
  updatedDate?: { start?: string; end?: string };
  /** Due date range */
  dueDate?: { start?: string; end?: string };
  /** Created date range */
  createdDate?: { start?: string; end?: string };
  /** Fields to include */
  fields?: string[];
  /** Responsible IDs filter */
  responsibles?: string[];
  /** Author IDs filter */
  authors?: string[];
  /** Sort field */
  sortField?: 'CreatedDate' | 'UpdatedDate' | 'CompletedDate' | 'DueDate' | 'Status' | 'Importance' | 'Title';
  /** Sort order */
  sortOrder?: 'Asc' | 'Desc';
  /** Subtasks */
  subTasks?: boolean;
  /** Type filter */
  type?: 'Backlog' | 'Milestone' | 'Planned';
}

/**
 * Wrike API response wrapper.
 */
export interface WrikeApiResponse<T> {
  kind: string;
  data: T[];
  nextPageToken?: string;
  responseSize?: number;
}
