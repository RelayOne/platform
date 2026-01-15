import { z } from 'zod';

/**
 * @fileoverview ClickUp-specific type definitions and Zod schemas.
 * Maps to ClickUp's REST API data structures.
 * @packageDocumentation
 */

/**
 * ClickUp user schema.
 */
export const ClickUpUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email().optional(),
  color: z.string().nullish(),
  profilePicture: z.string().url().nullish(),
  initials: z.string().optional(),
  role: z.number().optional(),
  custom_role: z.string().nullish(),
  last_active: z.string().optional(),
  date_joined: z.string().optional(),
  date_invited: z.string().optional(),
});
export type ClickUpUser = z.infer<typeof ClickUpUserSchema>;

/**
 * ClickUp team (workspace) schema.
 */
export const ClickUpTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  avatar: z.string().url().nullish(),
  members: z.array(z.object({
    user: ClickUpUserSchema,
    invited_by: ClickUpUserSchema.optional(),
  })).optional(),
});
export type ClickUpTeam = z.infer<typeof ClickUpTeamSchema>;

/**
 * ClickUp space schema.
 */
export const ClickUpSpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  private: z.boolean().optional(),
  color: z.string().nullish(),
  avatar: z.string().nullish(),
  admin_can_manage: z.boolean().optional(),
  archived: z.boolean().optional(),
  members: z.array(z.object({
    user: ClickUpUserSchema,
  })).optional(),
  statuses: z.array(z.object({
    id: z.string().optional(),
    status: z.string(),
    type: z.string(),
    orderindex: z.number(),
    color: z.string(),
  })).optional(),
  multiple_assignees: z.boolean().optional(),
  features: z.record(z.object({
    enabled: z.boolean(),
  })).optional(),
});
export type ClickUpSpace = z.infer<typeof ClickUpSpaceSchema>;

/**
 * ClickUp folder schema.
 */
export const ClickUpFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  orderindex: z.number().optional(),
  override_statuses: z.boolean().optional(),
  hidden: z.boolean().optional(),
  space: z.object({
    id: z.string(),
    name: z.string().optional(),
  }).optional(),
  task_count: z.string().optional(),
  archived: z.boolean().optional(),
  permission_level: z.string().optional(),
  lists: z.array(z.lazy(() => ClickUpListSchema)).optional(),
});
export type ClickUpFolder = z.infer<typeof ClickUpFolderSchema>;

/**
 * ClickUp list schema.
 */
export const ClickUpListSchema = z.object({
  id: z.string(),
  name: z.string(),
  orderindex: z.number().optional(),
  content: z.string().optional(),
  status: z.object({
    status: z.string(),
    color: z.string(),
    hide_label: z.boolean().optional(),
  }).optional(),
  priority: z.object({
    priority: z.string(),
    color: z.string(),
  }).nullish(),
  assignee: ClickUpUserSchema.nullish(),
  task_count: z.number().optional(),
  due_date: z.string().nullish(),
  start_date: z.string().nullish(),
  folder: z.object({
    id: z.string(),
    name: z.string().optional(),
    hidden: z.boolean().optional(),
    access: z.boolean().optional(),
  }).optional(),
  space: z.object({
    id: z.string(),
    name: z.string().optional(),
    access: z.boolean().optional(),
  }).optional(),
  archived: z.boolean().optional(),
  override_statuses: z.boolean().optional(),
  permission_level: z.string().optional(),
  statuses: z.array(z.object({
    id: z.string().optional(),
    status: z.string(),
    type: z.string(),
    orderindex: z.number(),
    color: z.string(),
  })).optional(),
});
export type ClickUpList = z.infer<typeof ClickUpListSchema>;

/**
 * ClickUp status schema.
 */
export const ClickUpStatusSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  type: z.enum(['open', 'custom', 'closed', 'done']),
  orderindex: z.number(),
  color: z.string(),
});
export type ClickUpStatus = z.infer<typeof ClickUpStatusSchema>;

/**
 * ClickUp priority schema.
 */
export const ClickUpPrioritySchema = z.object({
  id: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).nullable(),
  color: z.string(),
  orderindex: z.string().optional(),
});
export type ClickUpPriority = z.infer<typeof ClickUpPrioritySchema>;

/**
 * ClickUp tag schema.
 */
export const ClickUpTagSchema = z.object({
  name: z.string(),
  tag_fg: z.string().optional(),
  tag_bg: z.string().optional(),
  creator: z.number().optional(),
});
export type ClickUpTag = z.infer<typeof ClickUpTagSchema>;

/**
 * ClickUp custom field schema.
 */
export const ClickUpCustomFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  type_config: z.record(z.unknown()).optional(),
  date_created: z.string().optional(),
  hide_from_guests: z.boolean().optional(),
  required: z.boolean().optional(),
  value: z.unknown().optional(),
});
export type ClickUpCustomField = z.infer<typeof ClickUpCustomFieldSchema>;

/**
 * ClickUp checklist item schema.
 */
export const ClickUpChecklistItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  orderindex: z.number().optional(),
  assignee: ClickUpUserSchema.nullish(),
  group_assignee: z.string().nullish(),
  resolved: z.boolean(),
  parent: z.string().nullish(),
  date_created: z.string().optional(),
  children: z.array(z.lazy(() => ClickUpChecklistItemSchema)).optional(),
});
export type ClickUpChecklistItem = z.infer<typeof ClickUpChecklistItemSchema>;

/**
 * ClickUp checklist schema.
 */
export const ClickUpChecklistSchema = z.object({
  id: z.string(),
  task_id: z.string().optional(),
  name: z.string(),
  date_created: z.string().optional(),
  orderindex: z.number().optional(),
  creator: z.number().optional(),
  resolved: z.number().optional(),
  unresolved: z.number().optional(),
  items: z.array(ClickUpChecklistItemSchema).optional(),
});
export type ClickUpChecklist = z.infer<typeof ClickUpChecklistSchema>;

/**
 * ClickUp attachment schema.
 */
export const ClickUpAttachmentSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  type: z.number().optional(),
  source: z.number().optional(),
  version: z.number().optional(),
  extension: z.string().optional(),
  thumbnail_small: z.string().url().nullish(),
  thumbnail_medium: z.string().url().nullish(),
  thumbnail_large: z.string().url().nullish(),
  is_folder: z.boolean().nullish(),
  mimetype: z.string().optional(),
  hidden: z.boolean().optional(),
  parent_id: z.string().optional(),
  size: z.number().optional(),
  total_comments: z.number().optional(),
  resolved_comments: z.number().optional(),
  user: ClickUpUserSchema.optional(),
  deleted: z.boolean().optional(),
  orientation: z.string().nullish(),
  url: z.string().url().optional(),
  parent_comment_type: z.string().nullish(),
  parent_comment_parent: z.string().nullish(),
  email_data: z.string().nullish(),
  url_w_query: z.string().url().optional(),
  url_w_host: z.string().url().optional(),
});
export type ClickUpAttachment = z.infer<typeof ClickUpAttachmentSchema>;

/**
 * ClickUp task schema.
 */
export const ClickUpTaskSchema = z.object({
  id: z.string(),
  custom_id: z.string().nullish(),
  name: z.string(),
  text_content: z.string().nullish(),
  description: z.string().nullish(),
  status: z.object({
    id: z.string().optional(),
    status: z.string(),
    color: z.string(),
    type: z.string().optional(),
    orderindex: z.number().optional(),
  }),
  orderindex: z.string().optional(),
  date_created: z.string(),
  date_updated: z.string().optional(),
  date_closed: z.string().nullish(),
  date_done: z.string().nullish(),
  archived: z.boolean().optional(),
  creator: ClickUpUserSchema,
  assignees: z.array(ClickUpUserSchema).optional(),
  group_assignees: z.array(z.object({
    id: z.string(),
    name: z.string(),
    initials: z.string().optional(),
    avatar: z.string().nullish(),
  })).optional(),
  watchers: z.array(ClickUpUserSchema).optional(),
  checklists: z.array(ClickUpChecklistSchema).optional(),
  tags: z.array(ClickUpTagSchema).optional(),
  parent: z.string().nullish(),
  priority: z.object({
    id: z.string().optional(),
    priority: z.string().nullable(),
    color: z.string(),
    orderindex: z.string().optional(),
  }).nullish(),
  due_date: z.string().nullish(),
  start_date: z.string().nullish(),
  points: z.number().nullish(),
  time_estimate: z.number().nullish(),
  time_spent: z.number().optional(),
  custom_fields: z.array(ClickUpCustomFieldSchema).optional(),
  dependencies: z.array(z.object({
    task_id: z.string(),
    depends_on: z.string(),
    type: z.number(),
    date_created: z.string().optional(),
    userid: z.string().optional(),
  })).optional(),
  linked_tasks: z.array(z.object({
    task_id: z.string(),
    link_id: z.string(),
    date_created: z.string().optional(),
    userid: z.string().optional(),
  })).optional(),
  team_id: z.string().optional(),
  url: z.string().url(),
  sharing: z.object({
    public: z.boolean(),
    public_share_expires_on: z.string().nullish(),
    public_fields: z.array(z.string()).optional(),
    token: z.string().nullish(),
    seo_optimized: z.boolean().optional(),
  }).optional(),
  permission_level: z.string().optional(),
  list: z.object({
    id: z.string(),
    name: z.string().optional(),
    access: z.boolean().optional(),
  }).optional(),
  project: z.object({
    id: z.string(),
    name: z.string().optional(),
    hidden: z.boolean().optional(),
    access: z.boolean().optional(),
  }).optional(),
  folder: z.object({
    id: z.string(),
    name: z.string().optional(),
    hidden: z.boolean().optional(),
    access: z.boolean().optional(),
  }).optional(),
  space: z.object({
    id: z.string(),
  }),
  subtasks: z.array(z.lazy(() => ClickUpTaskSchema)).optional(),
  attachments: z.array(ClickUpAttachmentSchema).optional(),
});
export type ClickUpTask = z.infer<typeof ClickUpTaskSchema>;

/**
 * ClickUp comment schema.
 */
export const ClickUpCommentSchema = z.object({
  id: z.string(),
  comment: z.array(z.object({
    text: z.string(),
    type: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
  })).optional(),
  comment_text: z.string(),
  user: ClickUpUserSchema,
  assignee: ClickUpUserSchema.nullish(),
  group_assignee: z.string().nullish(),
  assigned_by: ClickUpUserSchema.nullish(),
  reactions: z.array(z.object({
    reaction: z.string(),
    date: z.string(),
    user: ClickUpUserSchema,
  })).optional(),
  date: z.string(),
  resolved_by: ClickUpUserSchema.nullish(),
  resolved_date: z.string().nullish(),
  hist_id: z.string().optional(),
});
export type ClickUpComment = z.infer<typeof ClickUpCommentSchema>;

/**
 * ClickUp webhook event types.
 */
export const ClickUpWebhookEventSchema = z.enum([
  'taskCreated',
  'taskUpdated',
  'taskDeleted',
  'taskPriorityUpdated',
  'taskStatusUpdated',
  'taskAssigneeUpdated',
  'taskDueDateUpdated',
  'taskTagUpdated',
  'taskMoved',
  'taskCommentPosted',
  'taskCommentUpdated',
  'taskTimeEstimateUpdated',
  'taskTimeTrackedUpdated',
  'taskAttachmentUploaded',
  'listCreated',
  'listUpdated',
  'listDeleted',
  'folderCreated',
  'folderUpdated',
  'folderDeleted',
  'spaceCreated',
  'spaceUpdated',
  'spaceDeleted',
  'goalCreated',
  'goalUpdated',
  'goalDeleted',
  'keyResultCreated',
  'keyResultUpdated',
  'keyResultDeleted',
]);
export type ClickUpWebhookEvent = z.infer<typeof ClickUpWebhookEventSchema>;

/**
 * ClickUp webhook payload schema.
 */
export const ClickUpWebhookPayloadSchema = z.object({
  event: ClickUpWebhookEventSchema,
  history_items: z.array(z.object({
    id: z.string(),
    type: z.number(),
    date: z.string(),
    field: z.string(),
    parent_id: z.string(),
    data: z.record(z.unknown()).optional(),
    source: z.string().nullish(),
    user: ClickUpUserSchema.optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    comment: z.object({
      id: z.string(),
      comment_text: z.string(),
      user: ClickUpUserSchema,
      date: z.string(),
    }).optional(),
  })).optional(),
  task_id: z.string().optional(),
  webhook_id: z.string(),
});
export type ClickUpWebhookPayload = z.infer<typeof ClickUpWebhookPayloadSchema>;

/**
 * ClickUp OAuth 2.0 configuration.
 */
export interface ClickUpOAuth2Config {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth redirect/callback URL */
  redirectUri: string;
}

/**
 * ClickUp OAuth tokens.
 */
export interface ClickUpOAuthTokens {
  /** Access token */
  accessToken: string;
  /** Token type */
  tokenType: string;
}

/**
 * Input for creating a ClickUp task.
 */
export const CreateClickUpTaskInputSchema = z.object({
  /** Task name/title */
  name: z.string().min(1),
  /** Task description (markdown supported) */
  description: z.string().optional(),
  /** Markdown description */
  markdown_description: z.string().optional(),
  /** Assignee user IDs */
  assignees: z.array(z.number()).optional(),
  /** Tags */
  tags: z.array(z.string()).optional(),
  /** Status name */
  status: z.string().optional(),
  /** Priority (1=urgent, 2=high, 3=normal, 4=low) */
  priority: z.number().min(1).max(4).nullish(),
  /** Due date timestamp (ms) */
  due_date: z.number().optional(),
  /** Due date time included */
  due_date_time: z.boolean().optional(),
  /** Start date timestamp (ms) */
  start_date: z.number().optional(),
  /** Start date time included */
  start_date_time: z.boolean().optional(),
  /** Time estimate (ms) */
  time_estimate: z.number().optional(),
  /** Notify all assignees */
  notify_all: z.boolean().optional(),
  /** Parent task ID (for subtasks) */
  parent: z.string().nullish(),
  /** Links to other tasks */
  links_to: z.string().nullish(),
  /** Custom fields */
  custom_fields: z.array(z.object({
    id: z.string(),
    value: z.unknown(),
  })).optional(),
  /** Check required custom fields */
  check_required_custom_fields: z.boolean().optional(),
  /** Custom item ID */
  custom_item_id: z.number().optional(),
});
export type CreateClickUpTaskInput = z.infer<typeof CreateClickUpTaskInputSchema>;

/**
 * Input for updating a ClickUp task.
 */
export const UpdateClickUpTaskInputSchema = z.object({
  /** Task name */
  name: z.string().optional(),
  /** Task description */
  description: z.string().optional(),
  /** Status name */
  status: z.string().optional(),
  /** Priority (1-4 or null) */
  priority: z.number().min(1).max(4).nullish(),
  /** Due date timestamp (ms) or null */
  due_date: z.number().nullish(),
  /** Due date time included */
  due_date_time: z.boolean().optional(),
  /** Start date timestamp (ms) or null */
  start_date: z.number().nullish(),
  /** Start date time included */
  start_date_time: z.boolean().optional(),
  /** Time estimate (ms) */
  time_estimate: z.number().nullish(),
  /** Assignees (add) */
  assignees: z.object({
    add: z.array(z.number()).optional(),
    rem: z.array(z.number()).optional(),
  }).optional(),
  /** Archived status */
  archived: z.boolean().optional(),
  /** Parent task ID */
  parent: z.string().nullish(),
});
export type UpdateClickUpTaskInput = z.infer<typeof UpdateClickUpTaskInputSchema>;

/**
 * Options for listing tasks.
 */
export interface ClickUpListTasksOptions {
  /** Filter archived tasks */
  archived?: boolean;
  /** Include closed tasks */
  include_closed?: boolean;
  /** Page number (0-indexed) */
  page?: number;
  /** Order by field */
  order_by?: 'id' | 'created' | 'updated' | 'due_date';
  /** Reverse order */
  reverse?: boolean;
  /** Subtasks filter */
  subtasks?: boolean;
  /** Statuses to filter by */
  statuses?: string[];
  /** Include markdown description */
  include_markdown_description?: boolean;
  /** Custom fields to include */
  custom_fields?: Array<{ field_id: string; operator: string; value: unknown }>;
  /** Assignees to filter by */
  assignees?: number[];
  /** Watchers to filter by */
  watchers?: number[];
  /** Tags to filter by */
  tags?: string[];
  /** Due date greater than (ms) */
  due_date_gt?: number;
  /** Due date less than (ms) */
  due_date_lt?: number;
  /** Date created greater than (ms) */
  date_created_gt?: number;
  /** Date created less than (ms) */
  date_created_lt?: number;
  /** Date updated greater than (ms) */
  date_updated_gt?: number;
  /** Date updated less than (ms) */
  date_updated_lt?: number;
  /** Custom task IDs */
  custom_task_ids?: boolean;
  /** Team ID for custom task IDs */
  team_id?: string;
}

/**
 * ClickUp API response wrapper for lists.
 */
export interface ClickUpListResponse<T> {
  tasks?: T[];
  lists?: T[];
  folders?: T[];
  spaces?: T[];
  teams?: T[];
  comments?: T[];
  last_page?: boolean;
}
