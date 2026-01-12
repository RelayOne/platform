# @relay/platform

Shared TypeScript library for the Relay Platform (Verity, NoteMan, ShipCheck).

## Installation

```bash
npm install @relay/platform
# or
pnpm add @relay/platform
```

## Features

- **Authentication**: JWT token generation/validation, session management
- **Types**: Shared types for users, organizations, RBAC, events
- **Services**: Cross-app deep linking, session synchronization
- **Utilities**: Cryptographic functions, validation schemas, error classes
- **Integrations**: OAuth helpers, webhook verification

## Usage

### JWT Authentication

```typescript
import { JwtService, createJwtService } from '@relay/platform';

// Create service with config
const jwt = new JwtService({
  secret: process.env.JWT_SECRET,
  issuer: 'relay-platform',
  audience: ['verity', 'noteman', 'shipcheck'],
});

// Generate tokens
const { accessToken, refreshToken, expiresAt } = await jwt.generateTokenPair({
  sub: userId,
  email: user.email,
  name: user.name,
  session_id: sessionId,
});

// Verify token
const claims = await jwt.verifyToken(accessToken);
console.log(claims.sub, claims.email);
```

### Cross-App Deep Linking

```typescript
import { DeepLinkingService, RelayApp } from '@relay/platform';

const deepLinks = new DeepLinkingService({
  signingKey: process.env.DEEP_LINK_SIGNING_KEY,
});

// Generate a deep link to a specific resource
const link = deepLinks.generateNavigationUrl(
  'SHIPCHECK' as RelayApp,
  'repo',
  'repo-123',
  {
    sessionId: currentSession.id,
    userId: user.id,
    context: { organizationId: org.id },
  }
);

console.log(link.url); // https://app.shipcheck.dev/repos/repo-123?_rl_id=...

// Resolve an incoming deep link
const resolved = deepLinks.resolveLink(incomingUrl);
if (resolved.valid) {
  console.log(resolved.targetApp, resolved.path, resolved.sessionId);
}
```

### Session Synchronization

```typescript
import { SessionSyncService, AuthEventType, RelayApp } from '@relay/platform';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const subscriber = redis.duplicate();

const sessionSync = new SessionSyncService({
  redis,
  redisSubscriber: subscriber,
  currentApp: 'NOTEMAN' as RelayApp,
  handlers: {
    [AuthEventType.PLATFORM_LOGOUT]: async (event) => {
      // Invalidate local session when user logs out from another app
      await invalidateSession(event.payload.sessionId);
    },
    [AuthEventType.SECURITY_INVALIDATION]: async (event) => {
      // Force logout on security events
      for (const sessionId of event.payload.affectedSessions) {
        await invalidateSession(sessionId);
      }
    },
  },
});

// Start listening for events
await sessionSync.startListening();

// Publish events when user logs in/out
await sessionSync.publishLogin({
  sessionId,
  userId,
  email: user.email,
  organizationId: org.id,
  apps: ['NOTEMAN'],
  loginMethod: 'sso',
  mfaUsed: false,
});
```

### Types and RBAC

```typescript
import {
  User,
  Organization,
  RelayApp,
  ResourceType,
  Action,
  hasPermission,
  type PermissionSet,
} from '@relay/platform';

// Check permissions
const permissions: PermissionSet = {
  allow: ['meeting:read', 'meeting:create', 'transcript:read'],
  deny: [],
};

if (hasPermission(permissions, ResourceType.MEETING, Action.CREATE)) {
  // User can create meetings
}
```

### Validation

```typescript
import { emailSchema, passwordSchema, validate, ValidationError } from '@relay/platform';

try {
  const email = validate(emailSchema, userInput.email);
  const password = validate(passwordSchema, userInput.password);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.fieldErrors);
  }
}
```

### Error Handling

```typescript
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  isRelayError,
} from '@relay/platform';

// Throw typed errors
if (!user) {
  throw new NotFoundError('User');
}

if (!hasAccess) {
  throw new AuthorizationError('You do not have access to this resource');
}

// Handle errors
try {
  await someOperation();
} catch (error) {
  if (isRelayError(error)) {
    return Response.json(error.toJSON(), { status: error.statusCode });
  }
  throw error;
}
```

## Module Exports

The package provides both a main export and subpath exports:

```typescript
// Main export (everything)
import { JwtService, RelayApp, DeepLinkingService } from '@relay/platform';

// Subpath exports (tree-shakeable)
import { JwtService, PlatformClaims } from '@relay/platform/auth';
import { User, Organization } from '@relay/platform/types';
import { DeepLinkingService } from '@relay/platform/services';
import { sha256, aesEncrypt } from '@relay/platform/utils';
import { IntegrationProvider } from '@relay/platform/integrations';
```

## Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-secret-key-here

# Deep Linking
DEEP_LINK_SIGNING_KEY=your-signing-key-here

# App URLs (optional, has defaults)
VERITY_URL=https://app.verity.dev
NOTEMAN_URL=https://app.noteman.dev
SHIPCHECK_URL=https://app.shipcheck.dev
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

## License

UNLICENSED - Proprietary to Terragon Labs
