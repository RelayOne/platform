/**
 * @fileoverview Webhook delivery system for Relay Platform
 * @module @relay/webhooks
 *
 * Provides webhook delivery with retry logic, signature verification,
 * and delivery tracking. Designed for distributed serverless environments.
 */

import { nanoid } from 'nanoid';
import crypto from 'crypto';

/**
 * Webhook subscription configuration.
 */
export interface WebhookSubscription {
  /** Unique subscription ID */
  id: string;
  /** Webhook endpoint URL */
  url: string;
  /** Secret for signature verification */
  secret: string;
  /** Events to subscribe to */
  events: string[];
  /** Whether webhook is enabled */
  enabled: boolean;
  /** Optional description */
  description?: string;
  /** Number of consecutive failures */
  failureCount: number;
  /** Last successful delivery timestamp */
  lastDeliveryAt?: Date;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Webhook delivery result.
 */
export interface WebhookDeliveryResult {
  /** Whether delivery was successful */
  success: boolean;
  /** HTTP response status */
  status?: number;
  /** Error message if failed */
  error?: string;
  /** Response body (truncated) */
  responseBody?: string;
}

/**
 * Webhook delivery log entry.
 */
export interface WebhookDeliveryLog {
  /** Unique log ID */
  id: string;
  /** Webhook subscription ID */
  webhookId: string;
  /** Event type */
  eventType: string;
  /** Event payload */
  payload: unknown;
  /** Target URL */
  url: string;
  /** Request headers */
  requestHeaders: Record<string, string>;
  /** HTTP response status */
  responseStatus?: number;
  /** Response body (truncated) */
  responseBody?: string;
  /** Whether delivery succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Attempt number (for retries) */
  attemptNumber: number;
  /** Delivery timestamp */
  deliveredAt: Date;
}

/**
 * Webhook retry configuration.
 */
export interface WebhookRetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds for each attempt */
  retryDelays: number[];
  /** Timeout for webhook requests in milliseconds */
  timeout: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: WebhookRetryConfig = {
  maxRetries: 3,
  retryDelays: [1000, 5000, 30000], // 1s, 5s, 30s
  timeout: 30000, // 30 seconds
};

/**
 * Generates a secure webhook signing secret.
 * @returns Random hex string for webhook signature verification
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a webhook signature for outgoing webhooks.
 * Uses HMAC-SHA256 with timestamp to prevent replay attacks.
 * @param payload - Webhook payload (stringified JSON)
 * @param secret - Webhook secret
 * @returns Signature string with timestamp in format: t=timestamp,v1=signature
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verifies a webhook signature from an incoming webhook.
 * @param payload - Webhook payload (stringified JSON)
 * @param signature - Signature header value
 * @param secret - Webhook secret
 * @param toleranceSeconds - Maximum age of timestamp to accept (default: 300s)
 * @returns Whether signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  try {
    // Parse signature header: t=timestamp,v1=signature
    const parts = signature.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>
    );

    const timestamp = parseInt(parts.t, 10);
    const expectedSignature = parts.v1;

    if (!timestamp || !expectedSignature) {
      return false;
    }

    // Check timestamp is within tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const computedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(computedSignature));
  } catch {
    return false;
  }
}

/**
 * Delivers a webhook event to a URL with retry logic.
 * @param webhook - Webhook subscription
 * @param eventType - Event type
 * @param payload - Event payload
 * @param attemptNumber - Attempt number for retries
 * @param retryConfig - Retry configuration (optional)
 * @returns Delivery result
 */
export async function deliverWebhook(
  webhook: Pick<WebhookSubscription, 'url' | 'secret'>,
  eventType: string,
  payload: unknown,
  attemptNumber: number = 1,
  retryConfig: WebhookRetryConfig = DEFAULT_RETRY_CONFIG
): Promise<WebhookDeliveryResult> {
  const payloadString = JSON.stringify(payload);
  const signature = generateWebhookSignature(payloadString, webhook.secret);

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Relay-Webhooks/1.0',
    'X-Relay-Event': eventType,
    'X-Relay-Signature': signature,
    'X-Relay-Delivery-ID': nanoid(),
    'X-Relay-Attempt': attemptNumber.toString(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), retryConfig.timeout);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseStatus = response.status;
    const responseBody = await response.text();

    // Consider 2xx status codes as successful delivery
    const success = response.ok;

    return {
      success,
      status: responseStatus,
      responseBody: responseBody.substring(0, 1000), // Truncate to 1000 chars
      error: success ? undefined : `HTTP ${responseStatus}: ${responseBody.substring(0, 200)}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Delivers a webhook with exponential backoff retry logic.
 * @param webhook - Webhook subscription
 * @param eventType - Event type
 * @param payload - Event payload
 * @param retryConfig - Retry configuration (optional)
 * @param onDeliveryLog - Callback for logging delivery attempts (optional)
 * @returns Final delivery result after all retries
 */
export async function deliverWebhookWithRetry(
  webhook: Pick<WebhookSubscription, 'url' | 'secret'>,
  eventType: string,
  payload: unknown,
  retryConfig: WebhookRetryConfig = DEFAULT_RETRY_CONFIG,
  onDeliveryLog?: (log: Omit<WebhookDeliveryLog, 'id' | 'deliveredAt'>) => void | Promise<void>
): Promise<WebhookDeliveryResult> {
  let lastResult: WebhookDeliveryResult | null = null;

  for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
    const result = await deliverWebhook(webhook, eventType, payload, attempt, retryConfig);
    lastResult = result;

    // Log delivery attempt if callback provided
    if (onDeliveryLog) {
      await onDeliveryLog({
        webhookId: '', // Should be provided by caller
        eventType,
        payload,
        url: webhook.url,
        requestHeaders: {
          'Content-Type': 'application/json',
          'X-Relay-Event': eventType,
        },
        responseStatus: result.status,
        responseBody: result.responseBody,
        success: result.success,
        error: result.error,
        attemptNumber: attempt,
      });
    }

    // If successful, return immediately
    if (result.success) {
      return result;
    }

    // If not last attempt, wait before retrying
    if (attempt < retryConfig.maxRetries) {
      const delay = retryConfig.retryDelays[attempt - 1] || retryConfig.retryDelays[retryConfig.retryDelays.length - 1];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastResult!;
}

/**
 * Creates a webhook subscription object.
 * @param url - Webhook endpoint URL
 * @param events - Events to subscribe to
 * @param description - Optional description
 * @returns Webhook subscription
 */
export function createWebhookSubscription(
  url: string,
  events: string[],
  description?: string
): WebhookSubscription {
  const now = new Date();
  return {
    id: nanoid(),
    url,
    secret: generateWebhookSecret(),
    events,
    enabled: true,
    description,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Checks if a webhook should be disabled based on failure count.
 * @param failureCount - Number of consecutive failures
 * @param threshold - Failure threshold (default: 10)
 * @returns Whether webhook should be disabled
 */
export function shouldDisableWebhook(failureCount: number, threshold: number = 10): boolean {
  return failureCount >= threshold;
}

/**
 * Validates a webhook URL.
 * @param url - URL to validate
 * @returns Whether URL is valid for webhooks
 */
export function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Must be HTTP or HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }

    // Reject localhost in production (optional check)
    if (process.env.NODE_ENV === 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return { valid: false, error: 'Localhost URLs are not allowed in production' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Creates request headers for webhook delivery.
 * @param eventType - Event type
 * @param signature - Webhook signature
 * @param deliveryId - Unique delivery ID
 * @param attemptNumber - Attempt number
 * @returns Headers object
 */
export function createWebhookHeaders(
  eventType: string,
  signature: string,
  deliveryId: string,
  attemptNumber: number = 1
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Relay-Webhooks/1.0',
    'X-Relay-Event': eventType,
    'X-Relay-Signature': signature,
    'X-Relay-Delivery-ID': deliveryId,
    'X-Relay-Attempt': attemptNumber.toString(),
  };
}
