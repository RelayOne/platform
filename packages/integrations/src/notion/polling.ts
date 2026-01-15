/**
 * @fileoverview Notion polling-based change detection.
 * Since Notion doesn't have webhooks, we poll for changes.
 * @packageDocumentation
 */

import { createLogger } from '@relay/logger';
import { NotionClient } from './client';
import type { NotionPage, NotionDatabaseSort } from './types';

const logger = createLogger('notion-polling');

/**
 * Configuration for Notion polling.
 */
export interface NotionPollingConfig {
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  intervalMs?: number;
  /** Database IDs to monitor */
  databaseIds: string[];
  /** Maximum pages to fetch per poll (default: 100) */
  maxPagesPerPoll?: number;
}

/**
 * Notion change event types.
 */
export type NotionChangeType = 'created' | 'updated' | 'archived';

/**
 * Notion change event.
 */
export interface NotionChangeEvent {
  /** Change type */
  type: NotionChangeType;
  /** Page that changed */
  page: NotionPage;
  /** Database ID */
  databaseId: string;
  /** Timestamp when change was detected */
  detectedAt: Date;
}

/**
 * Event handler type for Notion changes.
 */
type NotionChangeHandler = (event: NotionChangeEvent) => Promise<void>;

/**
 * Notion polling manager for detecting changes.
 *
 * Since Notion doesn't support webhooks, this manager polls
 * databases at regular intervals to detect changes.
 *
 * @example
 * ```typescript
 * const client = new NotionClient({ ... });
 * const poller = new NotionPollingManager(client, {
 *   databaseIds: ['db-1', 'db-2'],
 *   intervalMs: 60000, // 1 minute
 * });
 *
 * poller.onPageCreated(async (event) => {
 *   console.log('Page created:', event.page.id);
 * });
 *
 * poller.onPageUpdated(async (event) => {
 *   console.log('Page updated:', event.page.id);
 * });
 *
 * poller.start();
 *
 * // Later
 * poller.stop();
 * ```
 */
export class NotionPollingManager {
  private client: NotionClient;
  private config: Required<NotionPollingConfig>;
  private handlers: Map<NotionChangeType | '*', NotionChangeHandler[]> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTime: Date;
  private knownPages: Map<string, { lastEditedTime: Date; archived: boolean }> = new Map();
  private isPolling: boolean = false;

  /**
   * Creates a new Notion polling manager.
   * @param client - Notion client
   * @param config - Polling configuration
   */
  constructor(client: NotionClient, config: NotionPollingConfig) {
    this.client = client;
    this.config = {
      intervalMs: config.intervalMs || 30000,
      databaseIds: config.databaseIds,
      maxPagesPerPoll: config.maxPagesPerPoll || 100,
    };
    this.lastPollTime = new Date();
  }

  /**
   * Start polling for changes.
   */
  start(): void {
    if (this.pollTimer) {
      logger.warn('Polling already started');
      return;
    }

    logger.info('Starting Notion polling', {
      intervalMs: this.config.intervalMs,
      databases: this.config.databaseIds,
    });

    // Do initial poll to populate known pages
    this.poll().catch((error) => {
      logger.error('Initial poll failed', { error });
    });

    // Start regular polling
    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => {
        logger.error('Poll failed', { error });
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop polling for changes.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info('Stopped Notion polling');
    }
  }

  /**
   * Check if polling is active.
   * @returns True if polling is active
   */
  isActive(): boolean {
    return this.pollTimer !== null;
  }

  /**
   * Perform a single poll for changes.
   */
  async poll(): Promise<void> {
    if (this.isPolling) {
      logger.debug('Poll already in progress, skipping');
      return;
    }

    this.isPolling = true;
    const pollStartTime = new Date();

    try {
      for (const databaseId of this.config.databaseIds) {
        await this.pollDatabase(databaseId);
      }

      this.lastPollTime = pollStartTime;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Poll a single database for changes.
   * @param databaseId - Database ID
   */
  private async pollDatabase(databaseId: string): Promise<void> {
    const sorts: NotionDatabaseSort[] = [
      { timestamp: 'last_edited_time', direction: 'descending' },
    ];

    let cursor: string | undefined;
    let pagesProcessed = 0;

    do {
      const { results, nextCursor, hasMore } = await (this.client as any).queryDatabase(
        databaseId,
        { sorts, cursor, pageSize: 100 }
      );

      for (const page of results as NotionPage[]) {
        const pageKey = page.id;
        const currentEditTime = new Date(page.last_edited_time);
        const known = this.knownPages.get(pageKey);

        if (!known) {
          // New page
          this.knownPages.set(pageKey, {
            lastEditedTime: currentEditTime,
            archived: page.archived,
          });

          // Only emit 'created' if page was created after we started polling
          const createdTime = new Date(page.created_time);
          if (createdTime > this.lastPollTime) {
            await this.emitEvent({
              type: 'created',
              page,
              databaseId,
              detectedAt: new Date(),
            });
          }
        } else if (currentEditTime > known.lastEditedTime) {
          // Updated page
          this.knownPages.set(pageKey, {
            lastEditedTime: currentEditTime,
            archived: page.archived,
          });

          if (page.archived && !known.archived) {
            // Page was archived
            await this.emitEvent({
              type: 'archived',
              page,
              databaseId,
              detectedAt: new Date(),
            });
          } else {
            // Page was updated
            await this.emitEvent({
              type: 'updated',
              page,
              databaseId,
              detectedAt: new Date(),
            });
          }
        } else {
          // Page hasn't changed, and since results are sorted by last_edited_time,
          // we can stop processing this database
          return;
        }

        pagesProcessed++;
        if (pagesProcessed >= this.config.maxPagesPerPoll) {
          return;
        }
      }

      cursor = hasMore ? (nextCursor as string) : undefined;
    } while (cursor);
  }

  /**
   * Emit an event to registered handlers.
   * @param event - Change event
   */
  private async emitEvent(event: NotionChangeEvent): Promise<void> {
    // Call type-specific handlers
    const typeHandlers = this.handlers.get(event.type) || [];
    for (const handler of typeHandlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Event handler error', { type: event.type, error });
      }
    }

    // Call wildcard handlers
    const wildcardHandlers = this.handlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Wildcard handler error', { type: event.type, error });
      }
    }
  }

  /**
   * Register an event handler.
   * @param type - Event type or '*' for all events
   * @param handler - Event handler function
   */
  on(type: NotionChangeType | '*', handler: NotionChangeHandler): void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  /**
   * Register handler for page created events.
   * @param handler - Event handler
   */
  onPageCreated(handler: NotionChangeHandler): void {
    this.on('created', handler);
  }

  /**
   * Register handler for page updated events.
   * @param handler - Event handler
   */
  onPageUpdated(handler: NotionChangeHandler): void {
    this.on('updated', handler);
  }

  /**
   * Register handler for page archived events.
   * @param handler - Event handler
   */
  onPageArchived(handler: NotionChangeHandler): void {
    this.on('archived', handler);
  }

  /**
   * Add a database to monitor.
   * @param databaseId - Database ID
   */
  addDatabase(databaseId: string): void {
    if (!this.config.databaseIds.includes(databaseId)) {
      this.config.databaseIds.push(databaseId);
      logger.info('Added database to polling', { databaseId });
    }
  }

  /**
   * Remove a database from monitoring.
   * @param databaseId - Database ID
   */
  removeDatabase(databaseId: string): void {
    const index = this.config.databaseIds.indexOf(databaseId);
    if (index !== -1) {
      this.config.databaseIds.splice(index, 1);
      // Clean up known pages for this database
      // Note: We'd need to track which pages belong to which database
      // for a complete cleanup, but this is a reasonable simplification
      logger.info('Removed database from polling', { databaseId });
    }
  }

  /**
   * Get polling statistics.
   * @returns Polling statistics
   */
  getStats(): {
    isActive: boolean;
    lastPollTime: Date;
    knownPagesCount: number;
    databaseCount: number;
    intervalMs: number;
  } {
    return {
      isActive: this.isActive(),
      lastPollTime: this.lastPollTime,
      knownPagesCount: this.knownPages.size,
      databaseCount: this.config.databaseIds.length,
      intervalMs: this.config.intervalMs,
    };
  }

  /**
   * Force an immediate poll.
   * @returns Promise that resolves when poll completes
   */
  async forcePoll(): Promise<void> {
    return this.poll();
  }

  /**
   * Clear known pages cache.
   * Useful for resetting state.
   */
  clearCache(): void {
    this.knownPages.clear();
    logger.info('Cleared polling cache');
  }
}

/**
 * Helper to process Notion changes as a webhook-like event.
 * Wraps the polling manager with a simpler interface.
 */
export interface NotionWebhookLikeEvent {
  /** Event type */
  eventType: 'page.created' | 'page.updated' | 'page.archived';
  /** Page ID */
  pageId: string;
  /** Database ID */
  databaseId: string;
  /** Page title (extracted from properties) */
  title: string;
  /** Page URL */
  url: string;
  /** Last edited time */
  lastEditedTime: Date;
  /** Event timestamp */
  timestamp: Date;
}

/**
 * Convert NotionChangeEvent to a webhook-like event.
 * @param event - Notion change event
 * @returns Webhook-like event
 */
export function toWebhookLikeEvent(event: NotionChangeEvent): NotionWebhookLikeEvent {
  // Extract title from properties
  const titleProp = Object.values(event.page.properties).find(
    (p) => p.type === 'title'
  );
  const title = titleProp?.title
    ? titleProp.title.map((t) => t.plain_text).join('')
    : 'Untitled';

  return {
    eventType:
      event.type === 'created'
        ? 'page.created'
        : event.type === 'updated'
        ? 'page.updated'
        : 'page.archived',
    pageId: event.page.id,
    databaseId: event.databaseId,
    title,
    url: event.page.url,
    lastEditedTime: new Date(event.page.last_edited_time),
    timestamp: event.detectedAt,
  };
}
