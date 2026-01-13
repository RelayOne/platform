/**
 * @fileoverview HTTP client utilities for integrations
 * @module @relay/integrations/common/http
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { IntegrationConfig, IntegrationSource, ApiResponse } from './types';
import { IntegrationError, RateLimitError } from './errors';

/**
 * Default configuration for HTTP clients
 */
const DEFAULT_CONFIG: Required<IntegrationConfig> = {
  baseUrl: '',
  timeout: 30000,
  maxRetries: 3,
  debug: false,
};

/**
 * Creates a configured Axios instance for an integration
 * @param source - The integration source
 * @param config - Configuration options
 * @returns Configured Axios instance
 */
export function createHttpClient(
  source: IntegrationSource,
  config: IntegrationConfig & { baseUrl: string }
): AxiosInstance {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const client = axios.create({
    baseURL: mergedConfig.baseUrl,
    timeout: mergedConfig.timeout,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Request interceptor for logging
  if (mergedConfig.debug) {
    client.interceptors.request.use((request) => {
      console.log(`[${source}] ${request.method?.toUpperCase()} ${request.url}`);
      return request;
    });
  }

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Handle rate limiting
      if (error.response?.status === 429) {
        const retryAfter = parseRetryAfter(error.response.headers['retry-after']);
        throw new RateLimitError(source, 'Rate limit exceeded', retryAfter);
      }

      throw IntegrationError.fromAxiosError(source, error);
    }
  );

  return client;
}

/**
 * Parses the Retry-After header value
 * @param value - The header value (seconds or HTTP date)
 * @returns Retry delay in milliseconds, or undefined
 */
function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;

  // Try parsing as seconds
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return undefined;
}

/**
 * Wraps an API response in a standardized format
 * @param response - The axios response
 * @returns Wrapped API response
 */
export function wrapResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
  return {
    success: true,
    data: response.data,
    rateLimit: extractRateLimitInfo(response),
  };
}

/**
 * Extracts rate limit information from response headers
 * @param response - The axios response
 * @returns Rate limit info or undefined
 */
function extractRateLimitInfo(response: AxiosResponse): ApiResponse<unknown>['rateLimit'] {
  const limit = parseInt(response.headers['x-ratelimit-limit'], 10);
  const remaining = parseInt(response.headers['x-ratelimit-remaining'], 10);
  const resetTimestamp = parseInt(response.headers['x-ratelimit-reset'], 10);

  if (isNaN(limit) || isNaN(remaining)) {
    return undefined;
  }

  return {
    limit,
    remaining,
    resetAt: isNaN(resetTimestamp) ? new Date() : new Date(resetTimestamp * 1000),
  };
}

/**
 * Retries an async operation with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelayMs - Base delay in milliseconds
 * @returns The function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (error instanceof IntegrationError && !error.retryable) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = baseDelayMs * Math.pow(2, attempt);

      // Use retry-after if available
      if (error instanceof IntegrationError && error.retryAfter) {
        delay = error.retryAfter;
      }

      // Add jitter (±10%)
      delay = delay * (0.9 + Math.random() * 0.2);

      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Sleep for a specified duration
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes a paginated request, fetching all pages
 * @param fetchPage - Function to fetch a single page
 * @param getNextCursor - Function to extract next cursor from response
 * @returns All items from all pages
 */
export async function fetchAllPages<T, R>(
  fetchPage: (cursor?: string) => Promise<R>,
  getItems: (response: R) => T[],
  getNextCursor: (response: R) => string | undefined
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchPage(cursor);
    const items = getItems(response);
    allItems.push(...items);
    cursor = getNextCursor(response);
  } while (cursor);

  return allItems;
}

/**
 * Creates headers for Bearer token authentication
 * @param token - The access token
 * @returns Headers object
 */
export function bearerAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Creates headers for Basic authentication
 * @param username - Username
 * @param password - Password
 * @returns Headers object
 */
export function basicAuthHeaders(username: string, password: string): Record<string, string> {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
  };
}

/**
 * Builds URL with query parameters
 * @param baseUrl - Base URL
 * @param params - Query parameters
 * @returns Full URL with query string
 */
export function buildUrl(baseUrl: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return baseUrl;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  if (!queryString) return baseUrl;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${queryString}`;
}
