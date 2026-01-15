/**
 * @fileoverview ClickUp integration package exports.
 * Provides client, webhook handler, OAuth flow, and types for ClickUp task management.
 * @packageDocumentation
 * @module @agentforge/clickup
 */

// Client exports
export { ClickUpClient } from './client';
export type { ClickUpClientConfig } from './client';

// Webhook exports
export { ClickUpWebhookHandler, ClickUpWebhookManager } from './webhooks';
export type {
  ClickUpWebhookConfig,
  ProcessedClickUpEvent,
} from './webhooks';

// OAuth exports
export { ClickUpOAuthFlow, ClickUpPersonalToken } from './oauth';
export type { ClickUpOAuthState } from './oauth';

// Type exports
export type {
  ClickUpTask,
  ClickUpList,
  ClickUpFolder,
  ClickUpSpace,
  ClickUpTeam,
  ClickUpUser,
  ClickUpComment,
  ClickUpStatus,
  ClickUpPriority,
  ClickUpTag,
  ClickUpChecklist,
  ClickUpChecklistItem,
  ClickUpAttachment,
  ClickUpCustomField,
  ClickUpWebhookPayload,
  ClickUpWebhookEvent,
  ClickUpOAuth2Config,
  ClickUpOAuthTokens,
  CreateClickUpTaskInput,
  UpdateClickUpTaskInput,
  ClickUpListTasksOptions,
  ClickUpListResponse,
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
