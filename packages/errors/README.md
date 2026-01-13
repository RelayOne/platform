# @relay/errors

Shared error classes for the Relay Platform (Verity, NoteMan, ShipCheck).

## Installation

```bash
pnpm add @relay/errors
```

## Usage

### Basic Errors

```typescript
import {
  RelayError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
  QuotaExceededError,
  InternalError,
  ServiceUnavailableError,
} from '@relay/errors';

// Throw authentication error
throw new AuthenticationError('Invalid credentials');

// Throw validation error with field details
throw new ValidationError('Invalid input', {
  email: ['Invalid email format'],
  password: ['Password too short', 'Must contain a number'],
});

// Throw not found error
throw new NotFoundError('User');

// Throw rate limit error with retry-after
throw new RateLimitError(60); // 60 seconds until reset

// Throw quota exceeded error
throw new QuotaExceededError('API calls', 1500, 1000);
```

### Utility Functions

```typescript
import {
  isRelayError,
  isOperationalError,
  wrapError,
  createErrorResponse,
  fromStatusCode,
  assertRelay,
} from '@relay/errors';

// Check if an error is a Relay error
if (isRelayError(error)) {
  console.log(error.code, error.statusCode);
}

// Check if error is operational (expected)
if (!isOperationalError(error)) {
  // This is a programming error, investigate!
  Sentry.captureException(error);
}

// Wrap unknown errors
try {
  await externalCall();
} catch (error) {
  const relayError = wrapError(error);
  return res.status(relayError.statusCode).json(relayError.toJSON());
}

// Create HTTP response
const { statusCode, body } = createErrorResponse(error);

// Create error from status code
const error = fromStatusCode(404, 'User not found');

// Assert conditions
assertRelay(user.isAdmin, new AuthorizationError('Admin required'));
```

### Hono Middleware

```typescript
import { Hono } from 'hono';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
} from '@relay/errors/middleware';

const app = new Hono();

// Add request ID to all requests
app.use(requestIdMiddleware());

// Handle errors
app.onError(errorHandler({
  includeStack: process.env.NODE_ENV !== 'production',
  onError: (error, ctx) => {
    // Log to Sentry or other monitoring
    if (!isOperationalError(error)) {
      Sentry.captureException(error);
    }
  },
}));

// Handle 404
app.notFound(notFoundHandler());
```

## Error Types

| Error Class | Status Code | Default Code | Description |
|-------------|-------------|--------------|-------------|
| `AuthenticationError` | 401 | `AUTHENTICATION_REQUIRED` | Authentication required or failed |
| `TokenError` | 401 | Various | JWT/token-specific errors |
| `AuthorizationError` | 403 | `PERMISSION_DENIED` | Permission denied |
| `OrganizationAccessError` | 403 | `ORG_ACCESS_DENIED` | Organization access denied |
| `ProjectAccessError` | 403 | `PROJECT_ACCESS_DENIED` | Project access denied |
| `NotFoundError` | 404 | `NOT_FOUND` | Resource not found |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Input validation failed |
| `BadRequestError` | 400 | `BAD_REQUEST` | Malformed request |
| `ConflictError` | 409 | `CONFLICT` | Resource conflict |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| `QuotaExceededError` | 402 | `QUOTA_EXCEEDED` | Usage quota exceeded |
| `InternalError` | 500 | `INTERNAL_ERROR` | Internal server error |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |
| `GatewayTimeoutError` | 504 | `GATEWAY_TIMEOUT` | Upstream timeout |
| `DependencyError` | 502 | `DEPENDENCY_ERROR` | External dependency failed |

## Error Response Format

All errors serialize to a consistent JSON format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fieldErrors": {
        "email": ["Invalid email format"],
        "password": ["Password too short"]
      }
    },
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

## License

MIT
