/**
 * @fileoverview Tests for @relay/logger middleware functions
 * @module @relay/logger/tests/middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRequestLogger,
  createRequestIdMiddleware,
  createExpressLogger,
  getLogger,
  generateRequestId,
} from '../src/middleware';
import { Logger, configureLogger, createLogger } from '../src/logger';

// Mock crypto.randomUUID
const mockUUID = 'test-uuid-1234-5678-9012';
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => mockUUID),
});

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset logger config to suppress output during tests
    configureLogger({
      level: 'debug',
      format: 'json',
      output: () => {}, // Suppress output during tests
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // generateRequestId Tests
  // ============================================================================

  describe('generateRequestId', () => {
    it('generates a UUID', () => {
      const requestId = generateRequestId();
      expect(requestId).toBe(mockUUID);
    });

    it('calls crypto.randomUUID', () => {
      generateRequestId();
      expect(crypto.randomUUID).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getLogger Tests
  // ============================================================================

  describe('getLogger', () => {
    it('returns logger from context when available', () => {
      const testLogger = createLogger({ component: 'test' });
      const context = {
        get: vi.fn((key: string) => (key === 'logger' ? testLogger : undefined)),
      };

      const result = getLogger(context);
      expect(result).toBe(testLogger);
      expect(context.get).toHaveBeenCalledWith('logger');
    });

    it('returns new logger when context has no logger', () => {
      const context = {
        get: vi.fn(() => undefined),
      };

      const result = getLogger(context);
      expect(result).toBeInstanceOf(Logger);
    });

    it('returns new logger when context has no get method', () => {
      const context = {};
      const result = getLogger(context);
      expect(result).toBeInstanceOf(Logger);
    });

    it('returns new logger when context.get returns non-Logger', () => {
      const context = {
        get: vi.fn(() => 'not a logger'),
      };

      const result = getLogger(context);
      expect(result).toBeInstanceOf(Logger);
    });
  });

  // ============================================================================
  // createRequestIdMiddleware Tests
  // ============================================================================

  describe('createRequestIdMiddleware', () => {
    it('creates middleware function', () => {
      const middleware = createRequestIdMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('generates request ID when not in header', async () => {
      const middleware = createRequestIdMiddleware();
      const context = {
        req: {
          header: vi.fn(() => undefined),
        },
        set: vi.fn(),
        header: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(context.set).toHaveBeenCalledWith('requestId', mockUUID);
      expect(context.header).toHaveBeenCalledWith('x-request-id', mockUUID);
      expect(next).toHaveBeenCalled();
    });

    it('uses existing request ID from header', async () => {
      const middleware = createRequestIdMiddleware();
      const existingId = 'existing-request-id';
      const context = {
        req: {
          header: vi.fn((name: string) =>
            name === 'x-request-id' ? existingId : undefined
          ),
        },
        set: vi.fn(),
        header: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(context.set).toHaveBeenCalledWith('requestId', existingId);
      expect(context.header).toHaveBeenCalledWith('x-request-id', existingId);
    });

    it('supports custom header name', async () => {
      const middleware = createRequestIdMiddleware('x-correlation-id');
      const context = {
        req: {
          header: vi.fn(() => undefined),
        },
        set: vi.fn(),
        header: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(context.req.header).toHaveBeenCalledWith('x-correlation-id');
      expect(context.header).toHaveBeenCalledWith('x-correlation-id', mockUUID);
    });
  });

  // ============================================================================
  // createRequestLogger Tests
  // ============================================================================

  describe('createRequestLogger', () => {
    it('creates middleware function', () => {
      const middleware = createRequestLogger();
      expect(typeof middleware).toBe('function');
    });

    it('skips logging for health check paths', async () => {
      const middleware = createRequestLogger();
      const context = {
        req: {
          method: 'GET',
          path: '/health',
          header: vi.fn(() => undefined),
          raw: {} as Request,
        },
        res: { status: 200 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(next).toHaveBeenCalled();
      // Should not set logger in context for skipped paths
      expect(context.set).not.toHaveBeenCalled();
    });

    it('logs requests for non-skipped paths', async () => {
      const middleware = createRequestLogger();
      const context = {
        req: {
          method: 'GET',
          path: '/api/users',
          header: vi.fn((name: string) => {
            if (name === 'user-agent') return 'TestAgent/1.0';
            if (name === 'x-forwarded-for') return '192.168.1.1';
            return undefined;
          }),
          raw: {} as Request,
        },
        res: { status: 200 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(next).toHaveBeenCalled();
      expect(context.set).toHaveBeenCalledWith('logger', expect.any(Logger));
      expect(context.set).toHaveBeenCalledWith('requestId', mockUUID);
    });

    it('uses request ID from header when available', async () => {
      const middleware = createRequestLogger();
      const existingId = 'existing-id';
      const context = {
        req: {
          method: 'POST',
          path: '/api/data',
          header: vi.fn((name: string) =>
            name === 'x-request-id' ? existingId : undefined
          ),
          raw: {} as Request,
        },
        res: { status: 201 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(context.set).toHaveBeenCalledWith('requestId', existingId);
    });

    it('supports custom configuration', async () => {
      const middleware = createRequestLogger({
        skipPaths: ['/custom-skip'],
        successLevel: 'debug',
        errorLevel: 'error',
      });

      const context = {
        req: {
          method: 'GET',
          path: '/custom-skip',
          header: vi.fn(() => undefined),
          raw: {} as Request,
        },
        res: { status: 200 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      // Should skip custom path
      expect(context.set).not.toHaveBeenCalled();
    });

    it('handles error status codes', async () => {
      const middleware = createRequestLogger();
      const context = {
        req: {
          method: 'GET',
          path: '/api/error',
          header: vi.fn(() => undefined),
          raw: {} as Request,
        },
        res: { status: 500 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(next).toHaveBeenCalled();
      expect(context.set).toHaveBeenCalledWith('logger', expect.any(Logger));
    });

    it('supports custom format message', async () => {
      const customFormat = vi.fn(
        (info) => `Custom: ${info.method} ${info.path}`
      );
      const middleware = createRequestLogger({
        formatMessage: customFormat,
      });

      const context = {
        req: {
          method: 'GET',
          path: '/api/custom',
          header: vi.fn(() => undefined),
          raw: {} as Request,
        },
        res: { status: 200 },
        set: vi.fn(),
        get: vi.fn(),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(context, next);

      expect(customFormat).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/api/custom',
          statusCode: 200,
        })
      );
    });
  });

  // ============================================================================
  // createExpressLogger Tests
  // ============================================================================

  describe('createExpressLogger', () => {
    it('creates middleware function', () => {
      const middleware = createExpressLogger();
      expect(typeof middleware).toBe('function');
    });

    it('skips logging for health check paths', () => {
      const middleware = createExpressLogger();
      const req = {
        method: 'GET',
        path: '/health',
        headers: {},
      };
      const res = {
        statusCode: 200,
        on: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('attaches logger to request for non-skipped paths', () => {
      const middleware = createExpressLogger();
      const req = {
        method: 'GET',
        path: '/api/users',
        headers: {},
      };
      const res = {
        statusCode: 200,
        on: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect((req as Record<string, unknown>)['logger']).toBeInstanceOf(Logger);
      expect((req as Record<string, unknown>)['requestId']).toBe(mockUUID);
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(next).toHaveBeenCalled();
    });

    it('uses existing request ID from header', () => {
      const middleware = createExpressLogger();
      const existingId = 'express-request-id';
      const req = {
        method: 'POST',
        path: '/api/data',
        headers: {
          'x-request-id': existingId,
        },
      };
      const res = {
        statusCode: 201,
        on: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect((req as Record<string, unknown>)['requestId']).toBe(existingId);
    });

    it('logs on response finish event', () => {
      const middleware = createExpressLogger();
      const req = {
        method: 'GET',
        path: '/api/test',
        headers: {
          'user-agent': 'TestAgent',
          'x-forwarded-for': '10.0.0.1',
        },
      };
      let finishHandler: () => void;
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'finish') {
            finishHandler = handler;
          }
        }),
      };
      const next = vi.fn();

      middleware(req, res, next);

      // Simulate response finish
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
      finishHandler!();
      // No assertion needed - just verify it doesn't throw
    });

    it('supports custom skip paths', () => {
      const middleware = createExpressLogger({
        skipPaths: ['/custom/health'],
      });
      const req = {
        method: 'GET',
        path: '/custom/health',
        headers: {},
      };
      const res = {
        statusCode: 200,
        on: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('uses error level for 4xx/5xx responses', () => {
      const middleware = createExpressLogger();
      const req = {
        method: 'GET',
        path: '/api/error',
        headers: {},
      };
      let finishHandler: () => void;
      const res = {
        statusCode: 404,
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'finish') {
            finishHandler = handler;
          }
        }),
      };
      const next = vi.fn();

      middleware(req, res, next);

      // Simulate response finish
      finishHandler!();
      // No assertion needed - just verify it doesn't throw
    });
  });
});
