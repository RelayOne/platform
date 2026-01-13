/**
 * @fileoverview Slack API client
 * @module @relay/integrations/slack/client
 */

import { WebClient, ChatPostMessageResponse, ConversationsListResponse } from '@slack/web-api';
import type {
  SlackConfig,
  SlackUser,
  SlackChannel,
  SlackMessage,
  SlackBlock,
  SendMessageOptions,
  UpdateMessageOptions,
  PostMessageResponse,
} from './types';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, ChatPlatformClient, ChatMessage } from '../common/types';

/**
 * Slack integration source identifier
 */
const SOURCE: IntegrationSource = 'slack';

/**
 * Slack API client wrapper
 * Implements ChatPlatformClient interface for cross-platform compatibility
 */
export class SlackClient implements ChatPlatformClient {
  private client: WebClient;
  private config: SlackConfig;
  private botUserId?: string;

  /**
   * Creates a new Slack client
   * @param config - Slack configuration
   */
  constructor(config: SlackConfig) {
    this.validateConfig(config);
    this.config = config;
    this.client = new WebClient(config.botToken);
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: SlackConfig): void {
    if (!config.botToken) {
      throw new ConfigurationError(SOURCE, 'Slack bot token is required');
    }
    if (!config.botToken.startsWith('xoxb-')) {
      throw new ConfigurationError(SOURCE, 'Slack bot token must start with xoxb-');
    }
    if (!config.signingSecret) {
      throw new ConfigurationError(SOURCE, 'Slack signing secret is required');
    }
  }

  /**
   * Gets the bot user ID (cached after first call)
   * @returns Bot user ID
   */
  async getBotUserId(): Promise<string> {
    if (this.botUserId) {
      return this.botUserId;
    }

    try {
      const result = await this.client.auth.test();
      this.botUserId = result.user_id as string;
      return this.botUserId;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Posts a message to a channel
   * @param options - Message options
   * @returns Post message response
   */
  async postMessage(options: SendMessageOptions): Promise<PostMessageResponse> {
    try {
      const result = await this.client.chat.postMessage({
        channel: options.channel,
        text: options.text,
        blocks: options.blocks as any,
        attachments: options.attachments as any,
        thread_ts: options.threadTs,
        unfurl_links: options.unfurlLinks,
        unfurl_media: options.unfurlMedia,
        metadata: options.metadata,
        parse: options.parse,
        link_names: options.linkNames,
        reply_broadcast: options.replyBroadcast,
        mrkdwn: options.mrkdwn,
      });

      return {
        ok: result.ok ?? false,
        channel: result.channel ?? options.channel,
        ts: result.ts ?? '',
        message: result.message as SlackMessage | undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Posts an ephemeral message (visible only to one user)
   * @param channel - Channel ID
   * @param user - User ID to show message to
   * @param text - Message text
   * @param blocks - Optional blocks
   * @returns Message timestamp
   */
  async postEphemeral(
    channel: string,
    user: string,
    text: string,
    blocks?: SlackBlock[]
  ): Promise<string> {
    try {
      const result = await this.client.chat.postEphemeral({
        channel,
        user,
        text,
        blocks: blocks as any,
      });

      return result.message_ts ?? '';
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Updates an existing message
   * @param options - Update options
   * @returns Updated message timestamp
   */
  async updateMessage(options: UpdateMessageOptions): Promise<string> {
    try {
      const result = await this.client.chat.update({
        channel: options.channel,
        ts: options.ts,
        text: options.text,
        blocks: options.blocks as any,
        attachments: options.attachments as any,
      });

      return result.ts ?? options.ts;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Deletes a message
   * @param channel - Channel ID
   * @param ts - Message timestamp
   */
  async deleteMessage(channel: string, ts: string): Promise<void> {
    try {
      await this.client.chat.delete({ channel, ts });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Adds a reaction to a message
   * @param channel - Channel ID
   * @param timestamp - Message timestamp
   * @param reaction - Reaction name (without colons)
   */
  async addReaction(channel: string, timestamp: string, reaction: string): Promise<void> {
    try {
      await this.client.reactions.add({
        channel,
        timestamp,
        name: reaction,
      });
    } catch (error) {
      // Ignore "already_reacted" error
      if ((error as any)?.data?.error !== 'already_reacted') {
        throw this.mapError(error);
      }
    }
  }

  /**
   * Removes a reaction from a message
   * @param channel - Channel ID
   * @param timestamp - Message timestamp
   * @param reaction - Reaction name (without colons)
   */
  async removeReaction(channel: string, timestamp: string, reaction: string): Promise<void> {
    try {
      await this.client.reactions.remove({
        channel,
        timestamp,
        name: reaction,
      });
    } catch (error) {
      // Ignore "no_reaction" error
      if ((error as any)?.data?.error !== 'no_reaction') {
        throw this.mapError(error);
      }
    }
  }

  /**
   * Gets user information
   * @param userId - User ID
   * @returns User information
   */
  async getUser(userId: string): Promise<SlackUser> {
    try {
      const result = await this.client.users.info({ user: userId });
      const user = result.user as any;

      return {
        id: user.id,
        teamId: user.team_id,
        name: user.name,
        realName: user.real_name,
        displayName: user.profile?.display_name,
        email: user.profile?.email,
        image24: user.profile?.image_24,
        image48: user.profile?.image_48,
        image72: user.profile?.image_72,
        isAdmin: user.is_admin,
        isBot: user.is_bot,
        tz: user.tz,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets channel information
   * @param channelId - Channel ID
   * @returns Channel information
   */
  async getChannel(channelId: string): Promise<SlackChannel> {
    try {
      const result = await this.client.conversations.info({ channel: channelId });
      const channel = result.channel as any;

      return {
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isArchived: channel.is_archived,
        isIm: channel.is_im,
        isMpim: channel.is_mpim,
        topic: channel.topic?.value,
        purpose: channel.purpose?.value,
        numMembers: channel.num_members,
        creator: channel.creator,
        created: channel.created,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Lists channels the bot is a member of
   * @param options - List options
   * @returns Array of channels
   */
  async listChannels(options?: {
    types?: string;
    excludeArchived?: boolean;
    limit?: number;
  }): Promise<SlackChannel[]> {
    try {
      const result = await this.client.conversations.list({
        types: options?.types || 'public_channel,private_channel',
        exclude_archived: options?.excludeArchived ?? true,
        limit: options?.limit || 100,
      });

      return (result.channels || []).map((channel: any) => ({
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isArchived: channel.is_archived,
        isIm: channel.is_im || false,
        isMpim: channel.is_mpim || false,
        topic: channel.topic?.value,
        purpose: channel.purpose?.value,
        numMembers: channel.num_members,
        creator: channel.creator,
        created: channel.created,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Opens a direct message channel with a user
   * @param userId - User ID
   * @returns Channel ID
   */
  async openDm(userId: string): Promise<string> {
    try {
      const result = await this.client.conversations.open({ users: userId });
      return (result.channel as any)?.id ?? '';
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Joins a channel
   * @param channelId - Channel ID
   */
  async joinChannel(channelId: string): Promise<void> {
    try {
      await this.client.conversations.join({ channel: channelId });
    } catch (error) {
      // Ignore "already_in_channel" error
      if ((error as any)?.data?.error !== 'already_in_channel') {
        throw this.mapError(error);
      }
    }
  }

  /**
   * Leaves a channel
   * @param channelId - Channel ID
   */
  async leaveChannel(channelId: string): Promise<void> {
    try {
      await this.client.conversations.leave({ channel: channelId });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets message history for a channel
   * @param channelId - Channel ID
   * @param options - History options
   * @returns Array of messages
   */
  async getHistory(
    channelId: string,
    options?: {
      limit?: number;
      oldest?: string;
      latest?: string;
      inclusive?: boolean;
    }
  ): Promise<SlackMessage[]> {
    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit: options?.limit || 100,
        oldest: options?.oldest,
        latest: options?.latest,
        inclusive: options?.inclusive,
      });

      return (result.messages || []).map((msg: any) => ({
        ts: msg.ts,
        channel: channelId,
        text: msg.text,
        user: msg.user,
        botId: msg.bot_id,
        subtype: msg.subtype,
        threadTs: msg.thread_ts,
        blocks: msg.blocks,
        attachments: msg.attachments,
        reactions: msg.reactions,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets replies in a thread
   * @param channelId - Channel ID
   * @param threadTs - Thread parent timestamp
   * @returns Array of reply messages
   */
  async getReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      return (result.messages || []).map((msg: any) => ({
        ts: msg.ts,
        channel: channelId,
        text: msg.text,
        user: msg.user,
        botId: msg.bot_id,
        subtype: msg.subtype,
        threadTs: msg.thread_ts,
        blocks: msg.blocks,
        attachments: msg.attachments,
        reactions: msg.reactions,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Maps Slack API errors to IntegrationError
   */
  private mapError(error: unknown): IntegrationError {
    if (error && typeof error === 'object' && 'data' in error) {
      const slackError = error as { data: { error: string } };
      const errorCode = slackError.data.error;

      switch (errorCode) {
        case 'not_authed':
        case 'invalid_auth':
        case 'token_revoked':
        case 'token_expired':
          return new IntegrationError(
            `Slack authentication failed: ${errorCode}`,
            IntegrationErrorCode.AUTH_FAILED,
            SOURCE
          );
        case 'channel_not_found':
        case 'user_not_found':
          return new IntegrationError(
            `Slack resource not found: ${errorCode}`,
            IntegrationErrorCode.NOT_FOUND,
            SOURCE
          );
        case 'ratelimited':
          return new IntegrationError(
            'Slack rate limit exceeded',
            IntegrationErrorCode.RATE_LIMITED,
            SOURCE,
            { retryable: true }
          );
        default:
          return new IntegrationError(
            `Slack API error: ${errorCode}`,
            IntegrationErrorCode.PROVIDER_ERROR,
            SOURCE
          );
      }
    }

    return IntegrationError.fromAxiosError(SOURCE, error);
  }

  // ChatPlatformClient interface implementation

  /**
   * Sends a message (interface method)
   */
  async sendMessage(
    channelId: string,
    message: string | ChatMessage
  ): Promise<string> {
    const text = typeof message === 'string' ? message : message.content;
    const result = await this.postMessage({
      channel: channelId,
      text,
    });
    return result.ts;
  }

  /**
   * Gets the signing secret for webhook verification
   * @returns Signing secret
   */
  getSigningSecret(): string {
    return this.config.signingSecret;
  }

  /**
   * Gets the default channel
   * @returns Default channel ID or undefined
   */
  getDefaultChannel(): string | undefined {
    return this.config.defaultChannel;
  }
}
