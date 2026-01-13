/**
 * @fileoverview GitLab API client for ShipCheck and Relay platform
 * @module @relay/integrations/gitlab/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  GitLabConfig,
  GitLabMergeRequest,
  GitLabMrChanges,
  GitLabDiff,
  GitLabProject,
  GitLabNote,
  GitLabCommitStatusConfig,
  CommitStatus,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { IntegrationError, IntegrationErrorCode, ConfigurationError } from '../common/errors';
import type { IntegrationSource, GitProviderClient, PullRequest, FileChange } from '../common/types';

/**
 * GitLab integration source identifier
 */
const SOURCE: IntegrationSource = 'gitlab';

/**
 * GitLab API client
 * Implements GitProviderClient interface for cross-platform compatibility
 */
export class GitLabClient implements GitProviderClient {
  private http: AxiosInstance;
  private config: GitLabConfig;

  /**
   * Creates a new GitLab client
   * @param config - GitLab configuration
   */
  constructor(config: GitLabConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: `${config.baseUrl}/api/v4`,
      timeout: 30000,
    });

    // Add auth header to all requests
    this.http.interceptors.request.use((request) => {
      request.headers = {
        ...request.headers,
        ...bearerAuthHeaders(config.accessToken),
      };
      return request;
    });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: GitLabConfig): void {
    if (!config.baseUrl) {
      throw new ConfigurationError(SOURCE, 'GitLab base URL is required');
    }
    if (!config.accessToken) {
      throw new ConfigurationError(SOURCE, 'GitLab access token is required');
    }
  }

  /**
   * Gets a merge request by IID
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @returns Merge request details
   */
  async getMergeRequest(
    projectId: number | string,
    mrIid: number
  ): Promise<GitLabMergeRequest> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.get(
        `/projects/${encodedProjectId}/merge_requests/${mrIid}`
      );
      return this.mapMergeRequest(data);
    });
  }

  /**
   * Gets merge request changes/diffs
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @returns MR with changes
   */
  async getMergeRequestChanges(
    projectId: number | string,
    mrIid: number
  ): Promise<GitLabMrChanges> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.get(
        `/projects/${encodedProjectId}/merge_requests/${mrIid}/changes`
      );
      return {
        ...this.mapMergeRequest(data),
        changes: (data.changes || []).map(this.mapDiff),
      };
    });
  }

  /**
   * Gets file content from a repository
   * @param projectId - Project ID or path
   * @param path - File path
   * @param ref - Git ref (branch, tag, or SHA)
   * @returns File content as string
   */
  async getFileContent(
    projectId: number | string,
    path: string,
    ref: string
  ): Promise<string> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;
    const encodedPath = encodeURIComponent(path);

    return withRetry(async () => {
      const { data } = await this.http.get(
        `/projects/${encodedProjectId}/repository/files/${encodedPath}`,
        { params: { ref } }
      );
      return Buffer.from(data.content, 'base64').toString('utf-8');
    });
  }

  /**
   * Creates a note (comment) on an MR
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @param body - Note body
   * @returns Created note
   */
  async createNote(
    projectId: number | string,
    mrIid: number,
    body: string
  ): Promise<GitLabNote> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.post(
        `/projects/${encodedProjectId}/merge_requests/${mrIid}/notes`,
        { body }
      );
      return this.mapNote(data);
    });
  }

  /**
   * Updates an existing note
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @param noteId - Note ID
   * @param body - New note body
   * @returns Updated note
   */
  async updateNote(
    projectId: number | string,
    mrIid: number,
    noteId: number,
    body: string
  ): Promise<GitLabNote> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.put(
        `/projects/${encodedProjectId}/merge_requests/${mrIid}/notes/${noteId}`,
        { body }
      );
      return this.mapNote(data);
    });
  }

  /**
   * Lists notes on an MR
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @returns List of notes
   */
  async listNotes(
    projectId: number | string,
    mrIid: number
  ): Promise<GitLabNote[]> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.get(
        `/projects/${encodedProjectId}/merge_requests/${mrIid}/notes`,
        { params: { per_page: 100 } }
      );
      return data.map(this.mapNote);
    });
  }

  /**
   * Creates or updates a note by identifier
   * @param projectId - Project ID or path
   * @param mrIid - MR IID
   * @param body - Note body
   * @param identifier - Identifier to find existing note
   * @returns Note ID
   */
  async createOrUpdateNote(
    projectId: number | string,
    mrIid: number,
    body: string,
    identifier?: string
  ): Promise<number> {
    if (identifier) {
      const notes = await this.listNotes(projectId, mrIid);
      const existing = notes.find((n) => n.body.includes(identifier));
      if (existing) {
        const updated = await this.updateNote(projectId, mrIid, existing.id, body);
        return updated.id;
      }
    }

    const created = await this.createNote(projectId, mrIid, body);
    return created.id;
  }

  /**
   * Creates a commit status
   * @param projectId - Project ID or path
   * @param sha - Commit SHA
   * @param status - Status configuration
   */
  async createCommitStatus(
    projectId: number | string,
    sha: string,
    status: GitLabCommitStatusConfig
  ): Promise<void> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    await withRetry(async () => {
      await this.http.post(
        `/projects/${encodedProjectId}/statuses/${sha}`,
        {
          state: status.state,
          name: status.name,
          description: status.description?.slice(0, 140),
          target_url: status.targetUrl,
          pipeline_id: status.pipelineId,
          coverage: status.coverage,
        }
      );
    });
  }

  /**
   * Gets project details
   * @param projectId - Project ID or path
   * @returns Project details
   */
  async getProject(projectId: number | string): Promise<GitLabProject> {
    const encodedProjectId = typeof projectId === 'string'
      ? encodeURIComponent(projectId)
      : projectId;

    return withRetry(async () => {
      const { data } = await this.http.get(`/projects/${encodedProjectId}`);
      return this.mapProject(data);
    });
  }

  /**
   * Maps API response to GitLabMergeRequest type
   */
  private mapMergeRequest(data: Record<string, unknown>): GitLabMergeRequest {
    return {
      id: data.id as number,
      iid: data.iid as number,
      projectId: data.project_id as number,
      title: data.title as string,
      description: data.description as string | undefined,
      state: data.state as GitLabMergeRequest['state'],
      draft: (data.draft as boolean) || (data.work_in_progress as boolean) || false,
      targetBranch: data.target_branch as string,
      sourceBranch: data.source_branch as string,
      targetProjectId: data.target_project_id as number,
      sourceProjectId: data.source_project_id as number,
      author: {
        id: (data.author as Record<string, unknown>)?.id as number,
        username: (data.author as Record<string, unknown>)?.username as string,
        name: (data.author as Record<string, unknown>)?.name as string,
        avatarUrl: (data.author as Record<string, unknown>)?.avatar_url as string | undefined,
      },
      reviewers: Array.isArray(data.reviewers)
        ? data.reviewers.map((r: Record<string, unknown>) => ({
            id: r.id as number,
            username: r.username as string,
            name: r.name as string,
            avatarUrl: r.avatar_url as string | undefined,
          }))
        : undefined,
      labels: (data.labels as string[]) || [],
      sha: data.sha as string,
      diffRefs: data.diff_refs
        ? {
            baseSha: (data.diff_refs as Record<string, string>).base_sha,
            headSha: (data.diff_refs as Record<string, string>).head_sha,
            startSha: (data.diff_refs as Record<string, string>).start_sha,
          }
        : undefined,
      changesCount: data.changes_count as string | undefined,
      hasConflicts: (data.has_conflicts as boolean) || false,
      mergeStatus: data.merge_status as string,
      webUrl: data.web_url as string,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      mergedAt: data.merged_at ? new Date(data.merged_at as string) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at as string) : undefined,
    };
  }

  /**
   * Maps API response to GitLabDiff type
   */
  private mapDiff(data: Record<string, unknown>): GitLabDiff {
    return {
      oldPath: data.old_path as string,
      newPath: data.new_path as string,
      aMode: data.a_mode as string | undefined,
      bMode: data.b_mode as string | undefined,
      newFile: data.new_file as boolean,
      renamedFile: data.renamed_file as boolean,
      deletedFile: data.deleted_file as boolean,
      diff: data.diff as string,
    };
  }

  /**
   * Maps API response to GitLabNote type
   */
  private mapNote(data: Record<string, unknown>): GitLabNote {
    return {
      id: data.id as number,
      body: data.body as string,
      author: {
        id: (data.author as Record<string, unknown>)?.id as number,
        username: (data.author as Record<string, unknown>)?.username as string,
        name: (data.author as Record<string, unknown>)?.name as string,
        avatarUrl: (data.author as Record<string, unknown>)?.avatar_url as string | undefined,
      },
      system: data.system as boolean,
      noteableType: data.noteable_type as string,
      noteableId: data.noteable_id as number,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      resolvable: data.resolvable as boolean | undefined,
      resolved: data.resolved as boolean | undefined,
    };
  }

  /**
   * Maps API response to GitLabProject type
   */
  private mapProject(data: Record<string, unknown>): GitLabProject {
    return {
      id: data.id as number,
      name: data.name as string,
      pathWithNamespace: data.path_with_namespace as string,
      description: data.description as string | undefined,
      webUrl: data.web_url as string,
      httpUrlToRepo: data.http_url_to_repo as string,
      sshUrlToRepo: data.ssh_url_to_repo as string,
      defaultBranch: data.default_branch as string,
      visibility: data.visibility as 'private' | 'internal' | 'public',
      namespace: data.namespace
        ? {
            id: (data.namespace as Record<string, unknown>).id as number,
            name: (data.namespace as Record<string, unknown>).name as string,
            path: (data.namespace as Record<string, unknown>).path as string,
          }
        : undefined,
    };
  }

  // GitProviderClient interface implementation

  /**
   * Gets MR as common PullRequest type
   */
  async getPR(
    _installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequest> {
    const projectPath = `${owner}/${repo}`;
    const mr = await this.getMergeRequest(projectPath, prNumber);

    return {
      id: mr.id.toString(),
      number: mr.iid,
      title: mr.title,
      description: mr.description,
      state: mr.state === 'merged' ? 'closed' : mr.state,
      sourceBranch: mr.sourceBranch,
      targetBranch: mr.targetBranch,
      author: {
        id: mr.author.id.toString(),
        username: mr.author.username,
        displayName: mr.author.name,
        avatarUrl: mr.author.avatarUrl,
      },
      reviewers: (mr.reviewers || []).map((r) => ({
        id: r.id.toString(),
        username: r.username,
        displayName: r.name,
        avatarUrl: r.avatarUrl,
      })),
      labels: mr.labels,
      createdAt: mr.createdAt,
      updatedAt: mr.updatedAt,
      url: mr.webUrl,
    };
  }

  /**
   * Gets files as common FileChange type
   */
  async getPRFiles(
    _installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<FileChange[]> {
    const projectPath = `${owner}/${repo}`;
    const mrChanges = await this.getMergeRequestChanges(projectPath, prNumber);

    return mrChanges.changes.map((change) => ({
      path: change.newPath,
      status: change.newFile
        ? 'added'
        : change.deletedFile
        ? 'removed'
        : change.renamedFile
        ? 'renamed'
        : 'modified',
      additions: 0, // GitLab doesn't provide line counts in diff
      deletions: 0,
      patch: change.diff,
    }));
  }

  /**
   * Creates a comment
   */
  async createComment(
    _installationId: number,
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<string> {
    const projectPath = `${owner}/${repo}`;
    const note = await this.createNote(projectPath, prNumber, body);
    return note.id.toString();
  }

  /**
   * Sets commit status
   */
  async setCommitStatus(
    _installationId: number,
    owner: string,
    repo: string,
    sha: string,
    status: 'pending' | 'success' | 'failure' | 'error',
    context: string,
    description?: string,
    targetUrl?: string
  ): Promise<void> {
    const projectPath = `${owner}/${repo}`;
    const gitlabStatus: CommitStatus = status === 'error' ? 'failed' : status;

    await this.createCommitStatus(projectPath, sha, {
      state: gitlabStatus,
      name: context,
      description,
      targetUrl,
    });
  }
}
