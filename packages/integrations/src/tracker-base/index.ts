/**
 * @agentforge/tracker-common
 *
 * Shared base classes and utilities for product/project tracker integrations.
 * Provides a unified interface for building integrations with trackers like
 * Linear, Trello, Asana, Monday.com, ClickUp, Notion, Wrike, and more.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export {
  // Provider and auth types
  TrackerProviderSchema,
  type TrackerProvider,
  TrackerAuthTypeSchema,
  type TrackerAuthType,
  TrackerAuthConfigSchema,
  type TrackerAuthConfig,
  RateLimitConfigSchema,
  type RateLimitConfig,
  TrackerClientConfigSchema,
  type TrackerClientConfig,

  // Priority and status types
  PriorityLevelSchema,
  type PriorityLevel,
  StatusCategorySchema,
  type StatusCategory,

  // Entity types
  TrackerUserSchema,
  type TrackerUser,
  TrackerLabelSchema,
  type TrackerLabel,
  TrackerStatusSchema,
  type TrackerStatus,
  TrackerPrioritySchema,
  type TrackerPriority,
  TrackerEstimateSchema,
  type TrackerEstimate,
  TrackerTaskSchema,
  type TrackerTask,
  TrackerProjectSchema,
  type TrackerProject,
  TrackerCommentSchema,
  type TrackerComment,

  // Response types
  type PaginatedResponse,
  type RateLimitStatus,
  type ConnectionTestResult,

  // Input types
  CreateTaskInputSchema,
  type CreateTaskInput,
  UpdateTaskInputSchema,
  type UpdateTaskInput,
  type ListTasksOptions,
  type ListProjectsOptions,
} from './types';

// =============================================================================
// Base Classes
// =============================================================================

export { BaseTrackerClient } from './base-client';

export {
  BaseWebhookHandler,
  type WebhookEventPayload,
  type WebhookEventHandler,
  type SignatureStrategy,
  type WebhookRequest,
  type WebhookResponse,
} from './base-webhook-handler';

// =============================================================================
// Rate Limiting
// =============================================================================

export {
  RateLimiter,
  RateLimitError,
  ComplexityTracker,
  type RateLimiterConfig,
} from './rate-limiter';

// =============================================================================
// Field Mapping
// =============================================================================

export {
  FieldMapper,
  type MappingDirection,
  type TransformFunction,
  type TransformContext,
  type FieldMappingConfig,
  type StatusMapping,
  type PriorityMapping,
} from './field-mapper';
