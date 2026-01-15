import { createLogger } from '@relay/logger';
import {
  BaseWebhookHandler,
  type WebhookHandlerConfig,
  type WebhookRequest,
  type WebhookResponse,
} from '@agentforge/tracker-common';
import type { WrikeWebhookPayload, WrikeWebhookEventType } from './types';
import { WrikeWebhookPayloadSchema } from './types';

/**
 * @fileoverview Wrike webhook handler.
 * Handles task, folder, project, and timelog events from Wrike.
 * @packageDocumentation
 */

const logger = createLogger('wrike-webhooks');

/**
 * Wrike webhook configuration.
 */
export interface WrikeWebhookConfig extends WebhookHandlerConfig {
  /** Access token for webhook management */
  accessToken?: string;
  /** Wrike API host */
  host?: string;
}

/**
 * Processed Wrike webhook event.
 */
export interface ProcessedWrikeEvent {
  /** Event type */
  eventType: WrikeWebhookEventType;
  /** Webhook ID */
  webhookId: string;
  /** Task ID (if applicable) */
  taskId?: string;
  /** Folder ID (if applicable) */
  folderId?: string;
  /** Comment ID (if applicable) */
  commentId?: string;
  /** Attachment ID (if applicable) */
  attachmentId?: string;
  /** Timelog ID (if applicable) */
  timelogId?: string;
  /** Event author ID */
  eventAuthorId?: string;
  /** Old value */
  oldValue?: unknown;
  /** New value */
  newValue?: unknown;
  /** Raw payload */
  payload: WrikeWebhookPayload;
  /** Timestamp when event was processed */
  receivedAt: Date;
}

/**
 * Event handler function type.
 */
type WrikeEventHandler = (event: ProcessedWrikeEvent) => Promise<void>;

/**
 * Wrike webhook handler.
 * Handles incoming webhooks from Wrike.
 *
 * Note: Wrike webhooks do not use signature verification.
 * They rely on the webhook URL being kept secret.
 *
 * @example
 * ```typescript
 * const handler = new WrikeWebhookHandler({});
 *
 * handler.onTaskCreated(async (event) => {
 *   console.log('Task created:', event.taskId);
 * });
 *
 * handler.onTaskStatusChanged(async (event) => {
 *   console.log('Status changed from', event.oldValue, 'to', event.newValue);
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
export class WrikeWebhookHandler extends BaseWebhookHandler {
  private handlers: Map<string, WrikeEventHandler[]> = new Map();

  /**
   * Creates a new Wrike webhook handler.
   * @param config - Webhook configuration
   */
  constructor(config: WrikeWebhookConfig = {}) {
    super({
      ...config,
      signatureStrategy: 'none', // Wrike doesn't use signatures
    });
  }

  /**
   * Handle an incoming webhook request.
   * @param request - Incoming webhook request
   * @returns Webhook response
   */
  async handleRequest(request: WebhookRequest): Promise<WebhookResponse> {
    // Parse payload (may be array of events)
    let payloads: WrikeWebhookPayload[];

    try {
      const parsed = JSON.parse(request.body);
      // Wrike sends array of events
      payloads = Array.isArray(parsed)
        ? parsed.map((p) => WrikeWebhookPayloadSchema.parse(p))
        : [WrikeWebhookPayloadSchema.parse(parsed)];
    } catch (error) {
      logger.error('Failed to parse webhook payload', { error });
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid payload' }),
      };
    }

    // Process all events
    const processedAt = new Date();
    for (const payload of payloads) {
      const processedEvent: ProcessedWrikeEvent = {
        eventType: payload.eventType,
        webhookId: payload.webhookId,
        taskId: payload.taskId,
        folderId: payload.folderId,
        commentId: payload.commentId,
        attachmentId: payload.attachmentId,
        timelogId: payload.timelogId,
        eventAuthorId: payload.eventAuthorId,
        oldValue: payload.oldValue,
        newValue: payload.newValue,
        payload,
        receivedAt: processedAt,
      };

      await this.dispatchEvent(payload.eventType, processedEvent);
    }

    return {
      status: 200,
      body: JSON.stringify({ received: true }),
    };
  }

  /**
   * Dispatch event to registered handlers.
   * @param eventType - Event type
   * @param event - Processed event
   */
  private async dispatchEvent(
    eventType: WrikeWebhookEventType,
    event: ProcessedWrikeEvent
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
  on(eventType: WrikeWebhookEventType | '*', handler: WrikeEventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register handler for task created events.
   * @param handler - Event handler
   */
  onTaskCreated(handler: WrikeEventHandler): void {
    this.on('TaskCreated', handler);
  }

  /**
   * Register handler for task deleted events.
   * @param handler - Event handler
   */
  onTaskDeleted(handler: WrikeEventHandler): void {
    this.on('TaskDeleted', handler);
  }

  /**
   * Register handler for task title changed events.
   * @param handler - Event handler
   */
  onTaskTitleChanged(handler: WrikeEventHandler): void {
    this.on('TaskTitleChanged', handler);
  }

  /**
   * Register handler for task description changed events.
   * @param handler - Event handler
   */
  onTaskDescriptionChanged(handler: WrikeEventHandler): void {
    this.on('TaskDescriptionChanged', handler);
  }

  /**
   * Register handler for task status changed events.
   * @param handler - Event handler
   */
  onTaskStatusChanged(handler: WrikeEventHandler): void {
    this.on('TaskStatusChanged', handler);
  }

  /**
   * Register handler for task importance changed events.
   * @param handler - Event handler
   */
  onTaskImportanceChanged(handler: WrikeEventHandler): void {
    this.on('TaskImportanceChanged', handler);
  }

  /**
   * Register handler for task dates changed events.
   * @param handler - Event handler
   */
  onTaskDatesChanged(handler: WrikeEventHandler): void {
    this.on('TaskDatesChanged', handler);
  }

  /**
   * Register handler for task responsibles changed events.
   * @param handler - Event handler
   */
  onTaskResponsiblesChanged(handler: WrikeEventHandler): void {
    this.on('TaskResponsiblesChanged', handler);
  }

  /**
   * Register handler for task comment added events.
   * @param handler - Event handler
   */
  onTaskCommentAdded(handler: WrikeEventHandler): void {
    this.on('TaskCommentAdded', handler);
  }

  /**
   * Register handler for task attachment added events.
   * @param handler - Event handler
   */
  onTaskAttachmentAdded(handler: WrikeEventHandler): void {
    this.on('TaskAttachmentAdded', handler);
  }

  /**
   * Register handler for folder created events.
   * @param handler - Event handler
   */
  onFolderCreated(handler: WrikeEventHandler): void {
    this.on('FolderCreated', handler);
  }

  /**
   * Register handler for project status changed events.
   * @param handler - Event handler
   */
  onProjectStatusChanged(handler: WrikeEventHandler): void {
    this.on('ProjectStatusChanged', handler);
  }

  /**
   * Register handler for timelog created events.
   * @param handler - Event handler
   */
  onTimelogCreated(handler: WrikeEventHandler): void {
    this.on('TimelogCreated', handler);
  }

  /**
   * Check if an event represents a task completion.
   * @param event - Processed event
   * @returns True if task was completed
   */
  static isTaskCompleted(event: ProcessedWrikeEvent): boolean {
    if (event.eventType !== 'TaskStatusChanged') return false;

    const newStatus = event.newValue as { group?: string } | undefined;
    return newStatus?.group === 'Completed';
  }

  /**
   * Check if an event represents a task being assigned.
   * @param event - Processed event
   * @returns True if task was assigned
   */
  static isTaskAssigned(event: ProcessedWrikeEvent): boolean {
    if (event.eventType !== 'TaskResponsiblesChanged') return false;

    const newValue = event.newValue as string[] | undefined;
    const oldValue = event.oldValue as string[] | undefined;

    return (newValue?.length || 0) > (oldValue?.length || 0);
  }
}

/**
 * Webhook management utilities for Wrike.
 * Use these to create and manage webhooks via the Wrike API.
 */
export const WrikeWebhookManager = {
  /**
   * Create a webhook.
   * @param accessToken - Wrike access token
   * @param folderId - Folder ID to watch (use account root for all)
   * @param hookUrl - Webhook URL
   * @param events - Events to subscribe to
   * @param host - API host (optional)
   * @returns Created webhook info
   */
  async create(
    accessToken: string,
    folderId: string,
    hookUrl: string,
    events: WrikeWebhookEventType[],
    host: string = 'www.wrike.com'
  ): Promise<{ id: string; accountId: string; folderId: string; hookUrl: string }> {
    const response = await fetch(`https://${host}/api/v4/folders/${folderId}/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hookUrl, events }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create webhook: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0];
  },

  /**
   * Create an account-level webhook.
   * @param accessToken - Wrike access token
   * @param hookUrl - Webhook URL
   * @param events - Events to subscribe to
   * @param host - API host (optional)
   * @returns Created webhook info
   */
  async createAccountWebhook(
    accessToken: string,
    hookUrl: string,
    events: WrikeWebhookEventType[],
    host: string = 'www.wrike.com'
  ): Promise<{ id: string; accountId: string; hookUrl: string }> {
    const response = await fetch(`https://${host}/api/v4/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hookUrl, events }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create account webhook: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0];
  },

  /**
   * List webhooks.
   * @param accessToken - Wrike access token
   * @param host - API host (optional)
   * @returns List of webhooks
   */
  async list(
    accessToken: string,
    host: string = 'www.wrike.com'
  ): Promise<Array<{ id: string; accountId: string; folderId?: string; hookUrl: string; status: string }>> {
    const response = await fetch(`https://${host}/api/v4/webhooks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Delete a webhook.
   * @param accessToken - Wrike access token
   * @param webhookId - Webhook ID
   * @param host - API host (optional)
   */
  async delete(
    accessToken: string,
    webhookId: string,
    host: string = 'www.wrike.com'
  ): Promise<void> {
    const response = await fetch(`https://${host}/api/v4/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }
  },

  /**
   * Update a webhook.
   * @param accessToken - Wrike access token
   * @param webhookId - Webhook ID
   * @param updates - Updates to apply
   * @param host - API host (optional)
   */
  async update(
    accessToken: string,
    webhookId: string,
    updates: { status?: 'Active' | 'Suspended'; events?: WrikeWebhookEventType[] },
    host: string = 'www.wrike.com'
  ): Promise<void> {
    const response = await fetch(`https://${host}/api/v4/webhooks/${webhookId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update webhook: ${response.statusText}`);
    }
  },
};
