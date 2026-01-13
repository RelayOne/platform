/**
 * @fileoverview GitHub API client for ShipCheck and Relay platform
 * Provides authenticated access to GitHub API for PR operations
 * @module @relay/integrations/github/client
 */

import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import type {
  GitHubAppConfig,
  GitHubPullRequest,
  GitHubPrFile,
  GitHubRepository,
  GitHubUser,
  InstallationToken,
  PrComment,
  CommitStatusConfig,
  CheckRunConfig,
  CheckStatus,
  CheckConclusion,
} from './types';
import { GitHubAuthManager, createInstallationHeaders } from './auth';
import { withRetry } from '../common/http';
import { IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, GitProviderClient, PullRequest, FileChange } from '../common/types';

/**
 * GitHub integration source identifier
 */
const SOURCE: IntegrationSource = 'github';

/**
 * GitHub API client for PR operations
 * Implements GitProviderClient interface for cross-platform compatibility
 */
export class GitHubClient implements GitProviderClient {
  private authManager: GitHubAuthManager;
  private octokit: Octokit | null = null;
  private currentInstallationId: number | null = null;

  /**
   * Creates a new GitHub client
   * @param config - GitHub App configuration
   */
  constructor(config: GitHubAppConfig) {
    this.authManager = new GitHubAuthManager(config);
  }

  /**
   * Gets an authenticated Octokit instance for an installation
   * @param installationId - GitHub App installation ID
   * @returns Authenticated Octokit instance
   */
  async getOctokit(installationId: number): Promise<Octokit> {
    // Return cached instance if same installation
    if (this.octokit && this.currentInstallationId === installationId) {
      return this.octokit;
    }

    const token = await this.authManager.getInstallationToken(
      installationId,
      this.fetchInstallationToken.bind(this)
    );

    this.octokit = new Octokit({
      auth: token.token,
      baseUrl: this.authManager.getApiUrl(),
    });

    this.currentInstallationId = installationId;
    return this.octokit;
  }

  /**
   * Fetches an installation token from GitHub API
   * @param jwt - JWT for authentication
   * @param installationId - Installation ID
   * @returns Installation token
   */
  private async fetchInstallationToken(
    jwt: string,
    installationId: number
  ): Promise<InstallationToken> {
    const tempOctokit = new Octokit({
      auth: jwt,
      baseUrl: this.authManager.getApiUrl(),
    });

    try {
      const response = await tempOctokit.apps.createInstallationAccessToken({
        installation_id: installationId,
      });

      return {
        token: response.data.token,
        expiresAt: new Date(response.data.expires_at),
        installationId,
      };
    } catch (error) {
      throw IntegrationError.fromAxiosError(SOURCE, error);
    }
  }

  /**
   * Gets a pull request by number
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - PR number
   * @returns Pull request details
   */
  async getPullRequest(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPullRequest> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return this.mapPullRequest(data);
    });
  }

  /**
   * Gets files changed in a pull request
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - PR number
   * @returns List of changed files
   */
  async getPullRequestFiles(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPrFile[]> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      const files: GitHubPrFile[] = [];

      // Paginate through all files
      for await (const response of octokit.paginate.iterator(
        octokit.pulls.listFiles,
        { owner, repo, pull_number: prNumber, per_page: 100 }
      )) {
        for (const file of response.data) {
          files.push({
            sha: file.sha,
            filename: file.filename,
            status: file.status as GitHubPrFile['status'],
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            patch: file.patch,
            previousFilename: file.previous_filename,
            rawUrl: file.raw_url,
            contentsUrl: file.contents_url,
          });
        }
      }

      return files;
    });
  }

  /**
   * Gets file content from a repository
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - File path
   * @param ref - Git ref (branch, tag, or SHA)
   * @returns File content as string
   */
  async getFileContent(
    installationId: number,
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('content' in data && data.type === 'file') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      throw new IntegrationError(
        `Path is not a file: ${path}`,
        IntegrationErrorCode.INVALID_REQUEST,
        SOURCE
      );
    });
  }

  /**
   * Creates or updates a PR comment
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - PR number
   * @param comment - Comment configuration
   * @returns Comment ID
   */
  async createOrUpdateComment(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number,
    comment: PrComment
  ): Promise<number> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      if (comment.updateExisting && comment.identifier) {
        // Find existing comment
        const existingComment = await this.findCommentByIdentifier(
          octokit,
          owner,
          repo,
          prNumber,
          comment.identifier
        );

        if (existingComment) {
          // Update existing comment
          const { data } = await octokit.issues.updateComment({
            owner,
            repo,
            comment_id: existingComment.id,
            body: comment.body,
          });
          return data.id;
        }
      }

      // Create new comment
      const { data } = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment.body,
      });

      return data.id;
    });
  }

  /**
   * Finds a comment by identifier marker
   * @param octokit - Octokit instance
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - PR number
   * @param identifier - Comment identifier to search for
   * @returns Comment if found
   */
  private async findCommentByIdentifier(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    identifier: string
  ): Promise<{ id: number } | null> {
    for await (const response of octokit.paginate.iterator(
      octokit.issues.listComments,
      { owner, repo, issue_number: prNumber, per_page: 100 }
    )) {
      for (const comment of response.data) {
        if (comment.body?.includes(identifier)) {
          return { id: comment.id };
        }
      }
    }
    return null;
  }

  /**
   * Creates a commit status
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param sha - Commit SHA
   * @param status - Status configuration
   */
  async createCommitStatus(
    installationId: number,
    owner: string,
    repo: string,
    sha: string,
    status: CommitStatusConfig
  ): Promise<void> {
    const octokit = await this.getOctokit(installationId);

    await withRetry(async () => {
      await octokit.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state: status.state,
        context: status.context,
        description: status.description?.slice(0, 140), // GitHub limit
        target_url: status.targetUrl,
      });
    });
  }

  /**
   * Creates or updates a check run
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param checkRun - Check run configuration
   * @returns Check run ID
   */
  async createCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    checkRun: CheckRunConfig
  ): Promise<number> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      const { data } = await octokit.checks.create({
        owner,
        repo,
        name: checkRun.name,
        head_sha: checkRun.headSha,
        status: checkRun.status,
        conclusion: checkRun.conclusion,
        output: {
          title: checkRun.name,
          summary: checkRun.summary,
        },
        details_url: checkRun.detailsUrl,
      });

      return data.id;
    });
  }

  /**
   * Updates an existing check run
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param checkRunId - Check run ID
   * @param updates - Update fields
   */
  async updateCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    checkRunId: number,
    updates: {
      status?: CheckStatus;
      conclusion?: CheckConclusion;
      summary?: string;
    }
  ): Promise<void> {
    const octokit = await this.getOctokit(installationId);

    await withRetry(async () => {
      const updatePayload: Parameters<typeof octokit.checks.update>[0] = {
        owner,
        repo,
        check_run_id: checkRunId,
      };

      if (updates.status) {
        updatePayload.status = updates.status;
      }

      if (updates.conclusion) {
        updatePayload.conclusion = updates.conclusion;
      }

      if (updates.summary) {
        updatePayload.output = {
          title: 'ShipCheck Analysis',
          summary: updates.summary,
        };
      }

      await octokit.checks.update(updatePayload);
    });
  }

  /**
   * Lists PR reviews
   * @param installationId - Installation ID
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - PR number
   * @returns List of reviews
   */
  async listReviews(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ id: number; state: string; user: GitHubUser }>> {
    const octokit = await this.getOctokit(installationId);

    return withRetry(async () => {
      const { data } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });

      return data.map((review) => ({
        id: review.id,
        state: review.state,
        user: {
          id: review.user?.id ?? 0,
          login: review.user?.login ?? 'unknown',
          type: review.user?.type,
          avatarUrl: review.user?.avatar_url,
        },
      }));
    });
  }

  /**
   * Maps GitHub API pull request to internal type
   * @param data - API response data
   * @returns Mapped pull request
   */
  private mapPullRequest(
    data: RestEndpointMethodTypes['pulls']['get']['response']['data']
  ): GitHubPullRequest {
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? undefined,
      state: data.state as 'open' | 'closed',
      draft: data.draft ?? false,
      base: {
        ref: data.base.ref,
        sha: data.base.sha,
        repo: data.base.repo ? {
          id: data.base.repo.id,
          name: data.base.repo.name,
          fullName: data.base.repo.full_name,
          private: data.base.repo.private,
          owner: {
            id: data.base.repo.owner.id,
            login: data.base.repo.owner.login,
            type: data.base.repo.owner.type,
            avatarUrl: data.base.repo.owner.avatar_url,
          },
          defaultBranch: data.base.repo.default_branch,
          htmlUrl: data.base.repo.html_url,
          cloneUrl: data.base.repo.clone_url,
        } : undefined,
      },
      head: {
        ref: data.head.ref,
        sha: data.head.sha,
        repo: data.head.repo ? {
          id: data.head.repo.id,
          name: data.head.repo.name,
          fullName: data.head.repo.full_name,
          private: data.head.repo.private,
          owner: {
            id: data.head.repo.owner.id,
            login: data.head.repo.owner.login,
            type: data.head.repo.owner.type,
            avatarUrl: data.head.repo.owner.avatar_url,
          },
          defaultBranch: data.head.repo.default_branch,
          htmlUrl: data.head.repo.html_url,
          cloneUrl: data.head.repo.clone_url,
        } : undefined,
      },
      user: {
        id: data.user?.id ?? 0,
        login: data.user?.login ?? 'unknown',
        type: data.user?.type,
        avatarUrl: data.user?.avatar_url,
      },
      labels: data.labels.map((label) => ({
        id: label.id ?? 0,
        name: typeof label === 'string' ? label : label.name ?? '',
        color: typeof label === 'string' ? undefined : label.color ?? undefined,
        description: typeof label === 'string' ? undefined : label.description ?? undefined,
      })),
      commits: data.commits,
      changedFiles: data.changed_files,
      additions: data.additions,
      deletions: data.deletions,
      mergeable: data.mergeable ?? undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      htmlUrl: data.html_url,
    };
  }

  // GitProviderClient interface implementation

  /**
   * Gets PR as common PullRequest type
   */
  async getPR(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequest> {
    const pr = await this.getPullRequest(installationId, owner, repo, prNumber);
    return {
      id: pr.number.toString(),
      number: pr.number,
      title: pr.title,
      description: pr.body,
      state: pr.state,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      author: {
        id: pr.user.id.toString(),
        username: pr.user.login,
        displayName: pr.user.login,
        avatarUrl: pr.user.avatarUrl,
      },
      reviewers: [],
      labels: pr.labels.map((l) => l.name),
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      url: pr.htmlUrl,
    };
  }

  /**
   * Gets files as common FileChange type
   */
  async getPRFiles(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<FileChange[]> {
    const files = await this.getPullRequestFiles(installationId, owner, repo, prNumber);
    return files.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }

  /**
   * Creates a comment (implements interface)
   */
  async createComment(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<string> {
    const commentId = await this.createOrUpdateComment(installationId, owner, repo, prNumber, {
      body,
    });
    return commentId.toString();
  }

  /**
   * Creates a commit status (implements interface)
   */
  async setCommitStatus(
    installationId: number,
    owner: string,
    repo: string,
    sha: string,
    status: 'pending' | 'success' | 'failure' | 'error',
    context: string,
    description?: string,
    targetUrl?: string
  ): Promise<void> {
    await this.createCommitStatus(installationId, owner, repo, sha, {
      state: status,
      context,
      description,
      targetUrl,
    });
  }

  /**
   * Invalidates the cached token for an installation
   * @param installationId - Installation ID
   */
  invalidateAuth(installationId: number): void {
    this.authManager.invalidateToken(installationId);
    if (this.currentInstallationId === installationId) {
      this.octokit = null;
      this.currentInstallationId = null;
    }
  }
}
