import Redis from 'ioredis';
import type {
  RedisConfig,
  RedisHealthCheck,
  ConnectionState,
  ConnectionStateEvent,
} from './types';
import { RedisConfigSchema } from './types';

/**
 * Event listener type for connection state changes
 */
type ConnectionStateListener = (event: ConnectionStateEvent) => void;

/**
 * Redis connection manager with connection pooling, health checks, and auto-reconnection.
 * Implements singleton pattern per configuration for efficient connection reuse.
 */
export class RedisConnection {
  private static instances: Map<string, RedisConnection> = new Map();
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private config: RedisConfig;
  private state: ConnectionState = 'disconnected';
  private stateListeners: Set<ConnectionStateListener> = new Set();
  private healthCheckIntervalId: NodeJS.Timeout | null = null;

  /**
   * Creates a new RedisConnection instance.
   * Use RedisConnection.getInstance() for singleton access.
   * @param config - Redis connection configuration
   */
  private constructor(config: RedisConfig) {
    const validatedConfig = RedisConfigSchema.parse(config);
    this.config = validatedConfig;
  }

  /**
   * Gets a singleton instance of RedisConnection for the given configuration.
   * @param config - Redis connection configuration
   * @returns RedisConnection instance
   */
  public static getInstance(config: RedisConfig): RedisConnection {
    const key = config.url || `${config.host ?? 'localhost'}:${config.port ?? 6379}:${config.db ?? 0}`;

    if (!RedisConnection.instances.has(key)) {
      RedisConnection.instances.set(key, new RedisConnection(config));
    }

    return RedisConnection.instances.get(key)!;
  }

  /**
   * Clears all connection instances (for testing purposes).
   */
  public static clearInstances(): void {
    RedisConnection.instances.clear();
  }

  /**
   * Connects to Redis and returns the client instance.
   * @returns The Redis client instance
   */
  public async connect(): Promise<Redis> {
    if (this.client && this.state === 'connected') {
      return this.client;
    }

    this.setState('connecting');

    const options: Record<string, unknown> = {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 6379,
      password: this.config.password,
      db: this.config.db ?? 0,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectTimeout ?? 10000,
      commandTimeout: this.config.commandTimeout,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
      enableReadyCheck: this.config.enableReadyCheck ?? true,
      lazyConnect: this.config.lazyConnect ?? false,
    };

    if (this.config.tls) {
      options.tls = {};
    }

    if (this.config.name) {
      options.name = this.config.name;
    }

    // Use URL if provided
    if (this.config.url) {
      this.client = new Redis(this.config.url, options as Record<string, unknown>);
    } else {
      this.client = new Redis(options as Record<string, unknown>);
    }

    // Set up event listeners
    this.setupEventListeners(this.client);

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, this.config.connectTimeout ?? 10000);

      this.client!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client!.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    this.setState('connected');
    return this.client;
  }

  /**
   * Sets up Redis client event listeners for connection monitoring.
   */
  private setupEventListeners(client: Redis): void {
    client.on('connect', () => {
      // Initial connection established
    });

    client.on('ready', () => {
      this.setState('connected');
    });

    client.on('error', (error: Error) => {
      this.setState('error', error);
    });

    client.on('close', () => {
      this.setState('disconnected');
    });

    client.on('reconnecting', () => {
      this.setState('reconnecting');
    });

    client.on('end', () => {
      this.setState('end');
    });
  }

  /**
   * Disconnects from Redis gracefully.
   */
  public async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.setState('disconnected');
    }
  }

  /**
   * Gets the Redis client instance.
   * @returns The client instance or null if not connected
   */
  public getClient(): Redis | null {
    return this.client;
  }

  /**
   * Gets or creates a dedicated subscriber client for pub/sub.
   * @returns The subscriber Redis client
   */
  public async getSubscriber(): Promise<Redis> {
    if (this.subscriber) {
      return this.subscriber;
    }

    // Create a duplicate connection for subscriptions
    if (!this.client) {
      await this.connect();
    }

    this.subscriber = this.client!.duplicate();
    return this.subscriber;
  }

  /**
   * Gets the current connection state.
   * @returns The current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Checks if the connection is healthy.
   * @returns Health check result
   */
  public async healthCheck(): Promise<RedisHealthCheck> {
    const startTime = Date.now();

    try {
      if (!this.client) {
        return {
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          error: 'Not connected to Redis',
        };
      }

      // Ping Redis
      await this.client.ping();

      // Get server info
      const info = await this.client.info('server');
      const memoryInfo = await this.client.info('memory');
      const clientsInfo = await this.client.info('clients');

      // Parse info strings
      const parseInfo = (infoStr: string): Record<string, string> => {
        const result: Record<string, string> = {};
        infoStr.split('\r\n').forEach(line => {
          const [key, value] = line.split(':');
          if (key && value) {
            result[key] = value;
          }
        });
        return result;
      };

      const serverData = parseInfo(info);
      const memoryData = parseInfo(memoryInfo);
      const clientsData = parseInfo(clientsInfo);

      return {
        healthy: true,
        responseTimeMs: Date.now() - startTime,
        serverInfo: {
          version: serverData['redis_version'] ?? 'unknown',
          mode: serverData['redis_mode'] ?? 'standalone',
          connectedClients: parseInt(clientsData['connected_clients'] ?? '0', 10),
          usedMemoryHuman: memoryData['used_memory_human'] ?? 'unknown',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Starts periodic health checks.
   * @param intervalMs - Interval between health checks in milliseconds (default: 30000)
   * @param onUnhealthy - Callback when health check fails
   */
  public startHealthCheck(
    intervalMs = 30000,
    onUnhealthy?: (result: RedisHealthCheck) => void
  ): void {
    this.stopHealthCheck();

    this.healthCheckIntervalId = setInterval(async () => {
      const result = await this.healthCheck();
      if (!result.healthy && onUnhealthy) {
        onUnhealthy(result);
      }
    }, intervalMs);
  }

  /**
   * Stops periodic health checks.
   */
  public stopHealthCheck(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  /**
   * Adds a listener for connection state changes.
   * @param listener - Callback function for state changes
   */
  public onStateChange(listener: ConnectionStateListener): void {
    this.stateListeners.add(listener);
  }

  /**
   * Removes a connection state change listener.
   * @param listener - The listener to remove
   */
  public offStateChange(listener: ConnectionStateListener): void {
    this.stateListeners.delete(listener);
  }

  /**
   * Updates the connection state and notifies listeners.
   * @param newState - The new connection state
   * @param error - Optional error if transitioning to error state
   */
  private setState(newState: ConnectionState, error?: Error): void {
    const previousState = this.state;
    this.state = newState;

    const event: ConnectionStateEvent = {
      previousState,
      newState,
      timestamp: new Date(),
      error,
    };

    for (const listener of this.stateListeners) {
      try {
        listener(event);
      } catch (listenerError) {
        console.error('Error in connection state listener:', listenerError);
      }
    }
  }
}

/**
 * Creates a new Redis connection with the given configuration.
 * @param config - Redis connection configuration
 * @returns A configured RedisConnection instance
 */
export function createRedisConnection(config: RedisConfig): RedisConnection {
  return RedisConnection.getInstance(config);
}

/**
 * Creates a Redis connection from environment variables.
 * Expected environment variables:
 * - REDIS_URL: Connection URL (takes precedence)
 * - REDIS_HOST: Redis host (default: localhost)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password
 * - REDIS_DB: Database number (default: 0)
 * - REDIS_KEY_PREFIX: Key prefix for namespacing
 * @returns A configured RedisConnection instance
 */
export function createRedisConnectionFromEnv(): RedisConnection {
  const url = process.env.REDIS_URL;

  return createRedisConnection({
    url,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    tls: process.env.REDIS_TLS === 'true',
  });
}
