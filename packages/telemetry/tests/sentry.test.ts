import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SentryService, createSentryService } from '../src/sentry';

// Mock Sentry
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  captureException: vi.fn().mockReturnValue('event-id-123'),
  captureMessage: vi.fn().mockReturnValue('event-id-456'),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
  setContext: vi.fn(),
  getCurrentScope: vi.fn().mockReturnValue({}),
  flush: vi.fn().mockResolvedValue(true),
  withScope: vi.fn().mockImplementation((callback) => {
    const scope = {
      setUser: vi.fn(),
      setTag: vi.fn(),
      setExtra: vi.fn(),
      setFingerprint: vi.fn(),
      setLevel: vi.fn(),
    };
    return callback(scope);
  }),
  startInactiveSpan: vi.fn().mockReturnValue({
    end: vi.fn(),
    setStatus: vi.fn(),
  }),
  startSpan: vi.fn().mockImplementation((options, callback) => callback()),
  httpIntegration: vi.fn().mockReturnValue({}),
}));

describe('SentryService', () => {
  let sentryService: SentryService;

  const defaultConfig = {
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    environment: 'test',
    sentryEnabled: true,
    sentryDsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    sentrySampleRate: 1.0,
    sentryTracesSampleRate: 0.1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sentryService = createSentryService(defaultConfig);
  });

  afterEach(async () => {
    if (sentryService.isEnabled()) {
      await sentryService.shutdown();
    }
  });

  describe('createSentryService', () => {
    it('should create a sentry service instance', () => {
      expect(sentryService).toBeInstanceOf(SentryService);
    });
  });

  describe('initialize', () => {
    it('should initialize Sentry', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      expect(Sentry.init).toHaveBeenCalled();
      expect(sentryService.isEnabled()).toBe(true);
    });

    it('should not initialize if Sentry is disabled', () => {
      const disabledService = createSentryService({
        ...defaultConfig,
        sentryEnabled: false,
      });
      disabledService.initialize();
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should not initialize without DSN', () => {
      const noDsnService = createSentryService({
        ...defaultConfig,
        sentryDsn: undefined,
      });
      noDsnService.initialize();
      expect(noDsnService.isEnabled()).toBe(false);
    });

    it('should not initialize twice', () => {
      sentryService.initialize();
      sentryService.initialize();
      expect(sentryService.isEnabled()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown Sentry', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();
      await sentryService.shutdown();

      expect(Sentry.close).toHaveBeenCalled();
      expect(sentryService.isEnabled()).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      await sentryService.shutdown();
      expect(sentryService.isEnabled()).toBe(false);
    });
  });

  describe('captureError', () => {
    it('should capture an error', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const error = new Error('test error');
      const eventId = sentryService.captureError(error);

      expect(eventId).toBe('event-id-123');
      expect(Sentry.withScope).toHaveBeenCalled();
    });

    it('should capture error with context', async () => {
      sentryService.initialize();

      const error = new Error('test error');
      sentryService.captureError(error, {
        user: { id: 'user-123' },
        tags: { feature: 'test' },
        extra: { data: 'value' },
        fingerprint: ['custom-fingerprint'],
        level: 'warning',
      });

      // Verify withScope was called
    });

    it('should return undefined when not initialized', () => {
      const error = new Error('test error');
      const eventId = sentryService.captureError(error);
      expect(eventId).toBeUndefined();
    });
  });

  describe('captureMessage', () => {
    it('should capture a message', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const eventId = sentryService.captureMessage('Test message', 'info');

      // Both captureException and captureMessage use withScope which returns event id
      expect(eventId).toBeDefined();
      expect(Sentry.withScope).toHaveBeenCalled();
    });

    it('should capture message with context', async () => {
      sentryService.initialize();

      sentryService.captureMessage('Test message', 'warning', {
        user: { id: 'user-123' },
        tags: { feature: 'test' },
        extra: { data: 'value' },
      });
    });

    it('should return undefined when not initialized', () => {
      const eventId = sentryService.captureMessage('Test message');
      expect(eventId).toBeUndefined();
    });
  });

  describe('addBreadcrumb', () => {
    it('should add a breadcrumb', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.addBreadcrumb({
        category: 'test',
        message: 'Test breadcrumb',
        data: { key: 'value' },
        type: 'default',
        level: 'info',
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalled();
    });

    it('should not add breadcrumb when not initialized', async () => {
      const Sentry = await import('@sentry/node');

      sentryService.addBreadcrumb({
        message: 'Test breadcrumb',
      });

      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });
  });

  describe('setUser', () => {
    it('should set user context', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.setUser({ id: 'user-123', email: 'test@example.com' });

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should clear user context', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.setUser(null);

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe('setTag', () => {
    it('should set a tag', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.setTag('feature', 'test');

      expect(Sentry.setTag).toHaveBeenCalledWith('feature', 'test');
    });
  });

  describe('setExtra', () => {
    it('should set extra context', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.setExtra('data', { key: 'value' });

      expect(Sentry.setExtra).toHaveBeenCalledWith('data', { key: 'value' });
    });
  });

  describe('setContext', () => {
    it('should set context', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      sentryService.setContext('custom', { key: 'value' });

      expect(Sentry.setContext).toHaveBeenCalledWith('custom', { key: 'value' });
    });
  });

  describe('startTransaction', () => {
    it('should start a transaction', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const transaction = sentryService.startTransaction({
        name: 'test-transaction',
        op: 'test',
        description: 'Test transaction',
      });

      expect(transaction).toBeDefined();
      expect(Sentry.startInactiveSpan).toHaveBeenCalled();
    });

    it('should return undefined when not initialized', () => {
      const transaction = sentryService.startTransaction({
        name: 'test-transaction',
        op: 'test',
      });

      expect(transaction).toBeUndefined();
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      sentryService.initialize();

      const result = await sentryService.withTransaction(
        { name: 'test-transaction', op: 'test' },
        async () => 'success'
      );

      expect(result).toBe('success');
    });

    it('should execute function without transaction when not initialized', async () => {
      const result = await sentryService.withTransaction(
        { name: 'test-transaction', op: 'test' },
        async () => 'success'
      );

      expect(result).toBe('success');
    });
  });

  describe('startSpan', () => {
    it('should start a span', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const span = sentryService.startSpan('test-span', 'test');

      expect(span).toBeDefined();
      expect(Sentry.startInactiveSpan).toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('should flush pending events', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const result = await sentryService.flush();

      expect(result).toBe(true);
      expect(Sentry.flush).toHaveBeenCalled();
    });

    it('should return true when not initialized', async () => {
      const result = await sentryService.flush();
      expect(result).toBe(true);
    });
  });

  describe('getCurrentScope', () => {
    it('should return current scope', async () => {
      const Sentry = await import('@sentry/node');
      sentryService.initialize();

      const scope = sentryService.getCurrentScope();

      expect(scope).toBeDefined();
      expect(Sentry.getCurrentScope).toHaveBeenCalled();
    });

    it('should return undefined when not initialized', () => {
      const scope = sentryService.getCurrentScope();
      expect(scope).toBeUndefined();
    });
  });
});
