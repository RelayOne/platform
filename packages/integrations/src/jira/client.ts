/**
 * @fileoverview Jira API client
 * @module @relay/integrations/jira/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  JiraConfig,
  JiraOAuthConfig,
  JiraIssue,
  JiraProject,
  JiraUser,
  JiraComment,
  JiraSearchResults,
  JiraTransition,
  JiraStatus,
  JiraPriority,
  JiraIssueType,
  JiraSprint,
  JiraDocument,
  CreateJiraIssueInput,
  UpdateJiraIssueInput,
  TransitionJiraIssueInput,
} from './types';
import { createHttpClient, withRetry, basicAuthHeaders, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, IssueTrackerClient, Issue, Comment, User } from '../common/types';

/**
 * Jira integration source identifier
 */
const SOURCE: IntegrationSource = 'jira';

/**
 * Jira API client
 * Implements IssueTrackerClient interface for cross-platform compatibility
 */
export class JiraClient implements IssueTrackerClient {
  private http: AxiosInstance;
  private config: JiraConfig | JiraOAuthConfig;
  private isOAuth: boolean;

  /**
   * Creates a new Jira client
   * @param config - Jira configuration (basic auth or OAuth)
   */
  constructor(config: JiraConfig | JiraOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
    this.isOAuth = 'accessToken' in config && 'cloudId' in config;

    const baseUrl = this.isOAuth
      ? `https://api.atlassian.com/ex/jira/${(config as JiraOAuthConfig).cloudId}/rest/api/3`
      : `${(config as JiraConfig).baseUrl}/rest/api/3`;

    this.http = createHttpClient(SOURCE, {
      baseUrl,
      timeout: config.timeout || 30000,
    });

    // Add auth headers
    this.http.interceptors.request.use((request) => {
      if (this.isOAuth) {
        request.headers = {
          ...request.headers,
          ...bearerAuthHeaders((config as JiraOAuthConfig).accessToken),
        };
      } else {
        const basicConfig = config as JiraConfig;
        request.headers = {
          ...request.headers,
          ...basicAuthHeaders(basicConfig.email, basicConfig.apiToken),
        };
      }
      return request;
    });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: JiraConfig | JiraOAuthConfig): void {
    if ('accessToken' in config) {
      if (!config.accessToken) {
        throw new ConfigurationError(SOURCE, 'Jira access token is required for OAuth');
      }
      if (!config.cloudId) {
        throw new ConfigurationError(SOURCE, 'Jira cloud ID is required for OAuth');
      }
    } else {
      if (!config.baseUrl) {
        throw new ConfigurationError(SOURCE, 'Jira base URL is required');
      }
      if (!config.email) {
        throw new ConfigurationError(SOURCE, 'Jira email is required');
      }
      if (!config.apiToken) {
        throw new ConfigurationError(SOURCE, 'Jira API token is required');
      }
    }
  }

  /**
   * Gets an issue by key
   * @param issueKey - Issue key (e.g., PROJ-123)
   * @param expand - Fields to expand
   * @returns Issue details
   */
  async getIssue(
    issueKey: string,
    expand?: string[]
  ): Promise<JiraIssue> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (expand && expand.length > 0) {
        params.expand = expand.join(',');
      }

      const { data } = await this.http.get(`/issue/${issueKey}`, { params });
      return data as JiraIssue;
    });
  }

  /**
   * Creates a new issue
   * @param input - Issue creation input
   * @returns Created issue
   */
  async createIssue(input: CreateJiraIssueInput): Promise<JiraIssue> {
    return withRetry(async () => {
      const fields: Record<string, unknown> = {
        project: { key: input.projectKey },
        issuetype: { name: input.issueType },
        summary: input.summary,
      };

      if (input.description) {
        fields.description = typeof input.description === 'string'
          ? this.textToAdf(input.description)
          : input.description;
      }

      if (input.priority) {
        fields.priority = { name: input.priority };
      }

      if (input.assigneeId) {
        fields.assignee = { accountId: input.assigneeId };
      }

      if (input.labels) {
        fields.labels = input.labels;
      }

      if (input.components) {
        fields.components = input.components.map((c) => ({ name: c }));
      }

      if (input.parentKey) {
        fields.parent = { key: input.parentKey };
      }

      if (input.dueDate) {
        fields.duedate = input.dueDate;
      }

      // Custom fields
      if (input.customFields) {
        Object.assign(fields, input.customFields);
      }

      const { data } = await this.http.post('/issue', { fields });

      // Fetch the full issue after creation
      return this.getIssue(data.key);
    });
  }

  /**
   * Updates an existing issue
   * @param issueKey - Issue key
   * @param input - Update input
   * @returns Updated issue
   */
  async updateIssue(
    issueKey: string,
    input: UpdateJiraIssueInput
  ): Promise<JiraIssue> {
    return withRetry(async () => {
      const fields: Record<string, unknown> = {};

      if (input.summary !== undefined) {
        fields.summary = input.summary;
      }

      if (input.description !== undefined) {
        fields.description = typeof input.description === 'string'
          ? this.textToAdf(input.description)
          : input.description;
      }

      if (input.priority !== undefined) {
        fields.priority = { name: input.priority };
      }

      if (input.assigneeId !== undefined) {
        fields.assignee = input.assigneeId ? { accountId: input.assigneeId } : null;
      }

      if (input.labels !== undefined) {
        fields.labels = input.labels;
      }

      if (input.dueDate !== undefined) {
        fields.duedate = input.dueDate;
      }

      if (input.customFields) {
        Object.assign(fields, input.customFields);
      }

      await this.http.put(`/issue/${issueKey}`, { fields });
      return this.getIssue(issueKey);
    });
  }

  /**
   * Transitions an issue to a new status
   * @param issueKey - Issue key
   * @param input - Transition input
   */
  async transitionIssue(
    issueKey: string,
    input: TransitionJiraIssueInput
  ): Promise<void> {
    return withRetry(async () => {
      const body: Record<string, unknown> = {
        transition: { id: input.transitionId },
      };

      if (input.fields) {
        body.fields = input.fields;
      }

      if (input.comment) {
        body.update = {
          comment: [
            {
              add: {
                body: typeof input.comment === 'string'
                  ? this.textToAdf(input.comment)
                  : input.comment,
              },
            },
          ],
        };
      }

      await this.http.post(`/issue/${issueKey}/transitions`, body);
    });
  }

  /**
   * Gets available transitions for an issue
   * @param issueKey - Issue key
   * @returns Available transitions
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/issue/${issueKey}/transitions`, {
        params: { expand: 'transitions.fields' },
      });
      return data.transitions as JiraTransition[];
    });
  }

  /**
   * Searches issues using JQL
   * @param jql - JQL query string
   * @param options - Search options
   * @returns Search results
   */
  async searchIssues(
    jql: string,
    options?: {
      startAt?: number;
      maxResults?: number;
      fields?: string[];
      expand?: string[];
    }
  ): Promise<JiraSearchResults> {
    return withRetry(async () => {
      const { data } = await this.http.post('/search', {
        jql,
        startAt: options?.startAt || 0,
        maxResults: options?.maxResults || 50,
        fields: options?.fields || ['*all'],
        expand: options?.expand,
      });
      return data as JiraSearchResults;
    });
  }

  /**
   * Adds a comment to an issue
   * @param issueKey - Issue key
   * @param body - Comment body (plain text or ADF)
   * @returns Created comment
   */
  async addComment(
    issueKey: string,
    body: string | JiraDocument
  ): Promise<JiraComment> {
    return withRetry(async () => {
      const { data } = await this.http.post(`/issue/${issueKey}/comment`, {
        body: typeof body === 'string' ? this.textToAdf(body) : body,
      });
      return data as JiraComment;
    });
  }

  /**
   * Gets comments on an issue
   * @param issueKey - Issue key
   * @param options - Pagination options
   * @returns Comments
   */
  async getComments(
    issueKey: string,
    options?: { startAt?: number; maxResults?: number }
  ): Promise<{ comments: JiraComment[]; total: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/issue/${issueKey}/comment`, {
        params: {
          startAt: options?.startAt || 0,
          maxResults: options?.maxResults || 50,
        },
      });
      return {
        comments: data.comments as JiraComment[],
        total: data.total,
      };
    });
  }

  /**
   * Gets a project by key or ID
   * @param projectKeyOrId - Project key or ID
   * @returns Project details
   */
  async getProject(projectKeyOrId: string): Promise<JiraProject> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/project/${projectKeyOrId}`);
      return data as JiraProject;
    });
  }

  /**
   * Lists projects
   * @param options - List options
   * @returns Array of projects
   */
  async listProjects(options?: {
    startAt?: number;
    maxResults?: number;
    expand?: string[];
  }): Promise<{ projects: JiraProject[]; total: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get('/project/search', {
        params: {
          startAt: options?.startAt || 0,
          maxResults: options?.maxResults || 50,
          expand: options?.expand?.join(','),
        },
      });
      return {
        projects: data.values as JiraProject[],
        total: data.total,
      };
    });
  }

  /**
   * Gets issue types for a project
   * @param projectKeyOrId - Project key or ID
   * @returns Issue types
   */
  async getIssueTypes(projectKeyOrId: string): Promise<JiraIssueType[]> {
    return withRetry(async () => {
      const { data } = await this.http.get(
        `/project/${projectKeyOrId}/statuses`
      );
      // Extract unique issue types
      const issueTypes = data.map((item: { id: string; name: string; subtask: boolean }) => ({
        id: item.id,
        name: item.name,
        subtask: item.subtask,
      }));
      return issueTypes as JiraIssueType[];
    });
  }

  /**
   * Gets all priorities
   * @returns Priorities
   */
  async getPriorities(): Promise<JiraPriority[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/priority');
      return data as JiraPriority[];
    });
  }

  /**
   * Gets all statuses
   * @returns Statuses
   */
  async getStatuses(): Promise<JiraStatus[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/status');
      return data as JiraStatus[];
    });
  }

  /**
   * Gets current user
   * @returns Current user
   */
  async getCurrentUser(): Promise<JiraUser> {
    return withRetry(async () => {
      const { data } = await this.http.get('/myself');
      return data as JiraUser;
    });
  }

  /**
   * Searches users
   * @param query - Search query
   * @param options - Search options
   * @returns Matching users
   */
  async searchUsers(
    query: string,
    options?: { maxResults?: number; startAt?: number }
  ): Promise<JiraUser[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/user/search', {
        params: {
          query,
          maxResults: options?.maxResults || 50,
          startAt: options?.startAt || 0,
        },
      });
      return data as JiraUser[];
    });
  }

  /**
   * Gets sprints for a board
   * @param boardId - Board ID
   * @param options - Filter options
   * @returns Sprints
   */
  async getSprints(
    boardId: number,
    options?: { state?: 'future' | 'active' | 'closed' }
  ): Promise<JiraSprint[]> {
    const baseUrl = this.isOAuth
      ? `https://api.atlassian.com/ex/jira/${(this.config as JiraOAuthConfig).cloudId}`
      : (this.config as JiraConfig).baseUrl;

    return withRetry(async () => {
      const { data } = await axios.get(
        `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint`,
        {
          params: { state: options?.state },
          headers: this.getAuthHeaders(),
        }
      );
      return data.values as JiraSprint[];
    });
  }

  /**
   * Assigns an issue to a user
   * @param issueKey - Issue key
   * @param accountId - User account ID (null to unassign)
   */
  async assignIssue(
    issueKey: string,
    accountId: string | null
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.put(`/issue/${issueKey}/assignee`, {
        accountId,
      });
    });
  }

  /**
   * Adds a watcher to an issue
   * @param issueKey - Issue key
   * @param accountId - User account ID
   */
  async addWatcher(issueKey: string, accountId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.post(`/issue/${issueKey}/watchers`, `"${accountId}"`, {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  /**
   * Converts plain text to ADF format
   * @param text - Plain text
   * @returns ADF document
   */
  private textToAdf(text: string): JiraDocument {
    return {
      version: 1,
      type: 'doc',
      content: text.split('\n').map((line) => ({
        type: 'paragraph',
        content: line
          ? [{ type: 'text', text: line }]
          : [],
      })),
    };
  }

  /**
   * Gets authentication headers
   * @returns Auth headers
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.isOAuth) {
      return bearerAuthHeaders((this.config as JiraOAuthConfig).accessToken);
    } else {
      const basicConfig = this.config as JiraConfig;
      return basicAuthHeaders(basicConfig.email, basicConfig.apiToken);
    }
  }

  // IssueTrackerClient interface implementation

  /**
   * Gets issue (interface method)
   */
  async getIssueById(issueKey: string): Promise<Issue> {
    const issue = await this.getIssue(issueKey);
    return this.mapToCommonIssue(issue);
  }

  /**
   * Creates issue (interface method)
   */
  async createIssueFromRequest(
    projectKey: string,
    title: string,
    description?: string,
    options?: { priority?: string; labels?: string[]; issueType?: string }
  ): Promise<Issue> {
    const issue = await this.createIssue({
      projectKey,
      issueType: options?.issueType || 'Task',
      summary: title,
      description,
      priority: options?.priority,
      labels: options?.labels,
    });
    return this.mapToCommonIssue(issue);
  }

  /**
   * Updates issue (interface method)
   */
  async updateIssueById(
    issueKey: string,
    updates: Partial<Issue>
  ): Promise<Issue> {
    const issue = await this.updateIssue(issueKey, {
      summary: updates.title,
      description: updates.description,
      priority: updates.priority,
      labels: updates.labels,
    });
    return this.mapToCommonIssue(issue);
  }

  /**
   * Adds comment (interface method)
   */
  async addIssueComment(issueKey: string, body: string): Promise<Comment> {
    const comment = await this.addComment(issueKey, body);
    return this.mapToCommonComment(comment);
  }

  /**
   * Tests connection (interface method)
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps Jira issue to common Issue type
   */
  private mapToCommonIssue(issue: JiraIssue): Issue {
    return {
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      description: this.adfToText(issue.fields.description),
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name,
      type: issue.fields.issuetype.name,
      assignee: issue.fields.assignee
        ? this.mapToCommonUser(issue.fields.assignee)
        : undefined,
      reporter: issue.fields.reporter
        ? this.mapToCommonUser(issue.fields.reporter)
        : {
            id: 'unknown',
            username: 'unknown',
          },
      createdAt: new Date(issue.fields.created),
      updatedAt: new Date(issue.fields.updated),
      url: `${this.isOAuth ? '' : (this.config as JiraConfig).baseUrl}/browse/${issue.key}`,
      labels: issue.fields.labels,
    };
  }

  /**
   * Maps Jira user to common User type
   */
  private mapToCommonUser(user: JiraUser): User {
    return {
      id: user.accountId,
      username: user.emailAddress || user.accountId,
      displayName: user.displayName,
      email: user.emailAddress,
      avatarUrl: user.avatarUrls['48x48'],
    };
  }

  /**
   * Maps Jira comment to common Comment type
   */
  private mapToCommonComment(comment: JiraComment): Comment {
    return {
      id: comment.id,
      body: this.adfToText(comment.body),
      author: this.mapToCommonUser(comment.author),
      createdAt: new Date(comment.created),
      updatedAt: new Date(comment.updated),
      url: comment.self,
    };
  }

  /**
   * Converts ADF document to plain text
   */
  private adfToText(doc?: JiraDocument): string | undefined {
    if (!doc || !doc.content) return undefined;

    const extractText = (nodes: { type: string; text?: string; content?: any[] }[]): string => {
      return nodes
        .map((node) => {
          if (node.type === 'text' && node.text) {
            return node.text;
          }
          if (node.content) {
            return extractText(node.content);
          }
          if (node.type === 'hardBreak') {
            return '\n';
          }
          return '';
        })
        .join('');
    };

    return doc.content
      .map((block) => {
        if (block.content) {
          return extractText(block.content);
        }
        return '';
      })
      .join('\n');
  }
}
