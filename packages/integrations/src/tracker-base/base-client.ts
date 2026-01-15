import type {
  TrackerProvider,
  TrackerClientConfig,
  TrackerAuthConfig,
  TrackerTask,
  TrackerProject,
  TrackerComment,
  TrackerStatus,
  TrackerUser,
  PaginatedResponse,
  RateLimitStatus,
  ConnectionTestResult,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksOptions,
  ListProjectsOptions,
} from './types';

/**
 * @fileoverview Abstract base class for all tracker API clients.
 * Provides a unified interface for interacting with product/project trackers.
 * @packageDocumentation
 */

/**
 * Abstract base class for tracker API clients.
 * All tracker-specific clients (Linear, Trello, Asana, etc.) extend this class.
 *
 * @example
 * ```typescript
 * class LinearClient extends BaseTrackerClient {
 *   get provider(): TrackerProvider {
 *     return 'linear';
 *   }
 *   // ... implement abstract methods
 * }
 * ```
 */
export abstract class BaseTrackerClient {
  /** Client configuration */
  protected config: TrackerClientConfig;

  /** Current authentication state */
  protected auth: TrackerAuthConfig;

  /**
   * Creates a new tracker client instance.
   * @param config - Client configuration including auth and rate limits
   */
  constructor(config: TrackerClientConfig) {
    this.config = config;
    this.auth = config.auth;
  }

  /**
   * Get the tracker provider identifier.
   * @returns The provider name (e.g., 'linear', 'trello')
   */
  abstract get provider(): TrackerProvider;

  /**
   * Get the base API URL for this tracker.
   * @returns The base URL for API requests
   */
  abstract get baseUrl(): string;

  // =========================================================================
  // Authentication
  // =========================================================================

  /**
   * Test the connection and authentication with the tracker.
   * @returns Connection test result with latency and user info
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Refresh OAuth tokens if they are expired or about to expire.
   * @returns Updated authentication configuration
   * @throws Error if refresh fails or is not supported
   */
  abstract refreshTokens(): Promise<TrackerAuthConfig>;

  /**
   * Check if current tokens are expired or about to expire.
   * @param bufferSeconds - Seconds before expiry to consider "about to expire"
   * @returns True if tokens need refresh
   */
  isTokenExpired(bufferSeconds: number = 300): boolean {
    if (!this.auth.expiresAt) {
      return false; // No expiry means token doesn't expire (e.g., API key)
    }
    const expiresAt = new Date(this.auth.expiresAt);
    const bufferMs = bufferSeconds * 1000;
    return Date.now() >= expiresAt.getTime() - bufferMs;
  }

  /**
   * Get the current authentication configuration.
   * @returns Current auth config
   */
  getAuthConfig(): TrackerAuthConfig {
    return { ...this.auth };
  }

  /**
   * Update the authentication configuration.
   * @param auth - New authentication configuration
   */
  updateAuth(auth: TrackerAuthConfig): void {
    this.auth = auth;
  }

  // =========================================================================
  // Projects
  // =========================================================================

  /**
   * List all accessible projects/boards/workspaces.
   * @param options - Pagination and filter options
   * @returns Paginated list of projects
   */
  abstract listProjects(
    options?: ListProjectsOptions
  ): Promise<PaginatedResponse<TrackerProject>>;

  /**
   * Get a single project by ID.
   * @param projectId - External project ID from the tracker
   * @returns Project details or null if not found
   */
  abstract getProject(projectId: string): Promise<TrackerProject | null>;

  /**
   * Get available statuses for a project.
   * @param projectId - External project ID
   * @returns List of available statuses
   */
  abstract getProjectStatuses(projectId: string): Promise<TrackerStatus[]>;

  /**
   * Get project members.
   * @param projectId - External project ID
   * @returns List of project members
   */
  abstract getProjectMembers(projectId: string): Promise<TrackerUser[]>;

  // =========================================================================
  // Tasks
  // =========================================================================

  /**
   * List tasks/issues in a project.
   * @param projectId - External project ID
   * @param options - Pagination, filter, and sort options
   * @returns Paginated list of tasks
   */
  abstract listTasks(
    projectId: string,
    options?: ListTasksOptions
  ): Promise<PaginatedResponse<TrackerTask>>;

  /**
   * Get a single task by ID.
   * @param taskId - External task ID from the tracker
   * @returns Task details or null if not found
   */
  abstract getTask(taskId: string): Promise<TrackerTask | null>;

  /**
   * Create a new task in a project.
   * @param projectId - External project ID
   * @param input - Task creation input
   * @returns Created task
   */
  abstract createTask(
    projectId: string,
    input: CreateTaskInput
  ): Promise<TrackerTask>;

  /**
   * Update an existing task.
   * @param taskId - External task ID
   * @param input - Fields to update
   * @returns Updated task
   */
  abstract updateTask(
    taskId: string,
    input: UpdateTaskInput
  ): Promise<TrackerTask>;

  /**
   * Delete a task.
   * @param taskId - External task ID
   */
  abstract deleteTask(taskId: string): Promise<void>;

  /**
   * Move a task to a different status.
   * @param taskId - External task ID
   * @param statusId - Target status ID
   * @returns Updated task
   */
  async updateTaskStatus(
    taskId: string,
    statusId: string
  ): Promise<TrackerTask> {
    return this.updateTask(taskId, { status: statusId });
  }

  /**
   * Assign users to a task.
   * @param taskId - External task ID
   * @param userIds - User IDs to assign
   * @returns Updated task
   */
  async assignTask(taskId: string, userIds: string[]): Promise<TrackerTask> {
    return this.updateTask(taskId, { assigneeIds: userIds });
  }

  // =========================================================================
  // Comments
  // =========================================================================

  /**
   * List comments on a task.
   * @param taskId - External task ID
   * @param options - Pagination options
   * @returns Paginated list of comments
   */
  abstract listComments(
    taskId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<PaginatedResponse<TrackerComment>>;

  /**
   * Add a comment to a task.
   * @param taskId - External task ID
   * @param body - Comment body text
   * @returns Created comment
   */
  abstract addComment(taskId: string, body: string): Promise<TrackerComment>;

  /**
   * Update a comment.
   * @param commentId - External comment ID
   * @param body - New comment body
   * @returns Updated comment
   */
  abstract updateComment(
    commentId: string,
    body: string
  ): Promise<TrackerComment>;

  /**
   * Delete a comment.
   * @param commentId - External comment ID
   */
  abstract deleteComment(commentId: string): Promise<void>;

  // =========================================================================
  // Rate Limiting
  // =========================================================================

  /**
   * Get current rate limit status.
   * @returns Rate limit information
   */
  abstract getRateLimitStatus(): Promise<RateLimitStatus>;

  // =========================================================================
  // Search
  // =========================================================================

  /**
   * Search for tasks across projects.
   * @param query - Search query string
   * @param options - Search options
   * @returns Paginated search results
   */
  abstract searchTasks(
    query: string,
    options?: {
      projectIds?: string[];
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResponse<TrackerTask>>;

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Get the client configuration.
   * @returns Current configuration
   */
  getConfig(): TrackerClientConfig {
    return { ...this.config };
  }

  /**
   * Get the organization ID.
   * @returns Organization ID
   */
  getOrganizationId(): string {
    return this.config.organizationId;
  }

  /**
   * Get the integration ID.
   * @returns Integration ID
   */
  getIntegrationId(): string {
    return this.config.integrationId;
  }

  /**
   * Build authorization header for requests.
   * @returns Authorization header value
   */
  protected getAuthorizationHeader(): string {
    if (this.auth.accessToken) {
      const tokenType = this.auth.tokenType || 'Bearer';
      return `${tokenType} ${this.auth.accessToken}`;
    }
    if (this.auth.apiKey) {
      return this.auth.apiKey;
    }
    throw new Error('No valid authentication credentials available');
  }

  /**
   * Calculate exponential backoff delay.
   * @param attempt - Current retry attempt number
   * @param baseDelayMs - Base delay in milliseconds
   * @returns Delay in milliseconds
   */
  protected calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number = 1000
  ): number {
    return Math.min(baseDelayMs * Math.pow(2, attempt), 30000);
  }
}
