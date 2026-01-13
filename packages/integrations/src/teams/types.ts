/**
 * @fileoverview Microsoft Teams type definitions
 * @module @relay/integrations/teams/types
 */

import type { IntegrationConfig } from '../common/types';

/**
 * Microsoft Teams bot configuration
 */
export interface TeamsConfig extends IntegrationConfig {
  /** Microsoft App ID */
  appId: string;
  /** Microsoft App Password (client secret) */
  appPassword: string;
  /** Tenant ID (for single-tenant apps) */
  tenantId?: string;
  /** Bot endpoint URL */
  botEndpoint?: string;
}

/**
 * Teams user/account
 */
export interface TeamsUser {
  /** AAD Object ID */
  id: string;
  /** Azure AD Object ID */
  aadObjectId?: string;
  /** User principal name (email) */
  userPrincipalName?: string;
  /** Display name */
  name: string;
  /** Given name */
  givenName?: string;
  /** Surname */
  surname?: string;
  /** Email */
  email?: string;
  /** User role */
  userRole?: 'user' | 'guest';
  /** Tenant ID */
  tenantId?: string;
}

/**
 * Teams conversation/channel
 */
export interface TeamsConversation {
  /** Conversation ID */
  id: string;
  /** Conversation type */
  conversationType: 'personal' | 'groupChat' | 'channel';
  /** Team ID (for channel conversations) */
  teamId?: string;
  /** Channel ID (for channel conversations) */
  channelId?: string;
  /** Conversation name */
  name?: string;
  /** Whether it's a group */
  isGroup?: boolean;
  /** Tenant ID */
  tenantId?: string;
}

/**
 * Teams channel info
 */
export interface TeamsChannel {
  /** Channel ID */
  id: string;
  /** Channel name */
  name?: string;
  /** Description */
  description?: string;
  /** Whether it's the general channel */
  isGeneral?: boolean;
  /** Email address */
  email?: string;
  /** Web URL */
  webUrl?: string;
  /** Membership type */
  membershipType?: 'standard' | 'private' | 'shared';
}

/**
 * Teams team info
 */
export interface TeamsTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name?: string;
  /** AAD Group ID */
  aadGroupId?: string;
  /** Internal ID */
  internalId?: string;
  /** Description */
  description?: string;
  /** Web URL */
  webUrl?: string;
}

/**
 * Teams activity (message)
 */
export interface TeamsActivity {
  /** Activity type */
  type: TeamsActivityType;
  /** Activity ID */
  id?: string;
  /** Timestamp */
  timestamp?: string;
  /** Local timestamp */
  localTimestamp?: string;
  /** Service URL */
  serviceUrl?: string;
  /** Channel ID */
  channelId?: string;
  /** From account */
  from?: TeamsChannelAccount;
  /** Conversation reference */
  conversation?: TeamsConversationAccount;
  /** Recipient */
  recipient?: TeamsChannelAccount;
  /** Text format */
  textFormat?: 'plain' | 'xml' | 'markdown';
  /** Attachment layout */
  attachmentLayout?: 'list' | 'carousel';
  /** Members added (for conversationUpdate) */
  membersAdded?: TeamsChannelAccount[];
  /** Members removed (for conversationUpdate) */
  membersRemoved?: TeamsChannelAccount[];
  /** Topic name (for conversationUpdate) */
  topicName?: string;
  /** Text content */
  text?: string;
  /** Speak content (SSML) */
  speak?: string;
  /** Input hint */
  inputHint?: 'acceptingInput' | 'ignoringInput' | 'expectingInput';
  /** Summary */
  summary?: string;
  /** Suggested actions */
  suggestedActions?: TeamsSuggestedActions;
  /** Attachments */
  attachments?: TeamsAttachment[];
  /** Entities */
  entities?: TeamsEntity[];
  /** Channel data */
  channelData?: TeamsChannelData;
  /** Action (for invoke) */
  action?: string;
  /** Value (for message back, invoke, etc.) */
  value?: unknown;
  /** Name (for event, invoke) */
  name?: string;
  /** Relates to (for replies) */
  relatesTo?: TeamsConversationReference;
  /** Reply to ID */
  replyToId?: string;
  /** Label */
  label?: string;
  /** Value type */
  valueType?: string;
  /** Locale */
  locale?: string;
  /** Local timezone */
  localTimezone?: string;
  /** Importance */
  importance?: 'low' | 'normal' | 'high';
  /** Delivery mode */
  deliveryMode?: 'normal' | 'notification';
  /** Expiration */
  expiration?: string;
}

/**
 * Teams activity types
 */
export type TeamsActivityType =
  | 'message'
  | 'messageUpdate'
  | 'messageDelete'
  | 'messageReaction'
  | 'contactRelationUpdate'
  | 'conversationUpdate'
  | 'typing'
  | 'endOfConversation'
  | 'event'
  | 'invoke'
  | 'installationUpdate'
  | 'command'
  | 'commandResult'
  | 'trace';

/**
 * Teams channel account
 */
export interface TeamsChannelAccount {
  /** Account ID */
  id: string;
  /** Account name */
  name?: string;
  /** AAD Object ID */
  aadObjectId?: string;
  /** Role */
  role?: string;
}

/**
 * Teams conversation account
 */
export interface TeamsConversationAccount {
  /** Conversation ID */
  id: string;
  /** Conversation type */
  conversationType?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Whether it's a group */
  isGroup?: boolean;
  /** Name */
  name?: string;
  /** AAD Object ID */
  aadObjectId?: string;
  /** Role */
  role?: string;
}

/**
 * Teams conversation reference
 */
export interface TeamsConversationReference {
  /** Activity ID */
  activityId?: string;
  /** User */
  user?: TeamsChannelAccount;
  /** Bot */
  bot?: TeamsChannelAccount;
  /** Conversation */
  conversation?: TeamsConversationAccount;
  /** Channel ID */
  channelId?: string;
  /** Locale */
  locale?: string;
  /** Service URL */
  serviceUrl?: string;
}

/**
 * Teams suggested actions
 */
export interface TeamsSuggestedActions {
  /** Actions to suggest */
  actions: TeamsCardAction[];
  /** Users to show actions to */
  to?: string[];
}

/**
 * Teams card action
 */
export interface TeamsCardAction {
  /** Action type */
  type: 'openUrl' | 'imBack' | 'postBack' | 'playAudio' | 'playVideo' | 'showImage' | 'downloadFile' | 'signin' | 'call' | 'messageBack' | 'invoke';
  /** Title */
  title: string;
  /** Image URL */
  image?: string;
  /** Text to send */
  text?: string;
  /** Display text */
  displayText?: string;
  /** Value */
  value?: unknown;
  /** Channel data */
  channelData?: unknown;
}

/**
 * Teams attachment
 */
export interface TeamsAttachment {
  /** Content type */
  contentType: string;
  /** Content URL */
  contentUrl?: string;
  /** Content */
  content?: unknown;
  /** Name */
  name?: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
}

/**
 * Teams entity
 */
export interface TeamsEntity {
  /** Entity type */
  type: string;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Teams channel data
 */
export interface TeamsChannelData {
  /** Tenant ID */
  tenant?: { id: string };
  /** Team info */
  team?: TeamsTeam;
  /** Channel info */
  channel?: TeamsChannel;
  /** Event type */
  eventType?: string;
  /** Settings */
  settings?: unknown;
  /** Notification info */
  notification?: {
    alert?: boolean;
    alertInMeeting?: boolean;
  };
}

/**
 * Teams Adaptive Card
 */
export interface TeamsAdaptiveCard {
  /** Card type (always "AdaptiveCard") */
  type: 'AdaptiveCard';
  /** Schema version */
  $schema?: string;
  /** Card version */
  version: string;
  /** Card body */
  body?: TeamsAdaptiveCardElement[];
  /** Card actions */
  actions?: TeamsAdaptiveCardAction[];
  /** Fallback text */
  fallbackText?: string;
  /** Background image */
  backgroundImage?: string | { url: string };
  /** Minimum height */
  minHeight?: string;
  /** RTL */
  rtl?: boolean;
  /** Speak */
  speak?: string;
  /** Language */
  lang?: string;
  /** Vertical content alignment */
  verticalContentAlignment?: 'top' | 'center' | 'bottom';
}

/**
 * Teams Adaptive Card element
 */
export interface TeamsAdaptiveCardElement {
  /** Element type */
  type: string;
  /** ID */
  id?: string;
  /** Spacing */
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'extraLarge' | 'padding';
  /** Separator */
  separator?: boolean;
  /** Height */
  height?: 'auto' | 'stretch';
  /** Is visible */
  isVisible?: boolean;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Teams Adaptive Card action
 */
export interface TeamsAdaptiveCardAction {
  /** Action type */
  type: 'Action.OpenUrl' | 'Action.Submit' | 'Action.ShowCard' | 'Action.ToggleVisibility' | 'Action.Execute';
  /** Title */
  title?: string;
  /** Icon URL */
  iconUrl?: string;
  /** ID */
  id?: string;
  /** Style */
  style?: 'default' | 'positive' | 'destructive';
  /** Fallback */
  fallback?: TeamsAdaptiveCardAction | 'drop';
  /** Tooltip */
  tooltip?: string;
  /** Is enabled */
  isEnabled?: boolean;
  /** Mode */
  mode?: 'primary' | 'secondary';
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Send message input
 */
export interface SendTeamsMessageInput {
  /** Conversation reference or ID */
  conversationId: string;
  /** Service URL */
  serviceUrl: string;
  /** Message text */
  text?: string;
  /** Attachments */
  attachments?: TeamsAttachment[];
  /** Text format */
  textFormat?: 'plain' | 'markdown' | 'xml';
  /** Importance */
  importance?: 'low' | 'normal' | 'high';
  /** Summary */
  summary?: string;
}

/**
 * Teams OAuth token response
 */
export interface TeamsTokenResponse {
  /** Access token */
  access_token: string;
  /** Token type */
  token_type: string;
  /** Expires in (seconds) */
  expires_in: number;
  /** Scope */
  scope?: string;
}

/**
 * Teams message response
 */
export interface TeamsMessageResponse {
  /** Activity ID */
  id: string;
}
