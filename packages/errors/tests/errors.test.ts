import { describe, it, expect } from 'vitest';
import {
  RelayError,
  AuthenticationError,
  AuthorizationError,
  TokenError,
  OrganizationAccessError,
  ProjectAccessError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
  QuotaExceededError,
  BadRequestError,
  InternalError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  DependencyError,
  isRelayError,
  isOperationalError,
  wrapError,
  createErrorResponse,
  fromStatusCode,
  assertRelay,
  ErrorCodes,
} from '../src/index.js';

describe('RelayError', () => {
  it('should create a base error with defaults', () => {
    const error = new RelayError('Test error', 'TEST_CODE');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should create error with custom status code', () => {
    const error = new RelayError('Test', 'CODE', 418);
    expect(error.statusCode).toBe(418);
  });

  it('should include details', () => {
    const error = new RelayError('Test', 'CODE', 500, { key: 'value' });
    expect(error.details).toEqual({ key: 'value' });
  });

  it('should serialize to JSON', () => {
    const error = new RelayError('Test', 'CODE', 500, { key: 'value' });
    const json = error.toJSON();

    expect(json.error).toBeDefined();
    expect((json.error as Record<string, unknown>).code).toBe('CODE');
    expect((json.error as Record<string, unknown>).message).toBe('Test');
    expect((json.error as Record<string, unknown>).details).toEqual({ key: 'value' });
    expect((json.error as Record<string, unknown>).timestamp).toBeDefined();
  });

  it('should merge details with withDetails', () => {
    const error = new RelayError('Test', 'CODE', 500, { a: 1 });
    const newError = error.withDetails({ b: 2 });

    expect(newError.details).toEqual({ a: 1, b: 2 });
    expect(error.details).toEqual({ a: 1 }); // Original unchanged
  });
});

describe('AuthenticationError', () => {
  it('should create with default message', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe(ErrorCodes.AUTHENTICATION_REQUIRED);
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('AuthenticationError');
  });

  it('should create with custom message', () => {
    const error = new AuthenticationError('Invalid credentials');
    expect(error.message).toBe('Invalid credentials');
  });
});

describe('TokenError', () => {
  it('should create with default code', () => {
    const error = new TokenError('Token invalid');

    expect(error.code).toBe('TOKEN_INVALID');
    expect(error.statusCode).toBe(401);
  });

  it('should accept different token error codes', () => {
    expect(new TokenError('Expired', 'TOKEN_EXPIRED').code).toBe('TOKEN_EXPIRED');
    expect(new TokenError('Revoked', 'TOKEN_REVOKED').code).toBe('TOKEN_REVOKED');
    expect(new TokenError('Missing', 'TOKEN_MISSING').code).toBe('TOKEN_MISSING');
  });
});

describe('AuthorizationError', () => {
  it('should create with default message', () => {
    const error = new AuthorizationError();

    expect(error.message).toBe('Permission denied');
    expect(error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(error.statusCode).toBe(403);
  });
});

describe('OrganizationAccessError', () => {
  it('should include organization ID', () => {
    const error = new OrganizationAccessError('org-123');

    expect(error.message).toBe('Access denied to organization org-123');
    expect(error.organizationId).toBe('org-123');
    expect(error.statusCode).toBe(403);
  });
});

describe('ProjectAccessError', () => {
  it('should include project ID', () => {
    const error = new ProjectAccessError('proj-456');

    expect(error.message).toBe('Access denied to project proj-456');
    expect(error.projectId).toBe('proj-456');
    expect(error.statusCode).toBe(403);
  });
});

describe('NotFoundError', () => {
  it('should create with resource name', () => {
    const error = new NotFoundError('User');

    expect(error.message).toBe('User not found');
    expect(error.resource).toBe('User');
    expect(error.statusCode).toBe(404);
  });

  it('should use default resource name', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
  });
});

describe('ValidationError', () => {
  it('should store field errors', () => {
    const error = new ValidationError('Invalid input', {
      email: ['Invalid format'],
      password: ['Too short', 'Missing number'],
    });

    expect(error.fieldErrors.email).toEqual(['Invalid format']);
    expect(error.fieldErrors.password).toHaveLength(2);
    expect(error.statusCode).toBe(400);
  });

  it('should check for field errors', () => {
    const error = new ValidationError('Invalid', { email: ['Bad'] });

    expect(error.hasFieldError('email')).toBe(true);
    expect(error.hasFieldError('name')).toBe(false);
  });

  it('should get field errors', () => {
    const error = new ValidationError('Invalid', { email: ['Bad'] });

    expect(error.getFieldErrors('email')).toEqual(['Bad']);
    expect(error.getFieldErrors('name')).toEqual([]);
  });
});

describe('RateLimitError', () => {
  it('should include retry after', () => {
    const error = new RateLimitError(120);

    expect(error.message).toBe('Too many requests');
    expect(error.retryAfter).toBe(120);
    expect(error.statusCode).toBe(429);
  });

  it('should default to 60 seconds', () => {
    const error = new RateLimitError();
    expect(error.retryAfter).toBe(60);
  });
});

describe('QuotaExceededError', () => {
  it('should include quota details', () => {
    const error = new QuotaExceededError('API calls', 1000, 500);

    expect(error.quotaType).toBe('API calls');
    expect(error.currentUsage).toBe(1000);
    expect(error.maxAllowed).toBe(500);
    expect(error.statusCode).toBe(402);
  });

  it('should calculate usage percentage', () => {
    const error = new QuotaExceededError('Storage', 750, 1000);
    expect(error.usagePercentage).toBe(75);
  });

  it('should calculate overage', () => {
    const error = new QuotaExceededError('Requests', 150, 100);
    expect(error.overage).toBe(50);
  });

  it('should return zero overage when under limit', () => {
    const error = new QuotaExceededError('Requests', 50, 100);
    expect(error.overage).toBe(0);
  });
});

describe('GatewayTimeoutError', () => {
  it('should include service name', () => {
    const error = new GatewayTimeoutError('Database');

    expect(error.message).toBe('Database timed out');
    expect(error.service).toBe('Database');
    expect(error.statusCode).toBe(504);
  });
});

describe('DependencyError', () => {
  it('should include dependency name', () => {
    const error = new DependencyError('Redis');

    expect(error.message).toBe('Redis failed');
    expect(error.dependency).toBe('Redis');
    expect(error.statusCode).toBe(502);
  });

  it('should accept custom message', () => {
    const error = new DependencyError('Redis', 'Connection refused');
    expect(error.message).toBe('Connection refused');
  });
});

describe('isRelayError', () => {
  it('should return true for RelayError instances', () => {
    expect(isRelayError(new RelayError('Test', 'CODE'))).toBe(true);
    expect(isRelayError(new AuthenticationError())).toBe(true);
    expect(isRelayError(new NotFoundError())).toBe(true);
  });

  it('should return false for non-Relay errors', () => {
    expect(isRelayError(new Error('Test'))).toBe(false);
    expect(isRelayError('string error')).toBe(false);
    expect(isRelayError(null)).toBe(false);
    expect(isRelayError(undefined)).toBe(false);
  });
});

describe('isOperationalError', () => {
  it('should return true for operational errors', () => {
    expect(isOperationalError(new AuthenticationError())).toBe(true);
    expect(isOperationalError(new ValidationError())).toBe(true);
  });

  it('should return false for non-Relay errors', () => {
    expect(isOperationalError(new Error('Test'))).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return RelayError unchanged', () => {
    const original = new NotFoundError('User');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap Error instances', () => {
    const original = new Error('Something failed');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe('Something failed');
    expect(wrapped.details?.originalError).toBe('Error');
  });

  it('should wrap string errors', () => {
    const wrapped = wrapError('String error');

    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe('String error');
  });

  it('should wrap unknown types', () => {
    const wrapped = wrapError({ weird: 'object' });

    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe('An unknown error occurred');
  });
});

describe('createErrorResponse', () => {
  it('should create response object', () => {
    const error = new NotFoundError('User');
    const response = createErrorResponse(error);

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toBeDefined();
    expect((response.body.error as Record<string, unknown>).code).toBe('NOT_FOUND');
  });
});

describe('fromStatusCode', () => {
  it('should create appropriate error types', () => {
    expect(fromStatusCode(400)).toBeInstanceOf(BadRequestError);
    expect(fromStatusCode(401)).toBeInstanceOf(AuthenticationError);
    expect(fromStatusCode(403)).toBeInstanceOf(AuthorizationError);
    expect(fromStatusCode(404)).toBeInstanceOf(NotFoundError);
    expect(fromStatusCode(409)).toBeInstanceOf(ConflictError);
    expect(fromStatusCode(429)).toBeInstanceOf(RateLimitError);
    expect(fromStatusCode(500)).toBeInstanceOf(InternalError);
    expect(fromStatusCode(503)).toBeInstanceOf(ServiceUnavailableError);
  });

  it('should create generic error for unknown status codes', () => {
    const error = fromStatusCode(418, 'I am a teapot');

    expect(error).toBeInstanceOf(RelayError);
    expect(error.statusCode).toBe(418);
    expect(error.message).toBe('I am a teapot');
  });
});

describe('assertRelay', () => {
  it('should not throw when condition is true', () => {
    expect(() => {
      assertRelay(true, new AuthenticationError());
    }).not.toThrow();
  });

  it('should throw error when condition is false', () => {
    expect(() => {
      assertRelay(false, new AuthenticationError('Must be logged in'));
    }).toThrow(AuthenticationError);
  });

  it('should accept error factory function', () => {
    expect(() => {
      assertRelay(false, () => new NotFoundError('User'));
    }).toThrow(NotFoundError);
  });
});
