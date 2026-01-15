import { createLogger } from '@relay/logger';
import {
  BaseTrackerClient,
  type TrackerClientConfig,
  type TrackerTask,
  type TrackerProject,
  type TrackerComment,
  type TrackerUser,
  type TrackerStatus,
  type TrackerAuthConfig,
  type CreateTaskInput,
  type UpdateTaskInput,
  type PaginatedResult,
  RateLimiter,
} from '@agentforge/tracker-common';
import type {
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
  CreateWrikeTaskInput,
  UpdateWrikeTaskInput,
  WrikeListTasksOptions,
  WrikeApiResponse,
} from './types';

/**
 * @fileoverview Wrike REST API client implementation.
 * Provides full access to Wrike's task and project management features.
 * @packageDocumentation
 */

const logger = createLogger('wrike-client');

/**
 * Wrike client configuration options.
 */
export interface WrikeClientConfig extends TrackerClientConfig {
  /** Wrike API host (varies by data center) */
  host?: string;
  /** Account ID */
  accountId?: string;
}

/**
 * Wrike REST API client.
 * Implements the BaseTrackerClient interface for Wrike task management.
 *
 * @example
 * ```typescript
 * const client = new WrikeClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: {
 *     type: 'oauth2',
 *     accessToken: process.env.WRIKE_ACCESS_TOKEN,
 *   },
 *   host: 'www.wrike.com', // May vary by region
 * });
 *
 * // List folders/projects
 * const { items: projects } = await client.listProjects();
 *
 * // Create a task
 * const task = await client.createTask('folder-id', {
 *   title: 'New task',
 *   description: 'Task description',
 * });
 * ```
 */
export class WrikeClient extends BaseTrackerClient {
  private config: WrikeClientConfig;
  private rateLimiter: RateLimiter;
  private host: string;
  private workflowCache: Map<string, WrikeWorkflow> = new Map();

  /** Default Wrike API host */
  private static readonly DEFAULT_HOST = 'www.wrike.com';

  /**
   * Creates a new Wrike client.
   * @param config - Client configuration
   */
  constructor(config: WrikeClientConfig) {
    super(config);
    this.config = config;
    this.host = config.host || WrikeClient.DEFAULT_HOST;
    this.rateLimiter = RateLimiter.forTracker('wrike');
  }

  /**
   * Get API base URL.
   * @returns API base URL
   */
  private get apiBase(): string {
    return `https://${this.host}/api/v4`;
  }

  /**
   * Make an authenticated API request.
   * @param endpoint - API endpoint path
   * @param options - Fetch options
   * @returns API response
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<WrikeApiResponse<T>> {
    await this.rateLimiter.acquire();

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.apiBase}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.auth.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Check rate limit headers
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining && parseInt(remaining, 10) < 50) {
      logger.warn('Wrike rate limit approaching', { remaining });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Wrike API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        endpoint,
      });
      throw new Error(`Wrike API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Build URL with query parameters.
   * @param endpoint - Base endpoint
   * @param params - Query parameters
   * @returns URL with parameters
   */
  private buildUrl(
    endpoint: string,
    params: Record<string, string | number | boolean | string[] | undefined> = {}
  ): string {
    const url = new URL(`${this.apiBase}${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          url.searchParams.set(key, JSON.stringify(value));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Test the API connection.
   * @returns Connection status and user info
   */
  async testConnection(): Promise<{ success: boolean; user?: TrackerUser; error?: string }> {
    try {
      const response = await this.request<WrikeUser>('/contacts?me=true');
      const user = response.data[0];

      return {
        success: true,
        user: this.mapUser(user),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Refresh OAuth tokens.
   * Note: Token refresh should be handled by WrikeOAuthFlow.
   * @returns New auth configuration
   */
  async refreshTokens(): Promise<TrackerAuthConfig> {
    throw new Error('Token refresh should be handled by WrikeOAuthFlow');
  }

  /**
   * List all folders/projects.
   * @returns Paginated list of projects
   */
  async listProjects(): Promise<PaginatedResult<TrackerProject>> {
    const response = await this.request<WrikeFolder>(
      '/folders?project=true&fields=["description","briefDescription","color","customFields","project"]'
    );

    return {
      items: response.data.map((f) => this.mapFolder(f)),
      hasMore: !!response.nextPageToken,
      nextCursor: response.nextPageToken,
    };
  }

  /**
   * Get a folder/project by ID.
   * @param folderId - Folder ID
   * @returns Project details
   */
  async getProject(folderId: string): Promise<TrackerProject> {
    const response = await this.request<WrikeFolder>(
      `/folders/${folderId}?fields=["description","briefDescription","color","customFields","project"]`
    );
    return this.mapFolder(response.data[0]);
  }

  /**
   * Get project statuses from workflow.
   * @param projectId - Project ID
   * @returns List of statuses
   */
  async getProjectStatuses(projectId: string): Promise<TrackerStatus[]> {
    // Get the folder to find its workflow
    const folderResponse = await this.request<WrikeFolder>(`/folders/${projectId}`);
    const folder = folderResponse.data[0];

    const workflowId = folder.workflowId;
    if (!workflowId) {
      // Return default statuses if no workflow
      return [
        { id: 'Active', name: 'Active', category: 'in_progress' },
        { id: 'Completed', name: 'Completed', category: 'done' },
        { id: 'Deferred', name: 'Deferred', category: 'todo' },
        { id: 'Cancelled', name: 'Cancelled', category: 'canceled' },
      ];
    }

    // Get or fetch workflow
    let workflow = this.workflowCache.get(workflowId);
    if (!workflow) {
      const workflowResponse = await this.request<WrikeWorkflow>(`/workflows/${workflowId}`);
      workflow = workflowResponse.data[0];
      this.workflowCache.set(workflowId, workflow);
    }

    return (workflow.customStatuses || []).map((s, index) => this.mapCustomStatus(s, index));
  }

  /**
   * Get project members (shared users).
   * @param projectId - Project ID
   * @returns List of members
   */
  async getProjectMembers(projectId: string): Promise<TrackerUser[]> {
    const folderResponse = await this.request<WrikeFolder>(`/folders/${projectId}`);
    const folder = folderResponse.data[0];

    if (!folder.sharedIds || folder.sharedIds.length === 0) {
      return [];
    }

    const contactsResponse = await this.request<WrikeUser>(
      `/contacts/${folder.sharedIds.join(',')}`
    );

    return contactsResponse.data.map((u) => this.mapUser(u));
  }

  /**
   * List tasks in a folder/project.
   * @param folderId - Folder ID
   * @param options - List options
   * @returns Paginated list of tasks
   */
  async listTasks(
    folderId: string,
    options?: WrikeListTasksOptions
  ): Promise<PaginatedResult<TrackerTask>> {
    const params: Record<string, string | number | boolean | string[] | undefined> = {
      descendants: options?.descendants ?? true,
      pageSize: options?.pageSize || 100,
      nextPageToken: options?.nextPageToken,
      sortField: options?.sortField || 'UpdatedDate',
      sortOrder: options?.sortOrder || 'Desc',
      subTasks: options?.subTasks ?? true,
    };

    if (options?.status) {
      params.status = options.status;
    }
    if (options?.customStatuses) {
      params.customStatuses = options.customStatuses;
    }
    if (options?.importance) {
      params.importance = options.importance;
    }
    if (options?.responsibles) {
      params.responsibles = options.responsibles;
    }

    // Add default fields
    params.fields = JSON.stringify([
      'description',
      'briefDescription',
      'customFields',
      'responsibleIds',
      'authorIds',
      'followerIds',
      'superTaskIds',
      'subTaskIds',
      'dependencyIds',
      'attachmentCount',
      'recurrent',
      'effortAllocation',
    ]);

    const url = this.buildUrl(`/folders/${folderId}/tasks`, params);
    const response = await this.request<WrikeTask>(url);

    return {
      items: response.data.map((t) => this.mapTask(t)),
      nextCursor: response.nextPageToken,
      hasMore: !!response.nextPageToken,
    };
  }

  /**
   * Get a task by ID.
   * @param taskId - Task ID
   * @returns Task details
   */
  async getTask(taskId: string): Promise<TrackerTask> {
    const response = await this.request<WrikeTask>(
      `/tasks/${taskId}?fields=["description","briefDescription","customFields","responsibleIds","authorIds","followerIds","superTaskIds","subTaskIds","dependencyIds","attachmentCount"]`
    );
    return this.mapTask(response.data[0]);
  }

  /**
   * Create a new task.
   * @param folderId - Folder ID
   * @param input - Task creation input
   * @returns Created task
   */
  async createTask(folderId: string, input: CreateTaskInput): Promise<TrackerTask> {
    const wrikeInput: CreateWrikeTaskInput = {
      title: input.title,
      description: input.description,
      importance: input.priority ? this.mapPriorityToWrike(input.priority) : undefined,
      responsibles: input.assigneeIds,
      dates: input.dueDate
        ? {
            type: 'Planned',
            due: input.dueDate.toISOString().split('T')[0],
          }
        : undefined,
    };

    if (input.status) {
      wrikeInput.customStatus = input.status;
    }

    const response = await this.request<WrikeTask>(`/folders/${folderId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(wrikeInput),
    });

    return this.mapTask(response.data[0]);
  }

  /**
   * Update a task.
   * @param taskId - Task ID
   * @param input - Task update input
   * @returns Updated task
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    const wrikeInput: UpdateWrikeTaskInput = {};

    if (input.title !== undefined) {
      wrikeInput.title = input.title;
    }
    if (input.description !== undefined) {
      wrikeInput.description = input.description;
    }
    if (input.priority !== undefined) {
      wrikeInput.importance = input.priority ? this.mapPriorityToWrike(input.priority) : 'Normal';
    }
    if (input.status !== undefined) {
      wrikeInput.customStatus = input.status;
    }
    if (input.dueDate !== undefined) {
      wrikeInput.dates = input.dueDate
        ? {
            type: 'Planned',
            due: input.dueDate.toISOString().split('T')[0],
          }
        : { due: null };
    }
    if (input.assigneeIds !== undefined) {
      // Get current task to find existing responsibles
      const currentTask = await this.getTask(taskId);
      const currentResponsibles = currentTask.assignee ? [currentTask.assignee.id] : [];

      wrikeInput.addResponsibles = input.assigneeIds.filter(
        (id) => !currentResponsibles.includes(id)
      );
      wrikeInput.removeResponsibles = currentResponsibles.filter(
        (id) => !input.assigneeIds!.includes(id)
      );
    }

    const response = await this.request<WrikeTask>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(wrikeInput),
    });

    return this.mapTask(response.data[0]);
  }

  /**
   * Delete a task.
   * @param taskId - Task ID
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.request(`/tasks/${taskId}`, { method: 'DELETE' });
  }

  /**
   * List comments on a task.
   * @param taskId - Task ID
   * @returns List of comments
   */
  async listComments(taskId: string): Promise<TrackerComment[]> {
    const response = await this.request<WrikeComment>(`/tasks/${taskId}/comments`);
    return response.data.map((c) => this.mapComment(c));
  }

  /**
   * Add a comment to a task.
   * @param taskId - Task ID
   * @param body - Comment text
   * @returns Created comment
   */
  async addComment(taskId: string, body: string): Promise<TrackerComment> {
    const response = await this.request<WrikeComment>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: body }),
    });

    return this.mapComment(response.data[0]);
  }

  /**
   * Search for tasks.
   * @param query - Search query
   * @returns Search results
   */
  async searchTasks(query: string): Promise<PaginatedResult<TrackerTask>> {
    const response = await this.request<WrikeTask>(
      `/tasks?title=${encodeURIComponent(query)}&fields=["description","briefDescription","customFields","responsibleIds"]`
    );

    return {
      items: response.data.map((t) => this.mapTask(t)),
      hasMore: !!response.nextPageToken,
    };
  }

  // ==================== Wrike-Specific Methods ====================

  /**
   * Get account info.
   * @returns Account details
   */
  async getAccount(): Promise<WrikeAccount> {
    const response = await this.request<WrikeAccount>('/account');
    return response.data[0];
  }

  /**
   * Get all contacts (users).
   * @returns List of users
   */
  async getContacts(): Promise<WrikeUser[]> {
    const response = await this.request<WrikeUser>('/contacts');
    return response.data;
  }

  /**
   * Get current user.
   * @returns Current user
   */
  async getCurrentUser(): Promise<WrikeUser> {
    const response = await this.request<WrikeUser>('/contacts?me=true');
    return response.data[0];
  }

  /**
   * Get all workflows.
   * @returns List of workflows
   */
  async getWorkflows(): Promise<WrikeWorkflow[]> {
    const response = await this.request<WrikeWorkflow>('/workflows');
    return response.data;
  }

  /**
   * Get all spaces.
   * @returns List of spaces
   */
  async getSpaces(): Promise<WrikeSpace[]> {
    const response = await this.request<WrikeSpace>('/spaces');
    return response.data;
  }

  /**
   * Get folders in a space.
   * @param spaceId - Space ID
   * @returns List of folders
   */
  async getFoldersInSpace(spaceId: string): Promise<WrikeFolder[]> {
    const response = await this.request<WrikeFolder>(
      `/spaces/${spaceId}/folders?fields=["description","briefDescription","color","project"]`
    );
    return response.data;
  }

  /**
   * Create a folder.
   * @param parentFolderId - Parent folder ID
   * @param title - Folder title
   * @returns Created folder
   */
  async createFolder(parentFolderId: string, title: string): Promise<WrikeFolder> {
    const response = await this.request<WrikeFolder>(`/folders/${parentFolderId}/folders`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return response.data[0];
  }

  /**
   * Create a project.
   * @param parentFolderId - Parent folder ID
   * @param title - Project title
   * @param ownerIds - Owner user IDs
   * @returns Created project
   */
  async createProject(
    parentFolderId: string,
    title: string,
    ownerIds?: string[]
  ): Promise<WrikeFolder> {
    const response = await this.request<WrikeFolder>(`/folders/${parentFolderId}/folders`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        project: {
          ownerIds,
          status: 'Green',
        },
      }),
    });
    return response.data[0];
  }

  /**
   * Get subtasks of a task.
   * @param taskId - Task ID
   * @returns List of subtasks
   */
  async getSubtasks(taskId: string): Promise<WrikeTask[]> {
    const response = await this.request<WrikeTask>(
      `/tasks/${taskId}/subtasks?fields=["description","customFields","responsibleIds"]`
    );
    return response.data;
  }

  /**
   * Create a subtask.
   * @param parentTaskId - Parent task ID
   * @param title - Subtask title
   * @returns Created subtask
   */
  async createSubtask(parentTaskId: string, title: string): Promise<WrikeTask> {
    const response = await this.request<WrikeTask>(`/tasks/${parentTaskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return response.data[0];
  }

  /**
   * Get task attachments.
   * @param taskId - Task ID
   * @returns List of attachments
   */
  async getAttachments(taskId: string): Promise<WrikeAttachment[]> {
    const response = await this.request<WrikeAttachment>(`/tasks/${taskId}/attachments`);
    return response.data;
  }

  /**
   * Get timelogs for a task.
   * @param taskId - Task ID
   * @returns List of timelogs
   */
  async getTimelogs(taskId: string): Promise<WrikeTimelog[]> {
    const response = await this.request<WrikeTimelog>(`/tasks/${taskId}/timelogs`);
    return response.data;
  }

  /**
   * Create a timelog entry.
   * @param taskId - Task ID
   * @param hours - Hours worked
   * @param trackedDate - Date tracked
   * @param comment - Optional comment
   * @returns Created timelog
   */
  async createTimelog(
    taskId: string,
    hours: number,
    trackedDate: string,
    comment?: string
  ): Promise<WrikeTimelog> {
    const response = await this.request<WrikeTimelog>(`/tasks/${taskId}/timelogs`, {
      method: 'POST',
      body: JSON.stringify({ hours, trackedDate, comment }),
    });
    return response.data[0];
  }

  /**
   * Add a dependency between tasks.
   * @param taskId - Task ID
   * @param predecessorId - Predecessor task ID
   */
  async addDependency(taskId: string, predecessorId: string): Promise<void> {
    await this.request(`/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ predecessorId }),
    });
  }

  /**
   * Remove a dependency between tasks.
   * @param dependencyId - Dependency ID
   */
  async removeDependency(dependencyId: string): Promise<void> {
    await this.request(`/dependencies/${dependencyId}`, { method: 'DELETE' });
  }

  // ==================== Mapping Methods ====================

  /**
   * Map Wrike task to universal TrackerTask.
   * @param task - Wrike task
   * @returns Universal task
   */
  private mapTask(task: WrikeTask): TrackerTask {
    return {
      id: task.id,
      key: task.id,
      title: task.title,
      description: task.description || task.briefDescription || undefined,
      status: {
        id: task.customStatusId || task.status || 'Active',
        name: task.status || 'Active',
        category: this.mapStatusCategory(task.status),
      },
      priority: {
        id: task.importance || 'Normal',
        name: task.importance || 'Normal',
        value: this.mapWrikePriority(task.importance),
      },
      assignee:
        task.responsibleIds && task.responsibleIds.length > 0
          ? { id: task.responsibleIds[0], name: '' }
          : undefined,
      createdAt: task.createdDate ? new Date(task.createdDate) : new Date(),
      updatedAt: task.updatedDate ? new Date(task.updatedDate) : undefined,
      dueDate: task.dates?.due ? new Date(task.dates.due) : undefined,
      labels: [],
      url: task.permalink,
      projectId: task.parentIds?.[0],
      parentId: task.superTaskIds?.[0],
      metadata: {
        provider: 'wrike',
        accountId: task.accountId,
        authorIds: task.authorIds,
        followerIds: task.followerIds,
        subTaskIds: task.subTaskIds,
        dependencyIds: task.dependencyIds,
        hasAttachments: task.hasAttachments,
        attachmentCount: task.attachmentCount,
        recurrent: task.recurrent,
        customFields: task.customFields,
        dates: task.dates,
        effortAllocation: task.effortAllocation,
      },
    };
  }

  /**
   * Map Wrike folder to universal TrackerProject.
   * @param folder - Wrike folder
   * @returns Universal project
   */
  private mapFolder(folder: WrikeFolder): TrackerProject {
    return {
      id: folder.id,
      key: folder.id,
      name: folder.title,
      description: folder.description || folder.briefDescription,
      url: folder.permalink,
      createdAt: folder.createdDate ? new Date(folder.createdDate) : undefined,
      updatedAt: folder.updatedDate ? new Date(folder.updatedDate) : undefined,
      metadata: {
        provider: 'wrike',
        accountId: folder.accountId,
        color: folder.color,
        parentIds: folder.parentIds,
        childIds: folder.childIds,
        workflowId: folder.workflowId,
        project: folder.project,
        space: folder.space,
        scope: folder.scope,
        customFields: folder.customFields,
      },
    };
  }

  /**
   * Map Wrike custom status to universal TrackerStatus.
   * @param status - Wrike custom status
   * @param index - Position index
   * @returns Universal status
   */
  private mapCustomStatus(status: WrikeCustomStatus, index: number): TrackerStatus {
    return {
      id: status.id,
      name: status.name,
      category: this.mapStatusGroupToCategory(status.group),
      color: status.color,
      position: index,
    };
  }

  /**
   * Map Wrike user to universal TrackerUser.
   * @param user - Wrike user
   * @returns Universal user
   */
  private mapUser(user: WrikeUser): TrackerUser {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.profiles?.[0]?.email,
      avatarUrl: user.avatarUrl,
    };
  }

  /**
   * Map Wrike comment to universal TrackerComment.
   * @param comment - Wrike comment
   * @returns Universal comment
   */
  private mapComment(comment: WrikeComment): TrackerComment {
    return {
      id: comment.id,
      body: comment.text,
      author: { id: comment.authorId, name: '' },
      createdAt: new Date(comment.createdDate),
      updatedAt: comment.updatedDate ? new Date(comment.updatedDate) : undefined,
    };
  }

  /**
   * Map Wrike status to category.
   * @param status - Wrike status
   * @returns Status category
   */
  private mapStatusCategory(
    status?: string
  ): 'todo' | 'in_progress' | 'done' | 'canceled' {
    switch (status) {
      case 'Active':
        return 'in_progress';
      case 'Completed':
        return 'done';
      case 'Deferred':
        return 'todo';
      case 'Cancelled':
        return 'canceled';
      default:
        return 'todo';
    }
  }

  /**
   * Map Wrike status group to category.
   * @param group - Wrike status group
   * @returns Status category
   */
  private mapStatusGroupToCategory(
    group: 'Active' | 'Completed' | 'Deferred' | 'Cancelled'
  ): 'todo' | 'in_progress' | 'done' | 'canceled' {
    switch (group) {
      case 'Active':
        return 'in_progress';
      case 'Completed':
        return 'done';
      case 'Deferred':
        return 'todo';
      case 'Cancelled':
        return 'canceled';
    }
  }

  /**
   * Map Wrike importance to numeric value.
   * @param importance - Wrike importance
   * @returns Numeric value
   */
  private mapWrikePriority(importance?: string): number {
    switch (importance) {
      case 'High':
        return 3;
      case 'Normal':
        return 2;
      case 'Low':
        return 1;
      default:
        return 0;
    }
  }

  /**
   * Map universal priority to Wrike importance.
   * @param priority - Universal priority
   * @returns Wrike importance
   */
  private mapPriorityToWrike(priority: number): 'High' | 'Normal' | 'Low' {
    if (priority >= 3) return 'High';
    if (priority === 2) return 'Normal';
    return 'Low';
  }

  /**
   * Create a Wrike client from environment variables.
   * @param organizationId - AgentForge organization ID
   * @param integrationId - AgentForge integration ID
   * @returns Wrike client instance
   */
  static fromEnv(organizationId: string, integrationId: string): WrikeClient {
    const accessToken = process.env.WRIKE_ACCESS_TOKEN;
    const host = process.env.WRIKE_HOST;

    if (!accessToken) {
      throw new Error('WRIKE_ACCESS_TOKEN environment variable is required');
    }

    return new WrikeClient({
      organizationId,
      integrationId,
      auth: {
        type: 'oauth2',
        accessToken,
      },
      host,
    });
  }
}
