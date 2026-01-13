/**
 * @fileoverview Shared integrations package for Relay platform
 * Provides unified clients for GitHub, GitLab, Jira, Slack, Linear, Bitbucket, Discord, and Microsoft Teams
 * @module @relay/integrations
 */

// Common utilities and types
export * from './common';

// GitHub integration
export * as github from './github';
export { GitHubClient } from './github/client';
export { GitHubAuthManager } from './github/auth';
export { verifyWebhookSignature as verifyGitHubWebhook } from './github/webhooks';
export { PrFilterEngine } from './github/filters';

// GitLab integration
export * as gitlab from './gitlab';
export { GitLabClient } from './gitlab/client';
export { verifyWebhookToken as verifyGitLabWebhook } from './gitlab/webhooks';

// Slack integration
export * as slack from './slack';
export { SlackClient } from './slack/client';
export { verifySlackSignature } from './slack/webhooks';
export * as SlackBlocks from './slack/blocks';

// Linear integration
export * as linear from './linear';
export { LinearClient } from './linear/client';
export { verifyWebhookSignature as verifyLinearWebhook } from './linear/webhooks';

// Jira integration
export * as jira from './jira';
export { JiraClient } from './jira/client';
export { verifyWebhookSignature as verifyJiraWebhook } from './jira/webhooks';

// Bitbucket integration
export * as bitbucket from './bitbucket';
export { BitbucketClient } from './bitbucket/client';
export { verifyWebhook as verifyBitbucketWebhook } from './bitbucket/webhooks';

// Discord integration
export * as discord from './discord';
export { DiscordClient } from './discord/client';
export { verifyWebhookSignature as verifyDiscordWebhook } from './discord/webhooks';

// Microsoft Teams integration
export * as teams from './teams';
export { TeamsClient } from './teams/client';
export { verifyBotFrameworkToken as verifyTeamsWebhook } from './teams/webhooks';

// Re-export common types for convenience
export type {
  IntegrationSource,
  IntegrationConfig,
  OAuthToken,
  WebhookEvent,
  ApiResponse,
  PullRequest,
  FileChange,
  User,
  Repository,
  Comment,
  Issue,
  CommitStatus,
  ChatMessage,
  GitProviderClient,
  IssueTrackerClient,
  ChatPlatformClient,
} from './common/types';

export {
  IntegrationError,
  IntegrationErrorCode,
  WebhookVerificationError,
  AuthenticationError,
  RateLimitError,
  ConfigurationError,
  isIntegrationError,
} from './common/errors';

export {
  createHttpClient,
  withRetry,
  sleep,
  fetchAllPages,
  bearerAuthHeaders,
  basicAuthHeaders,
  buildUrl,
} from './common/http';
