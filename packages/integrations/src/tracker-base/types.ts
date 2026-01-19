import { z } from 'zod';

/**
 * @fileoverview Core type definitions for tracker integrations.
 * These types provide a unified interface for all product/project tracker platforms.
 * @packageDocumentation
 */

/**
 * Supported tracker providers
 */
export const TrackerProviderSchema = z.enum([
  'linear',
  'trello',
  'asana',
  'monday',
  'clickup',
  'notion',
  'wrike',
  'shortcut',
  'basecamp',
  'jira',
]);
export type TrackerProvider = z.infer<typeof TrackerProviderSchema>;

/**
 * Authentication types supported by tracker integrations
 */
export const TrackerAuthTypeSchema = z.enum([
  'oauth2',
  'oauth1',
  'api_key',
  'personal_token',
  'bearer',
]);
export type TrackerAuthType = z.infer<typeof TrackerAuthTypeSchema>;

/**
 * Authentication configuration for tracker clients
 */
export const TrackerAuthConfigSchema = z.object({
  /** Authentication type */
  type: TrackerAuthTypeSchema,
  /** OAuth access token */
  accessToken: z.string().optional(),
  /** OAuth refresh token for token renewal */
  refreshToken: z.string().optional(),
  /** API key for key-based authentication */
  apiKey: z.string().optional(),
  /** Token expiration timestamp */
  expiresAt: z.date().optional(),
  /** Token type (e.g., 'Bearer') */
  tokenType: z.string().optional(),
  /** Granted OAuth scopes */
  scopes: z.array(z.string()).optional(),
  /** OAuth 1.0a token secret (for Trello) */
  tokenSecret: z.string().optional(),
});
export type TrackerAuthConfig = z.infer<typeof TrackerAuthConfigSchema>;

/**
 * Rate limit configuration for API requests
 */
export const RateLimitConfigSchema = z.object({
  /** Maximum requests per minute */
  requestsPerMinute: z.number().optional(),
  /** Maximum requests per second */
  requestsPerSecond: z.number().optional(),
  /** Maximum burst size for rate limiting */
  burstSize: z.number().optional(),
  /** Complexity limit for GraphQL APIs (Linear, Monday) */
  complexityLimit: z.number().optional(),
});
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Base configuration for all tracker clients
 */
export const TrackerClientConfigSchema = z.object({
  /** Organization ID in AgentForge */
  organizationId: z.string().uuid(),
  /** Integration ID linking to IntegrationConfig */
  integrationId: z.string().uuid(),
  /** Authentication configuration */
  auth: TrackerAuthConfigSchema,
  /** Base URL override for self-hosted instances */
  baseUrl: z.string().url().optional(),
  /** API version to use */
  apiVersion: z.string().optional(),
  /** Request timeout in milliseconds */
  timeout: z.number().default(30000),
  /** Number of retry attempts for failed requests */
  retryAttempts: z.number().default(3),
  /** Rate limit configuration */
  rateLimit: RateLimitConfigSchema.optional(),
});
export type TrackerClientConfig = z.infer<typeof TrackerClientConfigSchema>;

/**
 * Normalized priority levels across all trackers
 * 0 = None, 1 = Low, 2 = Medium, 3 = High, 4 = Urgent
 */
export const PriorityLevelSchema = z.number().min(0).max(4);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

/**
 * Normalized status categories for cross-platform mapping
 */
export const StatusCategorySchema = z.enum([
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
]);
export type StatusCategory = z.infer<typeof StatusCategorySchema>;

/**
 * User representation across trackers
 */
export const TrackerUserSchema = z.object({
  /** User ID in the tracker */
  id: z.string(),
  /** External user ID from the tracker */
  externalId: z.string(),
  /** User's display name */
  name: z.string(),
  /** User's email address */
  email: z.string().email().optional(),
  /** Avatar/profile image URL */
  avatarUrl: z.string().url().optional(),
});
export type TrackerUser = z.infer<typeof TrackerUserSchema>;

/**
 * Label/tag representation
 */
export const TrackerLabelSchema = z.object({
  /** Label ID */
  id: z.string(),
  /** Label name/text */
  name: z.string(),
  /** Label color (hex or named) */
  color: z.string().optional(),
});
export type TrackerLabel = z.infer<typeof TrackerLabelSchema>;

/**
 * Status representation
 */
export const TrackerStatusSchema = z.object({
  /** Status ID in the tracker */
  id: z.string(),
  /** Status display name */
  name: z.string(),
  /** Normalized category for cross-platform mapping */
  category: StatusCategorySchema,
  /** Status color */
  color: z.string().optional(),
});
export type TrackerStatus = z.infer<typeof TrackerStatusSchema>;

/**
 * Priority representation
 */
export const TrackerPrioritySchema = z.object({
  /** Normalized priority level (0-4) */
  level: PriorityLevelSchema,
  /** Display name for the priority */
  name: z.string(),
  /** Priority color */
  color: z.string().optional(),
});
export type TrackerPriority = z.infer<typeof TrackerPrioritySchema>;

/**
 * Time estimate representation
 */
export const TrackerEstimateSchema = z.object({
  /** Numeric value */
  value: z.number(),
  /** Unit of measurement */
  unit: z.enum(['points', 'hours', 'days', 'minutes']),
});
export type TrackerEstimate = z.infer<typeof TrackerEstimateSchema>;

/**
 * Universal task/issue representation that maps across all trackers
 */
export const TrackerTaskSchema = z.object({
  /** Internal task ID (UUID) */
  id: z.string(),
  /** External ID from the tracker */
  externalId: z.string(),
  /** Source tracker provider */
  provider: TrackerProviderSchema,
  /** Task title */
  title: z.string(),
  /** Task description/body */
  description: z.string().optional(),
  /** Description format */
  descriptionFormat: z.enum(['markdown', 'html', 'plain']).default('markdown'),
  /** Current status */
  status: TrackerStatusSchema,
  /** Priority */
  priority: TrackerPrioritySchema.optional(),
  /** Assigned users */
  assignees: z.array(TrackerUserSchema).default([]),
  /** Labels/tags */
  labels: z.array(TrackerLabelSchema).default([]),
  /** Due date */
  dueDate: z.date().optional(),
  /** Start date */
  startDate: z.date().optional(),
  /** Completion date */
  completedAt: z.date().optional(),
  /** Creation timestamp */
  createdAt: z.date(),
  /** Last update timestamp */
  updatedAt: z.date(),
  /** Parent project */
  project: z.object({
    id: z.string(),
    externalId: z.string(),
    name: z.string(),
  }).optional(),
  /** Parent task (for subtasks) */
  parent: z.object({
    id: z.string(),
    externalId: z.string(),
    title: z.string().optional(),
  }).optional(),
  /** Subtask IDs */
  subtasks: z.array(z.string()).default([]),
  /** Blocked by task IDs */
  blockedBy: z.array(z.string()).default([]),
  /** Blocks task IDs */
  blocks: z.array(z.string()).default([]),
  /** Time estimate */
  estimate: TrackerEstimateSchema.optional(),
  /** Time spent */
  timeSpent: z.object({
    value: z.number(),
    unit: z.enum(['minutes', 'hours']),
  }).optional(),
  /** Custom fields (tracker-specific) */
  customFields: z.record(z.unknown()).default({}),
  /** Direct URL to task in tracker */
  url: z.string().url(),
  /** Last sync timestamp */
  syncedAt: z.date().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).default({}),
});
export type TrackerTask = z.infer<typeof TrackerTaskSchema>;

/**
 * Universal project representation
 */
export const TrackerProjectSchema = z.object({
  /** Internal project ID (UUID) */
  id: z.string(),
  /** External ID from the tracker */
  externalId: z.string(),
  /** Source tracker provider */
  provider: TrackerProviderSchema,
  /** Project name */
  name: z.string(),
  /** Project description */
  description: z.string().optional(),
  /** Project status/state */
  status: z.string().optional(),
  /** Project key/slug (e.g., 'PROJ' in Jira) */
  key: z.string().optional(),
  /** Project owner */
  owner: TrackerUserSchema.optional(),
  /** Project members */
  members: z.array(z.object({
    user: TrackerUserSchema,
    role: z.string().optional(),
  })).default([]),
  /** Creation timestamp */
  createdAt: z.date(),
  /** Last update timestamp */
  updatedAt: z.date(),
  /** Direct URL to project in tracker */
  url: z.string().url(),
  /** Available statuses in this project */
  statuses: z.array(TrackerStatusSchema).optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).default({}),
});
export type TrackerProject = z.infer<typeof TrackerProjectSchema>;

/**
 * Comment representation
 */
export const TrackerCommentSchema = z.object({
  /** Comment ID */
  id: z.string(),
  /** External ID from tracker */
  externalId: z.string(),
  /** Comment body */
  body: z.string(),
  /** Body format */
  bodyFormat: z.enum(['markdown', 'html', 'plain']).default('markdown'),
  /** Comment author */
  author: TrackerUserSchema,
  /** Creation timestamp */
  createdAt: z.date(),
  /** Last update timestamp */
  updatedAt: z.date(),
  /** Parent task ID */
  taskId: z.string(),
});
export type TrackerComment = z.infer<typeof TrackerCommentSchema>;

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  /** Items in current page */
  items: T[];
  /** Cursor for next page */
  nextCursor?: string;
  /** Whether more pages exist */
  hasMore: boolean;
  /** Total count (if available) */
  totalCount?: number;
}

/**
 * Alias for PaginatedResponse for backward compatibility
 */
export type PaginatedResult<T> = PaginatedResponse<T>;

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Remaining requests in current window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** When limit resets */
  resetAt: Date;
  /** For GraphQL: remaining complexity */
  complexityRemaining?: number;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** Whether connection succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** User info if authenticated */
  user?: TrackerUser;
}

/**
 * Task creation input
 */
export const CreateTaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: PriorityLevelSchema.optional(),
  assigneeIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  dueDate: z.date().optional(),
  startDate: z.date().optional(),
  parentId: z.string().optional(),
  estimate: TrackerEstimateSchema.optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/**
 * Task update input
 */
export const UpdateTaskInputSchema = CreateTaskInputSchema.partial();
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

/**
 * Task list options
 */
export interface ListTasksOptions {
  /** Pagination cursor */
  cursor?: string;
  /** Page size limit */
  limit?: number;
  /** Filter by status IDs */
  statusIds?: string[];
  /** Filter by assignee IDs */
  assigneeIds?: string[];
  /** Filter by label IDs */
  labelIds?: string[];
  /** Filter by tasks updated since */
  updatedSince?: Date;
  /** Filter by tasks created since */
  createdSince?: Date;
  /** Include completed tasks */
  includeCompleted?: boolean;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Project list options
 */
export interface ListProjectsOptions {
  /** Pagination cursor */
  cursor?: string;
  /** Page size limit */
  limit?: number;
  /** Include archived projects */
  includeArchived?: boolean;
}
