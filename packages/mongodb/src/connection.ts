import { MongoClient, Db, ServerApiVersion } from 'mongodb';
import type {
  MongoConfig,
  MongoHealthCheck,
  ConnectionState,
  ConnectionStateEvent,
} from './types';
import { MongoConfigSchema } from './types';

/**
 * Event listener type for connection state changes
 */
type ConnectionStateListener = (event: ConnectionStateEvent) => void;

/**
 * MongoDB connection manager with connection pooling, health checks, and auto-reconnection.
 * Implements singleton pattern per database for efficient connection reuse.
 */
export class MongoConnection {
  private static instances: Map<string, MongoConnection> = new Map();
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConfig;
  private state: ConnectionState = 'disconnected';
  private stateListeners: Set<ConnectionStateListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 1000;
  private healthCheckIntervalId: NodeJS.Timeout | null = null;

  /**
   * Creates a new MongoConnection instance.
   * Use MongoConnection.getInstance() for singleton access.
   * @param config - MongoDB connection configuration
   */
  private constructor(config: MongoConfig) {
    const validatedConfig = MongoConfigSchema.parse(config);
    this.config = validatedConfig;
  }

  /**
   * Gets a singleton instance of MongoConnection for the given configuration.
   * @param config - MongoDB connection configuration
   * @returns MongoConnection instance
   */
  public static getInstance(config: MongoConfig): MongoConnection {
    const key = `${config.uri}:${config.database}`;

    if (!MongoConnection.instances.has(key)) {
      MongoConnection.instances.set(key, new MongoConnection(config));
    }

    return MongoConnection.instances.get(key)!;
  }

  /**
   * Clears all connection instances (for testing purposes).
   */
  public static clearInstances(): void {
    MongoConnection.instances.clear();
  }

  /**
   * Connects to MongoDB and returns the database instance.
   * @returns The MongoDB database instance
   * @throws Error if connection fails after max retries
   */
  public async connect(): Promise<Db> {
    if (this.db && this.state === 'connected') {
      return this.db;
    }

    this.setState('connecting');

    try {
      const options: ConstructorParameters<typeof MongoClient>[1] = {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
        minPoolSize: this.config.minPoolSize ?? 5,
        maxPoolSize: this.config.maxPoolSize ?? 100,
        connectTimeoutMS: this.config.connectTimeoutMS ?? 10000,
        socketTimeoutMS: this.config.socketTimeoutMS ?? 45000,
        serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS ?? 30000,
        retryWrites: this.config.retryWrites ?? true,
        appName: this.config.appName ?? 'relay-platform',
      };

      if (this.config.tls !== undefined && options) {
        Object.assign(options, { tls: this.config.tls });
      }
      if (this.config.tlsCAFile && options) {
        Object.assign(options, { tlsCAFile: this.config.tlsCAFile });
      }
      if (this.config.tlsAllowInvalidCertificates !== undefined && options) {
        Object.assign(options, { tlsAllowInvalidCertificates: this.config.tlsAllowInvalidCertificates });
      }

      this.client = new MongoClient(this.config.uri, options);
      await this.client.connect();

      // Set up event listeners for connection monitoring
      this.setupEventListeners();

      this.db = this.client.db(this.config.database);
      this.reconnectAttempts = 0;
      this.setState('connected');

      return this.db;
    } catch (error) {
      this.setState('error', error as Error);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
      }

      throw new Error(
        `Failed to connect to MongoDB after ${this.maxReconnectAttempts} attempts: ${(error as Error).message}`
      );
    }
  }

  /**
   * Sets up MongoDB client event listeners for connection monitoring.
   */
  private setupEventListeners(): void {
    if (!this.client) return;

    this.client.on('close', () => {
      this.setState('disconnected');
    });

    this.client.on('error', (error: Error) => {
      this.setState('error', error);
    });

    this.client.on('connectionPoolCleared', () => {
      // Pool was cleared, potentially needs reconnection
      if (this.state === 'connected') {
        this.setState('disconnected');
        this.connect().catch(console.error);
      }
    });
  }

  /**
   * Disconnects from MongoDB gracefully.
   */
  public async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.client) {
      this.setState('disconnecting');
      await this.client.close();
      this.client = null;
      this.db = null;
      this.setState('disconnected');
    }
  }

  /**
   * Alias for disconnect() for backward compatibility.
   */
  public async close(): Promise<void> {
    return this.disconnect();
  }

  /**
   * Gets the MongoDB database instance.
   * @returns The database instance or null if not connected
   */
  public getDb(): Db | null {
    return this.db;
  }

  /**
   * Gets the MongoDB client instance.
   * @returns The client instance or null if not connected
   */
  public getClient(): MongoClient | null {
    return this.client;
  }

  /**
   * Gets the current connection state.
   * @returns The current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Checks if the connection is currently established.
   * @returns True if connected
   */
  public isConnected(): boolean {
    return this.state === 'connected' && this.client !== null && this.db !== null;
  }

  /**
   * Checks if the connection is healthy.
   * @returns Health check result
   */
  public async healthCheck(): Promise<MongoHealthCheck> {
    const startTime = Date.now();

    try {
      if (!this.client || !this.db) {
        return {
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          error: 'Not connected to MongoDB',
        };
      }

      const adminDb = this.client.db().admin();
      const serverInfo = await adminDb.serverInfo();
      const serverStatus = await adminDb.serverStatus();

      return {
        healthy: true,
        responseTimeMs: Date.now() - startTime,
        serverInfo: {
          version: serverInfo.version,
          host: serverStatus.host?.split(':')[0] ?? 'unknown',
          port: parseInt(serverStatus.host?.split(':')[1] ?? '27017', 10),
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
    onUnhealthy?: (result: MongoHealthCheck) => void
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

  /**
   * Executes a function within a MongoDB transaction.
   * @param fn - The function to execute within the transaction
   * @returns The result of the function
   * @throws Error if transaction fails
   */
  public async withTransaction<T>(
    fn: (session: import('mongodb').ClientSession) => Promise<T>
  ): Promise<T> {
    if (!this.client) {
      throw new Error('Not connected to MongoDB');
    }

    const session = this.client.startSession();

    try {
      let result: T;

      await session.withTransaction(async () => {
        result = await fn(session);
      });

      return result!;
    } finally {
      await session.endSession();
    }
  }
}

/**
 * Creates a new MongoDB connection with the given configuration.
 * @param config - MongoDB connection configuration
 * @returns A configured MongoConnection instance
 */
export function createMongoConnection(config: MongoConfig): MongoConnection {
  return MongoConnection.getInstance(config);
}

/**
 * Creates a MongoDB connection from environment variables.
 * Expected environment variables:
 * - MONGODB_URI: Connection URI
 * - MONGODB_DATABASE: Database name
 * - MONGODB_APP_NAME: Application name (optional)
 * @returns A configured MongoConnection instance
 * @throws Error if required environment variables are missing
 */
export function createMongoConnectionFromEnv(): MongoConnection {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DATABASE;

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  if (!database) {
    throw new Error('MONGODB_DATABASE environment variable is required');
  }

  return createMongoConnection({
    uri,
    database,
    appName: process.env.MONGODB_APP_NAME,
    minPoolSize: process.env.MONGODB_MIN_POOL_SIZE ? parseInt(process.env.MONGODB_MIN_POOL_SIZE, 10) : undefined,
    maxPoolSize: process.env.MONGODB_MAX_POOL_SIZE ? parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10) : undefined,
  });
}
