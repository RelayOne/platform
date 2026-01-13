/**
 * @fileoverview Discord type definitions
 * @module @relay/integrations/discord/types
 */

import type { IntegrationConfig } from '../common/types';

/**
 * Discord bot configuration
 */
export interface DiscordConfig extends IntegrationConfig {
  /** Bot token */
  botToken: string;
  /** Application ID */
  applicationId: string;
  /** Public key for webhook verification */
  publicKey: string;
  /** Default guild ID (optional) */
  defaultGuildId?: string;
}

/**
 * Discord user
 */
export interface DiscordUser {
  /** User ID (snowflake) */
  id: string;
  /** Username */
  username: string;
  /** Discriminator (legacy, may be "0" for new usernames) */
  discriminator: string;
  /** Global display name */
  global_name?: string;
  /** Avatar hash */
  avatar?: string;
  /** Whether the user is a bot */
  bot?: boolean;
  /** Whether the user is a system user */
  system?: boolean;
  /** User flags */
  flags?: number;
  /** Public flags */
  public_flags?: number;
  /** Banner hash */
  banner?: string;
  /** Accent color */
  accent_color?: number;
}

/**
 * Discord guild (server)
 */
export interface DiscordGuild {
  /** Guild ID */
  id: string;
  /** Guild name */
  name: string;
  /** Icon hash */
  icon?: string;
  /** Splash hash */
  splash?: string;
  /** Discovery splash hash */
  discovery_splash?: string;
  /** Owner ID */
  owner_id: string;
  /** Permissions for the bot */
  permissions?: string;
  /** Region (deprecated) */
  region?: string;
  /** AFK channel ID */
  afk_channel_id?: string;
  /** AFK timeout in seconds */
  afk_timeout: number;
  /** Verification level */
  verification_level: number;
  /** Default message notification level */
  default_message_notifications: number;
  /** Explicit content filter level */
  explicit_content_filter: number;
  /** Guild features */
  features: string[];
  /** MFA level */
  mfa_level: number;
  /** System channel ID */
  system_channel_id?: string;
  /** Maximum members */
  max_members?: number;
  /** Description */
  description?: string;
  /** Premium tier (boost level) */
  premium_tier: number;
  /** Premium subscription count */
  premium_subscription_count?: number;
}

/**
 * Discord channel types
 */
export type DiscordChannelType =
  | 0  // GUILD_TEXT
  | 1  // DM
  | 2  // GUILD_VOICE
  | 3  // GROUP_DM
  | 4  // GUILD_CATEGORY
  | 5  // GUILD_ANNOUNCEMENT
  | 10 // ANNOUNCEMENT_THREAD
  | 11 // PUBLIC_THREAD
  | 12 // PRIVATE_THREAD
  | 13 // GUILD_STAGE_VOICE
  | 14 // GUILD_DIRECTORY
  | 15; // GUILD_FORUM

/**
 * Discord channel
 */
export interface DiscordChannel {
  /** Channel ID */
  id: string;
  /** Channel type */
  type: DiscordChannelType;
  /** Guild ID */
  guild_id?: string;
  /** Position in channel list */
  position?: number;
  /** Channel name */
  name?: string;
  /** Channel topic */
  topic?: string;
  /** Whether the channel is NSFW */
  nsfw?: boolean;
  /** Last message ID */
  last_message_id?: string;
  /** Bitrate (voice channels) */
  bitrate?: number;
  /** User limit (voice channels) */
  user_limit?: number;
  /** Rate limit per user (slowmode) */
  rate_limit_per_user?: number;
  /** Recipients (DMs) */
  recipients?: DiscordUser[];
  /** Icon hash (group DMs) */
  icon?: string;
  /** Owner ID (group DMs, threads) */
  owner_id?: string;
  /** Parent category ID */
  parent_id?: string;
  /** Last pin timestamp */
  last_pin_timestamp?: string;
}

/**
 * Discord message
 */
export interface DiscordMessage {
  /** Message ID */
  id: string;
  /** Channel ID */
  channel_id: string;
  /** Author */
  author: DiscordUser;
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: string;
  /** Edited timestamp */
  edited_timestamp?: string;
  /** Whether it's TTS */
  tts: boolean;
  /** Whether it mentions everyone */
  mention_everyone: boolean;
  /** Mentioned users */
  mentions: DiscordUser[];
  /** Mentioned role IDs */
  mention_roles: string[];
  /** Attachments */
  attachments: DiscordAttachment[];
  /** Embeds */
  embeds: DiscordEmbed[];
  /** Reactions */
  reactions?: DiscordReaction[];
  /** Nonce */
  nonce?: string | number;
  /** Whether the message is pinned */
  pinned: boolean;
  /** Webhook ID (if from webhook) */
  webhook_id?: string;
  /** Message type */
  type: number;
  /** Message flags */
  flags?: number;
  /** Referenced message (for replies) */
  referenced_message?: DiscordMessage;
  /** Thread info (if message started a thread) */
  thread?: DiscordChannel;
  /** Components (buttons, selects) */
  components?: DiscordComponent[];
}

/**
 * Discord attachment
 */
export interface DiscordAttachment {
  /** Attachment ID */
  id: string;
  /** Filename */
  filename: string;
  /** Description */
  description?: string;
  /** Content type */
  content_type?: string;
  /** Size in bytes */
  size: number;
  /** URL */
  url: string;
  /** Proxy URL */
  proxy_url: string;
  /** Height (images) */
  height?: number;
  /** Width (images) */
  width?: number;
  /** Whether ephemeral */
  ephemeral?: boolean;
}

/**
 * Discord embed
 */
export interface DiscordEmbed {
  /** Title */
  title?: string;
  /** Type (always "rich" for webhook embeds) */
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';
  /** Description */
  description?: string;
  /** URL */
  url?: string;
  /** Timestamp (ISO8601) */
  timestamp?: string;
  /** Color (integer) */
  color?: number;
  /** Footer */
  footer?: {
    text: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  /** Image */
  image?: {
    url: string;
    proxy_url?: string;
    height?: number;
    width?: number;
  };
  /** Thumbnail */
  thumbnail?: {
    url: string;
    proxy_url?: string;
    height?: number;
    width?: number;
  };
  /** Video */
  video?: {
    url?: string;
    proxy_url?: string;
    height?: number;
    width?: number;
  };
  /** Provider */
  provider?: {
    name?: string;
    url?: string;
  };
  /** Author */
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  /** Fields */
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

/**
 * Discord reaction
 */
export interface DiscordReaction {
  /** Count */
  count: number;
  /** Whether the current user reacted */
  me: boolean;
  /** Emoji */
  emoji: {
    id?: string;
    name?: string;
    animated?: boolean;
  };
}

/**
 * Discord component (buttons, selects, etc.)
 */
export interface DiscordComponent {
  /** Component type */
  type: number;
  /** Custom ID */
  custom_id?: string;
  /** Whether disabled */
  disabled?: boolean;
  /** Style (for buttons) */
  style?: number;
  /** Label */
  label?: string;
  /** Emoji */
  emoji?: { id?: string; name?: string; animated?: boolean };
  /** URL (for link buttons) */
  url?: string;
  /** Options (for selects) */
  options?: Array<{
    label: string;
    value: string;
    description?: string;
    emoji?: { id?: string; name?: string; animated?: boolean };
    default?: boolean;
  }>;
  /** Placeholder (for selects) */
  placeholder?: string;
  /** Min values (for selects) */
  min_values?: number;
  /** Max values (for selects) */
  max_values?: number;
  /** Child components (for action rows) */
  components?: DiscordComponent[];
}

/**
 * Discord interaction types
 */
export type DiscordInteractionType =
  | 1 // PING
  | 2 // APPLICATION_COMMAND
  | 3 // MESSAGE_COMPONENT
  | 4 // APPLICATION_COMMAND_AUTOCOMPLETE
  | 5; // MODAL_SUBMIT

/**
 * Discord interaction
 */
export interface DiscordInteraction {
  /** Interaction ID */
  id: string;
  /** Application ID */
  application_id: string;
  /** Interaction type */
  type: DiscordInteractionType;
  /** Interaction data */
  data?: DiscordInteractionData;
  /** Guild ID */
  guild_id?: string;
  /** Channel ID */
  channel_id?: string;
  /** Member (in guilds) */
  member?: DiscordGuildMember;
  /** User (in DMs) */
  user?: DiscordUser;
  /** Interaction token */
  token: string;
  /** Version (always 1) */
  version: number;
  /** Message (for component interactions) */
  message?: DiscordMessage;
  /** App permissions */
  app_permissions?: string;
  /** Locale */
  locale?: string;
  /** Guild locale */
  guild_locale?: string;
}

/**
 * Discord interaction data
 */
export interface DiscordInteractionData {
  /** Command ID */
  id?: string;
  /** Command name */
  name?: string;
  /** Command type */
  type?: number;
  /** Resolved data */
  resolved?: {
    users?: Record<string, DiscordUser>;
    members?: Record<string, Partial<DiscordGuildMember>>;
    roles?: Record<string, DiscordRole>;
    channels?: Record<string, Partial<DiscordChannel>>;
    messages?: Record<string, Partial<DiscordMessage>>;
    attachments?: Record<string, DiscordAttachment>;
  };
  /** Options */
  options?: DiscordCommandOption[];
  /** Guild ID (for guild commands) */
  guild_id?: string;
  /** Target ID (for context menu commands) */
  target_id?: string;
  /** Custom ID (for components) */
  custom_id?: string;
  /** Component type */
  component_type?: number;
  /** Values (for selects) */
  values?: string[];
  /** Components (for modals) */
  components?: DiscordComponent[];
}

/**
 * Discord command option
 */
export interface DiscordCommandOption {
  /** Option name */
  name: string;
  /** Option type */
  type: number;
  /** Option value */
  value?: string | number | boolean;
  /** Sub-options */
  options?: DiscordCommandOption[];
  /** Whether focused (for autocomplete) */
  focused?: boolean;
}

/**
 * Discord guild member
 */
export interface DiscordGuildMember {
  /** User */
  user?: DiscordUser;
  /** Nickname */
  nick?: string;
  /** Avatar hash (guild-specific) */
  avatar?: string;
  /** Role IDs */
  roles: string[];
  /** Joined timestamp */
  joined_at: string;
  /** Premium since timestamp */
  premium_since?: string;
  /** Whether deafened */
  deaf: boolean;
  /** Whether muted */
  mute: boolean;
  /** Pending membership */
  pending?: boolean;
  /** Permissions (in interactions) */
  permissions?: string;
  /** Communication disabled until */
  communication_disabled_until?: string;
}

/**
 * Discord role
 */
export interface DiscordRole {
  /** Role ID */
  id: string;
  /** Role name */
  name: string;
  /** Role color */
  color: number;
  /** Whether hoisted */
  hoist: boolean;
  /** Icon hash */
  icon?: string;
  /** Unicode emoji */
  unicode_emoji?: string;
  /** Position */
  position: number;
  /** Permission bitfield */
  permissions: string;
  /** Whether managed */
  managed: boolean;
  /** Whether mentionable */
  mentionable: boolean;
}

/**
 * Send message input
 */
export interface SendDiscordMessageInput {
  /** Channel ID */
  channelId: string;
  /** Message content */
  content?: string;
  /** Embeds */
  embeds?: DiscordEmbed[];
  /** Components */
  components?: DiscordComponent[];
  /** Whether TTS */
  tts?: boolean;
  /** Allowed mentions */
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
    users?: string[];
    replied_user?: boolean;
  };
  /** Message reference (for replies) */
  message_reference?: {
    message_id: string;
    channel_id?: string;
    guild_id?: string;
    fail_if_not_exists?: boolean;
  };
  /** Attachments */
  attachments?: Array<{
    id: string;
    filename?: string;
    description?: string;
  }>;
  /** Flags */
  flags?: number;
}

/**
 * Discord webhook event payload
 */
export interface DiscordWebhookEvent {
  /** Event type */
  type: DiscordInteractionType;
  /** Interaction data */
  data?: DiscordInteractionData;
  /** Guild ID */
  guild_id?: string;
  /** Channel ID */
  channel_id?: string;
  /** Member */
  member?: DiscordGuildMember;
  /** User */
  user?: DiscordUser;
  /** Message */
  message?: DiscordMessage;
}
