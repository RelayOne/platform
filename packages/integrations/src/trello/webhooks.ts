import {
  BaseWebhookHandler,
  type TrackerProvider,
  type SignatureStrategy,
  type WebhookEventPayload,
  type WebhookRequest,
  type WebhookResponse,
} from '@agentforge/tracker-common';
import type {
  TrelloWebhookPayload,
  TrelloWebhookActionType,
} from './types';

/**
 * @fileoverview Trello webhook handler implementation.
 * @packageDocumentation
 */

/**
 * Trello webhook event types (action.type)
 */
export type TrelloWebhookEventType =
  | 'createCard'
  | 'updateCard'
  | 'deleteCard'
  | 'moveCardToBoard'
  | 'moveCardFromBoard'
  | 'addMemberToCard'
  | 'removeMemberFromCard'
  | 'addLabelToCard'
  | 'removeLabelFromCard'
  | 'commentCard'
  | 'updateComment'
  | 'deleteComment'
  | 'addChecklistToCard'
  | 'removeChecklistFromCard'
  | 'updateCheckItemStateOnCard'
  | 'createList'
  | 'updateList'
  | 'createBoard'
  | 'updateBoard'
  | 'addMemberToBoard'
  | 'removeMemberFromBoard';

/**
 * Trello webhook handler.
 * Processes webhooks from Trello with HMAC-SHA1 signature verification.
 *
 * @example
 * ```typescript
 * const handler = new TrelloWebhookHandler(
 *   process.env.TRELLO_API_SECRET,
 *   'https://myapp.com/api/webhooks/trello'
 * );
 *
 * handler.onCardCreated(async (event) => {
 *   console.log('Card created:', event.payload.action.data);
 * });
 *
 * // In your API route
 * const response = await handler.handleRequest({
 *   body: request.body,
 *   headers: request.headers,
 * });
 * ```
 */
export class TrelloWebhookHandler extends BaseWebhookHandler {
  private callbackUrl: string;

  /**
   * Creates a new Trello webhook handler.
   * @param secret - Trello API secret for signature verification
   * @param callbackUrl - The webhook callback URL (used in signature)
   */
  constructor(secret: string, callbackUrl: string) {
    super(secret);
    this.callbackUrl = callbackUrl;
  }

  /**
   * Get the tracker provider identifier.
   */
  get provider(): TrackerProvider {
    return 'trello';
  }

  /**
   * Get the signature verification strategy.
   * Trello uses HMAC-SHA1 with base64 encoding.
   */
  get signatureStrategy(): SignatureStrategy {
    return 'hmac-sha1';
  }

  /**
   * Extract signature from request headers.
   */
  protected extractSignature(headers: Record<string, string>): string {
    return headers['x-trello-webhook'] || '';
  }

  /**
   * Verify the Trello webhook signature.
   * Trello signature = base64(HMAC-SHA1(body + callbackUrl, secret))
   */
  async verify(payload: string, signature: string): Promise<boolean> {
    if (!signature) {
      return false;
    }

    // Trello includes the callback URL in the signature
    const signatureContent = payload + this.callbackUrl;
    return this.verifyHmacSha1(signatureContent, signature);
  }

  /**
   * Extract event type from payload.
   */
  protected extractEventType(
    payload: TrelloWebhookPayload,
    _headers: Record<string, string>
  ): string {
    return payload.action.type;
  }

  /**
   * Extract action from payload.
   */
  protected extractAction(payload: TrelloWebhookPayload): string | undefined {
    return payload.action.type;
  }

  /**
   * Extract resource information from payload.
   */
  protected extractResource(payload: TrelloWebhookPayload): {
    type: string;
    id: string;
  } {
    const actionType = payload.action.type;
    const data = payload.action.data;

    // Determine resource type from action
    if (actionType.includes('Card')) {
      return { type: 'card', id: (data as { card?: { id: string } }).card?.id || '' };
    }
    if (actionType.includes('List')) {
      return { type: 'list', id: (data as { list?: { id: string } }).list?.id || '' };
    }
    if (actionType.includes('Board')) {
      return { type: 'board', id: (data as { board?: { id: string } }).board?.id || '' };
    }
    if (actionType.includes('Comment') || actionType === 'commentCard') {
      return { type: 'comment', id: payload.action.id };
    }

    return { type: 'unknown', id: '' };
  }

  /**
   * Parse the webhook payload.
   */
  parsePayload(
    body: string,
    headers: Record<string, string>
  ): WebhookEventPayload<TrelloWebhookPayload> {
    const payload = JSON.parse(body) as TrelloWebhookPayload;
    const resource = this.extractResource(payload);

    return {
      eventType: this.extractEventType(payload, headers),
      action: this.extractAction(payload),
      timestamp: new Date(payload.action.date),
      source: this.provider,
      resourceType: resource.type,
      resourceId: resource.id,
      payload,
      deliveryId: payload.action.id,
    };
  }

  /**
   * Handle HEAD requests for webhook verification.
   * Trello sends a HEAD request when creating a webhook.
   */
  handleVerification(request: WebhookRequest): WebhookResponse | null {
    // Check if this is a HEAD request (verification)
    // In practice, this is handled by the web framework
    return null;
  }

  // =========================================================================
  // Convenience Event Handlers
  // =========================================================================

  /**
   * Register a handler for card creation events.
   */
  onCardCreated(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('createCard', handler);
  }

  /**
   * Register a handler for card update events.
   */
  onCardUpdated(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('updateCard', handler);
  }

  /**
   * Register a handler for card deletion events.
   */
  onCardDeleted(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('deleteCard', handler);
  }

  /**
   * Register a handler for card move events.
   */
  onCardMoved(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    // Card moves are updateCard events with listBefore/listAfter
    return this.on('updateCard', async (event) => {
      const data = event.payload.action.data as {
        listBefore?: { id: string };
        listAfter?: { id: string };
      };
      if (data.listBefore && data.listAfter) {
        await handler(event);
      }
    });
  }

  /**
   * Register a handler for comment events.
   */
  onComment(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('commentCard', handler);
  }

  /**
   * Register a handler for member assignment events.
   */
  onMemberAssigned(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('addMemberToCard', handler);
  }

  /**
   * Register a handler for member removal events.
   */
  onMemberRemoved(
    handler: (event: WebhookEventPayload<TrelloWebhookPayload>) => void | Promise<void>
  ): () => void {
    return this.on('removeMemberFromCard', handler);
  }

  // =========================================================================
  // Static Helper Methods
  // =========================================================================

  /**
   * Check if a card was moved to a different list.
   */
  static isCardMove(payload: TrelloWebhookPayload): boolean {
    if (payload.action.type !== 'updateCard') {
      return false;
    }

    const data = payload.action.data as {
      listBefore?: { id: string };
      listAfter?: { id: string };
    };

    return !!(data.listBefore && data.listAfter);
  }

  /**
   * Get the list change from a card move event.
   */
  static getListChange(payload: TrelloWebhookPayload): {
    from: { id: string; name: string };
    to: { id: string; name: string };
  } | null {
    if (!this.isCardMove(payload)) {
      return null;
    }

    const data = payload.action.data as {
      listBefore?: { id: string; name: string };
      listAfter?: { id: string; name: string };
    };

    return {
      from: data.listBefore!,
      to: data.listAfter!,
    };
  }

  /**
   * Check if a card was closed (archived).
   */
  static isCardClosed(payload: TrelloWebhookPayload): boolean {
    if (payload.action.type !== 'updateCard') {
      return false;
    }

    const data = payload.action.data as {
      card?: { closed?: boolean };
      old?: { closed?: boolean };
    };

    return data.card?.closed === true && data.old?.closed === false;
  }

  /**
   * Check if a card was reopened.
   */
  static isCardReopened(payload: TrelloWebhookPayload): boolean {
    if (payload.action.type !== 'updateCard') {
      return false;
    }

    const data = payload.action.data as {
      card?: { closed?: boolean };
      old?: { closed?: boolean };
    };

    return data.card?.closed === false && data.old?.closed === true;
  }

  /**
   * Check if a card's due date was changed.
   */
  static isDueDateChanged(payload: TrelloWebhookPayload): boolean {
    if (payload.action.type !== 'updateCard') {
      return false;
    }

    const data = payload.action.data as { old?: { due?: string } };
    return data.old?.due !== undefined;
  }

  /**
   * Extract card data from webhook payload.
   */
  static getCardData(payload: TrelloWebhookPayload): {
    id: string;
    name: string;
    shortLink: string;
    listId?: string;
    listName?: string;
    boardId?: string;
    boardName?: string;
  } | null {
    const data = payload.action.data as {
      card?: { id: string; name: string; shortLink: string };
      list?: { id: string; name: string };
      board?: { id: string; name: string; shortLink: string };
    };

    if (!data.card) {
      return null;
    }

    return {
      id: data.card.id,
      name: data.card.name,
      shortLink: data.card.shortLink,
      listId: data.list?.id,
      listName: data.list?.name,
      boardId: data.board?.id,
      boardName: data.board?.name,
    };
  }

  /**
   * Extract comment text from webhook payload.
   */
  static getCommentText(payload: TrelloWebhookPayload): string | null {
    if (payload.action.type !== 'commentCard') {
      return null;
    }

    const data = payload.action.data as { text?: string };
    return data.text || null;
  }
}
