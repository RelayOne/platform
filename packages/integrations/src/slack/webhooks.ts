/**
 * @fileoverview Slack webhook handling utilities
 * Request signing verification and event parsing
 * @module @relay/integrations/slack/webhooks
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  SlackEventWrapper,
  SlackEvent,
  SlackUrlVerification,
  SlackInteractivePayload,
  SlackSlashCommand,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource } from '../common/types';

/**
 * Slack integration source identifier
 */
const SOURCE: IntegrationSource = 'slack';

/**
 * Maximum allowed timestamp age in seconds (5 minutes)
 */
const MAX_TIMESTAMP_AGE = 60 * 5;

/**
 * Verifies Slack request signature using HMAC-SHA256
 * @param signingSecret - Slack signing secret
 * @param signature - X-Slack-Signature header value
 * @param timestamp - X-Slack-Request-Timestamp header value
 * @param body - Raw request body
 * @returns True if signature is valid
 * @throws {WebhookVerificationError} If signature is invalid or request is too old
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Validate timestamp to prevent replay attacks
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  if (isNaN(ts) || Math.abs(now - ts) > MAX_TIMESTAMP_AGE) {
    throw new WebhookVerificationError(SOURCE, 'Request timestamp is too old or invalid');
  }

  if (!signature || !signature.startsWith('v0=')) {
    throw new WebhookVerificationError(SOURCE, 'Missing or invalid signature format');
  }

  // Create the signature base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Calculate expected signature
  const hmac = createHmac('sha256', signingSecret);
  hmac.update(sigBasestring, 'utf8');
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  // Compare signatures using constant-time comparison
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new WebhookVerificationError(SOURCE, 'Webhook signature verification failed');
  }

  return true;
}

/**
 * Parses a URL verification challenge
 * @param body - Request body
 * @returns Challenge response or null if not a verification request
 */
export function parseUrlVerification(body: unknown): SlackUrlVerification | null {
  if (
    body &&
    typeof body === 'object' &&
    'type' in body &&
    body.type === 'url_verification' &&
    'challenge' in body
  ) {
    return body as SlackUrlVerification;
  }
  return null;
}

/**
 * Parses an event callback
 * @param body - Request body
 * @returns Parsed event wrapper or null if not an event callback
 */
export function parseEventCallback(body: unknown): SlackEventWrapper | null {
  if (
    body &&
    typeof body === 'object' &&
    'type' in body &&
    body.type === 'event_callback' &&
    'event' in body
  ) {
    const wrapper = body as Record<string, unknown>;
    return {
      token: wrapper.token as string,
      teamId: wrapper.team_id as string,
      apiAppId: wrapper.api_app_id as string,
      event: parseEvent(wrapper.event as Record<string, unknown>),
      type: 'event_callback',
      eventId: wrapper.event_id as string,
      eventTime: wrapper.event_time as number,
      authorizations: wrapper.authorizations as SlackEventWrapper['authorizations'],
    };
  }
  return null;
}

/**
 * Parses a Slack event
 * @param data - Raw event data
 * @returns Parsed Slack event
 */
function parseEvent(data: Record<string, unknown>): SlackEvent {
  return {
    type: data.type as SlackEvent['type'],
    user: data.user as string | undefined,
    channel: data.channel as string | undefined,
    text: data.text as string | undefined,
    ts: data.ts as string | undefined,
    threadTs: data.thread_ts as string | undefined,
    eventTs: data.event_ts as string | undefined,
    subtype: data.subtype as string | undefined,
    item: data.item as SlackEvent['item'],
    reaction: data.reaction as string | undefined,
    itemUser: data.item_user as string | undefined,
  };
}

/**
 * Parses an interactive payload (buttons, modals, etc.)
 * @param body - URL-encoded payload string or parsed object
 * @returns Parsed interactive payload
 */
export function parseInteractivePayload(body: string | Record<string, unknown>): SlackInteractivePayload {
  let data: Record<string, unknown>;

  if (typeof body === 'string') {
    // Parse URL-encoded payload
    const params = new URLSearchParams(body);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      throw new Error('Missing payload in interactive request');
    }
    data = JSON.parse(payloadStr);
  } else if (body.payload && typeof body.payload === 'string') {
    data = JSON.parse(body.payload);
  } else {
    data = body;
  }

  return {
    type: data.type as SlackInteractivePayload['type'],
    team: data.team as SlackInteractivePayload['team'],
    user: data.user as SlackInteractivePayload['user'],
    apiAppId: data.api_app_id as string,
    token: data.token as string,
    container: data.container as SlackInteractivePayload['container'],
    triggerId: data.trigger_id as string | undefined,
    responseUrl: data.response_url as string | undefined,
    actions: data.actions as SlackInteractivePayload['actions'],
    view: data.view as SlackInteractivePayload['view'],
    message: data.message as SlackInteractivePayload['message'],
  };
}

/**
 * Parses a slash command
 * @param body - URL-encoded or parsed request body
 * @returns Parsed slash command
 */
export function parseSlashCommand(body: string | Record<string, unknown>): SlackSlashCommand {
  let data: Record<string, string>;

  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    data = Object.fromEntries(params.entries());
  } else {
    data = body as Record<string, string>;
  }

  return {
    command: data.command,
    text: data.text || '',
    responseUrl: data.response_url,
    triggerId: data.trigger_id,
    userId: data.user_id,
    userName: data.user_name,
    channelId: data.channel_id,
    channelName: data.channel_name,
    teamId: data.team_id,
    teamDomain: data.team_domain,
    enterpriseId: data.enterprise_id,
    enterpriseName: data.enterprise_name,
    apiAppId: data.api_app_id,
    isEnterpriseInstall: data.is_enterprise_install,
  };
}

/**
 * Checks if an event is a bot message (to avoid infinite loops)
 * @param event - Slack event
 * @param botUserId - Bot's user ID
 * @returns True if message is from a bot
 */
export function isBotMessage(event: SlackEvent, botUserId?: string): boolean {
  // Check subtype
  if (event.subtype === 'bot_message') {
    return true;
  }

  // Check if user is the bot
  if (botUserId && event.user === botUserId) {
    return true;
  }

  return false;
}

/**
 * Checks if event is a direct message to the bot
 * @param event - Slack event
 * @param channelType - Channel type from event context
 * @returns True if DM to bot
 */
export function isDirectMessage(event: SlackEvent, channelType?: string): boolean {
  return channelType === 'im' || event.type === 'message' && !event.channel?.startsWith('C');
}

/**
 * Checks if event mentions the bot
 * @param event - Slack event
 * @param botUserId - Bot's user ID
 * @returns True if bot is mentioned
 */
export function isBotMentioned(event: SlackEvent, botUserId: string): boolean {
  if (event.type === 'app_mention') {
    return true;
  }

  if (event.text && botUserId) {
    return event.text.includes(`<@${botUserId}>`);
  }

  return false;
}

/**
 * Extracts mention from message text
 * @param text - Message text
 * @returns Array of mentioned user IDs
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /<@([A-Z0-9]+)>/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Extracts channel mentions from message text
 * @param text - Message text
 * @returns Array of mentioned channel IDs
 */
export function extractChannelMentions(text: string): string[] {
  const channelRegex = /<#([A-Z0-9]+)\|[^>]*>/g;
  const channels: string[] = [];
  let match;

  while ((match = channelRegex.exec(text)) !== null) {
    channels.push(match[1]);
  }

  return channels;
}
