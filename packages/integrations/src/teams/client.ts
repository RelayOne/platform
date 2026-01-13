/**
 * @fileoverview Microsoft Teams Bot API client
 * @module @relay/integrations/teams/client
 */

import type {
  TeamsConfig,
  TeamsActivity,
  TeamsConversationReference,
  TeamsAttachment,
  TeamsAdaptiveCard,
  TeamsTokenResponse,
  TeamsMessageResponse,
  TeamsTeam,
  TeamsChannel,
  TeamsUser,
  SendTeamsMessageInput,
} from './types';
import { createHttpClient, withRetry } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, ChatPlatformClient, ChatMessage } from '../common/types';
import type { AxiosInstance } from 'axios';

/**
 * Teams integration source identifier
 */
const SOURCE: IntegrationSource = 'teams';

/**
 * Microsoft login endpoint
 */
const LOGIN_URL = 'https://login.microsoftonline.com';

/**
 * Bot Framework API base URL
 */
const BOT_API_URL = 'https://smba.trafficmanager.net/amer';

/**
 * Microsoft Teams Bot API client
 * Implements ChatPlatformClient interface for cross-platform compatibility
 */
export class TeamsClient implements ChatPlatformClient {
  readonly source: IntegrationSource = SOURCE;
  private http: AxiosInstance;
  private config: TeamsConfig;
  private accessToken?: string;
  private tokenExpiry?: Date;

  /**
   * Creates a new Teams client
   * @param config - Teams configuration
   */
  constructor(config: TeamsConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: BOT_API_URL,
      timeout: config.timeout || 30000,
    });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: TeamsConfig): void {
    if (!config.appId) {
      throw new ConfigurationError(SOURCE, 'Microsoft App ID is required');
    }
    if (!config.appPassword) {
      throw new ConfigurationError(SOURCE, 'Microsoft App Password is required');
    }
  }

  /**
   * Gets an access token for the Bot Framework API
   * @returns Access token
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tenantId = this.config.tenantId || 'botframework.com';
    const tokenUrl = `${LOGIN_URL}/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.config.appId);
    params.append('client_secret', this.config.appPassword);
    params.append('scope', 'https://api.botframework.com/.default');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new IntegrationError(
        `Failed to get access token: ${response.statusText}`,
        IntegrationErrorCode.AUTH_FAILED,
        SOURCE
      );
    }

    const data = (await response.json()) as TeamsTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken;
  }

  /**
   * Gets auth headers with fresh token
   * @returns Auth headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Sends a message to a conversation
   * @param serviceUrl - Service URL from the incoming activity
   * @param conversationId - Conversation ID
   * @param activity - Activity to send
   * @returns Message response
   */
  async sendToConversation(
    serviceUrl: string,
    conversationId: string,
    activity: Partial<TeamsActivity>
  ): Promise<TeamsMessageResponse> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/activities`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'message',
          ...activity,
        }),
      });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to send message: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      return (await response.json()) as TeamsMessageResponse;
    });
  }

  /**
   * Replies to an activity
   * @param serviceUrl - Service URL
   * @param conversationId - Conversation ID
   * @param activityId - Activity ID to reply to
   * @param activity - Activity to send
   * @returns Message response
   */
  async replyToActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string,
    activity: Partial<TeamsActivity>
  ): Promise<TeamsMessageResponse> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/activities/${activityId}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'message',
          ...activity,
        }),
      });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to reply: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      return (await response.json()) as TeamsMessageResponse;
    });
  }

  /**
   * Updates an activity
   * @param serviceUrl - Service URL
   * @param conversationId - Conversation ID
   * @param activityId - Activity ID to update
   * @param activity - New activity content
   */
  async updateActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string,
    activity: Partial<TeamsActivity>
  ): Promise<void> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/activities/${activityId}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          type: 'message',
          id: activityId,
          ...activity,
        }),
      });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to update activity: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }
    });
  }

  /**
   * Deletes an activity
   * @param serviceUrl - Service URL
   * @param conversationId - Conversation ID
   * @param activityId - Activity ID to delete
   */
  async deleteActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string
  ): Promise<void> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/activities/${activityId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to delete activity: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }
    });
  }

  /**
   * Sends a proactive message using a conversation reference
   * @param reference - Conversation reference from a previous interaction
   * @param activity - Activity to send
   * @returns Message response
   */
  async sendProactiveMessage(
    reference: TeamsConversationReference,
    activity: Partial<TeamsActivity>
  ): Promise<TeamsMessageResponse> {
    if (!reference.serviceUrl || !reference.conversation?.id) {
      throw new IntegrationError(
        'Invalid conversation reference',
        IntegrationErrorCode.VALIDATION_ERROR,
        SOURCE
      );
    }

    return this.sendToConversation(
      reference.serviceUrl,
      reference.conversation.id,
      activity
    );
  }

  /**
   * Creates an Adaptive Card attachment
   * @param card - Adaptive card content
   * @returns Attachment
   */
  createAdaptiveCardAttachment(card: TeamsAdaptiveCard): TeamsAttachment {
    return {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: card,
    };
  }

  /**
   * Creates a simple text card
   * @param title - Card title
   * @param text - Card text
   * @returns Adaptive card
   */
  createTextCard(title: string, text: string): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          size: 'Medium',
          weight: 'Bolder',
          text: title,
        },
        {
          type: 'TextBlock',
          text,
          wrap: true,
        },
      ],
    };
  }

  /**
   * Creates a card with actions
   * @param title - Card title
   * @param text - Card text
   * @param actions - Card actions
   * @returns Adaptive card
   */
  createActionCard(
    title: string,
    text: string,
    actions: Array<{ title: string; url?: string; data?: unknown }>
  ): TeamsAdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          size: 'Medium',
          weight: 'Bolder',
          text: title,
        },
        {
          type: 'TextBlock',
          text,
          wrap: true,
        },
      ],
      actions: actions.map((action) =>
        action.url
          ? {
              type: 'Action.OpenUrl' as const,
              title: action.title,
              url: action.url,
            }
          : {
              type: 'Action.Submit' as const,
              title: action.title,
              data: action.data,
            }
      ),
    };
  }

  /**
   * Gets conversation members
   * @param serviceUrl - Service URL
   * @param conversationId - Conversation ID
   * @returns Array of members
   */
  async getConversationMembers(
    serviceUrl: string,
    conversationId: string
  ): Promise<TeamsUser[]> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/members`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to get members: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      return (await response.json()) as TeamsUser[];
    });
  }

  /**
   * Gets a single member
   * @param serviceUrl - Service URL
   * @param conversationId - Conversation ID
   * @param memberId - Member ID
   * @returns Member info
   */
  async getConversationMember(
    serviceUrl: string,
    conversationId: string,
    memberId: string
  ): Promise<TeamsUser> {
    return withRetry(async () => {
      const headers = await this.getAuthHeaders();
      const url = `${serviceUrl}/v3/conversations/${conversationId}/members/${memberId}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new IntegrationError(
          `Failed to get member: ${response.statusText}`,
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      return (await response.json()) as TeamsUser;
    });
  }

  /**
   * Tests connection by getting a token
   * @returns Whether connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the app ID
   * @returns App ID
   */
  getAppId(): string {
    return this.config.appId;
  }

  // ChatPlatformClient interface implementation

  /**
   * Sends a message (interface method)
   * Note: Teams requires serviceUrl from incoming activity context
   */
  async sendMessage(message: ChatMessage): Promise<ChatMessage> {
    // For Teams, we need both channelId (conversationId) and serviceUrl
    // The serviceUrl should be passed in a context or stored from incoming activities
    throw new IntegrationError(
      'Use sendToConversation with serviceUrl for Teams messaging',
      IntegrationErrorCode.VALIDATION_ERROR,
      SOURCE
    );
  }

  /**
   * Updates a message (interface method)
   */
  async updateMessage(
    _channelId: string,
    _messageId: string,
    _text: string
  ): Promise<void> {
    throw new IntegrationError(
      'Use updateActivity with serviceUrl for Teams message updates',
      IntegrationErrorCode.VALIDATION_ERROR,
      SOURCE
    );
  }

  /**
   * Deletes a message (interface method)
   */
  async deleteMessage(_channelId: string, _messageId: string): Promise<void> {
    throw new IntegrationError(
      'Use deleteActivity with serviceUrl for Teams message deletion',
      IntegrationErrorCode.VALIDATION_ERROR,
      SOURCE
    );
  }

  /**
   * Verifies webhook signature
   * Teams uses JWT validation - see webhooks.ts
   */
  verifyWebhook(
    _payload: string | Buffer,
    _signature: string,
    _secret: string
  ): { valid: boolean; error?: string } {
    // Teams webhook verification is handled via JWT validation
    return { valid: true };
  }
}
