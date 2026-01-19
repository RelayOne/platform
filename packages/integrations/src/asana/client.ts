import { createLogger } from '@relay/logger';
import {
  BaseTrackerClient,
  type TrackerProvider,
  type TrackerClientConfig,
  type TrackerTask,
  type TrackerProject,
  type TrackerComment,
  type TrackerUser,
  type TrackerStatus,
  type TrackerAuthConfig,
  type CreateTaskInput,
  type UpdateTaskInput,
  type PaginatedResponse,
  type RateLimitStatus,
  type ConnectionTestResult,
  RateLimiter,
  FieldMapper,
} from '../tracker-base';
import type {
  AsanaTask,
  AsanaProject,
  AsanaStory,
  AsanaUser,
  AsanaSection,
  AsanaWorkspace,
  AsanaTeam,
  AsanaTag,
  AsanaAttachment,
  CreateAsanaTaskInput,
  UpdateAsanaTaskInput,
  AsanaListTasksOptions,
  AsanaListProjectsOptions,
  AsanaApiResponse,
} from './types';

/**
 * @fileoverview Asana REST API client implementation.
 * Provides full access to Asana's task and project management features.
 * @packageDocumentation
 */

const logger = createLogger('asana-client');

/**
 * Asana client configuration options.
 */
export interface AsanaClientConfig extends TrackerClientConfig {
  /** Workspace GID (optional, will use first workspace if not specified) */
  workspaceId?: string;
  /** Default opt_fields to include in API requests */
  defaultOptFields?: {
    task?: string[];
    project?: string[];
    user?: string[];
  };
}

/**
 * Default fields to fetch for different resource types.
 */
const DEFAULT_OPT_FIELDS = {
  task: [
    'gid',
    'name',
    'notes',
    'html_notes',
    'completed',
    'completed_at',
    'completed_by',
    'created_at',
    'modified_at',
    'due_on',
    'due_at',
    'start_on',
    'start_at',
    'assignee',
    'assignee.name',
    'assignee.email',
    'assignee.photo',
    'projects',
    'projects.name',
    'memberships.project.name',
    'memberships.section.name',
    'tags',
    'tags.name',
    'tags.color',
    'followers',
    'followers.name',
    'parent',
    'parent.name',
    'num_subtasks',
    'permalink_url',
    'custom_fields',
    'custom_fields.name',
    'custom_fields.type',
    'custom_fields.display_value',
    'custom_fields.enum_value',
    'custom_fields.number_value',
    'custom_fields.text_value',
  ],
  project: [
    'gid',
    'name',
    'notes',
    'html_notes',
    'archived',
    'color',
    'created_at',
    'modified_at',
    'completed',
    'completed_at',
    'due_on',
    'start_on',
    'owner',
    'owner.name',
    'owner.email',
    'team',
    'team.name',
    'workspace',
    'workspace.name',
    'members',
    'members.name',
    'members.email',
    'permalink_url',
    'public',
    'default_view',
    'current_status',
    'current_status.color',
    'current_status.text',
  ],
  user: [
    'gid',
    'name',
    'email',
    'photo',
    'workspaces',
    'workspaces.name',
  ],
  section: [
    'gid',
    'name',
    'project',
    'project.name',
    'created_at',
  ],
  story: [
    'gid',
    'created_at',
    'created_by',
    'created_by.name',
    'resource_subtype',
    'text',
    'html_text',
    'is_pinned',
    'is_edited',
    'type',
  ],
};

/**
 * Asana REST API client.
 * Implements the BaseTrackerClient interface for Asana task management.
 *
 * @example
 * ```typescript
 * const client = new AsanaClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: {
 *     type: 'oauth2',
 *     accessToken: process.env.ASANA_ACCESS_TOKEN,
 *     refreshToken: process.env.ASANA_REFRESH_TOKEN,
 *   },
 * });
 *
 * // List projects
 * const { items: projects } = await client.listProjects();
 *
 * // Create a task
 * const task = await client.createTask('project-gid', {
 *   title: 'New task',
 *   description: 'Task description',
 * });
 * ```
 */
export class AsanaClient extends BaseTrackerClient {
  private asanaConfig: AsanaClientConfig;
  private rateLimiter: RateLimiter;
  private fieldMapper: FieldMapper;
  private workspaceId?: string;

  /** Asana API base URL */
  private static readonly API_BASE = 'https://app.asana.com/api/1.0';

  /**
   * Get the tracker provider identifier.
   * @returns The provider name
   */
  get provider(): TrackerProvider {
    return 'asana';
  }

  /**
   * Get the base API URL for this tracker.
   * @returns The base URL for API requests
   */
  get baseUrl(): string {
    return AsanaClient.API_BASE;
  }

  /**
   * Creates a new Asana client.
   * @param config - Client configuration
   */
  constructor(config: AsanaClientConfig) {
    super(config);
    this.asanaConfig = config;
    this.workspaceId = config.workspaceId;
    this.rateLimiter = RateLimiter.forTracker('asana');
    this.fieldMapper = new FieldMapper({});
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
  ): Promise<AsanaApiResponse<T>> {
    await this.rateLimiter.acquire();

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${AsanaClient.API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.asanaConfig.auth.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Asana API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        endpoint,
      });
      throw new Error(`Asana API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Build URL with query parameters including opt_fields.
   * @param endpoint - Base endpoint
   * @param params - Query parameters
   * @param optFields - Optional fields to include
   * @returns URL with parameters
   */
  private buildUrl(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    optFields?: string[]
  ): string {
    const url = new URL(`${AsanaClient.API_BASE}${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    if (optFields && optFields.length > 0) {
      url.searchParams.set('opt_fields', optFields.join(','));
    }

    return url.toString();
  }

  /**
   * Get the current workspace ID, fetching it if not set.
   * @returns Workspace GID
   */
  private async getWorkspaceId(): Promise<string> {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    const { data: workspaces } = await this.request<AsanaWorkspace[]>('/workspaces');
    if (!workspaces || workspaces.length === 0) {
      throw new Error('No workspaces found');
    }

    this.workspaceId = workspaces[0].gid;
    return this.workspaceId;
  }

  /**
   * Test the API connection.
   * @returns Connection status and user info
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const url = this.buildUrl('/users/me', {}, DEFAULT_OPT_FIELDS.user);
      const { data: user } = await this.request<AsanaUser>(url);
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
        user: this.mapUser(user),
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Refresh OAuth tokens.
   * Note: Token refresh should be handled by the OAuth flow class.
   * @returns New auth configuration
   */
  async refreshTokens(): Promise<TrackerAuthConfig> {
    throw new Error('Token refresh should be handled by AsanaOAuthFlow');
  }

  /**
   * List all projects (within workspace).
   * @param options - List options
   * @returns Paginated list of projects
   */
  async listProjects(
    options?: AsanaListProjectsOptions
  ): Promise<PaginatedResponse<TrackerProject>> {
    const workspaceId = await this.getWorkspaceId();
    const optFields = options?.opt_fields || DEFAULT_OPT_FIELDS.project;

    const url = this.buildUrl(
      `/workspaces/${workspaceId}/projects`,
      {
        limit: options?.limit || 100,
        offset: options?.cursor,
        archived: options?.archived,
      },
      optFields
    );

    const response = await this.request<AsanaProject[]>(url);

    return {
      items: response.data.map((p) => this.mapProject(p)),
      nextCursor: response.next_page?.offset,
      hasMore: !!response.next_page,
    };
  }

  /**
   * Get a project by ID.
   * @param projectId - Project GID
   * @returns Project details or null if not found
   */
  async getProject(projectId: string): Promise<TrackerProject | null> {
    try {
      const url = this.buildUrl(`/projects/${projectId}`, {}, DEFAULT_OPT_FIELDS.project);
      const { data: project } = await this.request<AsanaProject>(url);
      return this.mapProject(project);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get project sections (statuses).
   * @param projectId - Project GID
   * @returns List of sections
   */
  async getProjectStatuses(projectId: string): Promise<TrackerStatus[]> {
    const url = this.buildUrl(`/projects/${projectId}/sections`, {}, DEFAULT_OPT_FIELDS.section);
    const { data: sections } = await this.request<AsanaSection[]>(url);
    return sections.map((s, index) => this.mapSection(s, index));
  }

  /**
   * Get project members.
   * @param projectId - Project GID
   * @returns List of members
   */
  async getProjectMembers(projectId: string): Promise<TrackerUser[]> {
    const url = this.buildUrl(`/projects/${projectId}`, {}, ['members', 'members.name', 'members.email', 'members.photo']);
    const { data: project } = await this.request<AsanaProject>(url);
    return (project.members || []).map((m) => ({
      id: m.gid,
      externalId: m.gid,
      name: m.name || '',
      email: undefined,
    }));
  }

  /**
   * List tasks in a project.
   * @param projectId - Project GID
   * @param options - List options
   * @returns Paginated list of tasks
   */
  async listTasks(
    projectId: string,
    options?: AsanaListTasksOptions
  ): Promise<PaginatedResponse<TrackerTask>> {
    const optFields = options?.opt_fields || DEFAULT_OPT_FIELDS.task;
    let endpoint = `/projects/${projectId}/tasks`;

    if (options?.section) {
      endpoint = `/sections/${options.section}/tasks`;
    }

    const url = this.buildUrl(
      endpoint,
      {
        limit: options?.limit || 100,
        offset: options?.cursor,
        completed_since: options?.completed_since,
        modified_since: options?.modified_since,
      },
      optFields
    );

    const response = await this.request<AsanaTask[]>(url);

    return {
      items: response.data.map((t) => this.mapTask(t)),
      nextCursor: response.next_page?.offset,
      hasMore: !!response.next_page,
    };
  }

  /**
   * Get a task by ID.
   * @param taskId - Task GID
   * @returns Task details or null if not found
   */
  async getTask(taskId: string): Promise<TrackerTask | null> {
    try {
      const url = this.buildUrl(`/tasks/${taskId}`, {}, DEFAULT_OPT_FIELDS.task);
      const { data: task } = await this.request<AsanaTask>(url);
      return this.mapTask(task);
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a new task.
   * @param projectId - Project GID to add task to
   * @param input - Task creation input
   * @returns Created task
   */
  async createTask(projectId: string, input: CreateTaskInput): Promise<TrackerTask> {
    const asanaInput: CreateAsanaTaskInput = {
      name: input.title,
      notes: input.description,
      assignee: input.assigneeIds?.[0],
      due_on: input.dueDate?.toISOString().split('T')[0],
      projects: [projectId],
      tags: input.labelIds,
    };

    const { data: task } = await this.request<AsanaTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ data: asanaInput }),
    });

    return this.mapTask(task);
  }

  /**
   * Update a task.
   * @param taskId - Task GID
   * @param input - Task update input
   * @returns Updated task
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    const asanaInput: UpdateAsanaTaskInput = {};

    if (input.title !== undefined) {
      asanaInput.name = input.title;
    }
    if (input.description !== undefined) {
      asanaInput.notes = input.description;
    }
    if (input.assigneeIds !== undefined) {
      asanaInput.assignee = input.assigneeIds[0] || null;
    }
    if (input.dueDate !== undefined) {
      asanaInput.due_on = input.dueDate ? input.dueDate.toISOString().split('T')[0] : null;
    }
    if (input.status !== undefined) {
      // Status changes require moving the task to a different section
      // This needs to be done via a separate API call
    }

    const { data: task } = await this.request<AsanaTask>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ data: asanaInput }),
    });

    // Handle section move if status changed
    if (input.status) {
      await this.moveTaskToSection(taskId, input.status);
    }

    return this.mapTask(task);
  }

  /**
   * Delete a task.
   * @param taskId - Task GID
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.request(`/tasks/${taskId}`, { method: 'DELETE' });
  }

  /**
   * List comments (stories) on a task.
   * @param taskId - Task GID
   * @param options - Pagination options
   * @returns Paginated list of comments
   */
  async listComments(
    taskId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<PaginatedResponse<TrackerComment>> {
    const url = this.buildUrl(
      `/tasks/${taskId}/stories`,
      { limit: options?.limit, offset: options?.cursor },
      DEFAULT_OPT_FIELDS.story
    );
    const response = await this.request<AsanaStory[]>(url);

    // Filter to only comment stories
    const comments = response.data
      .filter((s) => s.type === 'comment' || s.resource_subtype === 'comment_added')
      .map((s) => this.mapComment(s));

    return {
      items: comments,
      nextCursor: response.next_page?.offset,
      hasMore: !!response.next_page,
    };
  }

  /**
   * Add a comment to a task.
   * @param taskId - Task GID
   * @param body - Comment text
   * @returns Created comment
   */
  async addComment(taskId: string, body: string): Promise<TrackerComment> {
    const { data: story } = await this.request<AsanaStory>(`/tasks/${taskId}/stories`, {
      method: 'POST',
      body: JSON.stringify({ data: { text: body } }),
    });

    return this.mapComment(story);
  }

  /**
   * Update a comment (story) in Asana.
   * Note: Asana only allows updating the text of a story within 15 minutes of creation.
   * @param commentId - Story GID
   * @param body - New comment text
   * @returns Updated comment
   */
  async updateComment(commentId: string, body: string): Promise<TrackerComment> {
    const { data: story } = await this.request<AsanaStory>(`/stories/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ data: { text: body } }),
    });

    return this.mapComment(story);
  }

  /**
   * Delete a comment (story) in Asana.
   * Note: Asana only allows deleting stories within 15 minutes of creation.
   * @param commentId - Story GID
   */
  async deleteComment(commentId: string): Promise<void> {
    await this.request(`/stories/${commentId}`, { method: 'DELETE' });
  }

  /**
   * Get current rate limit status.
   * Note: Asana uses a standard rate limit but doesn't expose detailed status.
   * @returns Rate limit information
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    // Asana doesn't expose rate limit status in API, return estimated status
    return {
      remaining: 150, // Asana allows ~150 requests per minute
      limit: 150,
      resetAt: new Date(Date.now() + 60000), // Reset in 1 minute
    };
  }

  /**
   * Search for tasks.
   * @param query - Search query
   * @param options - Search options
   * @returns Search results
   */
  async searchTasks(
    query: string,
    options?: { projectIds?: string[]; cursor?: string; limit?: number }
  ): Promise<PaginatedResponse<TrackerTask>> {
    const workspaceId = await this.getWorkspaceId();

    const url = this.buildUrl(
      `/workspaces/${workspaceId}/tasks/search`,
      {
        text: query,
        limit: options?.limit || 50,
        offset: options?.cursor,
      },
      DEFAULT_OPT_FIELDS.task
    );

    const response = await this.request<AsanaTask[]>(url);

    return {
      items: response.data.map((t) => this.mapTask(t)),
      nextCursor: response.next_page?.offset,
      hasMore: !!response.next_page,
    };
  }

  // ==================== Asana-Specific Methods ====================

  /**
   * Get all workspaces the user has access to.
   * @returns List of workspaces
   */
  async getWorkspaces(): Promise<AsanaWorkspace[]> {
    const { data } = await this.request<AsanaWorkspace[]>('/workspaces');
    return data;
  }

  /**
   * Get teams in a workspace.
   * @param workspaceId - Workspace GID (optional, uses default)
   * @returns List of teams
   */
  async getTeams(workspaceId?: string): Promise<AsanaTeam[]> {
    const wsId = workspaceId || (await this.getWorkspaceId());
    const url = this.buildUrl(`/workspaces/${wsId}/teams`, {}, [
      'gid',
      'name',
      'description',
      'permalink_url',
    ]);
    const { data } = await this.request<AsanaTeam[]>(url);
    return data;
  }

  /**
   * Get sections in a project.
   * @param projectId - Project GID
   * @returns List of sections
   */
  async getSections(projectId: string): Promise<AsanaSection[]> {
    const url = this.buildUrl(`/projects/${projectId}/sections`, {}, DEFAULT_OPT_FIELDS.section);
    const { data } = await this.request<AsanaSection[]>(url);
    return data;
  }

  /**
   * Create a section in a project.
   * @param projectId - Project GID
   * @param name - Section name
   * @returns Created section
   */
  async createSection(projectId: string, name: string): Promise<AsanaSection> {
    const { data } = await this.request<AsanaSection>(`/projects/${projectId}/sections`, {
      method: 'POST',
      body: JSON.stringify({ data: { name } }),
    });
    return data;
  }

  /**
   * Move a task to a different section.
   * @param taskId - Task GID
   * @param sectionId - Target section GID
   */
  async moveTaskToSection(taskId: string, sectionId: string): Promise<void> {
    await this.request(`/sections/${sectionId}/addTask`, {
      method: 'POST',
      body: JSON.stringify({ data: { task: taskId } }),
    });
  }

  /**
   * Get subtasks of a task.
   * @param taskId - Task GID
   * @returns List of subtasks
   */
  async getSubtasks(taskId: string): Promise<AsanaTask[]> {
    const url = this.buildUrl(`/tasks/${taskId}/subtasks`, {}, DEFAULT_OPT_FIELDS.task);
    const { data } = await this.request<AsanaTask[]>(url);
    return data;
  }

  /**
   * Create a subtask.
   * @param parentTaskId - Parent task GID
   * @param input - Subtask creation input
   * @returns Created subtask
   */
  async createSubtask(parentTaskId: string, input: CreateAsanaTaskInput): Promise<AsanaTask> {
    const { data } = await this.request<AsanaTask>(`/tasks/${parentTaskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ data: input }),
    });
    return data;
  }

  /**
   * Get task attachments.
   * @param taskId - Task GID
   * @returns List of attachments
   */
  async getAttachments(taskId: string): Promise<AsanaAttachment[]> {
    const url = this.buildUrl(`/tasks/${taskId}/attachments`, {}, [
      'gid',
      'name',
      'created_at',
      'download_url',
      'view_url',
      'host',
      'resource_subtype',
      'size',
    ]);
    const { data } = await this.request<AsanaAttachment[]>(url);
    return data;
  }

  /**
   * Get tags in a workspace.
   * @param workspaceId - Workspace GID (optional)
   * @returns List of tags
   */
  async getTags(workspaceId?: string): Promise<AsanaTag[]> {
    const wsId = workspaceId || (await this.getWorkspaceId());
    const url = this.buildUrl(`/workspaces/${wsId}/tags`, {}, [
      'gid',
      'name',
      'color',
      'notes',
    ]);
    const { data } = await this.request<AsanaTag[]>(url);
    return data;
  }

  /**
   * Add a tag to a task.
   * @param taskId - Task GID
   * @param tagId - Tag GID
   */
  async addTagToTask(taskId: string, tagId: string): Promise<void> {
    await this.request(`/tasks/${taskId}/addTag`, {
      method: 'POST',
      body: JSON.stringify({ data: { tag: tagId } }),
    });
  }

  /**
   * Remove a tag from a task.
   * @param taskId - Task GID
   * @param tagId - Tag GID
   */
  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    await this.request(`/tasks/${taskId}/removeTag`, {
      method: 'POST',
      body: JSON.stringify({ data: { tag: tagId } }),
    });
  }

  /**
   * Add a follower to a task.
   * @param taskId - Task GID
   * @param userId - User GID
   */
  async addFollower(taskId: string, userId: string): Promise<void> {
    await this.request(`/tasks/${taskId}/addFollowers`, {
      method: 'POST',
      body: JSON.stringify({ data: { followers: [userId] } }),
    });
  }

  /**
   * Remove a follower from a task.
   * @param taskId - Task GID
   * @param userId - User GID
   */
  async removeFollower(taskId: string, userId: string): Promise<void> {
    await this.request(`/tasks/${taskId}/removeFollowers`, {
      method: 'POST',
      body: JSON.stringify({ data: { followers: [userId] } }),
    });
  }

  /**
   * Set task dependencies.
   * @param taskId - Task GID
   * @param dependencyIds - GIDs of tasks this task depends on
   */
  async setDependencies(taskId: string, dependencyIds: string[]): Promise<void> {
    await this.request(`/tasks/${taskId}/addDependencies`, {
      method: 'POST',
      body: JSON.stringify({ data: { dependencies: dependencyIds } }),
    });
  }

  /**
   * Get current user info.
   * @returns Current user
   */
  async getCurrentUser(): Promise<AsanaUser> {
    const url = this.buildUrl('/users/me', {}, DEFAULT_OPT_FIELDS.user);
    const { data } = await this.request<AsanaUser>(url);
    return data;
  }

  /**
   * Get a user by ID.
   * @param userId - User GID
   * @returns User details
   */
  async getUser(userId: string): Promise<AsanaUser> {
    const url = this.buildUrl(`/users/${userId}`, {}, DEFAULT_OPT_FIELDS.user);
    const { data } = await this.request<AsanaUser>(url);
    return data;
  }

  // ==================== Mapping Methods ====================

  /**
   * Map Asana task to universal TrackerTask.
   * @param task - Asana task
   * @returns Universal task
   */
  private mapTask(task: AsanaTask): TrackerTask {
    const section = task.memberships?.[0]?.section;
    const project = task.projects?.[0];

    return {
      id: task.gid,
      externalId: task.gid,
      provider: 'asana',
      title: task.name,
      description: task.notes || undefined,
      descriptionFormat: task.html_notes ? 'html' : 'plain',
      status: section
        ? {
            id: section.gid || '',
            name: section.name || 'Unknown',
            category: this.inferStatusCategory(section.name || '', task.completed || false),
          }
        : {
            id: 'unknown',
            name: task.completed ? 'Completed' : 'To Do',
            category: task.completed ? 'done' : 'todo',
          },
      priority: this.extractPriority(task),
      assignees: task.assignee
        ? [{
            id: task.assignee.gid,
            externalId: task.assignee.gid,
            name: task.assignee.name || '',
            email: (task.assignee as { email?: string }).email,
          }]
        : [],
      labels: task.tags?.map((t) => ({
        id: t.gid,
        name: t.name || t.gid,
        color: (t as { color?: string }).color,
      })) || [],
      createdAt: task.created_at ? new Date(task.created_at) : new Date(),
      updatedAt: task.modified_at ? new Date(task.modified_at) : new Date(),
      dueDate: task.due_on ? new Date(task.due_on) : undefined,
      startDate: task.start_on ? new Date(task.start_on) : undefined,
      completedAt: task.completed_at ? new Date(task.completed_at) : undefined,
      project: project
        ? {
            id: project.gid,
            externalId: project.gid,
            name: project.name || 'Unknown',
          }
        : undefined,
      parent: task.parent
        ? {
            id: task.parent.gid,
            externalId: task.parent.gid,
            title: task.parent.name,
          }
        : undefined,
      subtasks: [],
      blockedBy: [],
      blocks: [],
      customFields: task.custom_fields?.reduce((acc, f) => {
        acc[f.name] = f.display_value || f.text_value || f.number_value || f.enum_value?.name;
        return acc;
      }, {} as Record<string, unknown>) || {},
      url: task.permalink_url || `https://app.asana.com/0/${project?.gid || '0'}/${task.gid}`,
      metadata: {
        provider: 'asana',
        completedBy: task.completed_by?.gid,
        numSubtasks: task.num_subtasks,
        resourceSubtype: task.resource_subtype,
      },
    };
  }

  /**
   * Map Asana project to universal TrackerProject.
   * @param project - Asana project
   * @returns Universal project
   */
  private mapProject(project: AsanaProject): TrackerProject {
    return {
      id: project.gid,
      externalId: project.gid,
      provider: 'asana',
      name: project.name,
      description: project.notes,
      key: project.gid,
      owner: project.owner
        ? {
            id: project.owner.gid,
            externalId: project.owner.gid,
            name: project.owner.name || '',
            email: (project.owner as { email?: string }).email,
          }
        : undefined,
      members: (project.members || []).map((m) => ({
        user: {
          id: m.gid,
          externalId: m.gid,
          name: m.name || '',
        },
      })),
      createdAt: project.created_at ? new Date(project.created_at) : new Date(),
      updatedAt: project.modified_at ? new Date(project.modified_at) : new Date(),
      url: project.permalink_url || `https://app.asana.com/0/${project.gid}`,
      metadata: {
        provider: 'asana',
        archived: project.archived,
        color: project.color,
        completed: project.completed,
        completedAt: project.completed_at,
        defaultView: project.default_view,
        isPublic: project.public,
        team: project.team,
        workspace: project.workspace,
        currentStatus: project.current_status,
      },
    };
  }

  /**
   * Map Asana section to universal TrackerStatus.
   * @param section - Asana section
   * @param index - Section position
   * @returns Universal status
   */
  private mapSection(section: AsanaSection, index: number): TrackerStatus {
    return {
      id: section.gid,
      name: section.name,
      category: this.inferStatusCategory(section.name, false),
    };
  }

  /**
   * Map Asana user to universal TrackerUser.
   * @param user - Asana user
   * @returns Universal user
   */
  private mapUser(user: AsanaUser): TrackerUser {
    return {
      id: user.gid,
      externalId: user.gid,
      name: user.name,
      email: user.email,
      avatarUrl: user.photo?.image_128x128,
    };
  }

  /**
   * Map Asana story (comment) to universal TrackerComment.
   * @param story - Asana story
   * @returns Universal comment
   */
  private mapComment(story: AsanaStory): TrackerComment {
    return {
      id: story.gid,
      body: story.text || '',
      author: story.created_by
        ? {
            id: story.created_by.gid,
            name: story.created_by.name || '',
          }
        : undefined,
      createdAt: new Date(story.created_at),
      updatedAt: new Date(story.created_at),
    };
  }

  /**
   * Infer status category from section name.
   * @param name - Section name
   * @param completed - Whether task is completed
   * @returns Status category
   */
  private inferStatusCategory(
    name: string,
    completed: boolean
  ): 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled' {
    if (completed) return 'done';

    const lowerName = name.toLowerCase();

    // Done patterns
    if (
      lowerName.includes('done') ||
      lowerName.includes('complete') ||
      lowerName.includes('finished') ||
      lowerName.includes('closed')
    ) {
      return 'done';
    }

    // Review patterns
    if (lowerName.includes('review') || lowerName.includes('qa')) {
      return 'review';
    }

    // In progress patterns
    if (
      lowerName.includes('progress') ||
      lowerName.includes('doing') ||
      lowerName.includes('working') ||
      lowerName.includes('active')
    ) {
      return 'in_progress';
    }

    // Cancelled patterns
    if (
      lowerName.includes('cancel') ||
      lowerName.includes('archived') ||
      lowerName.includes('blocked') ||
      lowerName.includes('won\'t do')
    ) {
      return 'cancelled';
    }

    // Backlog patterns
    if (lowerName.includes('backlog') || lowerName.includes('icebox')) {
      return 'backlog';
    }

    // Default to todo
    return 'todo';
  }

  /**
   * Extract priority from task custom fields or tags.
   * @param task - Asana task
   * @returns Priority object with level (0-4)
   */
  private extractPriority(task: AsanaTask): { name: string; level: number; color?: string } | undefined {
    // Check custom fields for priority
    const priorityField = task.custom_fields?.find(
      (f) =>
        f.name.toLowerCase().includes('priority') ||
        f.name.toLowerCase() === 'urgency'
    );

    if (priorityField && priorityField.enum_value) {
      const level = this.mapPriorityLevel(priorityField.enum_value.name || '');
      return {
        name: priorityField.enum_value.name || 'Unknown',
        level,
      };
    }

    // Check tags for priority indicators
    const priorityTag = task.tags?.find(
      (t) =>
        t.name?.toLowerCase().includes('urgent') ||
        t.name?.toLowerCase().includes('high') ||
        t.name?.toLowerCase().includes('priority') ||
        t.name?.toLowerCase().includes('critical')
    );

    if (priorityTag) {
      const name = priorityTag.name || '';
      return {
        name,
        level: this.mapPriorityLevel(name),
        color: (priorityTag as { color?: string }).color,
      };
    }

    // No priority found
    return undefined;
  }

  /**
   * Map priority name to numeric level (0-4).
   * @param name - Priority name
   * @returns Numeric priority level
   */
  private mapPriorityLevel(name: string): 0 | 1 | 2 | 3 | 4 {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('urgent') || lowerName.includes('critical')) return 4;
    if (lowerName.includes('high')) return 3;
    if (lowerName.includes('medium') || lowerName.includes('normal')) return 2;
    if (lowerName.includes('low')) return 1;
    return 0;
  }

  /**
   * Create an Asana client from environment variables.
   * @param organizationId - AgentForge organization ID
   * @param integrationId - AgentForge integration ID
   * @returns Asana client instance
   */
  static fromEnv(organizationId: string, integrationId: string): AsanaClient {
    const accessToken = process.env.ASANA_ACCESS_TOKEN;
    const workspaceId = process.env.ASANA_WORKSPACE_ID;

    if (!accessToken) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }

    return new AsanaClient({
      organizationId,
      integrationId,
      auth: {
        type: 'oauth2',
        accessToken,
      },
      workspaceId,
    });
  }
}
