/**
 * @fileoverview Microsoft Teams integration module exports
 * @module @relay/integrations/teams
 */

export { TeamsClient } from './client';
export {
  verifyBotFrameworkToken,
  parseWebhookPayload,
  getActivityType,
  isMessage,
  isConversationUpdate,
  isInvoke,
  isMessageReaction,
  hasMembersAdded,
  hasMembersRemoved,
  getMessageText,
  getInvokeName,
  getInvokeValue,
  getTenantId,
  getTeamInfo,
  getChannelInfo,
  createConversationReference,
  isFromChannel,
  isFromGroupChat,
  isFromPersonalChat,
  getSender,
  getMentions,
  isBotMentioned,
  stripBotMentions,
  TEAMS_HEADERS,
} from './webhooks';
export type {
  TeamsConfig,
  TeamsActivityType,
  TeamsChannelAccount,
  TeamsConversationAccount,
  TeamsAttachment,
  TeamsEntity,
  TeamsSuggestedActions,
  TeamsActivity,
  TeamsConversationReference,
  TeamsChannelData,
  TeamsTokenResponse,
  TeamsConversationParameters,
  TeamsConversationResourceResponse,
  TeamsAdaptiveCardAction,
  TeamsAdaptiveCardElement,
  TeamsAdaptiveCardBody,
  TeamsAdaptiveCard,
  TeamsMessageReaction,
  TeamsMention,
  SendTeamsMessageInput,
} from './types';
