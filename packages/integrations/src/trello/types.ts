import { z } from 'zod';

/**
 * @fileoverview Trello-specific type definitions.
 * @packageDocumentation
 */

// =============================================================================
// Trello API Response Types
// =============================================================================

/**
 * Trello Member (User)
 */
export const TrelloMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string().optional(),
  initials: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  email: z.string().email().optional(),
  memberType: z.enum(['admin', 'normal', 'observer']).optional(),
  confirmed: z.boolean().optional(),
});
export type TrelloMember = z.infer<typeof TrelloMemberSchema>;

/**
 * Trello Label
 */
export const TrelloLabelSchema = z.object({
  id: z.string(),
  idBoard: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});
export type TrelloLabel = z.infer<typeof TrelloLabelSchema>;

/**
 * Trello List
 */
export const TrelloListSchema = z.object({
  id: z.string(),
  name: z.string(),
  idBoard: z.string(),
  closed: z.boolean().default(false),
  pos: z.number(),
  subscribed: z.boolean().optional(),
});
export type TrelloList = z.infer<typeof TrelloListSchema>;

/**
 * Trello Checklist Item
 */
export const TrelloCheckItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['complete', 'incomplete']),
  pos: z.number().optional(),
  due: z.string().nullable().optional(),
  idMember: z.string().nullable().optional(),
});
export type TrelloCheckItem = z.infer<typeof TrelloCheckItemSchema>;

/**
 * Trello Checklist
 */
export const TrelloChecklistSchema = z.object({
  id: z.string(),
  name: z.string(),
  idBoard: z.string(),
  idCard: z.string(),
  pos: z.number(),
  checkItems: z.array(TrelloCheckItemSchema).optional(),
});
export type TrelloChecklist = z.infer<typeof TrelloChecklistSchema>;

/**
 * Trello Card (Task)
 */
export const TrelloCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  idBoard: z.string(),
  idList: z.string(),
  idMembers: z.array(z.string()),
  idLabels: z.array(z.string()),
  idChecklists: z.array(z.string()).optional(),
  closed: z.boolean().default(false),
  due: z.string().nullable().optional(),
  dueComplete: z.boolean().optional(),
  start: z.string().nullable().optional(),
  pos: z.number(),
  url: z.string().url(),
  shortUrl: z.string().url(),
  shortLink: z.string(),
  dateLastActivity: z.string(),
  subscribed: z.boolean().optional(),
  cover: z.object({
    color: z.string().nullable().optional(),
    idAttachment: z.string().nullable().optional(),
    idUploadedBackground: z.string().nullable().optional(),
    size: z.enum(['normal', 'full']).optional(),
    brightness: z.enum(['dark', 'light']).optional(),
  }).optional(),
  labels: z.array(TrelloLabelSchema).optional(),
  members: z.array(TrelloMemberSchema).optional(),
  checklists: z.array(TrelloChecklistSchema).optional(),
});
export type TrelloCard = z.infer<typeof TrelloCardSchema>;

/**
 * Trello Board (Project)
 */
export const TrelloBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  descData: z.string().nullable().optional(),
  closed: z.boolean().default(false),
  idOrganization: z.string().nullable().optional(),
  idEnterprise: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  url: z.string().url(),
  shortUrl: z.string().url(),
  shortLink: z.string(),
  starred: z.boolean().optional(),
  dateLastActivity: z.string().optional(),
  dateLastView: z.string().optional(),
  prefs: z.object({
    permissionLevel: z.enum(['org', 'private', 'public']).optional(),
    voting: z.enum(['disabled', 'members', 'observers', 'org', 'public']).optional(),
    comments: z.enum(['disabled', 'members', 'observers', 'org', 'public']).optional(),
    background: z.string().optional(),
    backgroundImage: z.string().url().nullable().optional(),
    backgroundColor: z.string().optional(),
  }).optional(),
  labelNames: z.object({
    green: z.string().optional(),
    yellow: z.string().optional(),
    orange: z.string().optional(),
    red: z.string().optional(),
    purple: z.string().optional(),
    blue: z.string().optional(),
    sky: z.string().optional(),
    lime: z.string().optional(),
    pink: z.string().optional(),
    black: z.string().optional(),
  }).optional(),
  memberships: z.array(z.object({
    id: z.string(),
    idMember: z.string(),
    memberType: z.enum(['admin', 'normal', 'observer']),
    unconfirmed: z.boolean().optional(),
    deactivated: z.boolean().optional(),
  })).optional(),
  lists: z.array(TrelloListSchema).optional(),
  labels: z.array(TrelloLabelSchema).optional(),
});
export type TrelloBoard = z.infer<typeof TrelloBoardSchema>;

/**
 * Trello Comment (Action)
 */
export const TrelloCommentSchema = z.object({
  id: z.string(),
  idMemberCreator: z.string(),
  type: z.literal('commentCard'),
  date: z.string(),
  data: z.object({
    text: z.string(),
    card: z.object({
      id: z.string(),
      name: z.string(),
      shortLink: z.string(),
    }),
    board: z.object({
      id: z.string(),
      name: z.string(),
      shortLink: z.string(),
    }),
    list: z.object({
      id: z.string(),
      name: z.string(),
    }).optional(),
  }),
  memberCreator: TrelloMemberSchema.optional(),
});
export type TrelloComment = z.infer<typeof TrelloCommentSchema>;

/**
 * Trello Organization (Workspace)
 */
export const TrelloOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  desc: z.string().optional(),
  url: z.string().url(),
  website: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  products: z.array(z.number()).optional(),
  powerUps: z.array(z.number()).optional(),
});
export type TrelloOrganization = z.infer<typeof TrelloOrganizationSchema>;

// =============================================================================
// Webhook Types
// =============================================================================

/**
 * Trello webhook action types
 */
export const TrelloWebhookActionTypeSchema = z.enum([
  'createCard',
  'updateCard',
  'deleteCard',
  'moveCardToBoard',
  'moveCardFromBoard',
  'addMemberToCard',
  'removeMemberFromCard',
  'addLabelToCard',
  'removeLabelFromCard',
  'commentCard',
  'updateComment',
  'deleteComment',
  'addChecklistToCard',
  'removeChecklistFromCard',
  'updateCheckItemStateOnCard',
  'createList',
  'updateList',
  'moveListToBoard',
  'moveListFromBoard',
  'createBoard',
  'updateBoard',
  'addMemberToBoard',
  'removeMemberFromBoard',
]);
export type TrelloWebhookActionType = z.infer<typeof TrelloWebhookActionTypeSchema>;

/**
 * Trello webhook payload
 */
export const TrelloWebhookPayloadSchema = z.object({
  action: z.object({
    id: z.string(),
    idMemberCreator: z.string(),
    type: TrelloWebhookActionTypeSchema,
    date: z.string(),
    data: z.record(z.unknown()),
    memberCreator: TrelloMemberSchema.optional(),
  }),
  model: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
export type TrelloWebhookPayload = z.infer<typeof TrelloWebhookPayloadSchema>;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Trello client configuration
 */
export interface TrelloClientOptions {
  /** Trello API key */
  apiKey: string;
  /** User's OAuth token */
  token: string;
  /** API base URL (for testing) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Trello OAuth 1.0a configuration
 */
export interface TrelloOAuth1Config {
  /** API key */
  apiKey: string;
  /** API secret */
  apiSecret: string;
  /** Callback URL after authorization */
  callbackUrl: string;
  /** App name shown to user */
  appName?: string;
  /** Token expiration: 1hour, 1day, 30days, never */
  expiration?: '1hour' | '1day' | '30days' | 'never';
  /** Requested scopes */
  scope?: ('read' | 'write' | 'account')[];
}

/**
 * Trello OAuth tokens
 */
export interface TrelloOAuthTokens {
  /** OAuth token */
  token: string;
  /** Token secret (for OAuth 1.0a signing) */
  tokenSecret: string;
}

/**
 * Card creation input
 */
export interface CreateCardInput {
  name: string;
  desc?: string;
  idList: string;
  idMembers?: string[];
  idLabels?: string[];
  due?: string;
  start?: string;
  pos?: 'top' | 'bottom' | number;
}

/**
 * Card update input
 */
export interface UpdateCardInput {
  name?: string;
  desc?: string;
  idList?: string;
  idMembers?: string[];
  idLabels?: string[];
  due?: string | null;
  dueComplete?: boolean;
  start?: string | null;
  closed?: boolean;
  pos?: 'top' | 'bottom' | number;
}
