/**
 * @fileoverview HubSpot integration exports
 * @module @relay/integrations/hubspot
 */

// Client
export { HubSpotClient } from './client';

// OAuth
export {
  HubSpotOAuthClient,
  isTokenValid,
  shouldRefreshToken,
} from './oauth';

// Webhooks
export {
  HubSpotWebhookHandler,
  verifyHubSpotWebhook,
  verifyWebhookSignatureV1,
  verifyWebhookSignatureV2,
  verifyWebhookSignatureV3,
  assertHubSpotWebhook,
  createWebhookResponse,
} from './webhooks';
export type { HubSpotWebhookEvent } from './webhooks';

// Types
export type {
  // Config
  HubSpotConfig,
  HubSpotOAuthConfig,
  HubSpotOAuthScope,
  HubSpotOAuthToken,
  // CRM Objects
  HubSpotCrmObject,
  HubSpotContact,
  HubSpotCompany,
  HubSpotDeal,
  HubSpotTicket,
  HubSpotAssociation,
  // Owners and Teams
  HubSpotOwner,
  HubSpotTeam,
  // Pipelines
  HubSpotPipeline,
  HubSpotPipelineStage,
  // Engagements
  HubSpotEngagement,
  HubSpotEmailEngagement,
  HubSpotCallEngagement,
  HubSpotMeetingEngagement,
  HubSpotNoteEngagement,
  HubSpotTaskEngagement,
  // Search
  HubSpotSearchRequest,
  HubSpotSearchOperator,
  HubSpotSearchResponse,
  // Batch
  HubSpotBatchReadRequest,
  HubSpotBatchResponse,
  // Operations
  CreateHubSpotObjectInput,
  UpdateHubSpotObjectInput,
  // Webhooks
  HubSpotWebhookSubscription,
  HubSpotWebhookEventType,
  HubSpotWebhookPayload,
  // Errors
  HubSpotApiError,
} from './types';
