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
  ClickUpTask,
  ClickUpList,
  ClickUpSpace,
  ClickUpFolder,
  ClickUpTeam,
  ClickUpComment,
  ClickUpUser,
  ClickUpStatus,
  ClickUpChecklist,
  ClickUpTag,
  CreateClickUpTaskInput,
  UpdateClickUpTaskInput,
  ClickUpListTasksOptions,
  ClickUpListResponse,
} from './types';

/**
 * @fileoverview ClickUp REST API client implementation.
 * Provides full access to ClickUp's task and space management features.
 * @packageDocumentation
 */

const logger = createLogger('clickup-client');

/**
 * ClickUp client configuration options.
 */
export interface ClickUpClientConfig extends TrackerClientConfig {
  /** Team (workspace) ID */
  teamId?: string;
}

/**
 * ClickUp REST API client.
 * Implements the BaseTrackerClient interface for ClickUp task management.
 *
 * @example
 * ```typescript
 * const client = new ClickUpClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: {
 *     type: 'oauth2',
 *     accessToken: process.env.CLICKUP_ACCESS_TOKEN,
 *   },
 * });
 *
 * // List spaces (projects)
 * const { items: spaces } = await client.listProjects();
 *
 * // Create a task
 * const task = await client.createTask('list-id', {
 *   title: 'New task',
 *   description: 'Task description',
 * });
 * ```
 */
export class ClickUpClient extends BaseTrackerClient {
  private config: ClickUpClientConfig;
  private rateLimiter: RateLimiter;
  private teamId?: string;

  /** ClickUp API base URL */
  private static readonly API_BASE = 'https://api.clickup.com/api/v2';

  /**
   * Creates a new ClickUp client.
   * @param config - Client configuration
   */
  constructor(config: ClickUpClientConfig) {
    super(config);
    this.config = config;
    this.teamId = config.teamId;
    this.rateLimiter = RateLimiter.forTracker('clickup');
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
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${ClickUpClient.API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.config.auth.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Check rate limit headers
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining && parseInt(remaining, 10) < 10) {
      logger.warn('ClickUp rate limit approaching', { remaining });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('ClickUp API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        endpoint,
      });
      throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {} as T;
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
    const url = new URL(`${ClickUpClient.API_BASE}${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(`${key}[]`, v));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Get the current team ID, fetching it if not set.
   * @returns Team ID
   */
  private async getTeamId(): Promise<string> {
    if (this.teamId) {
      return this.teamId;
    }

    const teams = await this.getTeams();
    if (teams.length === 0) {
      throw new Error('No teams found');
    }

    this.teamId = teams[0].id;
    return this.teamId;
  }

  /**
   * Test the API connection.
   * @returns Connection status and user info
   */
  async testConnection(): Promise<{ success: boolean; user?: TrackerUser; error?: string }> {
    try {
      const user = await this.request<{ user: ClickUpUser }>('/user');
      return {
        success: true,
        user: this.mapUser(user.user),
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
   * Note: ClickUp tokens don't expire, so this is a no-op.
   * @returns Current auth configuration
   */
  async refreshTokens(): Promise<TrackerAuthConfig> {
    // ClickUp tokens don't expire
    return this.config.auth;
  }

  /**
   * List all spaces (projects) in a team.
   * @returns Paginated list of spaces
   */
  async listProjects(): Promise<PaginatedResult<TrackerProject>> {
    const teamId = await this.getTeamId();
    const response = await this.request<{ spaces: ClickUpSpace[] }>(
      `/team/${teamId}/space?archived=false`
    );

    return {
      items: response.spaces.map((s) => this.mapSpace(s)),
      hasMore: false,
    };
  }

  /**
   * Get a space by ID.
   * @param spaceId - Space ID
   * @returns Space details
   */
  async getProject(spaceId: string): Promise<TrackerProject> {
    const space = await this.request<ClickUpSpace>(`/space/${spaceId}`);
    return this.mapSpace(space);
  }

  /**
   * Get statuses for a space.
   * @param spaceId - Space ID
   * @returns List of statuses
   */
  async getProjectStatuses(spaceId: string): Promise<TrackerStatus[]> {
    const space = await this.request<ClickUpSpace>(`/space/${spaceId}`);
    return (space.statuses || []).map((s, index) => this.mapStatus(s, index));
  }

  /**
   * Get space members.
   * @param spaceId - Space ID
   * @returns List of members
   */
  async getProjectMembers(spaceId: string): Promise<TrackerUser[]> {
    const space = await this.request<ClickUpSpace>(`/space/${spaceId}`);
    return (space.members || []).map((m) => this.mapUser(m.user));
  }

  /**
   * List tasks in a list.
   * @param listId - List ID
   * @param options - List options
   * @returns Paginated list of tasks
   */
  async listTasks(
    listId: string,
    options?: ClickUpListTasksOptions
  ): Promise<PaginatedResult<TrackerTask>> {
    const params: Record<string, unknown> = {
      archived: options?.archived ?? false,
      include_closed: options?.include_closed ?? false,
      page: options?.page ?? 0,
      order_by: options?.order_by ?? 'updated',
      reverse: options?.reverse ?? true,
      subtasks: options?.subtasks ?? false,
      include_markdown_description: options?.include_markdown_description ?? false,
    };

    if (options?.statuses) params.statuses = options.statuses;
    if (options?.assignees) params.assignees = options.assignees;
    if (options?.tags) params.tags = options.tags;
    if (options?.due_date_gt) params.due_date_gt = options.due_date_gt;
    if (options?.due_date_lt) params.due_date_lt = options.due_date_lt;
    if (options?.date_created_gt) params.date_created_gt = options.date_created_gt;
    if (options?.date_created_lt) params.date_created_lt = options.date_created_lt;

    const url = this.buildUrl(`/list/${listId}/task`, params as Record<string, string | number | boolean | string[] | undefined>);
    const response = await this.request<ClickUpListResponse<ClickUpTask>>(url);

    const tasks = response.tasks || [];

    return {
      items: tasks.map((t) => this.mapTask(t)),
      nextCursor: response.last_page ? undefined : String((options?.page ?? 0) + 1),
      hasMore: !response.last_page,
    };
  }

  /**
   * Get a task by ID.
   * @param taskId - Task ID
   * @returns Task details
   */
  async getTask(taskId: string): Promise<TrackerTask> {
    const task = await this.request<ClickUpTask>(
      `/task/${taskId}?include_subtasks=true&include_markdown_description=true`
    );
    return this.mapTask(task);
  }

  /**
   * Create a new task.
   * @param listId - List ID
   * @param input - Task creation input
   * @returns Created task
   */
  async createTask(listId: string, input: CreateTaskInput): Promise<TrackerTask> {
    const clickupInput: CreateClickUpTaskInput = {
      name: input.title,
      description: input.description,
      priority: input.priority ? this.mapPriorityToClickUp(input.priority) : undefined,
      due_date: input.dueDate?.getTime(),
      due_date_time: !!input.dueDate,
      assignees: input.assigneeIds?.map((id) => parseInt(id, 10)),
      tags: input.labels,
      status: input.status,
    };

    const task = await this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(clickupInput),
    });

    return this.mapTask(task);
  }

  /**
   * Update a task.
   * @param taskId - Task ID
   * @param input - Task update input
   * @returns Updated task
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    const clickupInput: UpdateClickUpTaskInput = {};

    if (input.title !== undefined) {
      clickupInput.name = input.title;
    }
    if (input.description !== undefined) {
      clickupInput.description = input.description;
    }
    if (input.priority !== undefined) {
      clickupInput.priority = input.priority ? this.mapPriorityToClickUp(input.priority) : null;
    }
    if (input.dueDate !== undefined) {
      clickupInput.due_date = input.dueDate ? input.dueDate.getTime() : null;
      clickupInput.due_date_time = !!input.dueDate;
    }
    if (input.status !== undefined) {
      clickupInput.status = input.status;
    }
    if (input.assigneeIds !== undefined) {
      // Get current task to find existing assignees
      const currentTask = await this.getTask(taskId);
      const currentAssignees = currentTask.assignee
        ? [parseInt(currentTask.assignee.id, 10)]
        : [];
      const newAssignees = input.assigneeIds.map((id) => parseInt(id, 10));

      clickupInput.assignees = {
        add: newAssignees.filter((id) => !currentAssignees.includes(id)),
        rem: currentAssignees.filter((id) => !newAssignees.includes(id)),
      };
    }

    const task = await this.request<ClickUpTask>(`/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(clickupInput),
    });

    return this.mapTask(task);
  }

  /**
   * Delete a task.
   * @param taskId - Task ID
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.request(`/task/${taskId}`, { method: 'DELETE' });
  }

  /**
   * List comments on a task.
   * @param taskId - Task ID
   * @returns List of comments
   */
  async listComments(taskId: string): Promise<TrackerComment[]> {
    const response = await this.request<{ comments: ClickUpComment[] }>(
      `/task/${taskId}/comment`
    );
    return response.comments.map((c) => this.mapComment(c));
  }

  /**
   * Add a comment to a task.
   * @param taskId - Task ID
   * @param body - Comment text
   * @returns Created comment
   */
  async addComment(taskId: string, body: string): Promise<TrackerComment> {
    const comment = await this.request<ClickUpComment>(`/task/${taskId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment_text: body }),
    });
    return this.mapComment(comment);
  }

  /**
   * Search for tasks.
   * Note: ClickUp requires searching within a team.
   * @param query - Search query
   * @returns Search results
   */
  async searchTasks(query: string): Promise<PaginatedResult<TrackerTask>> {
    const teamId = await this.getTeamId();

    // ClickUp search is via filtered task listing across lists
    // We'll search across all spaces
    const spacesResponse = await this.request<{ spaces: ClickUpSpace[] }>(
      `/team/${teamId}/space?archived=false`
    );

    const allTasks: TrackerTask[] = [];

    for (const space of spacesResponse.spaces.slice(0, 5)) {
      // Get folders in space
      const foldersResponse = await this.request<{ folders: ClickUpFolder[] }>(
        `/space/${space.id}/folder?archived=false`
      );

      // Get folderless lists
      const listsResponse = await this.request<{ lists: ClickUpList[] }>(
        `/space/${space.id}/list?archived=false`
      );

      const lists = [
        ...listsResponse.lists,
        ...foldersResponse.folders.flatMap((f) => f.lists || []),
      ];

      for (const list of lists.slice(0, 10)) {
        const tasksResponse = await this.request<ClickUpListResponse<ClickUpTask>>(
          `/list/${list.id}/task?archived=false`
        );

        const matchingTasks = (tasksResponse.tasks || []).filter(
          (t) =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.description?.toLowerCase().includes(query.toLowerCase())
        );

        allTasks.push(...matchingTasks.map((t) => this.mapTask(t)));
      }
    }

    return {
      items: allTasks.slice(0, 50),
      hasMore: allTasks.length > 50,
    };
  }

  // ==================== ClickUp-Specific Methods ====================

  /**
   * Get all teams (workspaces).
   * @returns List of teams
   */
  async getTeams(): Promise<ClickUpTeam[]> {
    const response = await this.request<{ teams: ClickUpTeam[] }>('/team');
    return response.teams;
  }

  /**
   * Get all spaces in a team.
   * @param teamId - Team ID (optional, uses default)
   * @returns List of spaces
   */
  async getSpaces(teamId?: string): Promise<ClickUpSpace[]> {
    const id = teamId || (await this.getTeamId());
    const response = await this.request<{ spaces: ClickUpSpace[] }>(
      `/team/${id}/space?archived=false`
    );
    return response.spaces;
  }

  /**
   * Get all folders in a space.
   * @param spaceId - Space ID
   * @returns List of folders
   */
  async getFolders(spaceId: string): Promise<ClickUpFolder[]> {
    const response = await this.request<{ folders: ClickUpFolder[] }>(
      `/space/${spaceId}/folder?archived=false`
    );
    return response.folders;
  }

  /**
   * Get all lists in a folder.
   * @param folderId - Folder ID
   * @returns List of lists
   */
  async getListsInFolder(folderId: string): Promise<ClickUpList[]> {
    const response = await this.request<{ lists: ClickUpList[] }>(
      `/folder/${folderId}/list?archived=false`
    );
    return response.lists;
  }

  /**
   * Get folderless lists in a space.
   * @param spaceId - Space ID
   * @returns List of lists
   */
  async getFolderlessLists(spaceId: string): Promise<ClickUpList[]> {
    const response = await this.request<{ lists: ClickUpList[] }>(
      `/space/${spaceId}/list?archived=false`
    );
    return response.lists;
  }

  /**
   * Get a list by ID.
   * @param listId - List ID
   * @returns List details
   */
  async getList(listId: string): Promise<ClickUpList> {
    return this.request<ClickUpList>(`/list/${listId}`);
  }

  /**
   * Create a list in a folder.
   * @param folderId - Folder ID
   * @param name - List name
   * @returns Created list
   */
  async createListInFolder(folderId: string, name: string): Promise<ClickUpList> {
    return this.request<ClickUpList>(`/folder/${folderId}/list`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Create a folderless list in a space.
   * @param spaceId - Space ID
   * @param name - List name
   * @returns Created list
   */
  async createFolderlessList(spaceId: string, name: string): Promise<ClickUpList> {
    return this.request<ClickUpList>(`/space/${spaceId}/list`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Get subtasks for a task.
   * @param taskId - Task ID
   * @returns List of subtasks
   */
  async getSubtasks(taskId: string): Promise<ClickUpTask[]> {
    const task = await this.request<ClickUpTask>(`/task/${taskId}?include_subtasks=true`);
    return task.subtasks || [];
  }

  /**
   * Create a subtask.
   * @param parentTaskId - Parent task ID
   * @param listId - List ID
   * @param input - Subtask creation input
   * @returns Created subtask
   */
  async createSubtask(
    parentTaskId: string,
    listId: string,
    input: CreateClickUpTaskInput
  ): Promise<ClickUpTask> {
    return this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify({ ...input, parent: parentTaskId }),
    });
  }

  /**
   * Get checklists for a task.
   * @param taskId - Task ID
   * @returns List of checklists
   */
  async getChecklists(taskId: string): Promise<ClickUpChecklist[]> {
    const task = await this.request<ClickUpTask>(`/task/${taskId}`);
    return task.checklists || [];
  }

  /**
   * Create a checklist.
   * @param taskId - Task ID
   * @param name - Checklist name
   * @returns Created checklist
   */
  async createChecklist(taskId: string, name: string): Promise<ClickUpChecklist> {
    const response = await this.request<{ checklist: ClickUpChecklist }>(
      `/task/${taskId}/checklist`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    );
    return response.checklist;
  }

  /**
   * Add an item to a checklist.
   * @param checklistId - Checklist ID
   * @param name - Item name
   * @returns Created checklist item
   */
  async addChecklistItem(
    checklistId: string,
    name: string
  ): Promise<{ checklist: ClickUpChecklist }> {
    return this.request<{ checklist: ClickUpChecklist }>(
      `/checklist/${checklistId}/checklist_item`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    );
  }

  /**
   * Get tags for a space.
   * @param spaceId - Space ID
   * @returns List of tags
   */
  async getTags(spaceId: string): Promise<ClickUpTag[]> {
    const response = await this.request<{ tags: ClickUpTag[] }>(`/space/${spaceId}/tag`);
    return response.tags;
  }

  /**
   * Add a tag to a task.
   * @param taskId - Task ID
   * @param tagName - Tag name
   */
  async addTag(taskId: string, tagName: string): Promise<void> {
    await this.request(`/task/${taskId}/tag/${encodeURIComponent(tagName)}`, {
      method: 'POST',
    });
  }

  /**
   * Remove a tag from a task.
   * @param taskId - Task ID
   * @param tagName - Tag name
   */
  async removeTag(taskId: string, tagName: string): Promise<void> {
    await this.request(`/task/${taskId}/tag/${encodeURIComponent(tagName)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get time entries for a task.
   * @param taskId - Task ID
   * @returns List of time entries
   */
  async getTimeEntries(taskId: string): Promise<Array<{
    id: string;
    start: string;
    end: string;
    duration: number;
    user: ClickUpUser;
    description?: string;
  }>> {
    const response = await this.request<{
      data: Array<{
        id: string;
        start: string;
        end: string;
        duration: string;
        user: ClickUpUser;
        description?: string;
      }>;
    }>(`/task/${taskId}/time`);
    return response.data.map((entry) => ({
      ...entry,
      duration: parseInt(entry.duration, 10),
    }));
  }

  /**
   * Get current user info.
   * @returns Current user
   */
  async getCurrentUser(): Promise<ClickUpUser> {
    const response = await this.request<{ user: ClickUpUser }>('/user');
    return response.user;
  }

  // ==================== Mapping Methods ====================

  /**
   * Map ClickUp task to universal TrackerTask.
   * @param task - ClickUp task
   * @returns Universal task
   */
  private mapTask(task: ClickUpTask): TrackerTask {
    return {
      id: task.id,
      key: task.custom_id || task.id,
      title: task.name,
      description: task.description || task.text_content || undefined,
      status: {
        id: task.status.id || task.status.status,
        name: task.status.status,
        category: this.mapStatusCategory(task.status.type || 'custom'),
        color: task.status.color,
      },
      priority: task.priority
        ? {
            id: task.priority.id || task.priority.priority || 'none',
            name: task.priority.priority || 'None',
            value: this.mapClickUpPriority(task.priority.priority),
          }
        : { id: 'none', name: 'None', value: 0 },
      assignee:
        task.assignees && task.assignees.length > 0
          ? this.mapUser(task.assignees[0])
          : undefined,
      createdAt: new Date(parseInt(task.date_created, 10)),
      updatedAt: task.date_updated
        ? new Date(parseInt(task.date_updated, 10))
        : undefined,
      dueDate: task.due_date
        ? new Date(parseInt(task.due_date, 10))
        : undefined,
      labels: task.tags?.map((t) => t.name) || [],
      url: task.url,
      projectId: task.space.id,
      parentId: task.parent || undefined,
      metadata: {
        provider: 'clickup',
        customId: task.custom_id,
        archived: task.archived,
        dateClosed: task.date_closed,
        dateDone: task.date_done,
        timeEstimate: task.time_estimate,
        timeSpent: task.time_spent,
        points: task.points,
        creator: task.creator,
        list: task.list,
        folder: task.folder,
        checklists: task.checklists,
        customFields: task.custom_fields,
      },
    };
  }

  /**
   * Map ClickUp space to universal TrackerProject.
   * @param space - ClickUp space
   * @returns Universal project
   */
  private mapSpace(space: ClickUpSpace): TrackerProject {
    return {
      id: space.id,
      key: space.id,
      name: space.name,
      metadata: {
        provider: 'clickup',
        isPrivate: space.private,
        color: space.color,
        archived: space.archived,
        multipleAssignees: space.multiple_assignees,
        features: space.features,
        statuses: space.statuses,
      },
    };
  }

  /**
   * Map ClickUp status to universal TrackerStatus.
   * @param status - ClickUp status
   * @param index - Position index
   * @returns Universal status
   */
  private mapStatus(
    status: ClickUpSpace['statuses'] extends Array<infer T> ? T : never,
    index: number
  ): TrackerStatus {
    return {
      id: (status as { id?: string }).id || (status as { status: string }).status,
      name: (status as { status: string }).status,
      category: this.mapStatusCategory((status as { type: string }).type),
      color: (status as { color: string }).color,
      position: index,
    };
  }

  /**
   * Map ClickUp user to universal TrackerUser.
   * @param user - ClickUp user
   * @returns Universal user
   */
  private mapUser(user: ClickUpUser): TrackerUser {
    return {
      id: String(user.id),
      name: user.username,
      email: user.email,
      avatarUrl: user.profilePicture || undefined,
    };
  }

  /**
   * Map ClickUp comment to universal TrackerComment.
   * @param comment - ClickUp comment
   * @returns Universal comment
   */
  private mapComment(comment: ClickUpComment): TrackerComment {
    return {
      id: comment.id,
      body: comment.comment_text,
      author: this.mapUser(comment.user),
      createdAt: new Date(parseInt(comment.date, 10)),
    };
  }

  /**
   * Map ClickUp status type to category.
   * @param type - ClickUp status type
   * @returns Status category
   */
  private mapStatusCategory(type?: string): 'todo' | 'in_progress' | 'done' | 'canceled' {
    switch (type) {
      case 'open':
        return 'todo';
      case 'closed':
      case 'done':
        return 'done';
      case 'custom':
      default:
        return 'in_progress';
    }
  }

  /**
   * Map ClickUp priority to numeric value.
   * @param priority - ClickUp priority name
   * @returns Numeric value
   */
  private mapClickUpPriority(priority: string | null): number {
    if (!priority) return 0;
    switch (priority.toLowerCase()) {
      case 'urgent':
        return 4;
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }

  /**
   * Map universal priority to ClickUp priority.
   * @param priority - Universal priority (0-4)
   * @returns ClickUp priority (1-4) or null
   */
  private mapPriorityToClickUp(priority: number): number | null {
    if (priority <= 0) return null;
    // Universal: 1=low, 2=medium, 3=high, 4=urgent
    // ClickUp: 1=urgent, 2=high, 3=normal, 4=low
    const mapping: Record<number, number> = {
      1: 4, // low
      2: 3, // normal
      3: 2, // high
      4: 1, // urgent
    };
    return mapping[priority] || null;
  }

  /**
   * Create a ClickUp client from environment variables.
   * @param organizationId - AgentForge organization ID
   * @param integrationId - AgentForge integration ID
   * @returns ClickUp client instance
   */
  static fromEnv(organizationId: string, integrationId: string): ClickUpClient {
    const accessToken = process.env.CLICKUP_ACCESS_TOKEN;
    const teamId = process.env.CLICKUP_TEAM_ID;

    if (!accessToken) {
      throw new Error('CLICKUP_ACCESS_TOKEN environment variable is required');
    }

    return new ClickUpClient({
      organizationId,
      integrationId,
      auth: {
        type: 'oauth2',
        accessToken,
      },
      teamId,
    });
  }
}
