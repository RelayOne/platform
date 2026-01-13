import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Define mock functions inside the factory to avoid hoisting issues
vi.mock('pino', () => {
  const mockTrace = vi.fn();
  const mockDebug = vi.fn();
  const mockInfo = vi.fn();
  const mockWarn = vi.fn();
  const mockError = vi.fn();
  const mockFatal = vi.fn();
  const mockFlush = vi.fn();

  const pinoMock = vi.fn().mockImplementation(() => ({
    trace: mockTrace,
    debug: mockDebug,
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    fatal: mockFatal,
    flush: mockFlush,
    level: 'info',
    child: vi.fn().mockReturnThis(),
  }));

  // Attach stdTimeFunctions to the default export
  pinoMock.stdTimeFunctions = {
    isoTime: vi.fn().mockReturnValue(''),
  };

  return {
    default: pinoMock,
  };
});

import { Logger, createLogger, createLoggerFromEnv } from '../src/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createLogger({
      serviceName: 'test-service',
      level: 'debug',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration', () => {
      const log = createLogger({ serviceName: 'my-service' });
      expect(log).toBeInstanceOf(Logger);
    });

    it('should create a logger with custom configuration', () => {
      const log = createLogger({
        serviceName: 'custom-service',
        level: 'warn',
        prettyPrint: false,
        base: { customField: 'value' },
        redact: ['password', 'secret'],
      });
      expect(log).toBeInstanceOf(Logger);
    });
  });

  describe('createLoggerFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create logger from environment variables', () => {
      process.env.SERVICE_NAME = 'env-service';
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_PRETTY = 'true';

      const log = createLoggerFromEnv();
      expect(log).toBeInstanceOf(Logger);
    });

    it('should use provided service name over env var', () => {
      process.env.SERVICE_NAME = 'env-service';
      const log = createLoggerFromEnv('override-service');
      expect(log).toBeInstanceOf(Logger);
    });

    it('should use defaults when env vars not set', () => {
      delete process.env.SERVICE_NAME;
      delete process.env.LOG_LEVEL;

      const log = createLoggerFromEnv();
      expect(log).toBeInstanceOf(Logger);
    });
  });

  describe('log levels', () => {
    it('should log trace messages', () => {
      logger.trace('trace message', { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.trace).toHaveBeenCalled();
    });

    it('should log debug messages', () => {
      logger.debug('debug message', { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.debug).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('info message', { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('warn message', { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.warn).toHaveBeenCalled();
    });

    it('should log error messages with Error object', () => {
      const error = new Error('test error');
      logger.error('error message', error, { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.error).toHaveBeenCalled();
    });

    it('should log error messages without Error object', () => {
      logger.error('error message', undefined, { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.error).toHaveBeenCalled();
    });

    it('should log fatal messages with Error object', () => {
      const error = new Error('fatal error');
      logger.fatal('fatal message', error, { key: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.fatal).toHaveBeenCalled();
    });

    it('should handle non-Error objects in error logging', () => {
      logger.error('error message', { customError: true });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.error).toHaveBeenCalled();
    });
  });

  describe('operation logging', () => {
    it('should log start of operation', () => {
      logger.startOperation('testOp', { data: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalled();
    });

    it('should log end of operation', () => {
      logger.endOperation('testOp', 100, { data: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalled();
    });

    it('should log failed operation', () => {
      const error = new Error('operation failed');
      logger.failOperation('testOp', error, 100, { data: 'value' });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.error).toHaveBeenCalled();
    });
  });

  describe('withOperation', () => {
    it('should execute function and log success', async () => {
      const result = await logger.withOperation(
        'testOperation',
        async () => 'success'
      );

      expect(result).toBe('success');
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalledTimes(2); // start + end
    });

    it('should log failure and rethrow error', async () => {
      const error = new Error('operation failed');

      await expect(
        logger.withOperation('testOperation', async () => {
          throw error;
        })
      ).rejects.toThrow('operation failed');

      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalledTimes(1); // start
      expect(pinoLogger.error).toHaveBeenCalledTimes(1); // fail
    });
  });

  describe('HTTP request logging', () => {
    it('should log successful request as info', () => {
      logger.httpRequest('GET', '/api/users', 200, 50);
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.info).toHaveBeenCalled();
    });

    it('should log 4xx request as warn', () => {
      logger.httpRequest('POST', '/api/users', 404, 50);
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.warn).toHaveBeenCalled();
    });

    it('should log 5xx request as error', () => {
      logger.httpRequest('POST', '/api/users', 500, 50);
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.error).toHaveBeenCalled();
    });
  });

  describe('database query logging', () => {
    it('should log database queries', () => {
      logger.dbQuery('find', 'users', 25, { query: { active: true } });
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.debug).toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ requestId: '123' });
      expect(childLogger).toBeInstanceOf(Logger);
    });
  });

  describe('level management', () => {
    it('should get current log level', () => {
      expect(logger.getLevel()).toBe('info');
    });
  });

  describe('flush', () => {
    it('should flush pending logs', () => {
      logger.flush();
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger.flush).toHaveBeenCalled();
    });
  });

  describe('getPinoLogger', () => {
    it('should return underlying pino logger', () => {
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger).toBeDefined();
    });
  });
});
