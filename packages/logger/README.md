# @relay/logger

Shared logging utilities for the Relay Platform.

## Features

- **Structured Logging**: JSON and pretty-print output formats
- **Log Levels**: debug, info, warn, error, fatal
- **Request Correlation**: Request ID tracking across log entries
- **HTTP Middleware**: Automatic request/response logging
- **Audit Logging**: Security-focused event logging
- **Timed Operations**: Built-in duration tracking
- **Framework Support**: Works with Hono, Express, and others

## Installation

```bash
pnpm add @relay/logger
```

## Usage

### Basic Logging

```typescript
import { logger, createLogger, configureLogger } from '@relay/logger';

// Configure global settings
configureLogger({
  level: 'debug',
  service: 'my-service',
  format: 'pretty', // or 'json' for production
});

// Use default logger
logger.info('Application started');
logger.error('Something went wrong', { error: new Error('oops') });

// Create logger with context
const authLogger = createLogger({ component: 'auth' });
authLogger.info('User authenticated', { userId: '123' });
```

### Log Levels

```typescript
logger.debug('Detailed debugging info');
logger.info('General information');
logger.warn('Warning conditions');
logger.error('Error conditions');
logger.fatal('Critical errors');
```

### Request Correlation

```typescript
const reqLogger = createLogger();
reqLogger.setRequestId('req-12345');
reqLogger.setUserId('user-67890');
reqLogger.setOrganizationId('org-11111');

reqLogger.info('Processing request');
// Output includes requestId, userId, organizationId
```

### Child Loggers

```typescript
const parentLogger = createLogger({ service: 'api' });
const childLogger = parentLogger.child({ endpoint: '/users' });

childLogger.info('Handling request');
// Output: { service: 'api', endpoint: '/users', ... }
```

### Timed Operations

```typescript
const timer = logger.time('database-query', { table: 'users' });
const result = await db.query('SELECT * FROM users');
timer.end();
// Output: "database-query completed (150ms)"
```

### HTTP Middleware (Hono)

```typescript
import { Hono } from 'hono';
import { createRequestLogger, getLogger } from '@relay/logger';

const app = new Hono();

// Add request logging
app.use('*', createRequestLogger({
  skipPaths: ['/health', '/metrics'],
  logDuration: true,
}));

// Access logger in routes
app.get('/api/users', (c) => {
  const log = getLogger(c);
  log.info('Fetching users');
  return c.json({ users: [] });
});
```

### HTTP Middleware (Express)

```typescript
import express from 'express';
import { createExpressLogger } from '@relay/logger';

const app = express();
app.use(createExpressLogger());
```

### Audit Logging

```typescript
import { auditLogger, createAuditLogger } from '@relay/logger';

// User authentication
auditLogger.userLogin({
  success: true,
  actorEmail: 'user@example.com',
  actorIp: '192.168.1.1',
  authMethod: 'password',
  mfaUsed: true,
});

// Resource access
auditLogger.resourceAccess({
  action: 'read',
  success: true,
  actorId: 'user-123',
  resourceType: 'document',
  resourceId: 'doc-456',
});

// Organization member changes
auditLogger.orgMember({
  action: 'role_change',
  success: true,
  actorId: 'admin-123',
  organizationId: 'org-456',
  targetUserId: 'user-789',
  oldRole: 'member',
  newRole: 'admin',
});

// API key management
auditLogger.apiKey({
  action: 'create',
  success: true,
  actorId: 'user-123',
  keyId: 'key-456',
  keyName: 'Production API Key',
});

// Generic audit event
auditLogger.log('custom.event', {
  success: true,
  actorId: 'user-123',
  details: { customField: 'value' },
});
```

## Configuration

```typescript
import { configureLogger, configureAuditLogger } from '@relay/logger';

configureLogger({
  // Minimum log level (default: 'info')
  level: 'debug',

  // Service name for identification
  service: 'my-service',

  // Output format: 'json' or 'pretty'
  format: 'json',

  // Include timestamps in pretty format
  timestamps: true,

  // Default context for all logs
  defaultContext: {
    environment: 'production',
  },

  // Custom output function
  output: (entry) => {
    // Send to custom transport
  },
});

configureAuditLogger({
  service: 'my-service',
  echoToLogger: true, // Also log to standard logger
});
```

## Log Entry Structure

```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601 timestamp
  level: LogLevel;        // debug | info | warn | error | fatal
  message: string;        // Log message
  service: string;        // Service name
  requestId?: string;     // Request correlation ID
  userId?: string;        // Authenticated user ID
  organizationId?: string; // Organization ID
  context?: object;       // Additional context
  error?: {               // Error details
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  durationMs?: number;    // Operation duration
  http?: {                // HTTP request details
    method: string;
    path: string;
    statusCode?: number;
    userAgent?: string;
    ip?: string;
  };
}
```

## Audit Event Types

| Category | Events |
|----------|--------|
| User | `user.login`, `user.logout`, `user.register`, `user.password_change`, `user.mfa_enable`, `user.mfa_disable`, `user.profile_update` |
| Organization | `org.create`, `org.update`, `org.delete`, `org.member_add`, `org.member_remove`, `org.member_role_change` |
| Resource | `resource.create`, `resource.read`, `resource.update`, `resource.delete`, `resource.share` |
| API | `api.key_create`, `api.key_revoke`, `api.rate_limit` |
| Admin | `admin.user_suspend`, `admin.user_restore`, `admin.config_change` |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | `info` |
| `SERVICE_NAME` | Service identifier | `relay-service` |
| `NODE_ENV` | Environment (affects format) | `development` |

## API Reference

### Logger

| Method | Description |
|--------|-------------|
| `debug(message, data?)` | Log debug message |
| `info(message, data?)` | Log info message |
| `warn(message, data?)` | Log warning message |
| `error(message, data?)` | Log error message |
| `fatal(message, data?)` | Log fatal message |
| `child(context)` | Create child logger with merged context |
| `setRequestId(id)` | Set request correlation ID |
| `setUserId(id)` | Set authenticated user ID |
| `setOrganizationId(id)` | Set organization ID |
| `time(operation, data?)` | Start timed operation |

### Functions

| Function | Description |
|----------|-------------|
| `configureLogger(config)` | Configure global settings |
| `getLoggerConfig()` | Get current configuration |
| `createLogger(context?)` | Create new logger instance |
| `createRequestLogger(config?)` | Create Hono request middleware |
| `createExpressLogger(config?)` | Create Express request middleware |
| `createRequestIdMiddleware(header?)` | Create request ID middleware |
| `getLogger(context)` | Get logger from request context |

## License

MIT
