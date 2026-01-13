import type Redis from 'ioredis';
import type { PubSubMessage, MessageHandler } from './types';

/**
 * Pub/Sub service for cross-service messaging.
 */
export class PubSubService {
  private publisher: Redis;
  private subscriber: Redis | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private patternHandlers: Map<string, Set<MessageHandler>> = new Map();
  private source: string;

  /**
   * Creates a new PubSubService instance.
   * @param publisher - Redis client for publishing
   * @param subscriber - Redis client for subscribing (optional, will duplicate publisher)
   * @param source - Source identifier for messages
   */
  constructor(publisher: Redis, subscriber?: Redis, source?: string) {
    this.publisher = publisher;
    this.subscriber = subscriber ?? null;
    this.source = source ?? 'unknown';
  }

  /**
   * Gets or creates the subscriber client.
   * @returns The subscriber Redis client
   */
  private async getSubscriber(): Promise<Redis> {
    if (!this.subscriber) {
      this.subscriber = this.publisher.duplicate();
      this.setupSubscriberHandlers();
    }
    return this.subscriber;
  }

  /**
   * Sets up message handlers on the subscriber.
   */
  private setupSubscriberHandlers(): void {
    if (!this.subscriber) return;

    // Handle regular subscriptions
    this.subscriber.on('message', async (channel: string, message: string) => {
      await this.handleMessage(channel, message);
    });

    // Handle pattern subscriptions
    this.subscriber.on('pmessage', async (pattern: string, channel: string, message: string) => {
      await this.handlePatternMessage(pattern, channel, message);
    });
  }

  /**
   * Handles a message from a regular subscription.
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers || handlers.size === 0) return;

    try {
      const parsed = JSON.parse(message) as PubSubMessage;
      for (const handler of handlers) {
        try {
          await handler(parsed, channel);
        } catch (error) {
          console.error(`Error in message handler for channel ${channel}:`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to parse message on channel ${channel}:`, error);
    }
  }

  /**
   * Handles a message from a pattern subscription.
   */
  private async handlePatternMessage(pattern: string, channel: string, message: string): Promise<void> {
    const handlers = this.patternHandlers.get(pattern);
    if (!handlers || handlers.size === 0) return;

    try {
      const parsed = JSON.parse(message) as PubSubMessage;
      for (const handler of handlers) {
        try {
          await handler(parsed, channel);
        } catch (error) {
          console.error(`Error in pattern handler for ${pattern} (channel: ${channel}):`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to parse message on pattern ${pattern}:`, error);
    }
  }

  /**
   * Publishes a message to a channel.
   * @param channel - The channel to publish to
   * @param type - Message type/event name
   * @param payload - Message payload
   * @param correlationId - Optional correlation ID for tracking
   * @returns Number of subscribers that received the message
   */
  public async publish<T>(
    channel: string,
    type: string,
    payload: T,
    correlationId?: string
  ): Promise<number> {
    const message: PubSubMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source: this.source,
      correlationId,
    };

    const serialized = JSON.stringify(message);
    return this.publisher.publish(channel, serialized);
  }

  /**
   * Subscribes to a channel.
   * @param channel - The channel to subscribe to
   * @param handler - Message handler function
   */
  public async subscribe<T = unknown>(
    channel: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    const subscriber = await this.getSubscriber();

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await subscriber.subscribe(channel);
    }

    this.handlers.get(channel)!.add(handler as MessageHandler);
  }

  /**
   * Subscribes to multiple channels.
   * @param channels - The channels to subscribe to
   * @param handler - Message handler function
   */
  public async subscribeMany<T = unknown>(
    channels: string[],
    handler: MessageHandler<T>
  ): Promise<void> {
    for (const channel of channels) {
      await this.subscribe(channel, handler);
    }
  }

  /**
   * Subscribes to channels matching a pattern.
   * @param pattern - Glob pattern (e.g., "events:*")
   * @param handler - Message handler function
   */
  public async psubscribe<T = unknown>(
    pattern: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    const subscriber = await this.getSubscriber();

    if (!this.patternHandlers.has(pattern)) {
      this.patternHandlers.set(pattern, new Set());
      await subscriber.psubscribe(pattern);
    }

    this.patternHandlers.get(pattern)!.add(handler as MessageHandler);
  }

  /**
   * Unsubscribes from a channel.
   * @param channel - The channel to unsubscribe from
   * @param handler - Optional specific handler to remove (removes all if not provided)
   */
  public async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
        if (this.subscriber) {
          await this.subscriber.unsubscribe(channel);
        }
      }
    } else {
      this.handlers.delete(channel);
      if (this.subscriber) {
        await this.subscriber.unsubscribe(channel);
      }
    }
  }

  /**
   * Unsubscribes from a pattern.
   * @param pattern - The pattern to unsubscribe from
   * @param handler - Optional specific handler to remove (removes all if not provided)
   */
  public async punsubscribe(pattern: string, handler?: MessageHandler): Promise<void> {
    const handlers = this.patternHandlers.get(pattern);
    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.patternHandlers.delete(pattern);
        if (this.subscriber) {
          await this.subscriber.punsubscribe(pattern);
        }
      }
    } else {
      this.patternHandlers.delete(pattern);
      if (this.subscriber) {
        await this.subscriber.punsubscribe(pattern);
      }
    }
  }

  /**
   * Unsubscribes from all channels and patterns.
   */
  public async unsubscribeAll(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      await this.subscriber.punsubscribe();
    }
    this.handlers.clear();
    this.patternHandlers.clear();
  }

  /**
   * Gets the list of subscribed channels.
   * @returns Array of channel names
   */
  public getSubscribedChannels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Gets the list of subscribed patterns.
   * @returns Array of patterns
   */
  public getSubscribedPatterns(): string[] {
    return Array.from(this.patternHandlers.keys());
  }

  /**
   * Closes the subscriber connection.
   */
  public async close(): Promise<void> {
    await this.unsubscribeAll();
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}

/**
 * Creates a new PubSubService instance.
 * @param publisher - Redis client for publishing
 * @param subscriber - Redis client for subscribing (optional)
 * @param source - Source identifier for messages
 * @returns PubSubService instance
 */
export function createPubSubService(
  publisher: Redis,
  subscriber?: Redis,
  source?: string
): PubSubService {
  return new PubSubService(publisher, subscriber, source);
}
