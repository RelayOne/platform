# @relay/logger

Shared logging utilities for Relay Platform applications.

## Features

- **Structured logging** - JSON and pretty print formats
- **Log levels** - DEBUG, INFO, WARN, ERROR, FATAL
- **Context enrichment** - Add context to all log entries
- **Child loggers** - Create loggers with inherited context
- **Audit logging** - Security-relevant event logging
- **Request logging** - HTTP request/response logging middleware
- **TypeScript support** - Full type safety

## Installation

```bash
pnpm add @relay/logger
```

## Quick Start

```typescript
import { logger, createLogger, LogLevel } from '@relay/logger';

// Use default logger
logger.info('Application started');
logger.error('Something went wrong', new Error('Oops'));

// Create custom logger
const customLogger = createLogger({
  service: 'my-service',
  level: LogLevel.DEBUG,
});

customLogger.debug('Debug message', { key: 'value' });
```

## Configuration

### Global Configuration

```typescript
import { configureLogger } from '@relay/logger';

configureLogger({
  level: 'info',          // Minimum log level
  service: 'my-app',      // Service name
  format: 'json',         // 'json' or 'pretty'
  environment: 'production',
});
```

### Logger Options

```typescript
import { Logger, LogLevel, LoggerConfig } from '@relay/logger';

const config: LoggerConfig = {
  level: LogLevel.INFO,     // Minimum log level
  service: 'my-service',    // Service name
  json: true,               // Output as JSON
  timestamps: true,         // Include timestamps
  defaultContext: {         // Context for all logs
    app: 'my-app',
    version: '1.0.0',
  },
};

const logger = new Logger(config);
```

## API Reference

### Logger Methods

```typescript
import { logger } from '@relay/logger';

// Debug (development logging)
logger.debug('Debug message', { detail: 'info' });

// Info (general operational)
logger.info('User logged in', { userId: '123' });

// Warning (potential issues)
logger.warn('Rate limit approaching', { current: 90, max: 100 });

// Error (errors that need attention)
logger.error('Request failed', new Error('Network error'), { endpoint: '/api' });

// Fatal (critical errors)
logger.fatal('Database connection lost', new Error('Connection refused'));
```

### Child Loggers

Create loggers with additional context:

```typescript
const requestLogger = logger.child({
  requestId: 'req-123',
  userId: 'user-456',
});

// All logs include requestId and userId
requestLogger.info('Processing request');
requestLogger.error('Request failed', error);
```

### Creating Loggers

```typescript
import { createLogger, Logger } from '@relay/logger';

// With configuration
const configuredLogger = createLogger({
  service: 'api',
  level: LogLevel.DEBUG,
  json: false,
});

// With context (creates child logger)
const contextLogger = createLogger({ component: 'auth' });

// Direct instantiation
const customLogger = new Logger({
  service: 'custom',
  defaultContext: { env: 'dev' },
});
```

## Audit Logging

For security-relevant events:

```typescript
import { auditLogger } from '@relay/logger';

auditLogger.log({
  eventType: 'user_login',
  actorId: 'user-123',
  actorEmail: 'user@example.com',
  actorIp: '192.168.1.1',
  organizationId: 'org-456',
  projectId: 'proj-789',
  resourceType: 'session',
  resourceId: 'sess-001',
  success: true,
  metadata: {
    userAgent: 'Mozilla/5.0...',
    mfaUsed: true,
  },
});
```

## HTTP Middleware

### Request Logging

```typescript
import { createRequestLogger } from '@relay/logger';

const requestLogger = createRequestLogger();

// Express/Hono middleware
app.use(requestLogger);

// Logs: "GET /api/users" with method, url, statusCode, duration
```

### Request ID Middleware

```typescript
import { createRequestIdMiddleware } from '@relay/logger';

const requestIdMiddleware = createRequestIdMiddleware();

// Express/Hono middleware
app.use(requestIdMiddleware);

// Sets X-Request-ID header, preserves existing or generates new
```

## Output Formats

### JSON Format (Production)

```json
{
  "level": "info",
  "message": "User logged in",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "auth",
  "context": {
    "userId": "123",
    "ip": "192.168.1.1"
  }
}
```

### Pretty Format (Development)

```
[2024-01-15T10:30:00.000Z] INFO  [auth] User logged in {"userId":"123","ip":"192.168.1.1"}
```

## Log Levels

| Level | Priority | Use Case |
|-------|----------|----------|
| DEBUG | 0 | Detailed debugging information |
| INFO | 1 | General operational messages |
| WARN | 2 | Warning conditions, potential issues |
| ERROR | 3 | Error conditions that need attention |
| FATAL | 4 | Critical errors, system failures |

## Type Definitions

```typescript
import {
  LogLevel,
  LogEntry,
  LoggerConfig,
  ILogger,
  AuditEventType,
  AuditLogEntry,
} from '@relay/logger';

// LogEntry structure
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
  service?: string;
  traceId?: string;
  spanId?: string;
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level | `info` (prod), `debug` (dev) |
| `SERVICE_NAME` | Service name for logs | `relay` |
| `NODE_ENV` | Environment detection | `development` |

## Best Practices

1. **Use appropriate log levels** - DEBUG for development, INFO+ for production
2. **Include context** - Add relevant data like IDs, durations, counts
3. **Use child loggers** - Create request-scoped loggers with context
4. **Audit security events** - Log authentication, authorization, data access
5. **Don't log sensitive data** - Never log passwords, tokens, PII
6. **Use structured logging** - JSON format for log aggregation systems

## Testing

```bash
pnpm test
```

## License

MIT
