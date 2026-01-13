/**
 * @fileoverview Microsoft Teams webhook verification and parsing
 * @module @relay/integrations/teams/webhooks
 */

import type {
  TeamsActivity,
  TeamsActivityType,
  TeamsConversationReference,
  TeamsChannelData,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource, WebhookVerificationResult } from '../common/types';

/**
 * Teams integration source identifier
 */
const SOURCE: IntegrationSource = 'teams';

/**
 * Teams webhook headers
 */
export const TEAMS_HEADERS = {
  /** Authorization header */
  AUTHORIZATION: 'authorization',
} as const;

/**
 * OpenID configuration URL for Bot Framework
 */
const OPENID_CONFIG_URL =
  'https://login.botframework.com/v1/.well-known/openidconfiguration';

/**
 * Verifies a Teams Bot Framework JWT token
 * This is a simplified version - production should use proper JWT verification
 * @param authHeader - Authorization header value
 * @param appId - Expected app ID
 * @returns Verification result
 */
export function verifyBotFrameworkToken(
  authHeader: string | undefined,
  appId: string
): WebhookVerificationResult {
  if (!authHeader) {
    return { valid: false, error: 'Missing authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Invalid authorization header format' };
  }

  const token = authHeader.substring(7);
  if (!token) {
    return { valid: false, error: 'Empty token' };
  }

  try {
    // Decode JWT payload (without verification - for demo purposes)
    // In production, use a proper JWT library with key fetching from OpenID config
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );

    // Verify audience
    if (payload.aud !== appId) {
      return { valid: false, error: 'Invalid audience' };
    }

    // Verify issuer
    const validIssuers = [
      'https://api.botframework.com',
      'https://sts.windows.net/',
      'https://login.microsoftonline.com/',
    ];
    const issuerValid = validIssuers.some(
      (issuer) =>
        payload.iss === issuer || payload.iss?.startsWith(issuer)
    );
    if (!issuerValid) {
      return { valid: false, error: 'Invalid issuer' };
    }

    // Verify expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parses a Teams webhook payload
 * @param payload - Raw webhook payload
 * @returns Parsed activity
 */
export function parseWebhookPayload(payload: string | Buffer): TeamsActivity {
  try {
    const payloadString =
      typeof payload === 'string' ? payload : payload.toString('utf8');
    return JSON.parse(payloadString) as TeamsActivity;
  } catch (error) {
    throw new WebhookVerificationError(
      SOURCE,
      `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets the activity type
 * @param activity - Parsed activity
 * @returns Activity type
 */
export function getActivityType(activity: TeamsActivity): TeamsActivityType {
  return activity.type;
}

/**
 * Checks if the activity is a message
 * @param activity - Parsed activity
 * @returns Whether the activity is a message
 */
export function isMessage(activity: TeamsActivity): boolean {
  return activity.type === 'message';
}

/**
 * Checks if the activity is a conversation update
 * @param activity - Parsed activity
 * @returns Whether the activity is a conversation update
 */
export function isConversationUpdate(activity: TeamsActivity): boolean {
  return activity.type === 'conversationUpdate';
}

/**
 * Checks if the activity is an invoke
 * @param activity - Parsed activity
 * @returns Whether the activity is an invoke
 */
export function isInvoke(activity: TeamsActivity): boolean {
  return activity.type === 'invoke';
}

/**
 * Checks if the activity is a message reaction
 * @param activity - Parsed activity
 * @returns Whether the activity is a message reaction
 */
export function isMessageReaction(activity: TeamsActivity): boolean {
  return activity.type === 'messageReaction';
}

/**
 * Checks if members were added in a conversation update
 * @param activity - Parsed activity
 * @returns Whether members were added
 */
export function hasMembersAdded(activity: TeamsActivity): boolean {
  return (
    isConversationUpdate(activity) &&
    Array.isArray(activity.membersAdded) &&
    activity.membersAdded.length > 0
  );
}

/**
 * Checks if members were removed in a conversation update
 * @param activity - Parsed activity
 * @returns Whether members were removed
 */
export function hasMembersRemoved(activity: TeamsActivity): boolean {
  return (
    isConversationUpdate(activity) &&
    Array.isArray(activity.membersRemoved) &&
    activity.membersRemoved.length > 0
  );
}

/**
 * Gets the message text from an activity
 * @param activity - Parsed activity
 * @returns Message text or undefined
 */
export function getMessageText(activity: TeamsActivity): string | undefined {
  return activity.text;
}

/**
 * Gets the invoke name from an activity
 * @param activity - Parsed activity
 * @returns Invoke name or undefined
 */
export function getInvokeName(activity: TeamsActivity): string | undefined {
  return activity.name;
}

/**
 * Gets the invoke value from an activity
 * @param activity - Parsed activity
 * @returns Invoke value or undefined
 */
export function getInvokeValue<T = unknown>(
  activity: TeamsActivity
): T | undefined {
  return activity.value as T | undefined;
}

/**
 * Gets the tenant ID from an activity
 * @param activity - Parsed activity
 * @returns Tenant ID or undefined
 */
export function getTenantId(activity: TeamsActivity): string | undefined {
  return (
    activity.channelData?.tenant?.id ||
    activity.conversation?.tenantId
  );
}

/**
 * Gets the team info from an activity
 * @param activity - Parsed activity
 * @returns Team info or undefined
 */
export function getTeamInfo(
  activity: TeamsActivity
): TeamsChannelData['team'] | undefined {
  return activity.channelData?.team;
}

/**
 * Gets the channel info from an activity
 * @param activity - Parsed activity
 * @returns Channel info or undefined
 */
export function getChannelInfo(
  activity: TeamsActivity
): TeamsChannelData['channel'] | undefined {
  return activity.channelData?.channel;
}

/**
 * Creates a conversation reference from an activity
 * @param activity - Activity to create reference from
 * @returns Conversation reference
 */
export function createConversationReference(
  activity: TeamsActivity
): TeamsConversationReference {
  return {
    activityId: activity.id,
    user: activity.from,
    bot: activity.recipient,
    conversation: activity.conversation,
    channelId: activity.channelId,
    locale: activity.locale,
    serviceUrl: activity.serviceUrl,
  };
}

/**
 * Checks if the activity is from a channel
 * @param activity - Parsed activity
 * @returns Whether the activity is from a channel
 */
export function isFromChannel(activity: TeamsActivity): boolean {
  return activity.conversation?.conversationType === 'channel';
}

/**
 * Checks if the activity is from a group chat
 * @param activity - Parsed activity
 * @returns Whether the activity is from a group chat
 */
export function isFromGroupChat(activity: TeamsActivity): boolean {
  return activity.conversation?.conversationType === 'groupChat';
}

/**
 * Checks if the activity is from a personal chat
 * @param activity - Parsed activity
 * @returns Whether the activity is from a personal chat
 */
export function isFromPersonalChat(activity: TeamsActivity): boolean {
  return (
    activity.conversation?.conversationType === 'personal' ||
    (!activity.conversation?.isGroup &&
      !activity.channelData?.team)
  );
}

/**
 * Gets the user who sent the activity
 * @param activity - Parsed activity
 * @returns Sender info or undefined
 */
export function getSender(activity: TeamsActivity) {
  return activity.from;
}

/**
 * Gets the mentioned users from an activity
 * @param activity - Parsed activity
 * @returns Array of mentioned users
 */
export function getMentions(activity: TeamsActivity): Array<{
  id: string;
  name?: string;
  type?: string;
}> {
  if (!activity.entities) {
    return [];
  }

  return activity.entities
    .filter((entity) => entity.type === 'mention')
    .map((entity) => ({
      id: (entity as any).mentioned?.id || '',
      name: (entity as any).mentioned?.name,
      type: (entity as any).mentioned?.role,
    }));
}

/**
 * Checks if the bot was mentioned in the activity
 * @param activity - Parsed activity
 * @param botId - Bot ID to check for
 * @returns Whether the bot was mentioned
 */
export function isBotMentioned(
  activity: TeamsActivity,
  botId: string
): boolean {
  const mentions = getMentions(activity);
  return mentions.some((mention) => mention.id === botId);
}

/**
 * Strips bot mentions from message text
 * @param activity - Parsed activity
 * @param botName - Bot name to strip
 * @returns Text with mentions removed
 */
export function stripBotMentions(
  activity: TeamsActivity,
  botName: string
): string {
  if (!activity.text) {
    return '';
  }

  // Remove <at>Bot Name</at> tags
  return activity.text
    .replace(new RegExp(`<at>${botName}</at>`, 'gi'), '')
    .trim();
}
