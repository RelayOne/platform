import { z } from 'zod';

/**
 * @fileoverview Asana-specific type definitions and Zod schemas.
 * Maps to Asana's REST API data structures.
 * @packageDocumentation
 */

/**
 * Asana resource type enumeration.
 * Used for type discrimination in API responses.
 */
export const AsanaResourceTypeSchema = z.enum([
  'task',
  'project',
  'section',
  'user',
  'workspace',
  'team',
  'tag',
  'story',
  'attachment',
  'custom_field',
  'portfolio',
  'goal',
]);
export type AsanaResourceType = z.infer<typeof AsanaResourceTypeSchema>;

/**
 * Asana compact resource reference.
 * Used for linked resources in API responses.
 */
export const AsanaCompactSchema = z.object({
  gid: z.string(),
  resource_type: AsanaResourceTypeSchema.optional(),
  name: z.string().optional(),
});
export type AsanaCompact = z.infer<typeof AsanaCompactSchema>;

/**
 * Asana user schema.
 */
export const AsanaUserSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('user').optional(),
  name: z.string(),
  email: z.string().email().optional(),
  photo: z
    .object({
      image_21x21: z.string().url().optional(),
      image_27x27: z.string().url().optional(),
      image_36x36: z.string().url().optional(),
      image_60x60: z.string().url().optional(),
      image_128x128: z.string().url().optional(),
    })
    .optional(),
  workspaces: z.array(AsanaCompactSchema).optional(),
});
export type AsanaUser = z.infer<typeof AsanaUserSchema>;

/**
 * Asana workspace schema.
 */
export const AsanaWorkspaceSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('workspace').optional(),
  name: z.string(),
  is_organization: z.boolean().optional(),
  email_domains: z.array(z.string()).optional(),
});
export type AsanaWorkspace = z.infer<typeof AsanaWorkspaceSchema>;

/**
 * Asana team schema.
 */
export const AsanaTeamSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('team').optional(),
  name: z.string(),
  description: z.string().optional(),
  html_description: z.string().optional(),
  organization: AsanaCompactSchema.optional(),
  permalink_url: z.string().url().optional(),
});
export type AsanaTeam = z.infer<typeof AsanaTeamSchema>;

/**
 * Asana custom field schema.
 */
export const AsanaCustomFieldSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('custom_field').optional(),
  name: z.string(),
  type: z.enum(['text', 'number', 'enum', 'multi_enum', 'date', 'people']),
  enum_options: z
    .array(
      z.object({
        gid: z.string(),
        name: z.string(),
        color: z.string().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .optional(),
  enum_value: AsanaCompactSchema.nullish(),
  multi_enum_values: z.array(AsanaCompactSchema).optional(),
  number_value: z.number().nullish(),
  text_value: z.string().nullish(),
  display_value: z.string().nullish(),
  date_value: z
    .object({
      date: z.string().nullish(),
      date_time: z.string().nullish(),
    })
    .nullish(),
  people_value: z.array(AsanaCompactSchema).optional(),
});
export type AsanaCustomField = z.infer<typeof AsanaCustomFieldSchema>;

/**
 * Asana section schema (for task categorization within projects).
 */
export const AsanaSectionSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('section').optional(),
  name: z.string(),
  project: AsanaCompactSchema.optional(),
  created_at: z.string().optional(),
});
export type AsanaSection = z.infer<typeof AsanaSectionSchema>;

/**
 * Asana project schema.
 */
export const AsanaProjectSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('project').optional(),
  name: z.string(),
  archived: z.boolean().optional(),
  color: z.string().nullish(),
  created_at: z.string().optional(),
  current_status: z
    .object({
      gid: z.string(),
      color: z.string(),
      text: z.string(),
      author: AsanaCompactSchema.optional(),
      created_at: z.string().optional(),
      modified_at: z.string().optional(),
    })
    .nullish(),
  current_status_update: AsanaCompactSchema.nullish(),
  custom_field_settings: z
    .array(
      z.object({
        gid: z.string(),
        custom_field: AsanaCustomFieldSchema.optional(),
        is_important: z.boolean().optional(),
        project: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  default_view: z.enum(['list', 'board', 'calendar', 'timeline']).optional(),
  due_date: z.string().nullish(),
  due_on: z.string().nullish(),
  html_notes: z.string().optional(),
  notes: z.string().optional(),
  members: z.array(AsanaCompactSchema).optional(),
  owner: AsanaCompactSchema.nullish(),
  permalink_url: z.string().url().optional(),
  public: z.boolean().optional(),
  start_on: z.string().nullish(),
  team: AsanaCompactSchema.optional(),
  workspace: AsanaCompactSchema.optional(),
  completed: z.boolean().optional(),
  completed_at: z.string().nullish(),
  modified_at: z.string().optional(),
  followers: z.array(AsanaCompactSchema).optional(),
});
export type AsanaProject = z.infer<typeof AsanaProjectSchema>;

/**
 * Asana tag schema.
 */
export const AsanaTagSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('tag').optional(),
  name: z.string(),
  color: z.string().nullish(),
  notes: z.string().optional(),
  followers: z.array(AsanaCompactSchema).optional(),
  workspace: AsanaCompactSchema.optional(),
  permalink_url: z.string().url().optional(),
});
export type AsanaTag = z.infer<typeof AsanaTagSchema>;

/**
 * Asana task schema.
 */
export const AsanaTaskSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('task').optional(),
  name: z.string(),
  resource_subtype: z.enum(['default_task', 'milestone', 'section', 'approval']).optional(),
  approval_status: z.enum(['pending', 'approved', 'rejected', 'changes_requested']).nullish(),
  assignee: AsanaCompactSchema.nullish(),
  assignee_status: z.enum(['inbox', 'upcoming', 'today', 'later']).optional(),
  completed: z.boolean().optional(),
  completed_at: z.string().nullish(),
  completed_by: AsanaCompactSchema.nullish(),
  created_at: z.string().optional(),
  created_by: AsanaCompactSchema.optional(),
  custom_fields: z.array(AsanaCustomFieldSchema).optional(),
  dependencies: z.array(AsanaCompactSchema).optional(),
  dependents: z.array(AsanaCompactSchema).optional(),
  due_at: z.string().nullish(),
  due_on: z.string().nullish(),
  external: z
    .object({
      gid: z.string().optional(),
      data: z.string().optional(),
    })
    .nullish(),
  followers: z.array(AsanaCompactSchema).optional(),
  hearted: z.boolean().optional(),
  hearts: z
    .array(
      z.object({
        gid: z.string(),
        user: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  html_notes: z.string().optional(),
  is_rendered_as_separator: z.boolean().optional(),
  liked: z.boolean().optional(),
  likes: z
    .array(
      z.object({
        gid: z.string(),
        user: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  memberships: z
    .array(
      z.object({
        project: AsanaCompactSchema.optional(),
        section: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  modified_at: z.string().optional(),
  notes: z.string().optional(),
  num_hearts: z.number().optional(),
  num_likes: z.number().optional(),
  num_subtasks: z.number().optional(),
  parent: AsanaCompactSchema.nullish(),
  permalink_url: z.string().url().optional(),
  projects: z.array(AsanaCompactSchema).optional(),
  start_at: z.string().nullish(),
  start_on: z.string().nullish(),
  tags: z.array(AsanaCompactSchema).optional(),
  workspace: AsanaCompactSchema.optional(),
  actual_time_minutes: z.number().nullish(),
});
export type AsanaTask = z.infer<typeof AsanaTaskSchema>;

/**
 * Asana story (comment/activity) schema.
 */
export const AsanaStorySchema = z.object({
  gid: z.string(),
  resource_type: z.literal('story').optional(),
  created_at: z.string(),
  created_by: AsanaCompactSchema.optional(),
  resource_subtype: z
    .enum([
      'comment_added',
      'assigned',
      'unassigned',
      'section_changed',
      'due_date_changed',
      'attachment_added',
      'follower_added',
      'marked_complete',
      'marked_incomplete',
      'name_changed',
      'description_changed',
      'tag_added',
      'tag_removed',
      'dependency_added',
      'dependency_removed',
      'project_added',
      'project_removed',
    ])
    .optional(),
  text: z.string().optional(),
  html_text: z.string().optional(),
  is_pinned: z.boolean().optional(),
  is_edited: z.boolean().optional(),
  hearted: z.boolean().optional(),
  hearts: z
    .array(
      z.object({
        gid: z.string(),
        user: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  liked: z.boolean().optional(),
  likes: z
    .array(
      z.object({
        gid: z.string(),
        user: AsanaCompactSchema.optional(),
      })
    )
    .optional(),
  num_hearts: z.number().optional(),
  num_likes: z.number().optional(),
  previews: z.array(z.record(z.unknown())).optional(),
  sticker_name: z.string().nullish(),
  target: AsanaCompactSchema.optional(),
  type: z.enum(['comment', 'system']).optional(),
});
export type AsanaStory = z.infer<typeof AsanaStorySchema>;

/**
 * Asana attachment schema.
 */
export const AsanaAttachmentSchema = z.object({
  gid: z.string(),
  resource_type: z.literal('attachment').optional(),
  name: z.string(),
  created_at: z.string().optional(),
  download_url: z.string().url().nullish(),
  host: z.string().optional(),
  parent: AsanaCompactSchema.optional(),
  permanent_url: z.string().url().optional(),
  view_url: z.string().url().nullish(),
  resource_subtype: z.string().optional(),
  size: z.number().optional(),
});
export type AsanaAttachment = z.infer<typeof AsanaAttachmentSchema>;

/**
 * Asana webhook event action types.
 */
export const AsanaWebhookActionSchema = z.enum([
  'added',
  'removed',
  'changed',
  'deleted',
  'undeleted',
]);
export type AsanaWebhookAction = z.infer<typeof AsanaWebhookActionSchema>;

/**
 * Asana webhook event schema.
 */
export const AsanaWebhookEventSchema = z.object({
  user: AsanaCompactSchema.optional(),
  created_at: z.string(),
  action: AsanaWebhookActionSchema,
  resource: z.object({
    gid: z.string(),
    resource_type: AsanaResourceTypeSchema,
    resource_subtype: z.string().optional(),
  }),
  parent: AsanaCompactSchema.nullish(),
  change: z
    .object({
      field: z.string(),
      action: z.string(),
      new_value: z.unknown().optional(),
      added_value: z.unknown().optional(),
      removed_value: z.unknown().optional(),
    })
    .optional(),
});
export type AsanaWebhookEvent = z.infer<typeof AsanaWebhookEventSchema>;

/**
 * Asana webhook payload schema.
 */
export const AsanaWebhookPayloadSchema = z.object({
  events: z.array(AsanaWebhookEventSchema),
});
export type AsanaWebhookPayload = z.infer<typeof AsanaWebhookPayloadSchema>;

/**
 * Asana OAuth 2.0 configuration.
 */
export interface AsanaOAuth2Config {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth redirect/callback URL */
  redirectUri: string;
}

/**
 * Asana OAuth tokens.
 */
export interface AsanaOAuthTokens {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken?: string;
  /** Token type (usually 'bearer') */
  tokenType: string;
  /** Expiration time in seconds */
  expiresIn: number;
  /** User data from token response */
  data?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Input schema for creating an Asana task.
 */
export const CreateAsanaTaskInputSchema = z.object({
  /** Task name/title */
  name: z.string().min(1),
  /** Task notes/description */
  notes: z.string().optional(),
  /** HTML notes */
  html_notes: z.string().optional(),
  /** Assignee user GID */
  assignee: z.string().optional(),
  /** Due date (YYYY-MM-DD format) */
  due_on: z.string().optional(),
  /** Due date with time (ISO 8601) */
  due_at: z.string().optional(),
  /** Start date (YYYY-MM-DD format) */
  start_on: z.string().optional(),
  /** Start date with time (ISO 8601) */
  start_at: z.string().optional(),
  /** Project GIDs to add task to */
  projects: z.array(z.string()).optional(),
  /** Section GID for task placement */
  memberships: z
    .array(
      z.object({
        project: z.string(),
        section: z.string().optional(),
      })
    )
    .optional(),
  /** Tag GIDs */
  tags: z.array(z.string()).optional(),
  /** Follower user GIDs */
  followers: z.array(z.string()).optional(),
  /** Parent task GID (for subtasks) */
  parent: z.string().optional(),
  /** Custom field values */
  custom_fields: z.record(z.unknown()).optional(),
  /** Resource subtype */
  resource_subtype: z.enum(['default_task', 'milestone']).optional(),
  /** Workspace GID (required for standalone tasks) */
  workspace: z.string().optional(),
});
export type CreateAsanaTaskInput = z.infer<typeof CreateAsanaTaskInputSchema>;

/**
 * Input schema for updating an Asana task.
 */
export const UpdateAsanaTaskInputSchema = z.object({
  /** Task name/title */
  name: z.string().optional(),
  /** Task notes/description */
  notes: z.string().optional(),
  /** HTML notes */
  html_notes: z.string().optional(),
  /** Assignee user GID (null to unassign) */
  assignee: z.string().nullish(),
  /** Due date (YYYY-MM-DD format, null to clear) */
  due_on: z.string().nullish(),
  /** Due date with time (ISO 8601, null to clear) */
  due_at: z.string().nullish(),
  /** Start date (YYYY-MM-DD format, null to clear) */
  start_on: z.string().nullish(),
  /** Start date with time (ISO 8601, null to clear) */
  start_at: z.string().nullish(),
  /** Mark task as completed */
  completed: z.boolean().optional(),
  /** Custom field values */
  custom_fields: z.record(z.unknown()).optional(),
  /** Approval status (for approval tasks) */
  approval_status: z.enum(['pending', 'approved', 'rejected', 'changes_requested']).optional(),
});
export type UpdateAsanaTaskInput = z.infer<typeof UpdateAsanaTaskInputSchema>;

/**
 * Options for listing tasks.
 */
export interface AsanaListTasksOptions {
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Filter by completion status */
  completed_since?: string;
  /** Filter by modification date */
  modified_since?: string;
  /** Section to filter by */
  section?: string;
  /** Assignee to filter by */
  assignee?: string;
  /** Additional fields to include */
  opt_fields?: string[];
}

/**
 * Options for listing projects.
 */
export interface AsanaListProjectsOptions {
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Filter archived projects */
  archived?: boolean;
  /** Team to filter by */
  team?: string;
  /** Additional fields to include */
  opt_fields?: string[];
}

/**
 * Asana API pagination info.
 */
export interface AsanaPagination {
  /** Next page cursor */
  next_page?: {
    offset: string;
    path: string;
    uri: string;
  };
}

/**
 * Asana API response wrapper.
 */
export interface AsanaApiResponse<T> {
  data: T;
  next_page?: {
    offset: string;
    path: string;
    uri: string;
  };
}
