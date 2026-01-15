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
  ComplexityTracker,
  RateLimiter,
} from '@agentforge/tracker-common';
import type {
  MondayItem,
  MondayBoard,
  MondayUpdate,
  MondayUser,
  MondayGroup,
  MondayWorkspace,
  MondayColumn,
  MondayColumnValue,
  MondayAccount,
  MondayListItemsOptions,
  MondayListBoardsOptions,
  MondayGraphQLResponse,
} from './types';
import { QUERIES, MUTATIONS } from './queries';

/**
 * @fileoverview Monday.com GraphQL API client implementation.
 * Provides full access to Monday.com's board and item management features.
 * @packageDocumentation
 */

const logger = createLogger('monday-client');

/**
 * Monday.com client configuration options.
 */
export interface MondayClientConfig extends TrackerClientConfig {
  /** Workspace ID (optional) */
  workspaceId?: number;
  /** Default column IDs to fetch */
  defaultColumnIds?: string[];
}

/**
 * Monday.com GraphQL API client.
 * Implements the BaseTrackerClient interface for Monday.com task management.
 *
 * @example
 * ```typescript
 * const client = new MondayClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: {
 *     type: 'oauth2',
 *     accessToken: process.env.MONDAY_ACCESS_TOKEN,
 *   },
 * });
 *
 * // List boards
 * const { items: boards } = await client.listProjects();
 *
 * // Create an item
 * const item = await client.createTask('board-id', {
 *   title: 'New item',
 *   description: 'Item description',
 * });
 * ```
 */
export class MondayClient extends BaseTrackerClient {
  private config: MondayClientConfig;
  private rateLimiter: RateLimiter;
  private complexityTracker: ComplexityTracker;

  /** Monday.com API endpoint */
  private static readonly API_URL = 'https://api.monday.com/v2';

  /**
   * Creates a new Monday.com client.
   * @param config - Client configuration
   */
  constructor(config: MondayClientConfig) {
    super(config);
    this.config = config;
    this.rateLimiter = RateLimiter.forTracker('monday');
    this.complexityTracker = new ComplexityTracker(10000000); // 10M points per minute
  }

  /**
   * Execute a GraphQL query or mutation.
   * @param query - GraphQL query string
   * @param variables - Query variables
   * @returns GraphQL response
   */
  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<MondayGraphQLResponse<T>> {
    await this.rateLimiter.acquire();

    const response = await fetch(MondayClient.API_URL, {
      method: 'POST',
      headers: {
        Authorization: this.config.auth.accessToken,
        'Content-Type': 'application/json',
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Monday.com API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as MondayGraphQLResponse<T>;

    // Track complexity
    if (result.complexity) {
      this.complexityTracker.recordUsage(result.complexity.before - result.complexity.after);
    }

    // Handle GraphQL errors
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message).join(', ');
      logger.error('GraphQL errors', { errors: result.errors });
      throw new Error(`GraphQL error: ${errorMessages}`);
    }

    return result;
  }

  /**
   * Test the API connection.
   * @returns Connection status and user info
   */
  async testConnection(): Promise<{ success: boolean; user?: TrackerUser; error?: string }> {
    try {
      const response = await this.graphql<{ me: MondayUser }>(QUERIES.ME);
      return {
        success: true,
        user: this.mapUser(response.data.me),
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
   * Note: Monday.com tokens expire in 5 minutes. Refresh should be handled by OAuth flow.
   * @returns New auth configuration
   */
  async refreshTokens(): Promise<TrackerAuthConfig> {
    throw new Error('Token refresh should be handled by MondayOAuthFlow');
  }

  /**
   * List all boards (projects).
   * @param options - List options
   * @returns Paginated list of boards
   */
  async listProjects(options?: MondayListBoardsOptions): Promise<PaginatedResult<TrackerProject>> {
    const variables: Record<string, unknown> = {
      limit: options?.limit || 50,
      page: options?.cursor ? parseInt(options.cursor, 10) : 1,
    };

    if (options?.state) {
      variables.state = options.state;
    }
    if (options?.workspaceId) {
      variables.workspace_ids = [options.workspaceId];
    }
    if (options?.boardKind) {
      variables.board_kind = options.boardKind;
    }

    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARDS, variables);

    const items = response.data.boards.map((b) => this.mapBoard(b));
    const currentPage = options?.cursor ? parseInt(options.cursor, 10) : 1;

    return {
      items,
      nextCursor: items.length === (options?.limit || 50) ? String(currentPage + 1) : undefined,
      hasMore: items.length === (options?.limit || 50),
    };
  }

  /**
   * Get a board by ID.
   * @param boardId - Board ID
   * @returns Board details
   */
  async getProject(boardId: string): Promise<TrackerProject> {
    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARD, {
      ids: [boardId],
    });

    if (!response.data.boards || response.data.boards.length === 0) {
      throw new Error(`Board not found: ${boardId}`);
    }

    return this.mapBoard(response.data.boards[0]);
  }

  /**
   * Get board groups (statuses).
   * @param boardId - Board ID
   * @returns List of groups as statuses
   */
  async getProjectStatuses(boardId: string): Promise<TrackerStatus[]> {
    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARD, {
      ids: [boardId],
    });

    if (!response.data.boards || response.data.boards.length === 0) {
      throw new Error(`Board not found: ${boardId}`);
    }

    const groups = response.data.boards[0].groups || [];
    return groups.map((g, index) => this.mapGroupToStatus(g, index));
  }

  /**
   * Get board members.
   * @param boardId - Board ID
   * @returns List of board subscribers
   */
  async getProjectMembers(boardId: string): Promise<TrackerUser[]> {
    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARD, {
      ids: [boardId],
    });

    if (!response.data.boards || response.data.boards.length === 0) {
      throw new Error(`Board not found: ${boardId}`);
    }

    const board = response.data.boards[0];
    const members = [...(board.owners || []), ...(board.subscribers || [])];

    // Deduplicate by ID
    const seen = new Set<number>();
    return members
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => this.mapUser(m));
  }

  /**
   * List items in a board.
   * @param boardId - Board ID
   * @param options - List options
   * @returns Paginated list of items
   */
  async listTasks(
    boardId: string,
    options?: MondayListItemsOptions
  ): Promise<PaginatedResult<TrackerTask>> {
    const variables: Record<string, unknown> = {
      board_id: boardId,
      limit: options?.limit || 50,
    };

    if (options?.cursor) {
      variables.cursor = options.cursor;
    }
    if (options?.groupId) {
      variables.group_id = options.groupId;
    }
    if (options?.columnIds) {
      variables.column_ids = options.columnIds;
    }

    const response = await this.graphql<{
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: MondayItem[];
        };
      }>;
    }>(QUERIES.ITEMS, variables);

    const itemsPage = response.data.boards[0]?.items_page;
    const items = itemsPage?.items || [];

    return {
      items: items.map((i) => this.mapItem(i)),
      nextCursor: itemsPage?.cursor || undefined,
      hasMore: !!itemsPage?.cursor,
    };
  }

  /**
   * Get an item by ID.
   * @param itemId - Item ID
   * @returns Item details
   */
  async getTask(itemId: string): Promise<TrackerTask> {
    const response = await this.graphql<{ items: MondayItem[] }>(QUERIES.ITEM, {
      ids: [itemId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Item not found: ${itemId}`);
    }

    return this.mapItem(response.data.items[0]);
  }

  /**
   * Create a new item.
   * @param boardId - Board ID
   * @param input - Item creation input
   * @returns Created item
   */
  async createTask(boardId: string, input: CreateTaskInput): Promise<TrackerTask> {
    const columnValues: Record<string, unknown> = {};

    // Map description to long_text column if available
    if (input.description) {
      columnValues.text = input.description;
    }

    // Map due date
    if (input.dueDate) {
      columnValues.date = { date: input.dueDate.toISOString().split('T')[0] };
    }

    // Map assignees to people column
    if (input.assigneeIds && input.assigneeIds.length > 0) {
      columnValues.people = {
        personsAndTeams: input.assigneeIds.map((id) => ({
          id: parseInt(id, 10),
          kind: 'person',
        })),
      };
    }

    const variables: Record<string, unknown> = {
      board_id: boardId,
      item_name: input.title,
      column_values: Object.keys(columnValues).length > 0 ? JSON.stringify(columnValues) : undefined,
    };

    // If status is provided as groupId
    if (input.status) {
      variables.group_id = input.status;
    }

    const response = await this.graphql<{ create_item: MondayItem }>(
      MUTATIONS.CREATE_ITEM,
      variables
    );

    return this.mapItem(response.data.create_item);
  }

  /**
   * Update an item.
   * @param itemId - Item ID
   * @param input - Item update input
   * @returns Updated item
   */
  async updateTask(itemId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    // First get the item to find its board
    const itemResponse = await this.graphql<{ items: MondayItem[] }>(QUERIES.ITEM, {
      ids: [itemId],
    });

    if (!itemResponse.data.items || itemResponse.data.items.length === 0) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const item = itemResponse.data.items[0];
    const boardId = item.board?.id;

    if (!boardId) {
      throw new Error('Item board not found');
    }

    // Update name if provided
    if (input.title) {
      await this.graphql(MUTATIONS.UPDATE_ITEM_NAME, {
        board_id: boardId,
        item_id: itemId,
        value: input.title,
      });
    }

    // Build column values update
    const columnValues: Record<string, unknown> = {};

    if (input.description) {
      columnValues.text = input.description;
    }

    if (input.dueDate) {
      columnValues.date = { date: input.dueDate.toISOString().split('T')[0] };
    }

    if (input.assigneeIds) {
      if (input.assigneeIds.length === 0) {
        columnValues.people = { personsAndTeams: [] };
      } else {
        columnValues.people = {
          personsAndTeams: input.assigneeIds.map((id) => ({
            id: parseInt(id, 10),
            kind: 'person',
          })),
        };
      }
    }

    // Update column values if any
    if (Object.keys(columnValues).length > 0) {
      await this.graphql(MUTATIONS.UPDATE_COLUMN_VALUES, {
        board_id: boardId,
        item_id: itemId,
        column_values: JSON.stringify(columnValues),
      });
    }

    // Move to different group if status changed
    if (input.status && input.status !== item.group?.id) {
      await this.graphql(MUTATIONS.MOVE_ITEM_TO_GROUP, {
        item_id: itemId,
        group_id: input.status,
      });
    }

    // Fetch and return updated item
    return this.getTask(itemId);
  }

  /**
   * Delete an item.
   * @param itemId - Item ID
   */
  async deleteTask(itemId: string): Promise<void> {
    await this.graphql(MUTATIONS.DELETE_ITEM, { item_id: itemId });
  }

  /**
   * List updates (comments) on an item.
   * @param itemId - Item ID
   * @returns List of updates
   */
  async listComments(itemId: string): Promise<TrackerComment[]> {
    const response = await this.graphql<{
      items: Array<{ updates: MondayUpdate[] }>;
    }>(QUERIES.UPDATES, {
      item_id: itemId,
      limit: 100,
    });

    const updates = response.data.items[0]?.updates || [];
    return updates.map((u) => this.mapUpdate(u));
  }

  /**
   * Add an update (comment) to an item.
   * @param itemId - Item ID
   * @param body - Comment text
   * @returns Created update
   */
  async addComment(itemId: string, body: string): Promise<TrackerComment> {
    const response = await this.graphql<{ create_update: MondayUpdate }>(MUTATIONS.CREATE_UPDATE, {
      item_id: itemId,
      body,
    });

    return this.mapUpdate(response.data.create_update);
  }

  /**
   * Search for items by text.
   * Note: Monday.com search is limited. This searches by item name.
   * @param query - Search query
   * @returns Search results
   */
  async searchTasks(query: string): Promise<PaginatedResult<TrackerTask>> {
    // Monday.com doesn't have a great search API
    // We'll list boards and search within each
    const boardsResponse = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARDS, {
      limit: 10,
    });

    const allItems: TrackerTask[] = [];

    for (const board of boardsResponse.data.boards) {
      const itemsResponse = await this.graphql<{
        boards: Array<{
          items_page: {
            items: MondayItem[];
          };
        }>;
      }>(QUERIES.ITEMS, {
        board_id: board.id,
        limit: 100,
      });

      const items = itemsResponse.data.boards[0]?.items_page?.items || [];
      const matchingItems = items.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      );

      allItems.push(...matchingItems.map((i) => this.mapItem(i)));
    }

    return {
      items: allItems.slice(0, 50),
      hasMore: allItems.length > 50,
    };
  }

  // ==================== Monday-Specific Methods ====================

  /**
   * Get workspaces.
   * @returns List of workspaces
   */
  async getWorkspaces(): Promise<MondayWorkspace[]> {
    const response = await this.graphql<{ workspaces: MondayWorkspace[] }>(QUERIES.WORKSPACES, {
      limit: 100,
    });
    return response.data.workspaces;
  }

  /**
   * Get account info.
   * @returns Account details
   */
  async getAccount(): Promise<MondayAccount> {
    const response = await this.graphql<{ account: MondayAccount }>(QUERIES.ACCOUNT);
    return response.data.account;
  }

  /**
   * Get board columns.
   * @param boardId - Board ID
   * @returns List of columns
   */
  async getColumns(boardId: string): Promise<MondayColumn[]> {
    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARD, {
      ids: [boardId],
    });

    return response.data.boards[0]?.columns || [];
  }

  /**
   * Get board groups.
   * @param boardId - Board ID
   * @returns List of groups
   */
  async getGroups(boardId: string): Promise<MondayGroup[]> {
    const response = await this.graphql<{ boards: MondayBoard[] }>(QUERIES.BOARD, {
      ids: [boardId],
    });

    return response.data.boards[0]?.groups || [];
  }

  /**
   * Create a group in a board.
   * @param boardId - Board ID
   * @param name - Group name
   * @returns Created group
   */
  async createGroup(boardId: string, name: string): Promise<MondayGroup> {
    const response = await this.graphql<{ create_group: MondayGroup }>(MUTATIONS.CREATE_GROUP, {
      board_id: boardId,
      group_name: name,
    });
    return response.data.create_group;
  }

  /**
   * Move an item to a different group.
   * @param itemId - Item ID
   * @param groupId - Target group ID
   * @returns Updated item
   */
  async moveItemToGroup(itemId: string, groupId: string): Promise<MondayItem> {
    const response = await this.graphql<{ move_item_to_group: MondayItem }>(
      MUTATIONS.MOVE_ITEM_TO_GROUP,
      {
        item_id: itemId,
        group_id: groupId,
      }
    );
    return response.data.move_item_to_group;
  }

  /**
   * Move an item to a different board.
   * @param itemId - Item ID
   * @param targetBoardId - Target board ID
   * @param groupId - Target group ID (optional)
   * @returns Updated item
   */
  async moveItemToBoard(itemId: string, targetBoardId: string, groupId?: string): Promise<MondayItem> {
    const response = await this.graphql<{ move_item_to_board: MondayItem }>(
      MUTATIONS.MOVE_ITEM_TO_BOARD,
      {
        item_id: itemId,
        board_id: targetBoardId,
        group_id: groupId,
      }
    );
    return response.data.move_item_to_board;
  }

  /**
   * Archive an item.
   * @param itemId - Item ID
   */
  async archiveItem(itemId: string): Promise<void> {
    await this.graphql(MUTATIONS.ARCHIVE_ITEM, { item_id: itemId });
  }

  /**
   * Create a subitem.
   * @param parentItemId - Parent item ID
   * @param name - Subitem name
   * @param columnValues - Column values as JSON string
   * @returns Created subitem
   */
  async createSubitem(
    parentItemId: string,
    name: string,
    columnValues?: string
  ): Promise<MondayItem> {
    const response = await this.graphql<{ create_subitem: MondayItem }>(MUTATIONS.CREATE_SUBITEM, {
      parent_item_id: parentItemId,
      item_name: name,
      column_values: columnValues,
    });
    return response.data.create_subitem;
  }

  /**
   * Update a column value.
   * @param boardId - Board ID
   * @param itemId - Item ID
   * @param columnId - Column ID
   * @param value - New value (as JSON)
   */
  async updateColumnValue(
    boardId: string,
    itemId: string,
    columnId: string,
    value: unknown
  ): Promise<void> {
    await this.graphql(MUTATIONS.UPDATE_COLUMN_VALUE, {
      board_id: boardId,
      item_id: itemId,
      column_id: columnId,
      value: JSON.stringify(value),
    });
  }

  /**
   * Get the current complexity budget.
   * @returns Complexity info
   */
  async getComplexity(): Promise<{ before: number; after: number; resetInSeconds?: number }> {
    const response = await this.graphql<{
      complexity: { before: number; after: number; reset_in_x_seconds?: number };
    }>(QUERIES.COMPLEXITY);
    return {
      before: response.data.complexity.before,
      after: response.data.complexity.after,
      resetInSeconds: response.data.complexity.reset_in_x_seconds,
    };
  }

  // ==================== Mapping Methods ====================

  /**
   * Map Monday.com item to universal TrackerTask.
   * @param item - Monday.com item
   * @returns Universal task
   */
  private mapItem(item: MondayItem): TrackerTask {
    const columnValues = item.column_values || [];
    const statusColumn = columnValues.find((cv) => cv.type === 'status' || cv.id === 'status');
    const dateColumn = columnValues.find((cv) => cv.type === 'date' || cv.id === 'date');
    const peopleColumn = columnValues.find((cv) => cv.type === 'people' || cv.id === 'person');
    const textColumn = columnValues.find((cv) => cv.type === 'long_text' || cv.id === 'text');

    return {
      id: item.id,
      key: item.id,
      title: item.name,
      description: textColumn?.text || undefined,
      status: item.group
        ? {
            id: item.group.id,
            name: item.group.title,
            category: this.inferStatusCategory(item.group.title, item.state),
          }
        : {
            id: 'unknown',
            name: 'Unknown',
            category: 'todo',
          },
      priority: this.extractPriority(columnValues),
      assignee: this.extractAssignee(peopleColumn),
      createdAt: item.created_at ? new Date(item.created_at) : new Date(),
      updatedAt: item.updated_at ? new Date(item.updated_at) : undefined,
      dueDate: dateColumn?.text ? new Date(dateColumn.text) : undefined,
      labels: this.extractLabels(columnValues),
      url: item.url,
      projectId: item.board?.id,
      parentId: item.parent_item?.id,
      metadata: {
        provider: 'monday',
        state: item.state,
        relativeLink: item.relative_link,
        columnValues: item.column_values,
        subitems: item.subitems?.map((s) => ({ id: s.id, name: s.name })),
      },
    };
  }

  /**
   * Map Monday.com board to universal TrackerProject.
   * @param board - Monday.com board
   * @returns Universal project
   */
  private mapBoard(board: MondayBoard): TrackerProject {
    return {
      id: board.id,
      key: board.id,
      name: board.name,
      description: board.description || undefined,
      url: board.url,
      createdAt: board.created_at ? new Date(board.created_at) : undefined,
      updatedAt: board.updated_at ? new Date(board.updated_at) : undefined,
      metadata: {
        provider: 'monday',
        boardKind: board.board_kind,
        state: board.state,
        itemsCount: board.items_count,
        workspace: board.workspace,
        type: board.type,
        columns: board.columns,
        groups: board.groups,
      },
    };
  }

  /**
   * Map Monday.com group to universal TrackerStatus.
   * @param group - Monday.com group
   * @param index - Position index
   * @returns Universal status
   */
  private mapGroupToStatus(group: MondayGroup, index: number): TrackerStatus {
    return {
      id: group.id,
      name: group.title,
      category: this.inferStatusCategory(group.title, undefined),
      color: group.color,
      position: index,
    };
  }

  /**
   * Map Monday.com user to universal TrackerUser.
   * @param user - Monday.com user
   * @returns Universal user
   */
  private mapUser(user: MondayUser): TrackerUser {
    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      avatarUrl: user.photo_thumb || undefined,
    };
  }

  /**
   * Map Monday.com update to universal TrackerComment.
   * @param update - Monday.com update
   * @returns Universal comment
   */
  private mapUpdate(update: MondayUpdate): TrackerComment {
    return {
      id: update.id,
      body: update.text_body || update.body,
      author: update.creator
        ? {
            id: String(update.creator.id),
            name: update.creator.name,
          }
        : undefined,
      createdAt: new Date(update.created_at),
      updatedAt: update.updated_at ? new Date(update.updated_at) : undefined,
    };
  }

  /**
   * Infer status category from group title and item state.
   * @param title - Group title
   * @param state - Item state
   * @returns Status category
   */
  private inferStatusCategory(
    title: string,
    state?: string
  ): 'todo' | 'in_progress' | 'done' | 'canceled' {
    if (state === 'archived' || state === 'deleted') return 'canceled';

    const lowerTitle = title.toLowerCase();

    // Done patterns
    if (
      lowerTitle.includes('done') ||
      lowerTitle.includes('complete') ||
      lowerTitle.includes('finished')
    ) {
      return 'done';
    }

    // In progress patterns
    if (
      lowerTitle.includes('progress') ||
      lowerTitle.includes('working') ||
      lowerTitle.includes('doing') ||
      lowerTitle.includes('active')
    ) {
      return 'in_progress';
    }

    // Canceled patterns
    if (
      lowerTitle.includes('stuck') ||
      lowerTitle.includes('blocked') ||
      lowerTitle.includes('cancelled') ||
      lowerTitle.includes('canceled')
    ) {
      return 'canceled';
    }

    return 'todo';
  }

  /**
   * Extract priority from column values.
   * @param columnValues - Column values
   * @returns Priority object
   */
  private extractPriority(
    columnValues: MondayColumnValue[]
  ): { id: string; name: string; value: number } {
    const priorityColumn = columnValues.find(
      (cv) =>
        cv.id === 'priority' ||
        cv.type === 'status' &&
          (cv.id.toLowerCase().includes('priority') || cv.column?.title?.toLowerCase().includes('priority'))
    );

    if (priorityColumn && priorityColumn.text) {
      const name = priorityColumn.text;
      return {
        id: priorityColumn.id,
        name,
        value: this.mapPriorityValue(name),
      };
    }

    return { id: 'none', name: 'None', value: 0 };
  }

  /**
   * Map priority text to numeric value.
   * @param name - Priority name
   * @returns Numeric value
   */
  private mapPriorityValue(name: string): number {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('critical') || lowerName.includes('urgent')) return 4;
    if (lowerName.includes('high')) return 3;
    if (lowerName.includes('medium') || lowerName.includes('normal')) return 2;
    if (lowerName.includes('low')) return 1;
    return 0;
  }

  /**
   * Extract assignee from people column.
   * @param peopleColumn - People column value
   * @returns Assignee or undefined
   */
  private extractAssignee(
    peopleColumn?: MondayColumnValue
  ): TrackerUser | undefined {
    if (!peopleColumn || !peopleColumn.value) return undefined;

    try {
      const value = JSON.parse(peopleColumn.value);
      if (value.personsAndTeams && value.personsAndTeams.length > 0) {
        const person = value.personsAndTeams[0];
        return {
          id: String(person.id),
          name: peopleColumn.text || 'Unknown',
        };
      }
    } catch {
      // Text fallback
      if (peopleColumn.text) {
        return {
          id: 'unknown',
          name: peopleColumn.text,
        };
      }
    }

    return undefined;
  }

  /**
   * Extract labels from column values.
   * @param columnValues - Column values
   * @returns Array of labels
   */
  private extractLabels(columnValues: MondayColumnValue[]): string[] {
    const tagsColumn = columnValues.find((cv) => cv.type === 'tags' || cv.id === 'tags');

    if (tagsColumn && tagsColumn.text) {
      return tagsColumn.text.split(',').map((t) => t.trim()).filter(Boolean);
    }

    return [];
  }

  /**
   * Create a Monday.com client from environment variables.
   * @param organizationId - AgentForge organization ID
   * @param integrationId - AgentForge integration ID
   * @returns Monday.com client instance
   */
  static fromEnv(organizationId: string, integrationId: string): MondayClient {
    const accessToken = process.env.MONDAY_ACCESS_TOKEN;

    if (!accessToken) {
      throw new Error('MONDAY_ACCESS_TOKEN environment variable is required');
    }

    return new MondayClient({
      organizationId,
      integrationId,
      auth: {
        type: 'oauth2',
        accessToken,
      },
    });
  }
}
