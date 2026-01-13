/**
 * @fileoverview Bitbucket Cloud API client
 * @module @relay/integrations/bitbucket/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  BitbucketConfig,
  BitbucketOAuthConfig,
  BitbucketRepository,
  BitbucketPullRequest,
  BitbucketDiffStat,
  BitbucketComment,
  BitbucketCommitStatus,
  BitbucketBranch,
  BitbucketCommit,
  BitbucketUser,
  BitbucketWorkspace,
  BitbucketPaginatedResponse,
  CreateBitbucketPrInput,
  UpdateBitbucketPrInput,
  CreateBitbucketStatusInput,
} from './types';
import { createHttpClient, withRetry, basicAuthHeaders, bearerAuthHeaders, fetchAllPages } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type {
  IntegrationSource,
  GitProviderClient,
  PullRequest,
  FileChange,
  Repository,
  User,
  Comment,
  CommitStatus,
  WebhookVerificationResult,
} from '../common/types';

/**
 * Bitbucket integration source identifier
 */
const SOURCE: IntegrationSource = 'bitbucket';

/**
 * Bitbucket API base URL
 */
const API_BASE_URL = 'https://api.bitbucket.org/2.0';

/**
 * Bitbucket Cloud API client
 * Implements GitProviderClient interface for cross-platform compatibility
 */
export class BitbucketClient implements GitProviderClient {
  readonly source: IntegrationSource = SOURCE;
  private http: AxiosInstance;
  private config: BitbucketConfig | BitbucketOAuthConfig;
  private isOAuth: boolean;

  /**
   * Creates a new Bitbucket client
   * @param config - Bitbucket configuration
   */
  constructor(config: BitbucketConfig | BitbucketOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
    this.isOAuth = 'accessToken' in config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: API_BASE_URL,
      timeout: config.timeout || 30000,
    });

    // Add auth headers
    this.http.interceptors.request.use((request) => {
      if (this.isOAuth) {
        request.headers = {
          ...request.headers,
          ...bearerAuthHeaders((config as BitbucketOAuthConfig).accessToken),
        };
      } else {
        const basicConfig = config as BitbucketConfig;
        request.headers = {
          ...request.headers,
          ...basicAuthHeaders(basicConfig.username, basicConfig.appPassword),
        };
      }
      return request;
    });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: BitbucketConfig | BitbucketOAuthConfig): void {
    if ('accessToken' in config) {
      if (!config.accessToken) {
        throw new ConfigurationError(SOURCE, 'Bitbucket access token is required for OAuth');
      }
    } else {
      if (!config.username) {
        throw new ConfigurationError(SOURCE, 'Bitbucket username is required');
      }
      if (!config.appPassword) {
        throw new ConfigurationError(SOURCE, 'Bitbucket app password is required');
      }
    }
  }

  /**
   * Gets a repository
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @returns Repository details
   */
  async getRepository(workspace: string, repoSlug: string): Promise<Repository> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketRepository>(
        `/repositories/${workspace}/${repoSlug}`
      );
      return this.mapToCommonRepository(data);
    });
  }

  /**
   * Gets a Bitbucket repository (native type)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @returns Bitbucket repository
   */
  async getBitbucketRepository(
    workspace: string,
    repoSlug: string
  ): Promise<BitbucketRepository> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketRepository>(
        `/repositories/${workspace}/${repoSlug}`
      );
      return data;
    });
  }

  /**
   * Lists repositories in a workspace
   * @param workspace - Workspace slug
   * @param options - List options
   * @returns Paginated repositories
   */
  async listRepositories(
    workspace: string,
    options?: { role?: string; q?: string }
  ): Promise<BitbucketPaginatedResponse<BitbucketRepository>> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketRepository>>(
        `/repositories/${workspace}`,
        { params: options }
      );
      return data;
    });
  }

  /**
   * Gets a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns Pull request
   */
  async getPullRequest(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<PullRequest> {
    const pr = await this.getBitbucketPullRequest(workspace, repoSlug, prId);
    return this.mapToCommonPullRequest(pr);
  }

  /**
   * Gets a Bitbucket pull request (native type)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns Bitbucket pull request
   */
  async getBitbucketPullRequest(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<BitbucketPullRequest> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPullRequest>(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`
      );
      return data;
    });
  }

  /**
   * Lists pull requests
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param options - Filter options
   * @returns Paginated pull requests
   */
  async listPullRequests(
    workspace: string,
    repoSlug: string,
    options?: { state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' }
  ): Promise<BitbucketPaginatedResponse<BitbucketPullRequest>> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketPullRequest>>(
        `/repositories/${workspace}/${repoSlug}/pullrequests`,
        { params: options }
      );
      return data;
    });
  }

  /**
   * Creates a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param input - PR creation input
   * @returns Created PR
   */
  async createPullRequest(
    workspace: string,
    repoSlug: string,
    input: CreateBitbucketPrInput
  ): Promise<BitbucketPullRequest> {
    return withRetry(async () => {
      const body: Record<string, unknown> = {
        title: input.title,
        source: { branch: { name: input.sourceBranch } },
        destination: { branch: { name: input.targetBranch } },
      };

      if (input.description) {
        body.description = input.description;
      }

      if (input.closeSourceBranch !== undefined) {
        body.close_source_branch = input.closeSourceBranch;
      }

      if (input.reviewers && input.reviewers.length > 0) {
        body.reviewers = input.reviewers.map((uuid) => ({ uuid }));
      }

      const { data } = await this.http.post<BitbucketPullRequest>(
        `/repositories/${workspace}/${repoSlug}/pullrequests`,
        body
      );
      return data;
    });
  }

  /**
   * Updates a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @param input - Update input
   * @returns Updated PR
   */
  async updatePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number,
    input: UpdateBitbucketPrInput
  ): Promise<BitbucketPullRequest> {
    return withRetry(async () => {
      const body: Record<string, unknown> = {};

      if (input.title) {
        body.title = input.title;
      }

      if (input.description !== undefined) {
        body.description = input.description;
      }

      if (input.reviewers) {
        body.reviewers = input.reviewers.map((uuid) => ({ uuid }));
      }

      if (input.targetBranch) {
        body.destination = { branch: { name: input.targetBranch } };
      }

      const { data } = await this.http.put<BitbucketPullRequest>(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`,
        body
      );
      return data;
    });
  }

  /**
   * Merges a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @param options - Merge options
   * @returns Merged PR
   */
  async mergePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: {
      mergeStrategy?: 'merge_commit' | 'squash' | 'fast_forward';
      closeSourceBranch?: boolean;
      message?: string;
    }
  ): Promise<BitbucketPullRequest> {
    return withRetry(async () => {
      const body: Record<string, unknown> = {};

      if (options?.mergeStrategy) {
        body.merge_strategy = options.mergeStrategy;
      }

      if (options?.closeSourceBranch !== undefined) {
        body.close_source_branch = options.closeSourceBranch;
      }

      if (options?.message) {
        body.message = options.message;
      }

      const { data } = await this.http.post<BitbucketPullRequest>(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/merge`,
        body
      );
      return data;
    });
  }

  /**
   * Declines a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns Declined PR
   */
  async declinePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<BitbucketPullRequest> {
    return withRetry(async () => {
      const { data } = await this.http.post<BitbucketPullRequest>(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/decline`
      );
      return data;
    });
  }

  /**
   * Gets PR files/diff stats
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns File changes
   */
  async getPullRequestFiles(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<FileChange[]> {
    const diffstats = await this.getBitbucketDiffStats(workspace, repoSlug, prId);
    return diffstats.map(this.mapToCommonFileChange);
  }

  /**
   * Gets Bitbucket diff stats (native type)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns Diff stats
   */
  async getBitbucketDiffStats(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<BitbucketDiffStat[]> {
    return withRetry(async () => {
      const allStats: BitbucketDiffStat[] = [];
      let nextUrl: string | undefined = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/diffstat`;

      while (nextUrl) {
        const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketDiffStat>>(nextUrl);
        allStats.push(...data.values);
        nextUrl = data.next?.replace(API_BASE_URL, '');
      }

      return allStats;
    });
  }

  /**
   * Creates a PR comment
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @param body - Comment body
   * @returns Created comment
   */
  async createPullRequestComment(
    workspace: string,
    repoSlug: string,
    prId: number,
    body: string
  ): Promise<Comment> {
    const comment = await this.createBitbucketComment(workspace, repoSlug, prId, body);
    return this.mapToCommonComment(comment);
  }

  /**
   * Creates a Bitbucket comment (native type)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @param body - Comment body
   * @returns Created comment
   */
  async createBitbucketComment(
    workspace: string,
    repoSlug: string,
    prId: number,
    body: string
  ): Promise<BitbucketComment> {
    return withRetry(async () => {
      const { data } = await this.http.post<BitbucketComment>(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`,
        { content: { raw: body } }
      );
      return data;
    });
  }

  /**
   * Lists PR comments
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   * @returns Comments
   */
  async listPullRequestComments(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<BitbucketComment[]> {
    return withRetry(async () => {
      const allComments: BitbucketComment[] = [];
      let nextUrl: string | undefined =
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`;

      while (nextUrl) {
        const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketComment>>(nextUrl);
        allComments.push(...data.values);
        nextUrl = data.next?.replace(API_BASE_URL, '');
      }

      return allComments;
    });
  }

  /**
   * Approves a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   */
  async approvePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.post(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/approve`
      );
    });
  }

  /**
   * Unapproves a pull request
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param prId - PR ID
   */
  async unapprovePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(
        `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/approve`
      );
    });
  }

  /**
   * Sets commit status (build status)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param sha - Commit SHA
   * @param status - Status configuration
   */
  async setCommitStatus(
    workspace: string,
    repoSlug: string,
    sha: string,
    status: CommitStatus
  ): Promise<void> {
    await this.createBitbucketStatus(workspace, repoSlug, sha, {
      key: status.context,
      state: this.mapToStateString(status.state),
      name: status.context,
      description: status.description,
      url: status.targetUrl,
    });
  }

  /**
   * Creates a Bitbucket commit status (native type)
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param sha - Commit SHA
   * @param input - Status input
   * @returns Created status
   */
  async createBitbucketStatus(
    workspace: string,
    repoSlug: string,
    sha: string,
    input: CreateBitbucketStatusInput
  ): Promise<BitbucketCommitStatus> {
    return withRetry(async () => {
      const { data } = await this.http.post<BitbucketCommitStatus>(
        `/repositories/${workspace}/${repoSlug}/commit/${sha}/statuses/build`,
        {
          key: input.key,
          state: input.state,
          name: input.name || input.key,
          description: input.description,
          url: input.url,
        }
      );
      return data;
    });
  }

  /**
   * Gets commit statuses
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param sha - Commit SHA
   * @returns Commit statuses
   */
  async getCommitStatuses(
    workspace: string,
    repoSlug: string,
    sha: string
  ): Promise<BitbucketCommitStatus[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketCommitStatus>>(
        `/repositories/${workspace}/${repoSlug}/commit/${sha}/statuses`
      );
      return data.values;
    });
  }

  /**
   * Gets file content from a repository
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param path - File path
   * @param ref - Git ref (commit, branch, tag)
   * @returns File content
   */
  async getFileContent(
    workspace: string,
    repoSlug: string,
    path: string,
    ref: string
  ): Promise<string> {
    return withRetry(async () => {
      const { data } = await this.http.get(
        `/repositories/${workspace}/${repoSlug}/src/${ref}/${path}`,
        { responseType: 'text' }
      );
      return data;
    });
  }

  /**
   * Gets branches
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @returns Branches
   */
  async getBranches(
    workspace: string,
    repoSlug: string
  ): Promise<BitbucketBranch[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketBranch>>(
        `/repositories/${workspace}/${repoSlug}/refs/branches`
      );
      return data.values;
    });
  }

  /**
   * Gets a specific branch
   * @param workspace - Workspace slug
   * @param repoSlug - Repository slug
   * @param branchName - Branch name
   * @returns Branch
   */
  async getBranch(
    workspace: string,
    repoSlug: string,
    branchName: string
  ): Promise<BitbucketBranch> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketBranch>(
        `/repositories/${workspace}/${repoSlug}/refs/branches/${branchName}`
      );
      return data;
    });
  }

  /**
   * Gets current user
   * @returns Current user
   */
  async getCurrentUser(): Promise<BitbucketUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketUser>('/user');
      return data;
    });
  }

  /**
   * Gets workspaces the user has access to
   * @returns Workspaces
   */
  async getWorkspaces(): Promise<BitbucketWorkspace[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<BitbucketPaginatedResponse<BitbucketWorkspace>>(
        '/workspaces'
      );
      return data.values;
    });
  }

  /**
   * Tests connection
   * @returns Whether connection is successful
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
   * Verifies webhook signature
   * Bitbucket doesn't use signatures by default, but supports IP allowlisting
   * For security, you should use webhook secrets via the hook configuration
   */
  verifyWebhook(
    _payload: string | Buffer,
    _signature: string,
    _secret: string
  ): WebhookVerificationResult {
    // Bitbucket Cloud doesn't use HMAC signatures by default
    // Verification is typically done via IP allowlisting or custom authentication
    return { valid: true };
  }

  // Mapping methods

  /**
   * Maps Bitbucket repository to common Repository type
   */
  private mapToCommonRepository(repo: BitbucketRepository): Repository {
    const httpsClone = repo.links.clone.find((c) => c.name === 'https');
    return {
      id: repo.uuid,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      defaultBranch: repo.mainbranch?.name || 'main',
      url: repo.links.html.href,
      cloneUrl: httpsClone?.href || '',
      isPrivate: repo.is_private,
      owner: this.mapToCommonUser(repo.owner),
    };
  }

  /**
   * Maps Bitbucket PR to common PullRequest type
   */
  private mapToCommonPullRequest(pr: BitbucketPullRequest): PullRequest {
    return {
      number: pr.id,
      title: pr.title,
      body: pr.description,
      state: this.mapPrState(pr.state),
      sourceBranch: pr.source.branch.name,
      targetBranch: pr.destination.branch.name,
      author: this.mapToCommonUser(pr.author),
      createdAt: new Date(pr.created_on),
      updatedAt: new Date(pr.updated_on),
      url: pr.links.html.href,
      isDraft: false, // Bitbucket doesn't have draft PRs
    };
  }

  /**
   * Maps Bitbucket user to common User type
   */
  private mapToCommonUser(user: BitbucketUser): User {
    return {
      id: user.uuid,
      username: user.username || user.nickname || user.display_name,
      displayName: user.display_name,
      avatarUrl: user.links.avatar.href,
    };
  }

  /**
   * Maps Bitbucket comment to common Comment type
   */
  private mapToCommonComment(comment: BitbucketComment): Comment {
    return {
      id: comment.id.toString(),
      body: comment.content.raw,
      author: this.mapToCommonUser(comment.user),
      createdAt: new Date(comment.created_on),
      updatedAt: new Date(comment.updated_on),
      url: comment.links.html.href,
    };
  }

  /**
   * Maps Bitbucket diff stat to common FileChange type
   */
  private mapToCommonFileChange(diff: BitbucketDiffStat): FileChange {
    return {
      path: diff.new?.path || diff.old?.path || '',
      previousPath: diff.status === 'renamed' ? diff.old?.path : undefined,
      status: diff.status as FileChange['status'],
      additions: diff.lines_added,
      deletions: diff.lines_removed,
    };
  }

  /**
   * Maps Bitbucket PR state to common state
   */
  private mapPrState(state: string): 'open' | 'closed' | 'merged' {
    switch (state) {
      case 'OPEN':
        return 'open';
      case 'MERGED':
        return 'merged';
      case 'DECLINED':
      case 'SUPERSEDED':
        return 'closed';
      default:
        return 'open';
    }
  }

  /**
   * Maps common status state to Bitbucket state string
   */
  private mapToStateString(
    state: 'pending' | 'success' | 'failure' | 'error'
  ): 'INPROGRESS' | 'SUCCESSFUL' | 'FAILED' | 'STOPPED' {
    switch (state) {
      case 'pending':
        return 'INPROGRESS';
      case 'success':
        return 'SUCCESSFUL';
      case 'failure':
      case 'error':
        return 'FAILED';
      default:
        return 'STOPPED';
    }
  }
}
