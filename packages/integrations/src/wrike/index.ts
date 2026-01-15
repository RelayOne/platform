/**
 * @fileoverview Wrike integration package exports.
 * Provides client, webhook handler, OAuth flow, and types for Wrike project management.
 * @packageDocumentation
 * @module @agentforge/wrike
 */

// Client exports
export { WrikeClient } from './client';
export type { WrikeClientConfig } from './client';

// Webhook exports
export { WrikeWebhookHandler, WrikeWebhookManager } from './webhooks';
export type {
  WrikeWebhookConfig,
  ProcessedWrikeEvent,
} from './webhooks';

// OAuth exports
export { WrikeOAuthFlow, WrikePermanentToken } from './oauth';
export type { WrikeOAuthState } from './oauth';

// Type exports
export type {
  WrikeTask,
  WrikeFolder,
  WrikeComment,
  WrikeUser,
  WrikeAccount,
  WrikeWorkflow,
  WrikeCustomStatus,
  WrikeSpace,
  WrikeAttachment,
  WrikeTimelog,
  WrikeImportance,
  WrikeWebhookPayload,
  WrikeWebhookEventType,
  WrikeOAuth2Config,
  WrikeOAuthTokens,
  CreateWrikeTaskInput,
  UpdateWrikeTaskInput,
  WrikeListTasksOptions,
  WrikeApiResponse,
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
