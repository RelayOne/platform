import { createLogger } from '@relay/logger';
import {
  BaseWebhookHandler,
  type WebhookHandlerConfig,
  type WebhookRequest,
  type WebhookResponse,
} from '../tracker-base';
import type { MondayWebhookPayload, MondayWebhookEventType } from './types';
import { MondayWebhookPayloadSchema } from './types';

/**
 * @fileoverview Monday.com webhook handler.
 * Handles board and item events from Monday.com with URL verification support.
 * @packageDocumentation
 */

const logger = createLogger('monday-webhooks');

/**
 * Monday.com webhook configuration.
 */
export interface MondayWebhookConfig extends WebhookHandlerConfig {
  /** Monday.com signing secret (optional - Monday uses URL verification) */
  signingSecret?: string;
}

/**
 * Processed Monday.com webhook event.
 */
export interface ProcessedMondayEvent {
  /** Event type */
  eventType: MondayWebhookEventType;
  /** Board ID */
  boardId: number;
  /** Item ID (pulse ID) */
  itemId?: number;
  /** Item name */
  itemName?: string;
  /** Group ID */
  groupId?: string;
  /** Column ID (for value changes) */
  columnId?: string;
  /** Column title */
  columnTitle?: string;
  /** User who triggered the event */
  userId: number;
  /** New value */
  value?: Record<string, unknown>;
  /** Previous value */
  previousValue?: Record<string, unknown>;
  /** Raw payload */
  payload: MondayWebhookPayload;
  /** Timestamp when event was processed */
  receivedAt: Date;
}

/**
 * Event handler function type.
 */
type MondayEventHandler = (event: ProcessedMondayEvent) => Promise<void>;

/**
 * Monday.com webhook handler.
 * Handles incoming webhooks from Monday.com.
 *
 * Note: Monday.com uses URL verification instead of signature verification.
 * When creating a webhook, Monday sends a challenge that must be echoed back.
 *
 * @example
 * ```typescript
 * const handler = new MondayWebhookHandler({});
 *
 * handler.onItemCreated(async (event) => {
 *   console.log('Item created:', event.itemId);
 * });
 *
 * handler.onStatusChanged(async (event) => {
 *   console.log('Status changed:', event.value);
 * });
 *
 * // In API route
 * export async function POST(request: Request) {
 *   const response = await handler.handleRequest({
 *     body: await request.text(),
 *     headers: Object.fromEntries(request.headers),
 *   });
 *   return new Response(response.body, { status: response.status });
 * }
 * ```
 */
export class MondayWebhookHandler extends BaseWebhookHandler {
  private handlers: Map<string, MondayEventHandler[]> = new Map();

  /**
   * Creates a new Monday.com webhook handler.
   * @param config - Webhook configuration
   */
  constructor(config: MondayWebhookConfig = {}) {
    super({
      ...config,
      signatureStrategy: 'none', // Monday uses URL verification
    });
  }

  /**
   * Handle an incoming webhook request.
   * @param request - Incoming webhook request
   * @returns Webhook response
   */
  async handleRequest(request: WebhookRequest): Promise<WebhookResponse> {
    let payload: MondayWebhookPayload;

    try {
      const parsed = JSON.parse(request.body);
      payload = MondayWebhookPayloadSchema.parse(parsed);
    } catch (error) {
      logger.error('Failed to parse webhook payload', { error });
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid payload' }),
      };
    }

    // Handle challenge (URL verification)
    if (payload.challenge) {
      logger.info('Webhook challenge received');
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: payload.challenge }),
      };
    }

    const event = payload.event;

    // Determine event type
    const eventType = event.type || this.inferEventType(event);

    if (!eventType) {
      logger.warn('Could not determine event type', { event });
      return {
        status: 200,
        body: JSON.stringify({ received: true }),
      };
    }

    // Process event
    const processedEvent: ProcessedMondayEvent = {
      eventType,
      boardId: event.boardId,
      itemId: event.itemId || event.pulseId,
      itemName: event.itemName || event.pulseName,
      groupId: event.groupId,
      columnId: event.columnId,
      columnTitle: event.columnTitle,
      userId: event.userId,
      value: event.value,
      previousValue: event.previousValue,
      payload,
      receivedAt: new Date(),
    };

    await this.dispatchEvent(eventType, processedEvent);

    return {
      status: 200,
      body: JSON.stringify({ received: true }),
    };
  }

  /**
   * Infer event type from event data.
   * @param event - Event data
   * @returns Inferred event type or undefined
   */
  private inferEventType(event: MondayWebhookPayload['event']): MondayWebhookEventType | undefined {
    // Item created
    if ((event.itemId || event.pulseId) && !event.columnId && !event.previousValue) {
      return 'create_item';
    }

    // Status column changed
    if (event.columnType === 'color' || event.columnId === 'status') {
      return 'change_status_column_value';
    }

    // Column value changed
    if (event.columnId && event.value !== undefined) {
      return 'change_column_value';
    }

    // Update created
    if (event.updateId && event.textBody) {
      return 'create_update';
    }

    return undefined;
  }

  /**
   * Dispatch event to registered handlers.
   * @param eventType - Event type
   * @param event - Processed event
   */
  private async dispatchEvent(
    eventType: MondayWebhookEventType,
    event: ProcessedMondayEvent
  ): Promise<void> {
    // Specific event handlers
    const handlers = this.handlers.get(eventType) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Event handler error', { eventType, error });
      }
    }

    // Wildcard handlers
    const wildcardHandlers = this.handlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Wildcard handler error', { eventType, error });
      }
    }
  }

  /**
   * Register an event handler.
   * @param eventType - Event type to handle
   * @param handler - Event handler function
   */
  on(eventType: MondayWebhookEventType | '*', handler: MondayEventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register handler for item created events.
   * @param handler - Event handler
   */
  onItemCreated(handler: MondayEventHandler): void {
    this.on('create_item', handler);
  }

  /**
   * Register handler for column value changed events.
   * @param handler - Event handler
   */
  onColumnValueChanged(handler: MondayEventHandler): void {
    this.on('change_column_value', handler);
  }

  /**
   * Register handler for status column changed events.
   * @param handler - Event handler
   */
  onStatusChanged(handler: MondayEventHandler): void {
    this.on('change_status_column_value', handler);
  }

  /**
   * Register handler for item name changed events.
   * @param handler - Event handler
   */
  onNameChanged(handler: MondayEventHandler): void {
    this.on('change_name', handler);
  }

  /**
   * Register handler for update (comment) created events.
   * @param handler - Event handler
   */
  onUpdateCreated(handler: MondayEventHandler): void {
    this.on('create_update', handler);
  }

  /**
   * Register handler for item archived events.
   * @param handler - Event handler
   */
  onItemArchived(handler: MondayEventHandler): void {
    this.on('archive_item', handler);
  }

  /**
   * Register handler for item deleted events.
   * @param handler - Event handler
   */
  onItemDeleted(handler: MondayEventHandler): void {
    this.on('delete_item', handler);
  }

  /**
   * Register handler for subitem created events.
   * @param handler - Event handler
   */
  onSubitemCreated(handler: MondayEventHandler): void {
    this.on('create_subitem', handler);
  }

  /**
   * Register handler for item moved to group events.
   * @param handler - Event handler
   */
  onItemMovedToGroup(handler: MondayEventHandler): void {
    this.on('move_item_to_group', handler);
  }

  /**
   * Register handler for item moved to board events.
   * @param handler - Event handler
   */
  onItemMovedToBoard(handler: MondayEventHandler): void {
    this.on('move_item_to_board', handler);
  }

  /**
   * Check if an event represents a status change to "done".
   * @param event - Processed event
   * @returns True if status is a "done" status
   */
  static isStatusDone(event: ProcessedMondayEvent): boolean {
    if (event.eventType !== 'change_status_column_value') return false;

    const value = event.value as { label?: { text?: string }; index?: number } | undefined;
    if (!value?.label?.text) return false;

    const text = value.label.text.toLowerCase();
    return (
      text.includes('done') ||
      text.includes('complete') ||
      text.includes('finished')
    );
  }

  /**
   * Check if an event represents an assignee change.
   * @param event - Processed event
   * @returns True if assignee changed
   */
  static isAssigneeChanged(event: ProcessedMondayEvent): boolean {
    return (
      event.eventType === 'change_column_value' &&
      (event.columnId === 'person' ||
        event.columnId === 'people' ||
        event.columnTitle?.toLowerCase().includes('assignee'))
    );
  }

  /**
   * Check if an event represents a due date change.
   * @param event - Processed event
   * @returns True if due date changed
   */
  static isDueDateChanged(event: ProcessedMondayEvent): boolean {
    return (
      event.eventType === 'change_column_value' &&
      (event.columnId === 'date' ||
        event.columnTitle?.toLowerCase().includes('due'))
    );
  }
}

/**
 * Webhook recipe types for Monday.com automation.
 */
export const MondayWebhookRecipes = {
  /**
   * When an item is created
   */
  ITEM_CREATED: 'create_item',

  /**
   * When a status changes
   */
  STATUS_CHANGED: 'change_status_column_value',

  /**
   * When any column value changes
   */
  COLUMN_CHANGED: 'change_column_value',

  /**
   * When a specific column changes
   */
  SPECIFIC_COLUMN_CHANGED: 'change_specific_column_value',

  /**
   * When an update is created
   */
  UPDATE_CREATED: 'create_update',

  /**
   * When an item is moved to a group
   */
  ITEM_MOVED_TO_GROUP: 'move_item_to_group',

  /**
   * When a subitem is created
   */
  SUBITEM_CREATED: 'create_subitem',

  /**
   * When an item is archived
   */
  ITEM_ARCHIVED: 'archive_item',

  /**
   * When an item is deleted
   */
  ITEM_DELETED: 'delete_item',
} as const;
