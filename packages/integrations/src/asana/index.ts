/**
 * @fileoverview Asana integration package exports.
 * Provides client, webhook handler, OAuth flow, and types for Asana task management.
 * @packageDocumentation
 * @module @agentforge/asana
 */

// Client exports
export { AsanaClient } from './client';
export type { AsanaClientConfig } from './client';

// Webhook exports
export { AsanaWebhookHandler, AsanaWebhookManager } from './webhooks';
export type {
  AsanaWebhookConfig,
  AsanaWebhookEventType,
  ProcessedAsanaEvent,
} from './webhooks';

// OAuth exports
export { AsanaOAuthFlow, AsanaPersonalAccessToken } from './oauth';
export type { AsanaOAuthState } from './oauth';

// Type exports
export type {
  AsanaTask,
  AsanaProject,
  AsanaSection,
  AsanaUser,
  AsanaWorkspace,
  AsanaTeam,
  AsanaTag,
  AsanaStory,
  AsanaAttachment,
  AsanaCustomField,
  AsanaCompact,
  AsanaResourceType,
  AsanaWebhookPayload,
  AsanaWebhookEvent,
  AsanaWebhookAction,
  AsanaOAuth2Config,
  AsanaOAuthTokens,
  CreateAsanaTaskInput,
  UpdateAsanaTaskInput,
  AsanaListTasksOptions,
  AsanaListProjectsOptions,
  AsanaApiResponse,
  AsanaPagination,
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
