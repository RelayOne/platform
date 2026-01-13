# @relay/auth-middleware

Shared authentication middleware for all Relay Platform Hono applications.

## Features

- **JWT Token Management** - Generate, verify, and decode JWT tokens with platform-aligned claims
- **Session Management** - Create, validate, and manage user sessions across apps
- **Role-Based Access Control** - Organization and project role validation
- **Tier-Based Feature Gating** - Restrict endpoints by subscription tier
- **MFA Verification** - Require MFA for sensitive operations
- **Permission Validation** - Check app-specific permissions
- **Cross-App Support** - Unified authentication across Verity, NoteMan, and ShipCheck

## Installation

```bash
pnpm add @relay/auth-middleware
```

## Quick Start

```typescript
import { Hono } from 'hono';
import {
  authMiddleware,
  requireTier,
  requireOrganization,
  requireRole,
  Role,
} from '@relay/auth-middleware';

const app = new Hono();

// Configure authentication
app.use('/*', authMiddleware({
  jwt: { secret: process.env.JWT_SECRET },
  requiredApp: 'noteman',
  skipPaths: ['/health', '/public/*'],
}));

// Tier-based access
app.use('/api/premium/*', requireTier('team'));

// Organization-scoped routes
app.use('/api/orgs/:orgId/*', requireOrganization());

// Role-based access
app.use('/api/admin/*', requireRole(Role.ADMIN));
```

## JWT Token Generation

```typescript
import { createJwtService, AuthMethod } from '@relay/auth-middleware';

const jwtService = createJwtService({ secret: process.env.JWT_SECRET });

// Generate access token
const token = await jwtService.generateAccessToken({
  sub: 'user-123',
  email: 'user@example.com',
  name: 'John Doe',
  tier: 'team',
  sessionId: crypto.randomUUID(),
}, {
  orgId: 'org-456',
  appPermissions: {
    noteman: ['meeting:read', 'meeting:create'],
    verity: ['document:read'],
  },
  authMethod: AuthMethod.OAUTH,
  oauthProvider: 'google',
});

// Generate token pair (access + refresh)
const { accessToken, refreshToken, expiresAt } = await jwtService.generateTokenPair({
  sub: 'user-123',
  email: 'user@example.com',
  tier: 'team',
  sessionId: crypto.randomUUID(),
});

// Verify token
const claims = await jwtService.verifyToken(token);
```

## Session Management

```typescript
import {
  createSession,
  isSessionValid,
  extendSession,
  parseDeviceInfo,
  AuthMethod,
} from '@relay/auth-middleware';

// Create session
const device = parseDeviceInfo(request.headers.get('user-agent'));
const session = createSession('user-123', {
  device,
  authMethod: AuthMethod.PASSWORD,
  mfaVerified: false,
  app: 'noteman',
});

// Validate session
if (isSessionValid(session)) {
  // Session is active
}

// Extend session
const extended = extendSession(session, 3600); // 1 hour
```

## Middleware Reference

### `authMiddleware(config)`

Main authentication middleware. Validates JWT and attaches user to context.

```typescript
app.use('/*', authMiddleware({
  jwt: { secret: process.env.JWT_SECRET },
  requiredApp: 'noteman',      // Optional: require specific app in audience
  allowLegacyTokens: true,     // Optional: support legacy token format
  skipPaths: ['/health'],      // Optional: paths to skip auth
}));
```

### `requireTier(tier)`

Require minimum subscription tier.

```typescript
app.use('/api/premium/*', requireTier('pro'));
app.use('/api/enterprise/*', requireTier('enterprise'));
```

### `requireOrganization(paramName?)`

Require user to be member of organization in route parameter.

```typescript
app.use('/api/orgs/:orgId/*', requireOrganization());
app.use('/api/organizations/:organizationId/*', requireOrganization('organizationId'));
```

### `requireOrganizationRole(role, paramName?)`

Require minimum role in organization.

```typescript
app.use('/api/orgs/:orgId/settings/*', requireOrganizationRole(Role.ADMIN));
app.use('/api/orgs/:orgId/billing/*', requireOrganizationRole(Role.OWNER));
```

### `requireProjectRole(role, orgParam?, projectParam?)`

Require minimum role in project.

```typescript
app.use('/api/orgs/:orgId/projects/:projectId/*', requireProjectRole(Role.EDITOR));
```

### `requireRole(role)`

Require role across any organization.

```typescript
app.use('/api/admin/*', requireRole(Role.ADMIN));
```

### `requireMFA()`

Require MFA verification for sensitive operations.

```typescript
app.use('/api/security/*', requireMFA());
app.use('/api/billing/payment-methods/*', requireMFA());
```

### `requirePermission(permission, app?)`

Require specific permission.

```typescript
app.post('/api/meetings', requirePermission('meeting:create', 'noteman'));
app.post('/api/verify', requirePermission('document:verify'));
```

### `requireAllPermissions(permissions, app?)`

Require all specified permissions.

```typescript
app.post('/api/meetings/full',
  requireAllPermissions(['meeting:create', 'meeting:update'], 'noteman')
);
```

### `requireAnyPermission(permissions, app?)`

Require any of the specified permissions.

```typescript
app.get('/api/meetings',
  requireAnyPermission(['meeting:read', 'meeting:admin'], 'noteman')
);
```

## Utility Functions

### User Context

```typescript
import { getUser, requireUser, hasOrganizationAccess, getOrganizationRole } from '@relay/auth-middleware';

app.get('/api/me', (c) => {
  const user = requireUser(c); // Throws if not authenticated
  return c.json({ userId: user.sub, email: user.email });
});

app.get('/api/check-access', (c) => {
  const user = getUser(c);
  if (user && hasOrganizationAccess(user, 'org-123')) {
    const role = getOrganizationRole(user, 'org-123');
    // ...
  }
});
```

### JWT Service

```typescript
import { JwtService } from '@relay/auth-middleware';

// Check permission
const hasPermission = jwtService.hasPermission(claims, 'meeting:create', 'noteman');

// Check app validity
const isValid = jwtService.isValidForApp(claims, 'verity');

// Get remaining lifetime
const seconds = jwtService.getRemainingLifetime(token);

// Extract bearer token
const token = JwtService.extractBearerToken(authHeader);
```

## Types

### PlatformClaims

```typescript
interface PlatformClaims {
  sub: string;           // User ID
  iss: string;           // Issuer ("relay-platform")
  aud: string[];         // Audience (app identifiers)
  exp: number;           // Expiration (Unix timestamp)
  iat: number;           // Issued at (Unix timestamp)
  jti: string;           // Token ID
  email: string;         // User email
  name?: string;         // Display name
  tier: Tier;            // Subscription tier
  orgId?: string;        // Current organization context
  projectId?: string;    // Current project context
  orgs?: Record<string, OrganizationAccess>;
  appPermissions?: Record<string, PermissionString[]>;
  sessionId: string;
  tokenType: TokenType;
  mfaVerified?: boolean;
  authMethod?: AuthMethod;
}
```

### Role Hierarchy

```
VIEWER < EDITOR < ADMIN < OWNER < SUPER_ADMIN
```

### Tier Hierarchy

```
personal < pro < team < enterprise
```

## Error Handling

The middleware throws typed errors from `@relay/errors`:

- `AuthenticationError` - Missing or invalid token (401)
- `AuthorizationError` - Insufficient permissions (403)
- `OrganizationAccessError` - Not a member of organization (403)

Use with the error middleware from `@relay/errors`:

```typescript
import { errorHandler } from '@relay/errors/middleware';

app.onError(errorHandler({
  includeStack: process.env.NODE_ENV !== 'production',
}));
```

## License

MIT
