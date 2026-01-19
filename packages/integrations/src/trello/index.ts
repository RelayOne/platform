/**
 * @fileoverview Trello integration package exports.
 * Provides client, webhook handler, OAuth flow, and types for Trello board management.
 * @packageDocumentation
 * @module @agentforge/trello
 */

// Client exports
export { TrelloClient } from './client';
export type { TrelloClientConfig } from './client';

// Webhook exports
export { TrelloWebhookHandler } from './webhooks';
export type { TrelloWebhookConfig, TrelloWebhookEvent } from './webhooks';

// OAuth exports
export { TrelloOAuthFlow, TrelloSimpleAuth } from './oauth';
export type { TrelloOAuthState } from './oauth';

// Type exports
export type {
  TrelloCard,
  TrelloBoard,
  TrelloList,
  TrelloMember,
  TrelloLabel,
  TrelloChecklist,
  TrelloChecklistItem,
  TrelloAttachment,
  TrelloAction,
  TrelloWebhookPayload,
  TrelloOAuth1Config,
  TrelloOAuthTokens,
  CreateTrelloCardInput,
  UpdateTrelloCardInput,
  TrelloListCardsOptions,
  TrelloBoardOptions,
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
} from '../tracker-base';
