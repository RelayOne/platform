/**
 * @fileoverview Shared integrations package for Relay platform
 * Provides unified clients for GitHub, GitLab, Jira, Slack, Linear, Bitbucket, Discord, Microsoft Teams,
 * Asana, ClickUp, Monday, Notion, Trello, Wrike, Salesforce, HubSpot, Pipedrive, Google Drive, and OneDrive
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

// Asana integration
export * as asana from './asana';
export { AsanaClient } from './asana/client';
export { AsanaOAuthClient } from './asana/oauth';
export { AsanaWebhookHandler, verifyAsanaWebhook } from './asana/webhooks';

// ClickUp integration
export * as clickup from './clickup';
export { ClickUpClient } from './clickup/client';
export { ClickUpOAuthClient } from './clickup/oauth';
export { ClickUpWebhookHandler, verifyClickUpWebhook } from './clickup/webhooks';

// Monday.com integration
export * as monday from './monday';
export { MondayClient } from './monday/client';
export { MondayOAuthClient } from './monday/oauth';
export { MondayWebhookHandler, verifyMondayWebhook } from './monday/webhooks';

// Notion integration
export * as notion from './notion';
export { NotionClient } from './notion/client';
export { NotionOAuthClient } from './notion/oauth';
export { NotionPollingService } from './notion/polling';

// Trello integration
export * as trello from './trello';
export { TrelloClient } from './trello/client';
export { TrelloOAuthClient } from './trello/oauth';
export { TrelloWebhookHandler, verifyTrelloWebhook } from './trello/webhooks';

// Wrike integration
export * as wrike from './wrike';
export { WrikeClient } from './wrike/client';
export { WrikeOAuthClient } from './wrike/oauth';
export { WrikeWebhookHandler, verifyWrikeWebhook } from './wrike/webhooks';

// Tracker Base - Common utilities for all tracker integrations
export * as trackerBase from './tracker-base';
export { BaseTrackerClient } from './tracker-base/base-client';
export { BaseWebhookHandler } from './tracker-base/base-webhook-handler';
export { TrackerRateLimiter } from './tracker-base/rate-limiter';
export { RateLimitRecoveryManager } from './tracker-base/rate-limit-recovery';
export { FieldMapper } from './tracker-base/field-mapper';
export { TrackerCache } from './tracker-base/cache';
export { ErrorReporter } from './tracker-base/error-reporter';

// Salesforce CRM integration
export * as salesforce from './salesforce';
export { SalesforceClient } from './salesforce/client';
export { SalesforceOAuthClient, SalesforceJwtOAuthClient } from './salesforce/oauth';
export {
  SalesforceOutboundMessageHandler,
  SalesforcePlatformEventHandler,
  SalesforceChangeDataCaptureHandler,
  verifyWebhookSignature as verifySalesforceWebhook,
} from './salesforce/webhooks';

// HubSpot CRM integration
export * as hubspot from './hubspot';
export { HubSpotClient } from './hubspot/client';
export { HubSpotOAuthClient } from './hubspot/oauth';
export {
  HubSpotWebhookHandler,
  verifyHubSpotWebhook,
} from './hubspot/webhooks';

// Pipedrive CRM integration
export * as pipedrive from './pipedrive';
export { PipedriveClient } from './pipedrive/client';
export { PipedriveOAuthClient } from './pipedrive/oauth';
export {
  PipedriveWebhookHandler,
  verifyPipedriveWebhook,
} from './pipedrive/webhooks';

// Google Drive cloud storage integration
export * as googleDrive from './google-drive';
export { GoogleDriveClient } from './google-drive/client';
export { GoogleDriveOAuthClient } from './google-drive/oauth';
export {
  GoogleDriveWebhookHandler,
  verifyGoogleDriveWebhook,
} from './google-drive/webhooks';

// OneDrive/Microsoft Graph cloud storage integration
export * as onedrive from './onedrive';
export { OneDriveClient } from './onedrive/client';
export { OneDriveOAuthClient } from './onedrive/oauth';
export {
  OneDriveWebhookHandler,
  verifyOneDriveWebhook,
} from './onedrive/webhooks';

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
