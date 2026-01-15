/**
 * @fileoverview Monday.com integration package exports.
 * Provides client, webhook handler, OAuth flow, and types for Monday.com board management.
 * @packageDocumentation
 * @module @agentforge/monday
 */

// Client exports
export { MondayClient } from './client';
export type { MondayClientConfig } from './client';

// Webhook exports
export { MondayWebhookHandler, MondayWebhookRecipes } from './webhooks';
export type {
  MondayWebhookConfig,
  ProcessedMondayEvent,
} from './webhooks';

// OAuth exports
export {
  MondayOAuthFlow,
  MondayApiToken,
  MondayTokenRefreshManager,
} from './oauth';
export type { MondayOAuthState } from './oauth';

// Query exports
export { QUERIES, MUTATIONS, FRAGMENTS } from './queries';

// Type exports
export type {
  MondayItem,
  MondayBoard,
  MondayUpdate,
  MondayUser,
  MondayTeam,
  MondayWorkspace,
  MondayGroup,
  MondayColumn,
  MondayColumnValue,
  MondayColumnType,
  MondayTag,
  MondayAccount,
  MondayBoardKind,
  MondayBoardState,
  MondayStatusLabel,
  MondayWebhookPayload,
  MondayWebhookEventType,
  MondayOAuth2Config,
  MondayOAuthTokens,
  CreateMondayItemInput,
  UpdateMondayItemInput,
  MondayListItemsOptions,
  MondayListBoardsOptions,
  MondayGraphQLResponse,
} from './types';

// Re-export common types from tracker-common
export type {
  TrackerTask,
  TrackerProject,
  TrackerComment,
  TrackerUser,
  TrackerStatus,
  TrackerPriority,
  TrackerAuthConfig,
  CreateTaskInput,
  UpdateTaskInput,
  PaginatedResult,
} from '@agentforge/tracker-common';
