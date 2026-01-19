/**
 * @fileoverview Slack-specific type definitions
 * @module @relay/integrations/slack/types
 */

import { z } from 'zod';

/**
 * Slack configuration
 */
export interface SlackConfig {
  /** Bot token (xoxb-...) */
  botToken: string;
  /** Signing secret for webhook verification */
  signingSecret: string;
  /** App-level token for socket mode (optional) */
  appToken?: string;
  /** Default channel for messages */
  defaultChannel?: string;
}

/**
 * Slack user info
 */
export interface SlackUser {
  /** User ID */
  id: string;
  /** Team/workspace ID */
  teamId: string;
  /** Username */
  name: string;
  /** Real name */
  realName?: string;
  /** Display name */
  displayName?: string;
  /** Email address */
  email?: string;
  /** Profile image URL (24px) */
  image24?: string;
  /** Profile image URL (48px) */
  image48?: string;
  /** Profile image URL (72px) */
  image72?: string;
  /** Whether user is admin */
  isAdmin?: boolean;
  /** Whether user is bot */
  isBot?: boolean;
  /** Timezone */
  tz?: string;
}

/**
 * Slack channel info
 */
export interface SlackChannel {
  /** Channel ID */
  id: string;
  /** Channel name */
  name: string;
  /** Whether channel is private */
  isPrivate: boolean;
  /** Whether channel is archived */
  isArchived: boolean;
  /** Whether channel is DM */
  isIm: boolean;
  /** Whether channel is group DM */
  isMpim: boolean;
  /** Channel topic */
  topic?: string;
  /** Channel purpose */
  purpose?: string;
  /** Number of members */
  numMembers?: number;
  /** Creator user ID */
  creator?: string;
  /** Created timestamp */
  created?: number;
}

/**
 * Slack message
 */
export interface SlackMessage {
  /** Message timestamp (unique ID) */
  ts: string;
  /** Channel ID */
  channel: string;
  /** Message text */
  text: string;
  /** User ID who sent message */
  user?: string;
  /** Bot ID if sent by bot */
  botId?: string;
  /** Message subtype */
  subtype?: string;
  /** Thread timestamp (if reply) */
  threadTs?: string;
  /** Block Kit blocks */
  blocks?: SlackBlock[];
  /** Attachments (legacy) */
  attachments?: SlackAttachment[];
  /** Reactions */
  reactions?: SlackReaction[];
}

/**
 * Slack Block Kit block
 */
export interface SlackBlock {
  /** Block type */
  type: string;
  /** Block ID */
  blockId?: string;
  /** Block content (varies by type) */
  [key: string]: unknown;
}

/**
 * Slack attachment (legacy format)
 */
export interface SlackAttachment {
  /** Attachment color */
  color?: string;
  /** Fallback text */
  fallback?: string;
  /** Pretext */
  pretext?: string;
  /** Author name */
  authorName?: string;
  /** Author link */
  authorLink?: string;
  /** Author icon */
  authorIcon?: string;
  /** Title */
  title?: string;
  /** Title link */
  titleLink?: string;
  /** Main text */
  text?: string;
  /** Fields */
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  /** Image URL */
  imageUrl?: string;
  /** Thumb URL */
  thumbUrl?: string;
  /** Footer */
  footer?: string;
  /** Footer icon */
  footerIcon?: string;
  /** Timestamp */
  ts?: number;
}

/**
 * Slack reaction
 */
export interface SlackReaction {
  /** Reaction name (emoji) */
  name: string;
  /** Users who added reaction */
  users: string[];
  /** Reaction count */
  count: number;
}

/**
 * Message options for sending
 */
export interface SendMessageOptions {
  /** Target channel ID */
  channel: string;
  /** Message text */
  text: string;
  /** Block Kit blocks */
  blocks?: SlackBlock[];
  /** Attachments */
  attachments?: SlackAttachment[];
  /** Thread timestamp for replies */
  threadTs?: string;
  /** Whether to unfurl links */
  unfurlLinks?: boolean;
  /** Whether to unfurl media */
  unfurlMedia?: boolean;
  /** Metadata */
  metadata?: {
    eventType: string;
    eventPayload: Record<string, unknown>;
  };
  /** Parse mode (full, none) */
  parse?: 'full' | 'none';
  /** Link names */
  linkNames?: boolean;
  /** Whether to send in thread and also to channel */
  replyBroadcast?: boolean;
  /** Markdown toggle */
  mrkdwn?: boolean;
}

/**
 * Message update options
 */
export interface UpdateMessageOptions {
  /** Channel ID */
  channel: string;
  /** Message timestamp */
  ts: string;
  /** New text */
  text?: string;
  /** New blocks */
  blocks?: SlackBlock[];
  /** New attachments */
  attachments?: SlackAttachment[];
}

/**
 * Message post response
 */
export interface PostMessageResponse {
  /** Success status */
  ok: boolean;
  /** Channel ID */
  channel: string;
  /** Message timestamp */
  ts: string;
  /** Posted message */
  message?: SlackMessage;
  /** Error message if failed */
  error?: string;
}

/**
 * Slack event types
 */
export type SlackEventType =
  | 'message'
  | 'app_mention'
  | 'reaction_added'
  | 'reaction_removed'
  | 'member_joined_channel'
  | 'member_left_channel'
  | 'channel_created'
  | 'channel_deleted'
  | 'channel_renamed'
  | 'channel_archive'
  | 'channel_unarchive'
  | 'team_join'
  | 'user_change';

/**
 * Slack event wrapper
 */
export interface SlackEventWrapper {
  /** Event token (deprecated) */
  token: string;
  /** Team ID */
  teamId: string;
  /** API app ID */
  apiAppId: string;
  /** Event object */
  event: SlackEvent;
  /** Event type */
  type: 'event_callback' | 'url_verification';
  /** Event ID */
  eventId: string;
  /** Event time */
  eventTime: number;
  /** Authorizations */
  authorizations?: Array<{
    enterpriseId: string | null;
    teamId: string;
    userId: string;
    isBot: boolean;
    isEnterpriseInstall: boolean;
  }>;
}

/**
 * Slack event
 */
export interface SlackEvent {
  /** Event type */
  type: SlackEventType;
  /** User ID */
  user?: string;
  /** Channel ID */
  channel?: string;
  /** Message text */
  text?: string;
  /** Timestamp */
  ts?: string;
  /** Thread timestamp */
  threadTs?: string;
  /** Event timestamp */
  eventTs?: string;
  /** Subtype */
  subtype?: string;
  /** Item (for reactions) */
  item?: {
    type: string;
    channel: string;
    ts: string;
  };
  /** Reaction (for reaction events) */
  reaction?: string;
  /** Item user */
  itemUser?: string;
}

/**
 * URL verification challenge
 */
export interface SlackUrlVerification {
  /** Event type */
  type: 'url_verification';
  /** Token */
  token: string;
  /** Challenge string */
  challenge: string;
}

/**
 * Interactive payload (from buttons, modals, etc.)
 */
export interface SlackInteractivePayload {
  /** Payload type */
  type: 'block_actions' | 'view_submission' | 'view_closed' | 'shortcut' | 'message_action';
  /** Team info */
  team: {
    id: string;
    domain: string;
  };
  /** User who triggered */
  user: {
    id: string;
    name: string;
    username: string;
    teamId: string;
  };
  /** API app ID */
  apiAppId: string;
  /** Token (deprecated) */
  token: string;
  /** Container (message, view, etc.) */
  container?: {
    type: string;
    messageTs?: string;
    channelId?: string;
    viewId?: string;
  };
  /** Trigger ID for opening modals */
  triggerId?: string;
  /** Response URL */
  responseUrl?: string;
  /** Actions taken */
  actions?: Array<{
    type: string;
    actionId: string;
    blockId?: string;
    value?: string;
    selectedOption?: { value: string; text: { type: string; text: string } };
  }>;
  /** View (for modal submissions) */
  view?: {
    id: string;
    type: string;
    callbackId: string;
    state: { values: Record<string, Record<string, { value?: string; selectedOption?: { value: string } }>> };
    privateMetadata?: string;
  };
  /** Original message */
  message?: SlackMessage;
}

/**
 * Slash command payload
 */
export interface SlackSlashCommand {
  /** Command text (e.g., /shipcheck) */
  command: string;
  /** Text after command */
  text: string;
  /** Response URL */
  responseUrl: string;
  /** Trigger ID */
  triggerId: string;
  /** User ID */
  userId: string;
  /** User name */
  userName: string;
  /** Channel ID */
  channelId: string;
  /** Channel name */
  channelName: string;
  /** Team ID */
  teamId: string;
  /** Team domain */
  teamDomain: string;
  /** Enterprise ID (if applicable) */
  enterpriseId?: string;
  /** Enterprise name */
  enterpriseName?: string;
  /** API app ID */
  apiAppId: string;
  /** Is enterprise install */
  isEnterpriseInstall: string;
}

/**
 * Block Kit builder types
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BlockKit {
  export interface SectionBlock extends SlackBlock {
    type: 'section';
    text: TextObject;
    blockId?: string;
    fields?: TextObject[];
    accessory?: Element;
  }

  export interface DividerBlock extends SlackBlock {
    type: 'divider';
  }

  export interface HeaderBlock extends SlackBlock {
    type: 'header';
    text: PlainTextObject;
  }

  export interface ContextBlock extends SlackBlock {
    type: 'context';
    elements: (TextObject | ImageElement)[];
  }

  export interface ActionsBlock extends SlackBlock {
    type: 'actions';
    elements: Element[];
  }

  export interface ImageBlock extends SlackBlock {
    type: 'image';
    imageUrl: string;
    altText: string;
    title?: PlainTextObject;
  }

  export interface TextObject {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
    verbatim?: boolean;
  }

  export interface PlainTextObject extends TextObject {
    type: 'plain_text';
  }

  export interface MrkdwnObject extends TextObject {
    type: 'mrkdwn';
  }

  export type Element = ButtonElement | ImageElement | SelectElement | OverflowElement | DatePickerElement;

  export interface ButtonElement {
    type: 'button';
    text: PlainTextObject;
    actionId: string;
    value?: string;
    url?: string;
    style?: 'primary' | 'danger';
    confirm?: ConfirmDialog;
  }

  export interface ImageElement {
    type: 'image';
    imageUrl: string;
    altText: string;
  }

  export interface SelectElement {
    type: 'static_select' | 'external_select' | 'users_select' | 'conversations_select' | 'channels_select';
    actionId: string;
    placeholder?: PlainTextObject;
    options?: Option[];
    initialOption?: Option;
  }

  export interface OverflowElement {
    type: 'overflow';
    actionId: string;
    options: Option[];
    confirm?: ConfirmDialog;
  }

  export interface DatePickerElement {
    type: 'datepicker';
    actionId: string;
    placeholder?: PlainTextObject;
    initialDate?: string;
    confirm?: ConfirmDialog;
  }

  export interface Option {
    text: PlainTextObject;
    value: string;
    description?: PlainTextObject;
  }

  export interface ConfirmDialog {
    title: PlainTextObject;
    text: TextObject;
    confirm: PlainTextObject;
    deny: PlainTextObject;
    style?: 'primary' | 'danger';
  }
}

/**
 * Zod schema for configuration validation
 */
export const SlackConfigSchema = z.object({
  botToken: z.string().startsWith('xoxb-'),
  signingSecret: z.string().min(1),
  appToken: z.string().startsWith('xapp-').optional(),
  defaultChannel: z.string().optional(),
});
