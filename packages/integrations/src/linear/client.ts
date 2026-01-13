/**
 * @fileoverview Linear API client
 * @module @relay/integrations/linear/client
 */

import { LinearClient as LinearSDK, Issue, Comment, Team, Project, User, WorkflowState, IssueLabel } from '@linear/sdk';
import type {
  LinearConfig,
  LinearIssue,
  LinearComment,
  LinearTeam,
  LinearProject,
  LinearUser,
  LinearState,
  LinearLabel,
  LinearCycle,
  CreateIssueInput,
  UpdateIssueInput,
  CreateCommentInput,
  IssueFilterOptions,
  PaginatedResponse,
} from './types';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, IssueTrackerClient, Issue as CommonIssue, Comment as CommonComment } from '../common/types';

/**
 * Linear integration source identifier
 */
const SOURCE: IntegrationSource = 'linear';

/**
 * Linear API client wrapper
 * Implements IssueTrackerClient interface for cross-platform compatibility
 */
export class LinearClient implements IssueTrackerClient {
  private client: LinearSDK;
  private config: LinearConfig;

  /**
   * Creates a new Linear client
   * @param config - Linear configuration
   */
  constructor(config: LinearConfig) {
    this.validateConfig(config);
    this.config = config;
    this.client = new LinearSDK({ apiKey: config.apiKey });
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: LinearConfig): void {
    if (!config.apiKey) {
      throw new ConfigurationError(SOURCE, 'Linear API key is required');
    }
  }

  /**
   * Gets an issue by ID
   * @param issueId - Issue ID
   * @returns Issue details
   */
  async getIssue(issueId: string): Promise<LinearIssue> {
    try {
      const issue = await this.client.issue(issueId);
      return this.mapIssue(issue);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets an issue by identifier (e.g., "ENG-123")
   * @param identifier - Issue identifier
   * @returns Issue details
   */
  async getIssueByIdentifier(identifier: string): Promise<LinearIssue> {
    try {
      // Linear SDK doesn't have direct identifier lookup, use search
      const result = await this.client.issues({
        filter: {
          or: [
            { number: { eq: parseInt(identifier.split('-')[1], 10) } },
          ],
        },
        first: 1,
      });

      const issues = result.nodes;
      if (issues.length === 0) {
        throw new IntegrationError(
          `Issue not found: ${identifier}`,
          IntegrationErrorCode.NOT_FOUND,
          SOURCE
        );
      }

      return this.mapIssue(issues[0]);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Creates a new issue
   * @param input - Issue creation input
   * @returns Created issue
   */
  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    try {
      const payload = await this.client.createIssue({
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        stateId: input.stateId,
        assigneeId: input.assigneeId,
        projectId: input.projectId,
        cycleId: input.cycleId,
        labelIds: input.labelIds,
        parentId: input.parentId,
        dueDate: input.dueDate,
        estimate: input.estimate,
      });

      if (!payload.success || !payload.issue) {
        throw new IntegrationError(
          'Failed to create issue',
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      const issue = await payload.issue;
      return this.mapIssue(issue);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Updates an existing issue
   * @param issueId - Issue ID
   * @param input - Issue update input
   * @returns Updated issue
   */
  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<LinearIssue> {
    try {
      const payload = await this.client.updateIssue(issueId, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        stateId: input.stateId,
        assigneeId: input.assigneeId,
        projectId: input.projectId,
        cycleId: input.cycleId,
        labelIds: input.labelIds,
        parentId: input.parentId,
        dueDate: input.dueDate,
        estimate: input.estimate,
        trashed: input.trashed,
      });

      if (!payload.success || !payload.issue) {
        throw new IntegrationError(
          'Failed to update issue',
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      const issue = await payload.issue;
      return this.mapIssue(issue);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Lists issues with filtering
   * @param options - Filter options
   * @returns Paginated issues
   */
  async listIssues(options: IssueFilterOptions = {}): Promise<PaginatedResponse<LinearIssue>> {
    try {
      const filter: any = {};

      if (options.teamId) {
        filter.team = { id: { eq: options.teamId } };
      }
      if (options.assigneeId) {
        filter.assignee = { id: { eq: options.assigneeId } };
      }
      if (options.projectId) {
        filter.project = { id: { eq: options.projectId } };
      }
      if (options.stateId) {
        filter.state = { id: { eq: options.stateId } };
      }
      if (options.stateTypes && options.stateTypes.length > 0) {
        filter.state = { ...filter.state, type: { in: options.stateTypes } };
      }
      if (options.priority !== undefined) {
        filter.priority = { eq: options.priority };
      }
      if (options.cycleId) {
        filter.cycle = { id: { eq: options.cycleId } };
      }

      const result = await this.client.issues({
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: options.first || 50,
        after: options.after,
        includeArchived: options.includeTrashed,
      });

      const issues = await Promise.all(result.nodes.map((issue) => this.mapIssue(issue)));

      return {
        nodes: issues,
        pageInfo: {
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
        },
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Searches issues by query
   * @param query - Search query
   * @param options - Additional options
   * @returns Search results
   */
  async searchIssues(
    query: string,
    options?: { first?: number; teamId?: string }
  ): Promise<LinearIssue[]> {
    try {
      const result = await this.client.searchIssues(query, {
        first: options?.first || 25,
        ...(options?.teamId && {
          filter: { team: { id: { eq: options.teamId } } },
        }),
      });

      const issues = await Promise.all(
        (result.nodes as Issue[]).map((issue) => this.mapIssue(issue))
      );

      return issues;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Creates a comment on an issue
   * @param input - Comment creation input
   * @returns Created comment
   */
  async createComment(input: CreateCommentInput): Promise<LinearComment> {
    try {
      const payload = await this.client.createComment({
        issueId: input.issueId,
        body: input.body,
        parentId: input.parentId,
      });

      if (!payload.success || !payload.comment) {
        throw new IntegrationError(
          'Failed to create comment',
          IntegrationErrorCode.PROVIDER_ERROR,
          SOURCE
        );
      }

      const comment = await payload.comment;
      return this.mapComment(comment);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets comments for an issue
   * @param issueId - Issue ID
   * @returns Array of comments
   */
  async getComments(issueId: string): Promise<LinearComment[]> {
    try {
      const issue = await this.client.issue(issueId);
      const commentsConnection = await issue.comments();
      const comments = await Promise.all(
        commentsConnection.nodes.map((comment) => this.mapComment(comment))
      );
      return comments;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets team by ID
   * @param teamId - Team ID
   * @returns Team details
   */
  async getTeam(teamId: string): Promise<LinearTeam> {
    try {
      const team = await this.client.team(teamId);
      return this.mapTeam(team);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Lists teams
   * @returns Array of teams
   */
  async listTeams(): Promise<LinearTeam[]> {
    try {
      const result = await this.client.teams();
      return result.nodes.map((team) => this.mapTeam(team));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets workflow states for a team
   * @param teamId - Team ID
   * @returns Array of states
   */
  async getWorkflowStates(teamId: string): Promise<LinearState[]> {
    try {
      const team = await this.client.team(teamId);
      const statesConnection = await team.states();
      return statesConnection.nodes.map((state) => this.mapState(state, teamId));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets labels
   * @param teamId - Optional team ID for team labels
   * @returns Array of labels
   */
  async getLabels(teamId?: string): Promise<LinearLabel[]> {
    try {
      let labels: IssueLabel[];

      if (teamId) {
        const team = await this.client.team(teamId);
        const labelsConnection = await team.labels();
        labels = labelsConnection.nodes;
      } else {
        const labelsConnection = await this.client.issueLabels();
        labels = labelsConnection.nodes;
      }

      return labels.map((label) => this.mapLabel(label, teamId));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets current user (viewer)
   * @returns Current user
   */
  async getCurrentUser(): Promise<LinearUser> {
    try {
      const viewer = await this.client.viewer;
      return this.mapUser(viewer);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Maps SDK Issue to LinearIssue type
   */
  private async mapIssue(issue: Issue): Promise<LinearIssue> {
    const [assignee, creator, team, project, state, labelsConnection, cycle] = await Promise.all([
      issue.assignee?.catch(() => undefined),
      issue.creator?.catch(() => undefined),
      issue.team?.catch(() => undefined),
      issue.project?.catch(() => undefined),
      issue.state?.catch(() => undefined),
      issue.labels()?.catch(() => ({ nodes: [] })),
      issue.cycle?.catch(() => undefined),
    ]);

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority as any,
      priorityLabel: issue.priorityLabel,
      estimate: issue.estimate,
      sortOrder: issue.sortOrder,
      branchName: issue.branchName,
      dueDate: issue.dueDate?.toISOString().split('T')[0],
      startedAt: issue.startedAt?.toISOString(),
      completedAt: issue.completedAt?.toISOString(),
      canceledAt: issue.canceledAt?.toISOString(),
      autoClosedAt: issue.autoClosedAt?.toISOString(),
      autoArchivedAt: issue.autoArchivedAt?.toISOString(),
      trashed: issue.trashed,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      url: issue.url,
      assignee: assignee ? this.mapUser(assignee) : undefined,
      creator: creator ? this.mapUser(creator) : undefined,
      team: team ? this.mapTeam(team) : undefined,
      project: project ? await this.mapProject(project) : undefined,
      state: state ? this.mapState(state, team?.id || '') : undefined,
      labels: labelsConnection.nodes.map((l) => this.mapLabel(l)),
      cycle: cycle ? await this.mapCycle(cycle) : undefined,
      parentId: undefined, // Would need additional query
    };
  }

  /**
   * Maps SDK Comment to LinearComment type
   */
  private async mapComment(comment: Comment): Promise<LinearComment> {
    const user = await comment.user?.catch(() => undefined);
    const issue = await comment.issue;

    return {
      id: comment.id,
      body: comment.body,
      user: user ? this.mapUser(user) : undefined,
      issueId: issue.id,
      parentId: undefined, // Linear doesn't have comment threads in SDK
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      edited: comment.editedAt !== undefined,
      url: comment.url,
    };
  }

  /**
   * Maps SDK User to LinearUser type
   */
  private mapUser(user: User): LinearUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      active: user.active,
      admin: user.admin,
      timezone: user.timezone,
    };
  }

  /**
   * Maps SDK Team to LinearTeam type
   */
  private mapTeam(team: Team): LinearTeam {
    return {
      id: team.id,
      name: team.name,
      key: team.key,
      description: team.description,
      icon: team.icon,
      color: team.color,
      private: team.private,
      timezone: team.timezone,
    };
  }

  /**
   * Maps SDK Project to LinearProject type
   */
  private async mapProject(project: Project): Promise<LinearProject> {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      slugId: project.slugId,
      icon: project.icon,
      color: project.color,
      state: project.state,
      startDate: project.startDate?.toISOString().split('T')[0],
      targetDate: project.targetDate?.toISOString().split('T')[0],
      progress: project.progress,
      url: project.url,
    };
  }

  /**
   * Maps SDK WorkflowState to LinearState type
   */
  private mapState(state: WorkflowState, teamId: string): LinearState {
    return {
      id: state.id,
      name: state.name,
      color: state.color,
      description: state.description,
      type: state.type as any,
      position: state.position,
      teamId,
    };
  }

  /**
   * Maps SDK IssueLabel to LinearLabel type
   */
  private mapLabel(label: IssueLabel, teamId?: string): LinearLabel {
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
      teamId,
    };
  }

  /**
   * Maps SDK Cycle to LinearCycle type
   */
  private async mapCycle(cycle: any): Promise<LinearCycle> {
    const team = await cycle.team;
    return {
      id: cycle.id,
      number: cycle.number,
      name: cycle.name,
      startsAt: cycle.startsAt.toISOString(),
      endsAt: cycle.endsAt.toISOString(),
      progress: cycle.progress,
      teamId: team.id,
    };
  }

  /**
   * Maps errors to IntegrationError
   */
  private mapError(error: unknown): IntegrationError {
    if (error instanceof IntegrationError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found') || message.includes('Not found')) {
      return new IntegrationError(message, IntegrationErrorCode.NOT_FOUND, SOURCE);
    }

    if (message.includes('unauthorized') || message.includes('Unauthorized')) {
      return new IntegrationError(message, IntegrationErrorCode.AUTH_FAILED, SOURCE);
    }

    return new IntegrationError(message, IntegrationErrorCode.PROVIDER_ERROR, SOURCE);
  }

  // IssueTrackerClient interface implementation

  /**
   * Gets issue (interface method)
   */
  async getIssueById(issueId: string): Promise<CommonIssue> {
    const issue = await this.getIssue(issueId);
    return {
      id: issue.id,
      key: issue.identifier,
      title: issue.title,
      description: issue.description,
      status: issue.state?.name || 'Unknown',
      priority: issue.priorityLabel,
      assignee: issue.assignee ? {
        id: issue.assignee.id,
        username: issue.assignee.email,
        displayName: issue.assignee.displayName,
        avatarUrl: issue.assignee.avatarUrl,
      } : undefined,
      labels: issue.labels.map((l) => l.name),
      url: issue.url,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
    };
  }

  /**
   * Creates issue (interface method)
   */
  async createIssueFromRequest(
    projectKey: string,
    title: string,
    description?: string,
    options?: { priority?: string; labels?: string[] }
  ): Promise<CommonIssue> {
    // projectKey is teamId in Linear
    const issue = await this.createIssue({
      teamId: projectKey,
      title,
      description,
      priority: options?.priority ? this.parsePriority(options.priority) : undefined,
    });

    return {
      id: issue.id,
      key: issue.identifier,
      title: issue.title,
      description: issue.description,
      status: issue.state?.name || 'Unknown',
      priority: issue.priorityLabel,
      labels: issue.labels.map((l) => l.name),
      url: issue.url,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
    };
  }

  /**
   * Creates comment (interface method)
   */
  async addComment(issueId: string, body: string): Promise<CommonComment> {
    const comment = await this.createComment({ issueId, body });
    return {
      id: comment.id,
      body: comment.body,
      author: comment.user ? {
        id: comment.user.id,
        username: comment.user.email,
        displayName: comment.user.displayName,
        avatarUrl: comment.user.avatarUrl,
      } : undefined,
      createdAt: new Date(comment.createdAt),
    };
  }

  /**
   * Parses priority string to Linear priority number
   */
  private parsePriority(priority: string): 0 | 1 | 2 | 3 | 4 {
    const lower = priority.toLowerCase();
    if (lower === 'urgent') return 1;
    if (lower === 'high') return 2;
    if (lower === 'medium') return 3;
    if (lower === 'low') return 4;
    return 0;
  }
}
