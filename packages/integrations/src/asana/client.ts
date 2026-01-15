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
  FieldMapper,
} from '@agentforge/tracker-common';
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
  private config: AsanaClientConfig;
  private rateLimiter: RateLimiter;
  private fieldMapper: FieldMapper;
  private workspaceId?: string;

  /** Asana API base URL */
  private static readonly API_BASE = 'https://app.asana.com/api/1.0';

  /**
   * Creates a new Asana client.
   * @param config - Client configuration
   */
  constructor(config: AsanaClientConfig) {
    super(config);
    this.config = config;
    this.workspaceId = config.workspaceId;
    this.rateLimiter = RateLimiter.forTracker('asana');
    this.fieldMapper = new FieldMapper('asana');
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
        Authorization: `Bearer ${this.config.auth.accessToken}`,
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
  async testConnection(): Promise<{ success: boolean; user?: TrackerUser; error?: string }> {
    try {
      const url = this.buildUrl('/users/me', {}, DEFAULT_OPT_FIELDS.user);
      const { data: user } = await this.request<AsanaUser>(url);

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
  ): Promise<PaginatedResult<TrackerProject>> {
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
   * @returns Project details
   */
  async getProject(projectId: string): Promise<TrackerProject> {
    const url = this.buildUrl(`/projects/${projectId}`, {}, DEFAULT_OPT_FIELDS.project);
    const { data: project } = await this.request<AsanaProject>(url);
    return this.mapProject(project);
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
  ): Promise<PaginatedResult<TrackerTask>> {
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
   * @returns Task details
   */
  async getTask(taskId: string): Promise<TrackerTask> {
    const url = this.buildUrl(`/tasks/${taskId}`, {}, DEFAULT_OPT_FIELDS.task);
    const { data: task } = await this.request<AsanaTask>(url);
    return this.mapTask(task);
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
      tags: input.labels,
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
   * @returns List of comments
   */
  async listComments(taskId: string): Promise<TrackerComment[]> {
    const url = this.buildUrl(`/tasks/${taskId}/stories`, {}, DEFAULT_OPT_FIELDS.story);
    const { data: stories } = await this.request<AsanaStory[]>(url);

    // Filter to only comment stories
    return stories
      .filter((s) => s.type === 'comment' || s.resource_subtype === 'comment_added')
      .map((s) => this.mapComment(s));
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
   * Search for tasks.
   * @param query - Search query
   * @returns Search results
   */
  async searchTasks(query: string): Promise<PaginatedResult<TrackerTask>> {
    const workspaceId = await this.getWorkspaceId();

    const url = this.buildUrl(
      `/workspaces/${workspaceId}/tasks/search`,
      {
        text: query,
        limit: 50,
      },
      DEFAULT_OPT_FIELDS.task
    );

    const response = await this.request<AsanaTask[]>(url);

    return {
      items: response.data.map((t) => this.mapTask(t)),
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

    return {
      id: task.gid,
      key: task.gid,
      title: task.name,
      description: task.notes || undefined,
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
      assignee: task.assignee
        ? {
            id: task.assignee.gid,
            name: task.assignee.name || '',
          }
        : undefined,
      createdAt: task.created_at ? new Date(task.created_at) : new Date(),
      updatedAt: task.modified_at ? new Date(task.modified_at) : new Date(),
      dueDate: task.due_on ? new Date(task.due_on) : undefined,
      labels: task.tags?.map((t) => t.name || t.gid) || [],
      url: task.permalink_url,
      projectId: task.projects?.[0]?.gid,
      parentId: task.parent?.gid,
      metadata: {
        provider: 'asana',
        completedAt: task.completed_at,
        completedBy: task.completed_by?.gid,
        numSubtasks: task.num_subtasks,
        customFields: task.custom_fields,
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
      key: project.gid,
      name: project.name,
      description: project.notes,
      url: project.permalink_url,
      createdAt: project.created_at ? new Date(project.created_at) : undefined,
      updatedAt: project.modified_at ? new Date(project.modified_at) : undefined,
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
        owner: project.owner,
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
      position: index,
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
  ): 'todo' | 'in_progress' | 'done' | 'canceled' {
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

    // In progress patterns
    if (
      lowerName.includes('progress') ||
      lowerName.includes('doing') ||
      lowerName.includes('working') ||
      lowerName.includes('active') ||
      lowerName.includes('in review') ||
      lowerName.includes('review')
    ) {
      return 'in_progress';
    }

    // Canceled patterns
    if (
      lowerName.includes('cancel') ||
      lowerName.includes('archived') ||
      lowerName.includes('blocked') ||
      lowerName.includes('won\'t do')
    ) {
      return 'canceled';
    }

    // Default to todo
    return 'todo';
  }

  /**
   * Extract priority from task custom fields or tags.
   * @param task - Asana task
   * @returns Priority object
   */
  private extractPriority(task: AsanaTask): { id: string; name: string; value: number } {
    // Check custom fields for priority
    const priorityField = task.custom_fields?.find(
      (f) =>
        f.name.toLowerCase().includes('priority') ||
        f.name.toLowerCase() === 'urgency'
    );

    if (priorityField && priorityField.enum_value) {
      const value = this.mapPriorityValue(priorityField.enum_value.name || '');
      return {
        id: priorityField.enum_value.gid,
        name: priorityField.enum_value.name || 'Unknown',
        value,
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
        id: priorityTag.gid,
        name,
        value: this.mapPriorityValue(name),
      };
    }

    // Default to no priority
    return {
      id: 'none',
      name: 'None',
      value: 0,
    };
  }

  /**
   * Map priority name to numeric value.
   * @param name - Priority name
   * @returns Numeric priority value
   */
  private mapPriorityValue(name: string): number {
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
