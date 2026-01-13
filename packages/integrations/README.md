# @relay/integrations

Shared integration clients for the Relay Platform. Provides unified TypeScript clients for external service integrations including Git providers, issue trackers, and chat platforms.

## Installation

```bash
pnpm add @relay/integrations
```

## Features

- **Git Providers**: GitHub, GitLab, Bitbucket
- **Issue Trackers**: Jira, Linear
- **Chat Platforms**: Slack (Discord and Teams planned)
- **Common Interfaces**: Unified types for cross-platform compatibility
- **Webhook Handling**: Signature verification and payload parsing
- **Error Handling**: Typed errors with retry support
- **Full TypeScript**: Complete type definitions with JSDoc documentation

## Usage

### GitHub

```typescript
import { GitHubClient, verifyGitHubWebhook } from '@relay/integrations';

// Create client
const github = new GitHubClient({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY,
  installationId: parseInt(process.env.GITHUB_INSTALLATION_ID),
});

// Get pull request
const pr = await github.getPullRequest(installationId, 'owner', 'repo', 123);

// Get PR files
const files = await github.getPullRequestFiles(installationId, 'owner', 'repo', 123);

// Create commit status
await github.createCommitStatus(installationId, 'owner', 'repo', 'sha', {
  state: 'success',
  context: 'ci/shipcheck',
  description: 'All checks passed',
  targetUrl: 'https://shipcheck.io/reports/123',
});

// Verify webhook
const result = verifyGitHubWebhook(payload, signature, secret);
```

### GitLab

```typescript
import { GitLabClient, verifyGitLabWebhook } from '@relay/integrations';

const gitlab = new GitLabClient({
  baseUrl: 'https://gitlab.com',
  accessToken: process.env.GITLAB_TOKEN,
});

// Get merge request
const mr = await gitlab.getMergeRequest('owner/repo', 123);

// Create note (comment)
await gitlab.createNote('owner/repo', 123, 'Review comment');

// Set commit status
await gitlab.createCommitStatus('owner/repo', 'sha', {
  state: 'success',
  name: 'ci/shipcheck',
});
```

### Jira

```typescript
import { JiraClient, verifyJiraWebhook } from '@relay/integrations';

const jira = new JiraClient({
  baseUrl: 'https://company.atlassian.net',
  email: process.env.JIRA_EMAIL,
  apiToken: process.env.JIRA_API_TOKEN,
});

// Get issue
const issue = await jira.getIssue('PROJ-123');

// Create issue
const newIssue = await jira.createIssue({
  projectKey: 'PROJ',
  issueType: 'Bug',
  summary: 'Fix authentication bug',
  description: 'Users cannot log in...',
  priority: 'High',
});

// Search with JQL
const results = await jira.searchIssues('project = PROJ AND status = Open');

// Transition issue
await jira.transitionIssue('PROJ-123', { transitionId: '31' });
```

### Bitbucket

```typescript
import { BitbucketClient, verifyBitbucketWebhook } from '@relay/integrations';

const bitbucket = new BitbucketClient({
  username: process.env.BITBUCKET_USERNAME,
  appPassword: process.env.BITBUCKET_APP_PASSWORD,
});

// Get pull request
const pr = await bitbucket.getBitbucketPullRequest('workspace', 'repo', 123);

// Create PR
const newPr = await bitbucket.createPullRequest('workspace', 'repo', {
  title: 'Feature: Add new feature',
  sourceBranch: 'feature/new-feature',
  targetBranch: 'main',
});

// Set commit status
await bitbucket.createBitbucketStatus('workspace', 'repo', 'sha', {
  key: 'ci/shipcheck',
  state: 'SUCCESSFUL',
  description: 'All checks passed',
});
```

### Linear

```typescript
import { LinearClient, verifyLinearWebhook } from '@relay/integrations';

const linear = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

// Get issue
const issue = await linear.getIssue('issue-uuid');

// Create issue
const newIssue = await linear.createIssue({
  teamId: 'team-uuid',
  title: 'Implement new feature',
  description: 'Feature requirements...',
  priority: 2, // High
});

// Search issues
const results = await linear.searchIssues('authentication bug');

// List teams
const teams = await linear.listTeams();
```

### Slack

```typescript
import { SlackClient, verifySlackSignature, SlackBlocks } from '@relay/integrations';

const slack = new SlackClient({
  botToken: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Send message
await slack.postMessage({
  channel: '#general',
  text: 'Hello from ShipCheck!',
  blocks: [
    SlackBlocks.section('*Analysis Complete*'),
    SlackBlocks.divider(),
    SlackBlocks.section('Found 3 issues in the pull request.'),
  ],
});

// Send ephemeral message
await slack.postEphemeral('#general', 'U12345', 'Only you can see this');

// Verify webhook
const isValid = verifySlackSignature(timestamp, body, signature, signingSecret);
```

## Common Interfaces

The package provides common interfaces for cross-platform compatibility:

```typescript
import type {
  GitProviderClient,
  IssueTrackerClient,
  ChatPlatformClient,
  PullRequest,
  Issue,
  User,
  Repository,
  FileChange,
  Comment,
} from '@relay/integrations';

// Use common interface for any Git provider
async function analyzePR(client: GitProviderClient, owner: string, repo: string, prNumber: number) {
  const pr = await client.getPullRequest(owner, repo, prNumber);
  const files = await client.getPullRequestFiles(owner, repo, prNumber);
  // Process files...
}

// Works with GitHub, GitLab, or Bitbucket
await analyzePR(github, 'owner', 'repo', 123);
await analyzePR(gitlab, 'owner', 'repo', 123);
await analyzePR(bitbucket, 'workspace', 'repo', 123);
```

## Error Handling

```typescript
import {
  IntegrationError,
  IntegrationErrorCode,
  isIntegrationError,
} from '@relay/integrations';

try {
  await github.getPullRequest(installationId, 'owner', 'repo', 999);
} catch (error) {
  if (isIntegrationError(error)) {
    switch (error.code) {
      case IntegrationErrorCode.NOT_FOUND:
        console.log('PR not found');
        break;
      case IntegrationErrorCode.AUTH_FAILED:
        console.log('Authentication failed');
        break;
      case IntegrationErrorCode.RATE_LIMITED:
        console.log('Rate limited, retry after:', error.details?.retryAfter);
        break;
    }
  }
}
```

## Webhook Verification

Each integration provides webhook signature verification:

```typescript
import {
  verifyGitHubWebhook,
  verifyGitLabWebhook,
  verifyJiraWebhook,
  verifyBitbucketWebhook,
  verifyLinearWebhook,
  verifySlackSignature,
} from '@relay/integrations';

// In your webhook handler
app.post('/webhooks/github', (req, res) => {
  const result = verifyGitHubWebhook(
    req.body,
    req.headers['x-hub-signature-256'],
    process.env.GITHUB_WEBHOOK_SECRET
  );

  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }

  // Process webhook...
});
```

## Environment Variables

```env
# GitHub
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# GitLab
GITLAB_TOKEN=glpat-xxx
GITLAB_WEBHOOK_TOKEN=your-webhook-token

# Jira
JIRA_EMAIL=user@company.com
JIRA_API_TOKEN=your-api-token

# Bitbucket
BITBUCKET_USERNAME=your-username
BITBUCKET_APP_PASSWORD=your-app-password

# Linear
LINEAR_API_KEY=lin_api_xxx
LINEAR_WEBHOOK_SECRET=your-webhook-secret

# Slack
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=your-signing-secret
```

## License

MIT
