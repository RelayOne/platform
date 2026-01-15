import {
  BaseTrackerClient,
  type TrackerProvider,
  type TrackerClientConfig,
  type TrackerAuthConfig,
  type TrackerTask,
  type TrackerProject,
  type TrackerComment,
  type TrackerStatus,
  type TrackerUser,
  type PaginatedResponse,
  type RateLimitStatus,
  type ConnectionTestResult,
  type CreateTaskInput,
  type UpdateTaskInput,
  type ListTasksOptions,
  type ListProjectsOptions,
  RateLimiter,
  FieldMapper,
} from '@agentforge/tracker-common';
import type {
  TrelloCard,
  TrelloBoard,
  TrelloList,
  TrelloMember,
  TrelloLabel,
  TrelloComment as TrelloCommentType,
  TrelloOrganization,
  CreateCardInput,
  UpdateCardInput,
} from './types';

/**
 * @fileoverview Trello REST API client implementation.
 * @packageDocumentation
 */

/**
 * Trello API client.
 * Provides methods for interacting with Trello's REST API.
 *
 * @example
 * ```typescript
 * const client = new TrelloClient({
 *   organizationId: 'org-123',
 *   integrationId: 'int-456',
 *   auth: { type: 'api_key', apiKey: 'key', accessToken: 'token' },
 * });
 *
 * const { items: boards } = await client.listProjects();
 * ```
 */
export class TrelloClient extends BaseTrackerClient {
  private apiKey: string;
  private token: string;
  private rateLimiter: RateLimiter;
  private fieldMapper: FieldMapper;

  /** Base URL for Trello API */
  private static readonly API_BASE = 'https://api.trello.com/1';

  /**
   * Creates a new Trello client.
   * @param config - Client configuration
   */
  constructor(config: TrackerClientConfig) {
    super(config);

    // Extract API key and token from auth config
    this.apiKey = config.auth.apiKey || process.env.TRELLO_API_KEY || '';
    this.token = config.auth.accessToken || '';

    if (!this.apiKey) {
      throw new Error('Trello API key is required');
    }

    this.rateLimiter = RateLimiter.forTracker('trello');
    this.fieldMapper = new FieldMapper();
  }

  /**
   * Get the tracker provider identifier.
   */
  get provider(): TrackerProvider {
    return 'trello';
  }

  /**
   * Get the base API URL.
   */
  get baseUrl(): string {
    return this.config.baseUrl || TrelloClient.API_BASE;
  }

  // =========================================================================
  // HTTP Methods
  // =========================================================================

  /**
   * Make an authenticated API request.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    params?: Record<string, unknown>,
    body?: Record<string, unknown>
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(`${this.baseUrl}${path}`);

    // Add auth params
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('token', this.token);

    // Add query params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Trello API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // =========================================================================
  // Authentication
  // =========================================================================

  /**
   * Test connection to Trello.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const member = await this.request<TrelloMember>('GET', '/members/me');

      return {
        success: true,
        latencyMs: Date.now() - start,
        user: this.mapMember(member),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Refresh OAuth tokens.
   * Trello tokens don't expire unless explicitly set to expire.
   */
  async refreshTokens(): Promise<TrackerAuthConfig> {
    // Trello tokens are permanent by default
    throw new Error('Trello tokens do not require refresh');
  }

  // =========================================================================
  // Projects (Boards)
  // =========================================================================

  /**
   * List all boards accessible by the user.
   */
  async listProjects(options?: ListProjectsOptions): Promise<PaginatedResponse<TrackerProject>> {
    const boards = await this.request<TrelloBoard[]>('GET', '/members/me/boards', {
      filter: options?.includeArchived ? 'all' : 'open',
      fields: 'id,name,desc,closed,url,shortUrl,shortLink,dateLastActivity,prefs',
      lists: 'open',
      labels: 'all',
    });

    return {
      items: boards.map((board) => this.mapBoardToProject(board)),
      hasMore: false, // Trello returns all boards at once
    };
  }

  /**
   * Get a single board by ID.
   */
  async getProject(projectId: string): Promise<TrackerProject | null> {
    try {
      const board = await this.request<TrelloBoard>('GET', `/boards/${projectId}`, {
        fields: 'id,name,desc,closed,url,shortUrl,shortLink,dateLastActivity,prefs,labelNames',
        lists: 'open',
        labels: 'all',
        members: 'all',
      });

      return this.mapBoardToProject(board);
    } catch {
      return null;
    }
  }

  /**
   * Get lists (statuses) for a board.
   */
  async getProjectStatuses(projectId: string): Promise<TrackerStatus[]> {
    const lists = await this.request<TrelloList[]>('GET', `/boards/${projectId}/lists`, {
      filter: 'open',
      fields: 'id,name,closed,pos',
    });

    return lists.map((list, index) => ({
      id: list.id,
      name: list.name,
      // Map position to status category based on order
      category: this.inferStatusCategory(list.name, index, lists.length),
    }));
  }

  /**
   * Get board members.
   */
  async getProjectMembers(projectId: string): Promise<TrackerUser[]> {
    const members = await this.request<TrelloMember[]>('GET', `/boards/${projectId}/members`, {
      fields: 'id,username,fullName,avatarUrl',
    });

    return members.map((member) => this.mapMember(member));
  }

  // =========================================================================
  // Tasks (Cards)
  // =========================================================================

  /**
   * List cards on a board.
   */
  async listTasks(
    projectId: string,
    options?: ListTasksOptions
  ): Promise<PaginatedResponse<TrackerTask>> {
    const params: Record<string, unknown> = {
      fields: 'id,name,desc,idBoard,idList,idMembers,idLabels,closed,due,dueComplete,start,pos,url,shortUrl,shortLink,dateLastActivity,cover',
      members: true,
      member_fields: 'id,username,fullName,avatarUrl',
      labels: true,
      filter: options?.includeCompleted ? 'all' : 'open',
    };

    // Get lists first for status mapping
    const lists = await this.getProjectStatuses(projectId);
    const listMap = new Map(lists.map((l) => [l.id, l]));

    const cards = await this.request<TrelloCard[]>('GET', `/boards/${projectId}/cards`, params);

    // Filter by list if statusIds provided
    let filteredCards = cards;
    if (options?.statusIds?.length) {
      filteredCards = cards.filter((card) => options.statusIds!.includes(card.idList));
    }

    // Filter by assignee
    if (options?.assigneeIds?.length) {
      filteredCards = filteredCards.filter((card) =>
        card.idMembers.some((id) => options.assigneeIds!.includes(id))
      );
    }

    return {
      items: filteredCards.map((card) => this.mapCardToTask(card, listMap)),
      hasMore: false,
    };
  }

  /**
   * Get a single card by ID.
   */
  async getTask(taskId: string): Promise<TrackerTask | null> {
    try {
      const card = await this.request<TrelloCard>('GET', `/cards/${taskId}`, {
        fields: 'id,name,desc,idBoard,idList,idMembers,idLabels,closed,due,dueComplete,start,pos,url,shortUrl,shortLink,dateLastActivity,cover',
        members: true,
        member_fields: 'id,username,fullName,avatarUrl',
        labels: true,
        checklists: 'all',
        checklist_fields: 'id,name,pos',
        checkItems: 'all',
        checkItem_fields: 'id,name,state,pos',
      });

      const lists = await this.request<TrelloList[]>('GET', `/boards/${card.idBoard}/lists`, {
        filter: 'open',
        fields: 'id,name',
      });
      const listMap = new Map(lists.map((l) => [l.id, { id: l.id, name: l.name, category: this.inferStatusCategory(l.name, 0, lists.length) }]));

      return this.mapCardToTask(card, listMap as Map<string, TrackerStatus>);
    } catch {
      return null;
    }
  }

  /**
   * Create a new card.
   */
  async createTask(projectId: string, input: CreateTaskInput): Promise<TrackerTask> {
    // Get the first list if no status specified
    let listId = input.status;
    if (!listId) {
      const lists = await this.request<TrelloList[]>('GET', `/boards/${projectId}/lists`, {
        filter: 'open',
        fields: 'id',
      });
      listId = lists[0]?.id;
    }

    if (!listId) {
      throw new Error('No list found for card creation');
    }

    const cardInput: CreateCardInput = {
      name: input.title,
      desc: input.description,
      idList: listId,
      idMembers: input.assigneeIds,
      idLabels: input.labelIds,
      due: input.dueDate?.toISOString(),
      start: input.startDate?.toISOString(),
    };

    const card = await this.request<TrelloCard>('POST', '/cards', {}, cardInput);

    const lists = await this.getProjectStatuses(projectId);
    const listMap = new Map(lists.map((l) => [l.id, l]));

    return this.mapCardToTask(card, listMap);
  }

  /**
   * Update a card.
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TrackerTask> {
    const updateInput: UpdateCardInput = {};

    if (input.title !== undefined) updateInput.name = input.title;
    if (input.description !== undefined) updateInput.desc = input.description;
    if (input.status !== undefined) updateInput.idList = input.status;
    if (input.assigneeIds !== undefined) updateInput.idMembers = input.assigneeIds;
    if (input.labelIds !== undefined) updateInput.idLabels = input.labelIds;
    if (input.dueDate !== undefined) {
      updateInput.due = input.dueDate ? input.dueDate.toISOString() : null;
    }

    const card = await this.request<TrelloCard>('PUT', `/cards/${taskId}`, {}, updateInput);

    const lists = await this.request<TrelloList[]>('GET', `/boards/${card.idBoard}/lists`, {
      filter: 'open',
      fields: 'id,name',
    });
    const listMap = new Map(lists.map((l) => [l.id, { id: l.id, name: l.name, category: this.inferStatusCategory(l.name, 0, lists.length) }]));

    return this.mapCardToTask(card, listMap as Map<string, TrackerStatus>);
  }

  /**
   * Delete (archive) a card.
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.request<void>('DELETE', `/cards/${taskId}`);
  }

  // =========================================================================
  // Comments (Actions)
  // =========================================================================

  /**
   * List comments on a card.
   */
  async listComments(
    taskId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<PaginatedResponse<TrackerComment>> {
    const actions = await this.request<TrelloCommentType[]>('GET', `/cards/${taskId}/actions`, {
      filter: 'commentCard',
      fields: 'id,idMemberCreator,type,date,data',
      memberCreator: true,
      memberCreator_fields: 'id,username,fullName,avatarUrl',
      limit: options?.limit || 50,
    });

    return {
      items: actions.map((action) => this.mapComment(action, taskId)),
      hasMore: actions.length === (options?.limit || 50),
    };
  }

  /**
   * Add a comment to a card.
   */
  async addComment(taskId: string, body: string): Promise<TrackerComment> {
    const action = await this.request<TrelloCommentType>('POST', `/cards/${taskId}/actions/comments`, {
      text: body,
    });

    return this.mapComment(action, taskId);
  }

  /**
   * Update a comment.
   */
  async updateComment(commentId: string, body: string): Promise<TrackerComment> {
    const action = await this.request<TrelloCommentType>('PUT', `/actions/${commentId}`, {
      text: body,
    });

    return this.mapComment(action, action.data.card.id);
  }

  /**
   * Delete a comment.
   */
  async deleteComment(commentId: string): Promise<void> {
    await this.request<void>('DELETE', `/actions/${commentId}`);
  }

  // =========================================================================
  // Rate Limiting
  // =========================================================================

  /**
   * Get current rate limit status.
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      remaining: this.rateLimiter.getRemainingTokens(),
      limit: 100,
      resetAt: new Date(Date.now() + 10000), // 10 second window
    };
  }

  // =========================================================================
  // Search
  // =========================================================================

  /**
   * Search for cards.
   */
  async searchTasks(
    query: string,
    options?: { projectIds?: string[]; cursor?: string; limit?: number }
  ): Promise<PaginatedResponse<TrackerTask>> {
    const searchParams: Record<string, unknown> = {
      query,
      modelTypes: 'cards',
      cards_limit: options?.limit || 50,
      card_fields: 'id,name,desc,idBoard,idList,idMembers,idLabels,closed,due,url,shortUrl,dateLastActivity',
      card_members: true,
      card_labels: true,
    };

    if (options?.projectIds?.length) {
      searchParams.idBoards = options.projectIds.join(',');
    }

    const results = await this.request<{
      cards: TrelloCard[];
    }>('GET', '/search', searchParams);

    // We don't have list info from search, so we'll use basic mapping
    return {
      items: results.cards.map((card) =>
        this.mapCardToTask(card, new Map())
      ),
      hasMore: results.cards.length === (options?.limit || 50),
    };
  }

  // =========================================================================
  // Trello-Specific Methods
  // =========================================================================

  /**
   * Get user's organizations (workspaces).
   */
  async getOrganizations(): Promise<TrelloOrganization[]> {
    return this.request<TrelloOrganization[]>('GET', '/members/me/organizations', {
      fields: 'id,name,displayName,desc,url,website,logoUrl',
    });
  }

  /**
   * Get labels for a board.
   */
  async getBoardLabels(boardId: string): Promise<TrelloLabel[]> {
    return this.request<TrelloLabel[]>('GET', `/boards/${boardId}/labels`, {
      fields: 'id,idBoard,name,color',
    });
  }

  /**
   * Create a new list on a board.
   */
  async createList(boardId: string, name: string, pos?: 'top' | 'bottom' | number): Promise<TrelloList> {
    return this.request<TrelloList>('POST', '/lists', {}, {
      name,
      idBoard: boardId,
      pos,
    });
  }

  /**
   * Archive a list.
   */
  async archiveList(listId: string): Promise<void> {
    await this.request<TrelloList>('PUT', `/lists/${listId}/closed`, { value: 'true' });
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Map Trello card to universal task.
   */
  private mapCardToTask(card: TrelloCard, listMap: Map<string, TrackerStatus>): TrackerTask {
    const status = listMap.get(card.idList) || {
      id: card.idList,
      name: 'Unknown',
      category: 'todo' as const,
    };

    return {
      id: card.id,
      externalId: card.id,
      provider: 'trello',
      title: card.name,
      description: card.desc,
      descriptionFormat: 'markdown',
      status,
      assignees: (card.members || []).map((m) => this.mapMember(m)),
      labels: (card.labels || []).map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color || undefined,
      })),
      dueDate: card.due ? new Date(card.due) : undefined,
      startDate: card.start ? new Date(card.start) : undefined,
      completedAt: card.dueComplete && card.due ? new Date(card.due) : undefined,
      createdAt: new Date(card.dateLastActivity), // Trello doesn't expose creation date
      updatedAt: new Date(card.dateLastActivity),
      project: {
        id: card.idBoard,
        externalId: card.idBoard,
        name: '', // Would need separate query
      },
      subtasks: card.idChecklists || [],
      url: card.url,
      metadata: {
        shortLink: card.shortLink,
        shortUrl: card.shortUrl,
        pos: card.pos,
        closed: card.closed,
        cover: card.cover,
      },
    };
  }

  /**
   * Map Trello board to universal project.
   */
  private mapBoardToProject(board: TrelloBoard): TrackerProject {
    return {
      id: board.id,
      externalId: board.id,
      provider: 'trello',
      name: board.name,
      description: board.desc,
      status: board.closed ? 'archived' : 'active',
      createdAt: new Date(), // Trello doesn't expose creation date
      updatedAt: board.dateLastActivity ? new Date(board.dateLastActivity) : new Date(),
      url: board.url,
      statuses: board.lists?.map((list, index) => ({
        id: list.id,
        name: list.name,
        category: this.inferStatusCategory(list.name, index, board.lists?.length || 1),
      })),
      metadata: {
        shortLink: board.shortLink,
        shortUrl: board.shortUrl,
        prefs: board.prefs,
        labelNames: board.labelNames,
        idOrganization: board.idOrganization,
      },
    };
  }

  /**
   * Map Trello member to universal user.
   */
  private mapMember(member: TrelloMember): TrackerUser {
    return {
      id: member.id,
      externalId: member.id,
      name: member.fullName || member.username,
      email: member.email,
      avatarUrl: member.avatarUrl || undefined,
    };
  }

  /**
   * Map Trello comment action to universal comment.
   */
  private mapComment(action: TrelloCommentType, taskId: string): TrackerComment {
    return {
      id: action.id,
      externalId: action.id,
      body: action.data.text,
      bodyFormat: 'markdown',
      author: action.memberCreator
        ? this.mapMember(action.memberCreator)
        : { id: action.idMemberCreator, externalId: action.idMemberCreator, name: 'Unknown' },
      createdAt: new Date(action.date),
      updatedAt: new Date(action.date),
      taskId: action.data.card?.id || taskId,
    };
  }

  /**
   * Infer status category from list name and position.
   */
  private inferStatusCategory(
    name: string,
    index: number,
    total: number
  ): 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled' {
    const lowerName = name.toLowerCase();

    // Check for common naming patterns
    if (lowerName.includes('backlog')) return 'backlog';
    if (lowerName.includes('to do') || lowerName.includes('todo')) return 'todo';
    if (lowerName.includes('progress') || lowerName.includes('doing')) return 'in_progress';
    if (lowerName.includes('review') || lowerName.includes('testing')) return 'review';
    if (lowerName.includes('done') || lowerName.includes('complete')) return 'done';
    if (lowerName.includes('cancel') || lowerName.includes('archive')) return 'cancelled';

    // Infer from position if no pattern match
    if (total <= 1) return 'todo';
    if (index === 0) return 'todo';
    if (index === total - 1) return 'done';
    return 'in_progress';
  }
}
