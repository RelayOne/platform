/**
 * @fileoverview Notion integration package exports.
 * Provides client, polling manager, OAuth flow, and types for Notion database and page management.
 * @packageDocumentation
 * @module @agentforge/notion
 */

// Client exports
export { NotionClient } from './client';
export type { NotionClientConfig } from './client';

// Polling exports (Notion doesn't have webhooks)
export {
  NotionPollingManager,
  toWebhookLikeEvent,
} from './polling';
export type {
  NotionPollingConfig,
  NotionChangeType,
  NotionChangeEvent,
  NotionWebhookLikeEvent,
} from './polling';

// OAuth exports
export { NotionOAuthFlow, NotionInternalToken } from './oauth';
export type { NotionOAuthState } from './oauth';

// Type exports
export type {
  NotionDatabase,
  NotionPage,
  NotionBlock,
  NotionComment,
  NotionUser,
  NotionRichText,
  NotionPropertyValue,
  NotionParent,
  NotionSearchResult,
  NotionDatabaseFilter,
  NotionDatabaseSort,
  NotionOAuth2Config,
  NotionOAuthTokens,
  NotionApiConfig,
  CreateNotionPageInput,
  UpdateNotionPageInput,
  NotionListResponse,
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
