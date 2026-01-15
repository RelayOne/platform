import { createLogger } from '@relay/logger';
import {
  BaseWebhookHandler,
  type WebhookHandlerConfig,
  type WebhookRequest,
  type WebhookResponse,
} from '@agentforge/tracker-common';
import type { ClickUpWebhookPayload, ClickUpWebhookEvent } from './types';
import { ClickUpWebhookPayloadSchema } from './types';

/**
 * @fileoverview ClickUp webhook handler.
 * Handles task, list, folder, and space events from ClickUp.
 * Note: ClickUp uses URL verification, not signature verification.
 * @packageDocumentation
 */

const logger = createLogger('clickup-webhooks');

/**
 * ClickUp webhook configuration.
 */
export interface ClickUpWebhookConfig extends WebhookHandlerConfig {
  /** Webhook secret (optional - ClickUp uses URL verification) */
  secret?: string;
}

/**
 * Processed ClickUp webhook event.
 */
export interface ProcessedClickUpEvent {
  /** Event type */
  eventType: ClickUpWebhookEvent;
  /** Task ID (if applicable) */
  taskId?: string;
  /** Webhook ID */
  webhookId: string;
  /** History items with change details */
  historyItems: ClickUpWebhookPayload['history_items'];
  /** Raw payload */
  payload: ClickUpWebhookPayload;
  /** Timestamp when event was processed */
  receivedAt: Date;
}

/**
 * Event handler function type.
 */
type ClickUpEventHandler = (event: ProcessedClickUpEvent) => Promise<void>;

/**
 * ClickUp webhook handler.
 * Handles incoming webhooks from ClickUp.
 *
 * Note: ClickUp webhooks use URL verification. When you create a webhook,
 * ClickUp will send a HEAD request to verify the URL is accessible.
 *
 * @example
 * ```typescript
 * const handler = new ClickUpWebhookHandler({});
 *
 * handler.onTaskCreated(async (event) => {
 *   console.log('Task created:', event.taskId);
 * });
 *
 * handler.onTaskStatusUpdated(async (event) => {
 *   console.log('Status changed');
 * });
 *
 * // In API route (Next.js example)
 * export async function POST(request: Request) {
 *   const response = await handler.handleRequest({
 *     body: await request.text(),
 *     headers: Object.fromEntries(request.headers),
 *   });
 *   return new Response(response.body, { status: response.status });
 * }
 *
 * // Handle HEAD request for URL verification
 * export async function HEAD() {
 *   return new Response(null, { status: 200 });
 * }
 * ```
 */
export class ClickUpWebhookHandler extends BaseWebhookHandler {
  private handlers: Map<string, ClickUpEventHandler[]> = new Map();

  /**
   * Creates a new ClickUp webhook handler.
   * @param config - Webhook configuration
   */
  constructor(config: ClickUpWebhookConfig = {}) {
    super({
      ...config,
      signatureStrategy: 'none', // ClickUp uses URL verification
    });
  }

  /**
   * Handle an incoming webhook request.
   * @param request - Incoming webhook request
   * @returns Webhook response
   */
  async handleRequest(request: WebhookRequest): Promise<WebhookResponse> {
    // Parse payload
    let payload: ClickUpWebhookPayload;

    try {
      const parsed = JSON.parse(request.body);
      payload = ClickUpWebhookPayloadSchema.parse(parsed);
    } catch (error) {
      logger.error('Failed to parse webhook payload', { error });
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid payload' }),
      };
    }

    // Process event
    const processedEvent: ProcessedClickUpEvent = {
      eventType: payload.event,
      taskId: payload.task_id,
      webhookId: payload.webhook_id,
      historyItems: payload.history_items,
      payload,
      receivedAt: new Date(),
    };

    await this.dispatchEvent(payload.event, processedEvent);

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
    eventType: ClickUpWebhookEvent,
    event: ProcessedClickUpEvent
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
  on(eventType: ClickUpWebhookEvent | '*', handler: ClickUpEventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register handler for task created events.
   * @param handler - Event handler
   */
  onTaskCreated(handler: ClickUpEventHandler): void {
    this.on('taskCreated', handler);
  }

  /**
   * Register handler for task updated events.
   * @param handler - Event handler
   */
  onTaskUpdated(handler: ClickUpEventHandler): void {
    this.on('taskUpdated', handler);
  }

  /**
   * Register handler for task deleted events.
   * @param handler - Event handler
   */
  onTaskDeleted(handler: ClickUpEventHandler): void {
    this.on('taskDeleted', handler);
  }

  /**
   * Register handler for task status updated events.
   * @param handler - Event handler
   */
  onTaskStatusUpdated(handler: ClickUpEventHandler): void {
    this.on('taskStatusUpdated', handler);
  }

  /**
   * Register handler for task priority updated events.
   * @param handler - Event handler
   */
  onTaskPriorityUpdated(handler: ClickUpEventHandler): void {
    this.on('taskPriorityUpdated', handler);
  }

  /**
   * Register handler for task assignee updated events.
   * @param handler - Event handler
   */
  onTaskAssigneeUpdated(handler: ClickUpEventHandler): void {
    this.on('taskAssigneeUpdated', handler);
  }

  /**
   * Register handler for task due date updated events.
   * @param handler - Event handler
   */
  onTaskDueDateUpdated(handler: ClickUpEventHandler): void {
    this.on('taskDueDateUpdated', handler);
  }

  /**
   * Register handler for task moved events.
   * @param handler - Event handler
   */
  onTaskMoved(handler: ClickUpEventHandler): void {
    this.on('taskMoved', handler);
  }

  /**
   * Register handler for task comment posted events.
   * @param handler - Event handler
   */
  onTaskCommentPosted(handler: ClickUpEventHandler): void {
    this.on('taskCommentPosted', handler);
  }

  /**
   * Register handler for task tag updated events.
   * @param handler - Event handler
   */
  onTaskTagUpdated(handler: ClickUpEventHandler): void {
    this.on('taskTagUpdated', handler);
  }

  /**
   * Register handler for list created events.
   * @param handler - Event handler
   */
  onListCreated(handler: ClickUpEventHandler): void {
    this.on('listCreated', handler);
  }

  /**
   * Register handler for folder created events.
   * @param handler - Event handler
   */
  onFolderCreated(handler: ClickUpEventHandler): void {
    this.on('folderCreated', handler);
  }

  /**
   * Register handler for space created events.
   * @param handler - Event handler
   */
  onSpaceCreated(handler: ClickUpEventHandler): void {
    this.on('spaceCreated', handler);
  }

  /**
   * Check if an event represents a task completion.
   * @param event - Processed event
   * @returns True if task was completed
   */
  static isTaskCompleted(event: ProcessedClickUpEvent): boolean {
    if (event.eventType !== 'taskStatusUpdated') return false;

    const statusChange = event.historyItems?.find(
      (item) => item.field === 'status'
    );

    if (!statusChange) return false;

    const afterStatus = statusChange.after as { type?: string } | undefined;
    return afterStatus?.type === 'closed' || afterStatus?.type === 'done';
  }

  /**
   * Get the changed field from a task update event.
   * @param event - Processed event
   * @returns Changed field name or undefined
   */
  static getChangedField(event: ProcessedClickUpEvent): string | undefined {
    return event.historyItems?.[0]?.field;
  }

  /**
   * Get before/after values from a task update event.
   * @param event - Processed event
   * @returns Before and after values
   */
  static getChangeValues(event: ProcessedClickUpEvent): {
    before: unknown;
    after: unknown;
  } | undefined {
    const item = event.historyItems?.[0];
    if (!item) return undefined;

    return {
      before: item.before,
      after: item.after,
    };
  }
}

/**
 * Webhook management utilities for ClickUp.
 * Use these to create and manage webhooks via the ClickUp API.
 */
export const ClickUpWebhookManager = {
  /**
   * Create a webhook.
   * @param accessToken - ClickUp access token
   * @param teamId - Team ID to create webhook for
   * @param endpoint - Endpoint URL for webhook
   * @param events - Events to subscribe to
   * @returns Created webhook info
   */
  async create(
    accessToken: string,
    teamId: string,
    endpoint: string,
    events: ClickUpWebhookEvent[]
  ): Promise<{ id: string; webhook: { id: string; endpoint: string; events: string[] } }> {
    const response = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      method: 'POST',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        events,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create webhook: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * List webhooks for a team.
   * @param accessToken - ClickUp access token
   * @param teamId - Team ID
   * @returns List of webhooks
   */
  async list(
    accessToken: string,
    teamId: string
  ): Promise<{ webhooks: Array<{ id: string; endpoint: string; events: string[] }> }> {
    const response = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      headers: {
        Authorization: accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Update a webhook.
   * @param accessToken - ClickUp access token
   * @param webhookId - Webhook ID
   * @param updates - Updates to apply
   * @returns Updated webhook
   */
  async update(
    accessToken: string,
    webhookId: string,
    updates: { endpoint?: string; events?: ClickUpWebhookEvent[]; status?: 'active' | 'inactive' }
  ): Promise<{ id: string; webhook: { id: string; endpoint: string; events: string[] } }> {
    const response = await fetch(`https://api.clickup.com/api/v2/webhook/${webhookId}`, {
      method: 'PUT',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update webhook: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Delete a webhook.
   * @param accessToken - ClickUp access token
   * @param webhookId - Webhook ID
   */
  async delete(accessToken: string, webhookId: string): Promise<void> {
    const response = await fetch(`https://api.clickup.com/api/v2/webhook/${webhookId}`, {
      method: 'DELETE',
      headers: {
        Authorization: accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }
  },
};
