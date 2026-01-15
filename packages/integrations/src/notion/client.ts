/**
 * @fileoverview Notion REST API client.
 * Implements the Notion API for database, page, and block management.
 * @packageDocumentation
 */

import { createLogger } from '@relay/logger';
import {
  BaseTrackerClient,
  type TrackerClientConfig,
  type TrackerTask,
  type TrackerProject,
  type TrackerComment,
  type TrackerUser,
  type PaginatedResult,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@agentforge/tracker-common';
import type {
  NotionDatabase,
  NotionPage,
  NotionBlock,
  NotionComment,
  NotionUser,
  NotionRichText,
  NotionDatabaseFilter,
  NotionDatabaseSort,
  CreateNotionPageInput,
  UpdateNotionPageInput,
} from './types';

const logger = createLogger('notion-client');

/**
 * Notion client configuration.
 */
export interface NotionClientConfig extends TrackerClientConfig {
  /** Notion API version (default: 2022-06-28) */
  notionVersion?: string;
}

/**
 * Notion REST API client.
 *
 * Implements the Notion API for managing databases, pages, and blocks.
 *
 * @example
 * ```typescript
 * const client = new NotionClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: {
 *     type: 'oauth2',
 *     accessToken: process.env.NOTION_ACCESS_TOKEN,
 *   },
 * });
 *
 * const { items: databases } = await client.listProjects();
 * const { items: pages } = await client.listTasks('database-id');
 * ```
 */
export class NotionClient extends BaseTrackerClient {
  private notionVersion: string;

  /** Base URL for Notion API */
  private static readonly BASE_URL = 'https://api.notion.com/v1';

  /**
   * Creates a new Notion client.
   * @param config - Client configuration
   */
  constructor(config: NotionClientConfig) {
    super(config);
    this.notionVersion = config.notionVersion || '2022-06-28';
  }

  /**
   * Make an authenticated API request.
   * @param endpoint - API endpoint
   * @param options - Fetch options
   * @returns Response data
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${NotionClient.BASE_URL}${endpoint}`;

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.auth.accessToken}`);
    headers.set('Content-Type', 'application/json');
    headers.set('Notion-Version', this.notionVersion);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('API request failed', {
        url,
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Test the API connection.
   * @returns Connection test result
   */
  async testConnection(): Promise<{ success: boolean; user?: TrackerUser }> {
    try {
      const me = await this.getCurrentUser();
      return {
        success: true,
        user: this.mapNotionUserToUser(me),
      };
    } catch (error) {
      logger.error('Connection test failed', { error });
      return { success: false };
    }
  }

  /**
   * Get current bot user.
   * @returns Current bot user
   */
  async getCurrentUser(): Promise<NotionUser> {
    return this.request<NotionUser>('/users/me');
  }

  /**
   * List all users.
   * @param cursor - Pagination cursor
   * @returns List of users
   */
  async listUsers(cursor?: string): Promise<{
    results: NotionUser[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (cursor) params.set('start_cursor', cursor);

    const response = await this.request<{
      results: NotionUser[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/users?${params}`);

    return {
      results: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Get a user by ID.
   * @param userId - User ID
   * @returns User
   */
  async getUser(userId: string): Promise<NotionUser> {
    return this.request<NotionUser>(`/users/${userId}`);
  }

  /**
   * Search across all content.
   * @param query - Search query
   * @param options - Search options
   * @returns Search results
   */
  async search(
    query?: string,
    options?: {
      filter?: { property: 'object'; value: 'page' | 'database' };
      sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
      cursor?: string;
      pageSize?: number;
    }
  ): Promise<{
    results: (NotionPage | NotionDatabase)[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const body: Record<string, unknown> = {};
    if (query) body.query = query;
    if (options?.filter) body.filter = options.filter;
    if (options?.sort) body.sort = options.sort;
    if (options?.cursor) body.start_cursor = options.cursor;
    if (options?.pageSize) body.page_size = options.pageSize;

    const response = await this.request<{
      results: (NotionPage | NotionDatabase)[];
      next_cursor: string | null;
      has_more: boolean;
    }>('/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      results: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * List databases (projects).
   * @returns Paginated list of databases
   */
  async listProjects(): Promise<PaginatedResult<TrackerProject>> {
    const { results, hasMore } = await this.search(undefined, {
      filter: { property: 'object', value: 'database' },
    });

    const databases = results.filter(
      (r): r is NotionDatabase => r.object === 'database'
    );

    return {
      items: databases.map((d) => this.mapDatabaseToProject(d)),
      hasMore,
    };
  }

  /**
   * Get a database by ID.
   * @param databaseId - Database ID
   * @returns Database as project
   */
  async getProject(databaseId: string): Promise<TrackerProject> {
    const database = await this.getDatabase(databaseId);
    return this.mapDatabaseToProject(database);
  }

  /**
   * Get a database.
   * @param databaseId - Database ID
   * @returns Database
   */
  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.request<NotionDatabase>(`/databases/${databaseId}`);
  }

  /**
   * Query a database.
   * @param databaseId - Database ID
   * @param options - Query options
   * @returns Query results
   */
  async queryDatabase(
    databaseId: string,
    options?: {
      filter?: NotionDatabaseFilter;
      sorts?: NotionDatabaseSort[];
      cursor?: string;
      pageSize?: number;
    }
  ): Promise<{
    results: NotionPage[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const body: Record<string, unknown> = {};
    if (options?.filter) body.filter = options.filter;
    if (options?.sorts) body.sorts = options.sorts;
    if (options?.cursor) body.start_cursor = options.cursor;
    if (options?.pageSize) body.page_size = options.pageSize;

    const response = await this.request<{
      results: NotionPage[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      results: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Create a database.
   * @param parentPageId - Parent page ID
   * @param title - Database title
   * @param properties - Database properties schema
   * @returns Created database
   */
  async createDatabase(
    parentPageId: string,
    title: string,
    properties: Record<string, unknown>
  ): Promise<NotionDatabase> {
    return this.request<NotionDatabase>('/databases', {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: title } }],
        properties,
      }),
    });
  }

  /**
   * Update a database.
   * @param databaseId - Database ID
   * @param updates - Updates to apply
   * @returns Updated database
   */
  async updateDatabase(
    databaseId: string,
    updates: {
      title?: string;
      description?: string;
      properties?: Record<string, unknown>;
    }
  ): Promise<NotionDatabase> {
    const body: Record<string, unknown> = {};
    if (updates.title) {
      body.title = [{ type: 'text', text: { content: updates.title } }];
    }
    if (updates.description) {
      body.description = [{ type: 'text', text: { content: updates.description } }];
    }
    if (updates.properties) {
      body.properties = updates.properties;
    }

    return this.request<NotionDatabase>(`/databases/${databaseId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * Get project statuses from a database.
   * @param databaseId - Database ID
   * @returns List of statuses
   */
  async getProjectStatuses(
    databaseId: string
  ): Promise<Array<{ id: string; name: string; category: string }>> {
    const database = await this.getDatabase(databaseId);

    // Find status property
    const statusProp = Object.values(database.properties).find(
      (p) => p.type === 'status'
    );

    if (!statusProp?.status) {
      return [];
    }

    return statusProp.status.options.map((opt) => {
      // Map Notion status groups to categories
      const group = statusProp.status!.groups.find((g) =>
        g.option_ids.includes(opt.id)
      );
      let category = 'todo';
      if (group) {
        if (group.name === 'To-do') category = 'todo';
        else if (group.name === 'In progress') category = 'in_progress';
        else if (group.name === 'Complete') category = 'done';
      }

      return {
        id: opt.id,
        name: opt.name,
        category,
      };
    });
  }

  /**
   * Get project members.
   * Notion doesn't have project-specific members, so return all users.
   * @returns List of users
   */
  async getProjectMembers(): Promise<TrackerUser[]> {
    const { results } = await this.listUsers();
    return results.map((u) => this.mapNotionUserToUser(u));
  }

  /**
   * List pages (tasks) in a database.
   * @param databaseId - Database ID
   * @param options - Query options
   * @returns Paginated list of tasks
   */
  async listTasks(
    databaseId: string,
    options?: {
      filter?: NotionDatabaseFilter;
      sorts?: NotionDatabaseSort[];
      cursor?: string;
      pageSize?: number;
    }
  ): Promise<PaginatedResult<TrackerTask>> {
    const { results, nextCursor, hasMore } = await this.queryDatabase(
      databaseId,
      options
    );

    return {
      items: results.map((p) => this.mapPageToTask(p)),
      hasMore,
      cursor: nextCursor || undefined,
    };
  }

  /**
   * Get a page by ID.
   * @param pageId - Page ID
   * @returns Page as task
   */
  async getTask(pageId: string): Promise<TrackerTask> {
    const page = await this.getPage(pageId);
    return this.mapPageToTask(page);
  }

  /**
   * Get a page.
   * @param pageId - Page ID
   * @returns Page
   */
  async getPage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>(`/pages/${pageId}`);
  }

  /**
   * Create a page in a database.
   * @param databaseId - Database ID
   * @param input - Task input
   * @returns Created task
   */
  async createTask(
    databaseId: string,
    input: CreateTaskInput
  ): Promise<TrackerTask> {
    const database = await this.getDatabase(databaseId);
    const properties = this.buildProperties(database, input);

    const page = await this.createPage(databaseId, { properties });
    return this.mapPageToTask(page);
  }

  /**
   * Create a page.
   * @param databaseId - Database ID
   * @param input - Page input
   * @returns Created page
   */
  async createPage(
    databaseId: string,
    input: CreateNotionPageInput
  ): Promise<NotionPage> {
    const body: Record<string, unknown> = {
      parent: { type: 'database_id', database_id: databaseId },
      properties: input.properties,
    };
    if (input.children) body.children = input.children;
    if (input.icon) body.icon = input.icon;
    if (input.cover) body.cover = input.cover;

    return this.request<NotionPage>('/pages', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update a page.
   * @param pageId - Page ID
   * @param input - Update input
   * @returns Updated task
   */
  async updateTask(pageId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    // Get the page to find its database
    const existingPage = await this.getPage(pageId);
    const databaseId = existingPage.parent.database_id;

    if (!databaseId) {
      throw new Error('Page is not in a database');
    }

    const database = await this.getDatabase(databaseId);
    const properties = this.buildProperties(database, input);

    const page = await this.updatePage(pageId, { properties });
    return this.mapPageToTask(page);
  }

  /**
   * Update a page.
   * @param pageId - Page ID
   * @param input - Page update input
   * @returns Updated page
   */
  async updatePage(
    pageId: string,
    input: UpdateNotionPageInput
  ): Promise<NotionPage> {
    return this.request<NotionPage>(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  /**
   * Archive a page (delete task).
   * @param pageId - Page ID
   */
  async deleteTask(pageId: string): Promise<void> {
    await this.updatePage(pageId, { archived: true });
  }

  /**
   * Get blocks (content) of a page.
   * @param pageId - Page or block ID
   * @param cursor - Pagination cursor
   * @returns List of blocks
   */
  async getBlocks(
    pageId: string,
    cursor?: string
  ): Promise<{
    results: NotionBlock[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (cursor) params.set('start_cursor', cursor);

    const response = await this.request<{
      results: NotionBlock[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/blocks/${pageId}/children?${params}`);

    return {
      results: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Append blocks to a page.
   * @param pageId - Page or block ID
   * @param children - Blocks to append
   * @returns Appended blocks
   */
  async appendBlocks(
    pageId: string,
    children: unknown[]
  ): Promise<NotionBlock[]> {
    const response = await this.request<{
      results: NotionBlock[];
    }>(`/blocks/${pageId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children }),
    });

    return response.results;
  }

  /**
   * List comments on a page.
   * @param pageId - Page ID
   * @param cursor - Pagination cursor
   * @returns List of comments
   */
  async listComments(
    pageId: string,
    cursor?: string
  ): Promise<TrackerComment[]> {
    const params = new URLSearchParams();
    params.set('block_id', pageId);
    if (cursor) params.set('start_cursor', cursor);

    const response = await this.request<{
      results: NotionComment[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/comments?${params}`);

    return response.results.map((c) => this.mapCommentToTrackerComment(c));
  }

  /**
   * Add a comment to a page.
   * @param pageId - Page ID
   * @param body - Comment body
   * @returns Created comment
   */
  async addComment(pageId: string, body: string): Promise<TrackerComment> {
    const comment = await this.request<NotionComment>('/comments', {
      method: 'POST',
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [{ type: 'text', text: { content: body } }],
      }),
    });

    return this.mapCommentToTrackerComment(comment);
  }

  /**
   * Search for pages (tasks).
   * @param query - Search query
   * @returns Search results
   */
  async searchTasks(query: string): Promise<PaginatedResult<TrackerTask>> {
    const { results, hasMore } = await this.search(query, {
      filter: { property: 'object', value: 'page' },
    });

    const pages = results.filter((r): r is NotionPage => r.object === 'page');

    return {
      items: pages.map((p) => this.mapPageToTask(p)),
      hasMore,
    };
  }

  /**
   * Build Notion properties from task input.
   * @param database - Database schema
   * @param input - Task input
   * @returns Notion properties
   */
  private buildProperties(
    database: NotionDatabase,
    input: Partial<CreateTaskInput & UpdateTaskInput>
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    // Find title property
    const titleProp = Object.entries(database.properties).find(
      ([, p]) => p.type === 'title'
    );
    if (titleProp && input.title) {
      properties[titleProp[0]] = {
        title: [{ type: 'text', text: { content: input.title } }],
      };
    }

    // Find status property
    const statusProp = Object.entries(database.properties).find(
      ([, p]) => p.type === 'status'
    );
    if (statusProp && input.status) {
      properties[statusProp[0]] = {
        status: { name: input.status },
      };
    }

    // Find date property
    const dateProp = Object.entries(database.properties).find(
      ([, p]) => p.type === 'date'
    );
    if (dateProp && input.dueDate) {
      properties[dateProp[0]] = {
        date: { start: input.dueDate.toISOString().split('T')[0] },
      };
    }

    // Find people property for assignees
    const peopleProp = Object.entries(database.properties).find(
      ([, p]) => p.type === 'people'
    );
    if (peopleProp && input.assigneeIds) {
      properties[peopleProp[0]] = {
        people: input.assigneeIds.map((id) => ({ id })),
      };
    }

    return properties;
  }

  /**
   * Extract plain text from rich text array.
   * @param richText - Rich text array
   * @returns Plain text string
   */
  private extractPlainText(richText: NotionRichText[] | undefined): string {
    if (!richText) return '';
    return richText.map((rt) => rt.plain_text).join('');
  }

  /**
   * Map a Notion database to TrackerProject.
   * @param database - Notion database
   * @returns TrackerProject
   */
  private mapDatabaseToProject(database: NotionDatabase): TrackerProject {
    return {
      id: database.id,
      name: this.extractPlainText(database.title),
      description: this.extractPlainText(database.description) || undefined,
      url: database.url,
      createdAt: new Date(database.created_time),
      updatedAt: new Date(database.last_edited_time),
    };
  }

  /**
   * Map a Notion page to TrackerTask.
   * @param page - Notion page
   * @returns TrackerTask
   */
  private mapPageToTask(page: NotionPage): TrackerTask {
    // Find title
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === 'title'
    );
    const title = titleProp?.title
      ? this.extractPlainText(titleProp.title)
      : 'Untitled';

    // Find status
    const statusProp = Object.values(page.properties).find(
      (p) => p.type === 'status'
    );
    let status: TrackerTask['status'] = {
      id: 'none',
      name: 'No Status',
      category: 'todo',
    };
    if (statusProp?.status) {
      status = {
        id: statusProp.status.id,
        name: statusProp.status.name,
        category: this.mapStatusCategory(statusProp.status.name),
      };
    }

    // Find date
    const dateProp = Object.values(page.properties).find(
      (p) => p.type === 'date'
    );
    const dueDate = dateProp?.date?.start
      ? new Date(dateProp.date.start)
      : undefined;

    // Find assignees
    const peopleProp = Object.values(page.properties).find(
      (p) => p.type === 'people'
    );
    const assignees = peopleProp?.people
      ? peopleProp.people.map((u) => this.mapNotionUserToUser(u))
      : [];

    return {
      id: page.id,
      title,
      status,
      assignees,
      dueDate,
      url: page.url,
      createdAt: new Date(page.created_time),
      updatedAt: new Date(page.last_edited_time),
      createdBy: this.mapNotionUserToUser(page.created_by),
      projectId: page.parent.database_id || undefined,
    };
  }

  /**
   * Map a Notion comment to TrackerComment.
   * @param comment - Notion comment
   * @returns TrackerComment
   */
  private mapCommentToTrackerComment(comment: NotionComment): TrackerComment {
    return {
      id: comment.id,
      body: this.extractPlainText(comment.rich_text),
      author: this.mapNotionUserToUser(comment.created_by),
      createdAt: new Date(comment.created_time),
    };
  }

  /**
   * Map a Notion user to TrackerUser.
   * @param user - Notion user
   * @returns TrackerUser
   */
  private mapNotionUserToUser(user: NotionUser): TrackerUser {
    return {
      id: user.id,
      name: user.name || 'Unknown',
      email: user.person?.email,
      avatarUrl: user.avatar_url || undefined,
    };
  }

  /**
   * Map status name to category.
   * @param statusName - Status name
   * @returns Status category
   */
  private mapStatusCategory(statusName: string): string {
    const lower = statusName.toLowerCase();
    if (lower.includes('done') || lower.includes('complete')) {
      return 'done';
    }
    if (
      lower.includes('progress') ||
      lower.includes('doing') ||
      lower.includes('active')
    ) {
      return 'in_progress';
    }
    return 'todo';
  }
}
