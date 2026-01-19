import { createHmac } from 'crypto';
import { createLogger } from '@relay/logger';
import type {
  WebhookRequest,
  WebhookResponse,
  TrackerProvider,
  SignatureStrategy,
} from '../tracker-base';
import type {
  AsanaWebhookPayload,
  AsanaWebhookEvent,
  AsanaResourceType,
  AsanaWebhookAction,
} from './types';
import { AsanaWebhookPayloadSchema } from './types';

/**
 * @fileoverview Asana webhook handler with X-Hook-Secret signature verification.
 * Handles task, project, and other resource events from Asana.
 * @packageDocumentation
 */

const logger = createLogger('asana-webhooks');

/**
 * Asana webhook configuration.
 */
export interface AsanaWebhookConfig {
  /** X-Hook-Secret for signature verification */
  hookSecret: string;
}

/**
 * Asana webhook event types.
 */
export type AsanaWebhookEventType =
  | 'task.added'
  | 'task.changed'
  | 'task.removed'
  | 'task.deleted'
  | 'task.undeleted'
  | 'project.added'
  | 'project.changed'
  | 'project.removed'
  | 'story.added'
  | 'section.added'
  | 'section.changed'
  | 'attachment.added';

/**
 * Processed Asana webhook event.
 */
export interface ProcessedAsanaEvent {
  /** Event identifier (constructed from resource + action) */
  eventType: AsanaWebhookEventType;
  /** Original event data */
  event: AsanaWebhookEvent;
  /** Raw payload */
  payload: AsanaWebhookPayload;
  /** Timestamp when event was processed */
  receivedAt: Date;
}

/**
 * Event handler function type.
 */
type AsanaEventHandler = (event: ProcessedAsanaEvent) => Promise<void>;

/**
 * Asana webhook handler.
 * Handles incoming webhooks from Asana with X-Hook-Secret signature verification.
 *
 * @example
 * ```typescript
 * const handler = new AsanaWebhookHandler({
 *   hookSecret: process.env.ASANA_WEBHOOK_SECRET,
 * });
 *
 * handler.onTaskChanged(async (event) => {
 *   console.log('Task changed:', event.event.resource.gid);
 * });
 *
 * handler.on('story.added', async (event) => {
 *   console.log('Comment added:', event.event);
 * });
 *
 * // In API route
 * export async function POST(request: Request) {
 *   const response = await handler.handleRequest({
 *     body: await request.text(),
 *     headers: Object.fromEntries(request.headers),
 *   });
 *   return new Response(response.body, {
 *     status: response.status,
 *     headers: response.headers,
 *   });
 * }
 * ```
 */
export class AsanaWebhookHandler {
  private hookSecret: string;
  private handlers: Map<string, AsanaEventHandler[]> = new Map();

  /** Provider identifier */
  public readonly provider: TrackerProvider = 'asana';

  /** Signature strategy for this handler */
  public readonly signatureStrategy: SignatureStrategy = 'x-hook-secret';

  /**
   * Creates a new Asana webhook handler.
   * @param config - Webhook configuration
   */
  constructor(config: AsanaWebhookConfig) {
    this.hookSecret = config.hookSecret;
  }

  /**
   * Handle an incoming webhook request.
   * Handles both handshake (X-Hook-Secret) and regular events.
   * @param request - Incoming webhook request
   * @returns Webhook response
   */
  async handleRequest(request: WebhookRequest): Promise<WebhookResponse> {
    // Handle webhook handshake
    const hookSecret = request.headers['x-hook-secret'];
    if (hookSecret) {
      logger.info('Webhook handshake received');
      return {
        status: 200,
        headers: { 'X-Hook-Secret': hookSecret },
        body: '',
      };
    }

    // Verify signature for regular requests
    const signature = request.headers['x-hook-signature'];
    if (!signature) {
      logger.warn('Missing webhook signature');
      return {
        status: 401,
        body: JSON.stringify({ error: 'Missing signature' }),
      };
    }

    if (!this.verifySignature(request.body, signature)) {
      logger.warn('Invalid webhook signature');
      return {
        status: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // Parse payload
    let payload: AsanaWebhookPayload;
    try {
      const parsed = JSON.parse(request.body);
      payload = AsanaWebhookPayloadSchema.parse(parsed);
    } catch (error) {
      logger.error('Failed to parse webhook payload', { error });
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid payload' }),
      };
    }

    // Process events
    const processedAt = new Date();
    for (const event of payload.events) {
      const eventType = this.buildEventType(event.resource.resource_type, event.action);

      const processedEvent: ProcessedAsanaEvent = {
        eventType,
        event,
        payload,
        receivedAt: processedAt,
      };

      await this.dispatchEvent(eventType, processedEvent);
    }

    return {
      status: 200,
      body: JSON.stringify({ received: true }),
    };
  }

  /**
   * Verify HMAC-SHA256 signature.
   * @param body - Request body
   * @param signature - Provided signature
   * @returns True if signature is valid
   */
  private verifySignature(body: string, signature: string): boolean {
    const computedSignature = createHmac('sha256', this.hookSecret)
      .update(body)
      .digest('hex');

    return signature === computedSignature;
  }

  /**
   * Build event type from resource type and action.
   * @param resourceType - Asana resource type
   * @param action - Webhook action
   * @returns Event type string
   */
  private buildEventType(
    resourceType: AsanaResourceType,
    action: AsanaWebhookAction
  ): AsanaWebhookEventType {
    return `${resourceType}.${action}` as AsanaWebhookEventType;
  }

  /**
   * Dispatch event to registered handlers.
   * @param eventType - Event type
   * @param event - Processed event
   */
  private async dispatchEvent(
    eventType: string,
    event: ProcessedAsanaEvent
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
  on(eventType: AsanaWebhookEventType | '*', handler: AsanaEventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Register handler for task added events.
   * @param handler - Event handler
   */
  onTaskAdded(handler: AsanaEventHandler): void {
    this.on('task.added', handler);
  }

  /**
   * Register handler for task changed events.
   * @param handler - Event handler
   */
  onTaskChanged(handler: AsanaEventHandler): void {
    this.on('task.changed', handler);
  }

  /**
   * Register handler for task removed events.
   * @param handler - Event handler
   */
  onTaskRemoved(handler: AsanaEventHandler): void {
    this.on('task.removed', handler);
  }

  /**
   * Register handler for task deleted events.
   * @param handler - Event handler
   */
  onTaskDeleted(handler: AsanaEventHandler): void {
    this.on('task.deleted', handler);
  }

  /**
   * Register handler for project changed events.
   * @param handler - Event handler
   */
  onProjectChanged(handler: AsanaEventHandler): void {
    this.on('project.changed', handler);
  }

  /**
   * Register handler for story (comment) added events.
   * @param handler - Event handler
   */
  onStoryAdded(handler: AsanaEventHandler): void {
    this.on('story.added', handler);
  }

  /**
   * Register handler for section changed events.
   * @param handler - Event handler
   */
  onSectionChanged(handler: AsanaEventHandler): void {
    this.on('section.changed', handler);
  }

  /**
   * Check if an event represents a task completion.
   * @param event - Processed event
   * @returns True if task was completed
   */
  static isTaskCompleted(event: ProcessedAsanaEvent): boolean {
    return (
      event.eventType === 'task.changed' &&
      event.event.change?.field === 'completed' &&
      event.event.change?.new_value === true
    );
  }

  /**
   * Check if an event represents a task assignment change.
   * @param event - Processed event
   * @returns True if assignee changed
   */
  static isAssigneeChanged(event: ProcessedAsanaEvent): boolean {
    return (
      event.eventType === 'task.changed' &&
      event.event.change?.field === 'assignee'
    );
  }

  /**
   * Check if an event represents a task being moved to a different section.
   * @param event - Processed event
   * @returns True if section changed
   */
  static isSectionChanged(event: ProcessedAsanaEvent): boolean {
    return (
      event.eventType === 'task.changed' &&
      event.event.change?.field === 'memberships'
    );
  }

  /**
   * Check if an event represents a due date change.
   * @param event - Processed event
   * @returns True if due date changed
   */
  static isDueDateChanged(event: ProcessedAsanaEvent): boolean {
    return (
      event.eventType === 'task.changed' &&
      (event.event.change?.field === 'due_on' ||
        event.event.change?.field === 'due_at')
    );
  }

  /**
   * Create an Asana webhook handler from environment variables.
   * @returns Asana webhook handler
   */
  static fromEnv(): AsanaWebhookHandler {
    const hookSecret = process.env.ASANA_WEBHOOK_SECRET;

    if (!hookSecret) {
      throw new Error('ASANA_WEBHOOK_SECRET environment variable is required');
    }

    return new AsanaWebhookHandler({ hookSecret });
  }
}

/**
 * Webhook management utilities for Asana.
 * Use these functions to create and manage webhooks via the Asana API.
 */
export const AsanaWebhookManager = {
  /**
   * Create a webhook for a resource.
   * Call this from your server-side code using the AsanaClient.
   * @param client - Asana client with access token
   * @param resourceId - Resource GID to watch (project, team, etc.)
   * @param targetUrl - URL to receive webhook events
   * @returns Webhook GID
   */
  async create(
    client: { request: <T>(endpoint: string, options?: RequestInit) => Promise<{ data: T }> },
    resourceId: string,
    targetUrl: string
  ): Promise<string> {
    const response = await client.request<{ gid: string }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          resource: resourceId,
          target: targetUrl,
        },
      }),
    });
    return response.data.gid;
  },

  /**
   * List existing webhooks for a workspace.
   * @param client - Asana client with access token
   * @param workspaceId - Workspace GID
   * @returns List of webhook info
   */
  async list(
    client: { request: <T>(endpoint: string, options?: RequestInit) => Promise<{ data: T }> },
    workspaceId: string
  ): Promise<Array<{ gid: string; resource: { gid: string }; target: string; active: boolean }>> {
    const response = await client.request<
      Array<{ gid: string; resource: { gid: string }; target: string; active: boolean }>
    >(`/webhooks?workspace=${workspaceId}`);
    return response.data;
  },

  /**
   * Delete a webhook.
   * @param client - Asana client with access token
   * @param webhookId - Webhook GID
   */
  async delete(
    client: { request: <T>(endpoint: string, options?: RequestInit) => Promise<{ data: T }> },
    webhookId: string
  ): Promise<void> {
    await client.request(`/webhooks/${webhookId}`, { method: 'DELETE' });
  },
};
