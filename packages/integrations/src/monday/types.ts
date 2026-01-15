import { z } from 'zod';

/**
 * @fileoverview Monday.com-specific type definitions and Zod schemas.
 * Maps to Monday.com's GraphQL API data structures.
 * @packageDocumentation
 */

/**
 * Monday.com column types.
 */
export const MondayColumnTypeSchema = z.enum([
  'auto_number',
  'board_relation',
  'button',
  'checkbox',
  'color_picker',
  'country',
  'creation_log',
  'date',
  'dependency',
  'doc',
  'dropdown',
  'email',
  'file',
  'formula',
  'hour',
  'item_id',
  'last_updated',
  'link',
  'location',
  'long_text',
  'mirror',
  'name',
  'numbers',
  'people',
  'phone',
  'progress',
  'rating',
  'status',
  'subtasks',
  'tags',
  'team',
  'text',
  'timeline',
  'time_tracking',
  'vote',
  'week',
  'world_clock',
]);
export type MondayColumnType = z.infer<typeof MondayColumnTypeSchema>;

/**
 * Monday.com board kind.
 */
export const MondayBoardKindSchema = z.enum(['public', 'private', 'share']);
export type MondayBoardKind = z.infer<typeof MondayBoardKindSchema>;

/**
 * Monday.com board state.
 */
export const MondayBoardStateSchema = z.enum(['active', 'archived', 'deleted', 'all']);
export type MondayBoardState = z.infer<typeof MondayBoardStateSchema>;

/**
 * Monday.com user schema.
 */
export const MondayUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
  photo_original: z.string().url().nullish(),
  photo_thumb: z.string().url().nullish(),
  title: z.string().nullish(),
  birthday: z.string().nullish(),
  country_code: z.string().nullish(),
  created_at: z.string().optional(),
  enabled: z.boolean().optional(),
  is_admin: z.boolean().optional(),
  is_guest: z.boolean().optional(),
  is_pending: z.boolean().optional(),
  is_view_only: z.boolean().optional(),
  join_date: z.string().nullish(),
  location: z.string().nullish(),
  mobile_phone: z.string().nullish(),
  phone: z.string().nullish(),
  teams: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  time_zone_identifier: z.string().nullish(),
});
export type MondayUser = z.infer<typeof MondayUserSchema>;

/**
 * Monday.com team schema.
 */
export const MondayTeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  picture_url: z.string().url().nullish(),
  users: z.array(MondayUserSchema).optional(),
});
export type MondayTeam = z.infer<typeof MondayTeamSchema>;

/**
 * Monday.com workspace schema.
 */
export const MondayWorkspaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.enum(['open', 'closed']).optional(),
  description: z.string().nullish(),
  created_at: z.string().optional(),
  account_product: z
    .object({
      id: z.number(),
      kind: z.string(),
    })
    .optional(),
});
export type MondayWorkspace = z.infer<typeof MondayWorkspaceSchema>;

/**
 * Monday.com column schema.
 */
export const MondayColumnSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: MondayColumnTypeSchema,
  archived: z.boolean().optional(),
  description: z.string().nullish(),
  settings_str: z.string().optional(),
  width: z.number().nullish(),
});
export type MondayColumn = z.infer<typeof MondayColumnSchema>;

/**
 * Monday.com column value schema.
 */
export const MondayColumnValueSchema = z.object({
  id: z.string(),
  text: z.string().nullish(),
  value: z.string().nullish(),
  type: MondayColumnTypeSchema.optional(),
  column: MondayColumnSchema.optional(),
  additional_info: z.record(z.unknown()).optional(),
});
export type MondayColumnValue = z.infer<typeof MondayColumnValueSchema>;

/**
 * Monday.com status column label schema.
 */
export const MondayStatusLabelSchema = z.object({
  index: z.number(),
  color: z.string(),
  text: z.string(),
  is_done: z.boolean().optional(),
});
export type MondayStatusLabel = z.infer<typeof MondayStatusLabelSchema>;

/**
 * Monday.com group schema (for board sections).
 */
export const MondayGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  color: z.string().optional(),
  archived: z.boolean().optional(),
  deleted: z.boolean().optional(),
  position: z.string().optional(),
});
export type MondayGroup = z.infer<typeof MondayGroupSchema>;

/**
 * Monday.com board schema.
 */
export const MondayBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  board_folder_id: z.number().nullish(),
  board_kind: MondayBoardKindSchema.optional(),
  state: MondayBoardStateSchema.optional(),
  description: z.string().nullish(),
  columns: z.array(MondayColumnSchema).optional(),
  groups: z.array(MondayGroupSchema).optional(),
  owners: z.array(MondayUserSchema).optional(),
  subscribers: z.array(MondayUserSchema).optional(),
  workspace: MondayWorkspaceSchema.nullish(),
  workspace_id: z.number().nullish(),
  items_count: z.number().optional(),
  permissions: z.string().optional(),
  type: z.enum(['board', 'document', 'dashboard']).optional(),
  url: z.string().url().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().nullish(),
});
export type MondayBoard = z.infer<typeof MondayBoardSchema>;

/**
 * Monday.com item (task) schema.
 */
export const MondayItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  board: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  column_values: z.array(MondayColumnValueSchema).optional(),
  created_at: z.string().optional(),
  creator: MondayUserSchema.optional(),
  creator_id: z.string().optional(),
  group: MondayGroupSchema.optional(),
  parent_item: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullish(),
  relative_link: z.string().optional(),
  state: z.enum(['active', 'archived', 'deleted']).optional(),
  subscribers: z.array(MondayUserSchema).optional(),
  subitems: z.array(z.lazy(() => MondayItemSchema)).optional(),
  updated_at: z.string().nullish(),
  url: z.string().url().optional(),
});
export type MondayItem = z.infer<typeof MondayItemSchema>;

/**
 * Monday.com update (comment) schema.
 */
export const MondayUpdateSchema = z.object({
  id: z.string(),
  body: z.string(),
  text_body: z.string().optional(),
  created_at: z.string(),
  creator: MondayUserSchema.optional(),
  creator_id: z.string().optional(),
  item_id: z.string().optional(),
  replies: z
    .array(
      z.object({
        id: z.string(),
        body: z.string(),
        text_body: z.string().optional(),
        created_at: z.string(),
        creator: MondayUserSchema.optional(),
      })
    )
    .optional(),
  updated_at: z.string().nullish(),
  assets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string(),
        file_size: z.number().optional(),
      })
    )
    .optional(),
});
export type MondayUpdate = z.infer<typeof MondayUpdateSchema>;

/**
 * Monday.com tag schema.
 */
export const MondayTagSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
});
export type MondayTag = z.infer<typeof MondayTagSchema>;

/**
 * Monday.com account schema.
 */
export const MondayAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullish(),
  show_timeline_weekends: z.boolean().optional(),
  tier: z.string().optional(),
  plan: z
    .object({
      max_users: z.number().optional(),
      period: z.string().optional(),
      tier: z.string().optional(),
      version: z.number().optional(),
    })
    .optional(),
});
export type MondayAccount = z.infer<typeof MondayAccountSchema>;

/**
 * Monday.com webhook event types.
 */
export const MondayWebhookEventTypeSchema = z.enum([
  'create_item',
  'change_column_value',
  'change_status_column_value',
  'change_specific_column_value',
  'change_name',
  'create_update',
  'edit_update',
  'delete_update',
  'create_subitem',
  'change_subitem_column_value',
  'change_subitem_name',
  'create_subitem_update',
  'delete_subitem',
  'archive_item',
  'delete_item',
  'move_item_to_group',
  'move_item_to_board',
]);
export type MondayWebhookEventType = z.infer<typeof MondayWebhookEventTypeSchema>;

/**
 * Monday.com webhook payload schema.
 */
export const MondayWebhookPayloadSchema = z.object({
  event: z.object({
    userId: z.number(),
    originalTriggerUuid: z.string().nullish(),
    boardId: z.number(),
    groupId: z.string().optional(),
    pulseId: z.number().optional(), // Legacy name for itemId
    itemId: z.number().optional(),
    pulseName: z.string().optional(),
    itemName: z.string().optional(),
    columnId: z.string().optional(),
    columnType: z.string().optional(),
    columnTitle: z.string().optional(),
    value: z.record(z.unknown()).optional(),
    previousValue: z.record(z.unknown()).optional(),
    changedAt: z.number().optional(),
    isTopGroup: z.boolean().optional(),
    triggerTime: z.string().optional(),
    subscriptionId: z.number().optional(),
    triggerUuid: z.string().optional(),
    parentItemId: z.number().optional(),
    parentItemBoardId: z.number().optional(),
    textBody: z.string().optional(),
    body: z.string().optional(),
    updateId: z.number().optional(),
    replyId: z.number().optional(),
    type: MondayWebhookEventTypeSchema.optional(),
    app: z.string().optional(),
  }),
  challenge: z.string().optional(), // For URL verification
});
export type MondayWebhookPayload = z.infer<typeof MondayWebhookPayloadSchema>;

/**
 * Monday.com OAuth 2.0 configuration.
 */
export interface MondayOAuth2Config {
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
 * Monday.com OAuth tokens.
 */
export interface MondayOAuthTokens {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken?: string;
  /** Token type */
  tokenType: string;
  /** Scope granted */
  scope: string;
}

/**
 * Input for creating a Monday.com item.
 */
export const CreateMondayItemInputSchema = z.object({
  /** Item name/title */
  item_name: z.string().min(1),
  /** Board ID to create item in */
  board_id: z.string(),
  /** Group ID (optional, uses first group if not specified) */
  group_id: z.string().optional(),
  /** Column values as JSON string */
  column_values: z.string().optional(),
  /** Create as subitem under parent */
  parent_item_id: z.string().optional(),
});
export type CreateMondayItemInput = z.infer<typeof CreateMondayItemInputSchema>;

/**
 * Input for updating a Monday.com item.
 */
export const UpdateMondayItemInputSchema = z.object({
  /** New item name */
  name: z.string().optional(),
  /** Column values as JSON string */
  column_values: z.string().optional(),
});
export type UpdateMondayItemInput = z.infer<typeof UpdateMondayItemInputSchema>;

/**
 * Options for listing items.
 */
export interface MondayListItemsOptions {
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Group to filter by */
  groupId?: string;
  /** Column IDs to include in response */
  columnIds?: string[];
  /** Filter by item state */
  state?: 'active' | 'archived' | 'deleted' | 'all';
}

/**
 * Options for listing boards.
 */
export interface MondayListBoardsOptions {
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Board state filter */
  state?: MondayBoardState;
  /** Workspace ID filter */
  workspaceId?: number;
  /** Board kind filter */
  boardKind?: MondayBoardKind;
}

/**
 * Monday.com GraphQL response wrapper.
 */
export interface MondayGraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: {
      code?: string;
      error_message?: string;
      error_data?: Record<string, unknown>;
    };
  }>;
  account_id?: number;
  complexity?: {
    before: number;
    after: number;
    reset_in_x_seconds?: number;
  };
}
