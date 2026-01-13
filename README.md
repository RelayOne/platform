# @relay/platform

Monorepo containing shared packages for the Relay Platform ecosystem (Verity, NoteMan, ShipCheck, nexus, AgentForce).

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@relay/core`](./packages/core) | Core types, services, utilities, deep-linking | 1.0.0 |
| [`@relay/auth-middleware`](./packages/auth-middleware) | JWT, session, Hono auth middleware | 1.0.0 |
| [`@relay/errors`](./packages/errors) | Shared error classes with Hono middleware | 1.0.0 |
| [`@relay/logger`](./packages/logger) | Structured logging with audit support | 1.0.0 |
| [`@relay/build-config`](./packages/build-config) | Shared tsup/vitest configurations | 1.0.0 |

## Installation

```bash
# Install individual packages
pnpm add @relay/auth-middleware @relay/errors @relay/logger

# Or install the core package for types and utilities
pnpm add @relay/core
```

## Quick Start

### Authentication Middleware (Hono)

```typescript
import { Hono } from 'hono';
import { createAuthMiddleware, JwtService } from '@relay/auth-middleware';

const app = new Hono();

const jwtService = new JwtService({
  secret: process.env.JWT_SECRET!,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
});

// Protected routes
app.use('/api/*', createAuthMiddleware({ jwtService }));

app.get('/api/profile', (c) => {
  const user = c.get('user');
  return c.json({ user });
});
```

### Error Handling

```typescript
import {
  NotFoundError,
  ValidationError,
  createErrorMiddleware
} from '@relay/errors';

// Use error middleware
app.onError(createErrorMiddleware());

// Throw typed errors
app.get('/api/users/:id', async (c) => {
  const user = await findUser(c.req.param('id'));
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return c.json(user);
});
```

### Structured Logging

```typescript
import { createLogger, createAuditLogger } from '@relay/logger';

const logger = createLogger({
  service: 'my-api',
  level: 'info'
});

const auditLogger = createAuditLogger({ service: 'my-api' });

// Log with context
logger.info('Request processed', {
  userId: '123',
  action: 'create'
});

// Audit security events
auditLogger.userLogin({
  success: true,
  actorEmail: 'user@example.com',
  actorIp: '192.168.1.1'
});
```

### Core Types and Services

```typescript
import {
  JwtService,
  DeepLinkingService,
  type User,
  type Organization,
  UserRole,
  PlanTier
} from '@relay/core';

// Deep linking between apps
const deepLinks = new DeepLinkingService();
const link = deepLinks.generateNavigationUrl('SHIPCHECK', 'repo', repoId);
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Package Dependencies

```
@relay/auth-middleware
  └── @relay/errors

@relay/core
  └── (standalone)

@relay/logger
  └── (standalone)

@relay/errors
  └── (standalone)

@relay/build-config
  └── (standalone)
```

## Apps Using These Packages

- **Verity** - AI content audit platform
- **NoteMan** - Meeting notes and AI transcription
- **ShipCheck** - Code analysis and quality checks
- **nexus** - CRM and sales intelligence
- **AgentForce** - AI coding agents platform

## License

MIT © Terragon Labs
