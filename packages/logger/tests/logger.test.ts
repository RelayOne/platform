/**
 * @fileoverview Tests for the Logger class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Logger,
  logger,
  createLogger,
  configureLogger,
  getLoggerConfig,
  LOG_LEVELS,
} from '../src/index.js';

describe('Logger', () => {
  let capturedLogs: Array<{ level: string; args: unknown[] }> = [];

  beforeEach(() => {
    capturedLogs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      capturedLogs.push({ level: 'log', args });
    });
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      capturedLogs.push({ level: 'warn', args });
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      capturedLogs.push({ level: 'error', args });
    });

    // Reset config
    configureLogger({
      level: 'debug',
      format: 'json',
      service: 'test-service',
    });
  });

  describe('LOG_LEVELS', () => {
    it('should have correct level hierarchy', () => {
      expect(LOG_LEVELS.debug).toBeLessThan(LOG_LEVELS.info);
      expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.warn);
      expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.error);
      expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.fatal);
    });
  });

  describe('configureLogger', () => {
    it('should update global configuration', () => {
      configureLogger({ level: 'warn', service: 'custom-service' });
      const config = getLoggerConfig();

      expect(config.level).toBe('warn');
      expect(config.service).toBe('custom-service');
    });

    it('should merge with existing configuration', () => {
      configureLogger({ level: 'error' });
      configureLogger({ service: 'another-service' });
      const config = getLoggerConfig();

      expect(config.level).toBe('error');
      expect(config.service).toBe('another-service');
    });
  });

  describe('Logger class', () => {
    it('should create logger with context', () => {
      const log = new Logger({ component: 'test' });
      log.info('test message');

      expect(capturedLogs.length).toBe(1);
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.component).toBe('test');
    });

    it('should create child logger with merged context', () => {
      const parent = new Logger({ component: 'parent' });
      const child = parent.child({ subComponent: 'child' });
      child.info('test message');

      expect(capturedLogs.length).toBe(1);
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.component).toBe('parent');
      expect(entry.context.subComponent).toBe('child');
    });

    it('should set request ID', () => {
      const log = createLogger();
      log.setRequestId('req-123');
      log.info('test');

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.requestId).toBe('req-123');
    });

    it('should set user ID', () => {
      const log = createLogger();
      log.setUserId('user-456');
      log.info('test');

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.userId).toBe('user-456');
    });

    it('should set organization ID', () => {
      const log = createLogger();
      log.setOrganizationId('org-789');
      log.info('test');

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.organizationId).toBe('org-789');
    });

    it('should inherit IDs in child logger', () => {
      const parent = createLogger();
      parent.setRequestId('req-123');
      parent.setUserId('user-456');

      const child = parent.child({ extra: 'data' });
      child.info('test');

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.requestId).toBe('req-123');
      expect(entry.userId).toBe('user-456');
    });
  });

  describe('Log levels', () => {
    it('should log debug messages', () => {
      logger.debug('debug message');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('debug');
      expect(entry.message).toBe('debug message');
    });

    it('should log info messages', () => {
      logger.info('info message');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('info');
    });

    it('should log warn messages', () => {
      logger.warn('warn message');
      expect(capturedLogs[0].level).toBe('warn');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('warn');
    });

    it('should log error messages', () => {
      logger.error('error message');
      expect(capturedLogs[0].level).toBe('error');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('error');
    });

    it('should log fatal messages', () => {
      logger.fatal('fatal message');
      expect(capturedLogs[0].level).toBe('error');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('fatal');
    });

    it('should filter logs below configured level', () => {
      configureLogger({ level: 'warn' });
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');

      // Only warn should be logged
      expect(capturedLogs.length).toBe(1);
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('warn');
    });
  });

  describe('Log data', () => {
    it('should include additional context', () => {
      logger.info('test', { key: 'value', num: 42 });
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.key).toBe('value');
      expect(entry.context.num).toBe(42);
    });

    it('should extract error objects', () => {
      const error = new Error('test error');
      logger.error('failed', { error });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.error.name).toBe('Error');
      expect(entry.error.message).toBe('test error');
      expect(entry.error.stack).toBeDefined();
    });

    it('should extract duration', () => {
      logger.info('completed', { durationMs: 150 });
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.durationMs).toBe(150);
    });

    it('should extract HTTP info', () => {
      logger.info('request', {
        http: {
          method: 'GET',
          path: '/api/users',
          statusCode: 200,
        },
      });
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.http.method).toBe('GET');
      expect(entry.http.path).toBe('/api/users');
      expect(entry.http.statusCode).toBe(200);
    });

    it('should include timestamp', () => {
      logger.info('test');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include service name', () => {
      logger.info('test');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.service).toBe('test-service');
    });
  });

  describe('time()', () => {
    it('should log operation duration', async () => {
      const timer = logger.time('test-operation');
      await new Promise((r) => setTimeout(r, 50));
      timer.end();

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.message).toBe('test-operation completed');
      expect(entry.durationMs).toBeGreaterThanOrEqual(40);
      expect(entry.durationMs).toBeLessThan(200);
    });

    it('should include additional data', () => {
      const timer = logger.time('db-query', { table: 'users' });
      timer.end();

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.table).toBe('users');
    });
  });

  describe('default logger', () => {
    it('should be available as singleton', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should log messages', () => {
      logger.info('singleton test');
      expect(capturedLogs.length).toBe(1);
    });
  });

  describe('createLogger', () => {
    it('should create new logger instance', () => {
      const log1 = createLogger({ id: 1 });
      const log2 = createLogger({ id: 2 });

      log1.info('log1');
      log2.info('log2');

      expect(capturedLogs.length).toBe(2);
      const entry1 = JSON.parse(capturedLogs[0].args[0] as string);
      const entry2 = JSON.parse(capturedLogs[1].args[0] as string);
      expect(entry1.context.id).toBe(1);
      expect(entry2.context.id).toBe(2);
    });
  });
});
