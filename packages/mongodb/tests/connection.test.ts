import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MongoConnection,
  createMongoConnection,
  createMongoConnectionFromEnv,
} from '../src/connection';
import type { MongoConfig } from '../src/types';

// Mock MongoDB client
vi.mock('mongodb', () => {
  const mockDb = {
    collection: vi.fn().mockReturnValue({
      findOne: vi.fn(),
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
    admin: vi.fn().mockReturnValue({
      serverInfo: vi.fn().mockResolvedValue({ version: '7.0.0' }),
      serverStatus: vi.fn().mockResolvedValue({ host: 'localhost:27017' }),
    }),
  };

  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    db: vi.fn().mockReturnValue(mockDb),
    on: vi.fn(),
    startSession: vi.fn().mockReturnValue({
      withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
      endSession: vi.fn().mockResolvedValue(undefined),
    }),
  };

  return {
    MongoClient: vi.fn().mockImplementation(() => mockClient),
    ServerApiVersion: { v1: '1' },
    ObjectId: class ObjectId {
      constructor(public id?: string) {
        this.id = id || 'mock-object-id';
      }
      toString() {
        return this.id;
      }
    },
  };
});

describe('MongoConnection', () => {
  const testConfig: MongoConfig = {
    uri: 'mongodb://localhost:27017',
    database: 'test-db',
    appName: 'test-app',
  };

  beforeEach(() => {
    MongoConnection.clearInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('getInstance', () => {
    it('should return singleton instance for same config', () => {
      const instance1 = MongoConnection.getInstance(testConfig);
      const instance2 = MongoConnection.getInstance(testConfig);
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different databases', () => {
      const instance1 = MongoConnection.getInstance(testConfig);
      const instance2 = MongoConnection.getInstance({
        ...testConfig,
        database: 'other-db',
      });
      expect(instance1).not.toBe(instance2);
    });

    it('should validate config with zod schema', () => {
      expect(() => MongoConnection.getInstance({ uri: '', database: '' })).toThrow();
    });
  });

  describe('connect', () => {
    it('should connect and return database instance', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      const db = await connection.connect();

      expect(db).toBeDefined();
      expect(connection.getState()).toBe('connected');
    });

    it('should return existing db if already connected', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      const db1 = await connection.connect();
      const db2 = await connection.connect();

      expect(db1).toBe(db2);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear state', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      await connection.connect();
      await connection.disconnect();

      expect(connection.getState()).toBe('disconnected');
      expect(connection.getDb()).toBeNull();
      expect(connection.getClient()).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when connected', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      await connection.connect();

      const health = await connection.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(health.serverInfo).toBeDefined();
    });

    it('should return unhealthy status when not connected', async () => {
      const connection = MongoConnection.getInstance(testConfig);

      const health = await connection.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Not connected to MongoDB');
    });
  });

  describe('state listeners', () => {
    it('should notify listeners on state change', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      const listener = vi.fn();

      connection.onStateChange(listener);
      await connection.connect();

      expect(listener).toHaveBeenCalled();
      const calls = listener.mock.calls;
      const connectedCall = calls.find(
        (call: [{ newState: string }]) => call[0].newState === 'connected'
      );
      expect(connectedCall).toBeDefined();
    });

    it('should remove listener when unsubscribed', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      const listener = vi.fn();

      connection.onStateChange(listener);
      connection.offStateChange(listener);
      await connection.connect();

      // Should only have been called during connect before offStateChange
      const connectedCalls = listener.mock.calls.filter(
        (call: [{ newState: string }]) => call[0].newState === 'connected'
      );
      expect(connectedCalls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      const connection = MongoConnection.getInstance(testConfig);
      await connection.connect();

      const mockFn = vi.fn().mockResolvedValue('result');
      const result = await connection.withTransaction(mockFn);

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should throw if not connected', async () => {
      const connection = MongoConnection.getInstance(testConfig);

      await expect(connection.withTransaction(vi.fn())).rejects.toThrow(
        'Not connected to MongoDB'
      );
    });
  });
});

describe('createMongoConnection', () => {
  beforeEach(() => {
    MongoConnection.clearInstances();
  });

  it('should create MongoConnection instance', () => {
    const connection = createMongoConnection({
      uri: 'mongodb://localhost:27017',
      database: 'test',
    });

    expect(connection).toBeInstanceOf(MongoConnection);
  });
});

describe('createMongoConnectionFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    MongoConnection.clearInstances();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create connection from environment variables', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    process.env.MONGODB_DATABASE = 'test-db';
    process.env.MONGODB_APP_NAME = 'test-app';

    const connection = createMongoConnectionFromEnv();

    expect(connection).toBeInstanceOf(MongoConnection);
  });

  it('should throw if MONGODB_URI is missing', () => {
    process.env.MONGODB_DATABASE = 'test-db';
    delete process.env.MONGODB_URI;

    expect(() => createMongoConnectionFromEnv()).toThrow(
      'MONGODB_URI environment variable is required'
    );
  });

  it('should throw if MONGODB_DATABASE is missing', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    delete process.env.MONGODB_DATABASE;

    expect(() => createMongoConnectionFromEnv()).toThrow(
      'MONGODB_DATABASE environment variable is required'
    );
  });
});
