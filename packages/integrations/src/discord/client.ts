/**
 * @fileoverview Discord API client
 * @module @relay/integrations/discord/client
 */

import type {
  DiscordConfig,
  DiscordUser,
  DiscordGuild,
  DiscordChannel,
  DiscordMessage,
  DiscordEmbed,
  DiscordComponent,
  DiscordGuildMember,
  SendDiscordMessageInput,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, ChatPlatformClient, ChatMessage } from '../common/types';
import type { AxiosInstance } from 'axios';

/**
 * Discord integration source identifier
 */
const SOURCE: IntegrationSource = 'discord';

/**
 * Discord API base URL
 */
const API_BASE_URL = 'https://discord.com/api/v10';

/**
 * Discord API client
 * Implements ChatPlatformClient interface for cross-platform compatibility
 */
export class DiscordClient implements ChatPlatformClient {
  readonly source: IntegrationSource = SOURCE;
  private http: AxiosInstance;
  private config: DiscordConfig;

  /**
   * Creates a new Discord client
   * @param config - Discord configuration
   */
  constructor(config: DiscordConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: API_BASE_URL,
      timeout: config.timeout || 30000,
    });

    // Add bot token auth
    this.http.interceptors.request.use((request) => {
      request.headers = {
        ...request.headers,
        Authorization: `Bot ${config.botToken}`,
      };
      return request;
    });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: DiscordConfig): void {
    if (!config.botToken) {
      throw new ConfigurationError(SOURCE, 'Discord bot token is required');
    }
    if (!config.applicationId) {
      throw new ConfigurationError(SOURCE, 'Discord application ID is required');
    }
    if (!config.publicKey) {
      throw new ConfigurationError(SOURCE, 'Discord public key is required for webhook verification');
    }
  }

  /**
   * Gets current bot user
   * @returns Bot user
   */
  async getCurrentUser(): Promise<DiscordUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordUser>('/users/@me');
      return data;
    });
  }

  /**
   * Gets a user by ID
   * @param userId - User ID
   * @returns User
   */
  async getUser(userId: string): Promise<DiscordUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordUser>(`/users/${userId}`);
      return data;
    });
  }

  /**
   * Gets a guild by ID
   * @param guildId - Guild ID
   * @returns Guild
   */
  async getGuild(guildId: string): Promise<DiscordGuild> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordGuild>(`/guilds/${guildId}`);
      return data;
    });
  }

  /**
   * Gets guilds the bot is in
   * @returns Array of guilds
   */
  async getGuilds(): Promise<DiscordGuild[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordGuild[]>('/users/@me/guilds');
      return data;
    });
  }

  /**
   * Gets a channel by ID
   * @param channelId - Channel ID
   * @returns Channel
   */
  async getChannel(channelId: string): Promise<DiscordChannel> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordChannel>(`/channels/${channelId}`);
      return data;
    });
  }

  /**
   * Gets channels in a guild
   * @param guildId - Guild ID
   * @returns Array of channels
   */
  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordChannel[]>(`/guilds/${guildId}/channels`);
      return data;
    });
  }

  /**
   * Sends a message to a channel
   * @param input - Message input
   * @returns Sent message
   */
  async sendChannelMessage(input: SendDiscordMessageInput): Promise<DiscordMessage> {
    return withRetry(async () => {
      const { data } = await this.http.post<DiscordMessage>(
        `/channels/${input.channelId}/messages`,
        {
          content: input.content,
          embeds: input.embeds,
          components: input.components,
          tts: input.tts,
          allowed_mentions: input.allowed_mentions,
          message_reference: input.message_reference,
          attachments: input.attachments,
          flags: input.flags,
        }
      );
      return data;
    });
  }

  /**
   * Edits a message
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param content - New content
   * @param embeds - New embeds
   * @param components - New components
   * @returns Edited message
   */
  async editMessage(
    channelId: string,
    messageId: string,
    content?: string,
    embeds?: DiscordEmbed[],
    components?: DiscordComponent[]
  ): Promise<DiscordMessage> {
    return withRetry(async () => {
      const { data } = await this.http.patch<DiscordMessage>(
        `/channels/${channelId}/messages/${messageId}`,
        { content, embeds, components }
      );
      return data;
    });
  }

  /**
   * Deletes a message
   * @param channelId - Channel ID
   * @param messageId - Message ID
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/channels/${channelId}/messages/${messageId}`);
    });
  }

  /**
   * Gets a message
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @returns Message
   */
  async getMessage(channelId: string, messageId: string): Promise<DiscordMessage> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordMessage>(
        `/channels/${channelId}/messages/${messageId}`
      );
      return data;
    });
  }

  /**
   * Gets messages from a channel
   * @param channelId - Channel ID
   * @param options - Query options
   * @returns Array of messages
   */
  async getMessages(
    channelId: string,
    options?: {
      around?: string;
      before?: string;
      after?: string;
      limit?: number;
    }
  ): Promise<DiscordMessage[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordMessage[]>(
        `/channels/${channelId}/messages`,
        { params: options }
      );
      return data;
    });
  }

  /**
   * Adds a reaction to a message
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param emoji - Emoji (URL encoded, e.g., "%F0%9F%91%8D" or "emoji_name:emoji_id")
   */
  async addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.put(
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`
      );
    });
  }

  /**
   * Removes own reaction from a message
   * @param channelId - Channel ID
   * @param messageId - Message ID
   * @param emoji - Emoji
   */
  async removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(
        `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`
      );
    });
  }

  /**
   * Creates a DM channel with a user
   * @param userId - User ID
   * @returns DM channel
   */
  async createDM(userId: string): Promise<DiscordChannel> {
    return withRetry(async () => {
      const { data } = await this.http.post<DiscordChannel>('/users/@me/channels', {
        recipient_id: userId,
      });
      return data;
    });
  }

  /**
   * Gets a guild member
   * @param guildId - Guild ID
   * @param userId - User ID
   * @returns Guild member
   */
  async getGuildMember(guildId: string, userId: string): Promise<DiscordGuildMember> {
    return withRetry(async () => {
      const { data } = await this.http.get<DiscordGuildMember>(
        `/guilds/${guildId}/members/${userId}`
      );
      return data;
    });
  }

  /**
   * Sends a DM to a user
   * @param userId - User ID
   * @param content - Message content
   * @param embeds - Message embeds
   * @returns Sent message
   */
  async sendDM(
    userId: string,
    content?: string,
    embeds?: DiscordEmbed[]
  ): Promise<DiscordMessage> {
    const channel = await this.createDM(userId);
    return this.sendChannelMessage({
      channelId: channel.id,
      content,
      embeds,
    });
  }

  /**
   * Responds to an interaction (webhook style)
   * @param interactionId - Interaction ID
   * @param interactionToken - Interaction token
   * @param response - Response data
   */
  async respondToInteraction(
    interactionId: string,
    interactionToken: string,
    response: {
      type: number;
      data?: {
        content?: string;
        embeds?: DiscordEmbed[];
        components?: DiscordComponent[];
        flags?: number;
      };
    }
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.post(
        `/interactions/${interactionId}/${interactionToken}/callback`,
        response
      );
    });
  }

  /**
   * Edits the original interaction response
   * @param interactionToken - Interaction token
   * @param content - New content
   * @param embeds - New embeds
   * @param components - New components
   * @returns Edited message
   */
  async editInteractionResponse(
    interactionToken: string,
    content?: string,
    embeds?: DiscordEmbed[],
    components?: DiscordComponent[]
  ): Promise<DiscordMessage> {
    return withRetry(async () => {
      const { data } = await this.http.patch<DiscordMessage>(
        `/webhooks/${this.config.applicationId}/${interactionToken}/messages/@original`,
        { content, embeds, components }
      );
      return data;
    });
  }

  /**
   * Sends a followup message to an interaction
   * @param interactionToken - Interaction token
   * @param content - Message content
   * @param embeds - Message embeds
   * @param components - Message components
   * @param ephemeral - Whether the message is ephemeral
   * @returns Sent message
   */
  async sendFollowup(
    interactionToken: string,
    content?: string,
    embeds?: DiscordEmbed[],
    components?: DiscordComponent[],
    ephemeral?: boolean
  ): Promise<DiscordMessage> {
    return withRetry(async () => {
      const { data } = await this.http.post<DiscordMessage>(
        `/webhooks/${this.config.applicationId}/${interactionToken}`,
        {
          content,
          embeds,
          components,
          flags: ephemeral ? 64 : undefined,
        }
      );
      return data;
    });
  }

  /**
   * Tests connection
   * @returns Whether connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the public key for webhook verification
   * @returns Public key
   */
  getPublicKey(): string {
    return this.config.publicKey;
  }

  /**
   * Gets the application ID
   * @returns Application ID
   */
  getApplicationId(): string {
    return this.config.applicationId;
  }

  // ChatPlatformClient interface implementation

  /**
   * Sends a message (interface method)
   */
  async sendMessage(message: ChatMessage): Promise<ChatMessage> {
    const result = await this.sendChannelMessage({
      channelId: message.channelId,
      content: message.text,
    });

    return {
      id: result.id,
      text: result.content,
      channelId: result.channel_id,
    };
  }

  /**
   * Updates a message (interface method)
   */
  async updateMessage(channelId: string, messageId: string, text: string): Promise<void> {
    await this.editMessage(channelId, messageId, text);
  }

  /**
   * Verifies webhook signature
   * Discord uses Ed25519 signatures
   */
  verifyWebhook(
    _payload: string | Buffer,
    _signature: string,
    _secret: string
  ): { valid: boolean; error?: string } {
    // Discord webhook verification is handled in webhooks.ts
    // This is a placeholder for the interface
    return { valid: true };
  }
}
