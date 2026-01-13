/**
 * @fileoverview Common utility functions for Relay Platform applications
 * @module @relay/utils
 *
 * This package provides a collection of commonly used utility functions
 * that are shared across all Relay Platform applications (Verity, NoteMan,
 * ShipCheck, Nexus, AgentForce).
 *
 * @example
 * ```typescript
 * import { cn, formatPrice, formatRelativeTime, generateId, debounce } from '@relay/utils';
 *
 * // Merge Tailwind classes
 * const className = cn('px-4 py-2', isActive && 'bg-blue-500');
 *
 * // Format currency
 * const price = formatPrice(29.99, true); // "$29.99"
 *
 * // Format relative time
 * const timeAgo = formatRelativeTime(new Date()); // "just now"
 *
 * // Generate unique IDs
 * const id = generateId('user'); // "user-abc123xyz"
 * ```
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ============================================================================
// CSS Class Utilities
// ============================================================================

/**
 * Utility function to merge Tailwind CSS classes with proper precedence.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 *
 * @param inputs - Class values to merge (strings, objects, arrays)
 * @returns Merged class string with proper Tailwind precedence
 *
 * @example
 * ```typescript
 * cn('px-4 py-2', isActive && 'bg-blue-500', className)
 * cn('text-sm', { 'font-bold': isBold })
 * cn(['base-class', conditionalClass])
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Formats a number as a compact string (e.g., 1.2K, 3.4M).
 *
 * @param num - The number to format
 * @returns Formatted string representation
 *
 * @example
 * ```typescript
 * formatCompactNumber(1234) // "1.2K"
 * formatCompactNumber(1234567) // "1.2M"
 * formatCompactNumber(1234567890) // "1.2B"
 * ```
 */
export function formatCompactNumber(num: number): string {
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

/**
 * Formats a price in USD currency format.
 *
 * @param amount - The amount to format
 * @param showCents - Whether to show cents (default: false)
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatPrice(29.99) // "$30"
 * formatPrice(29.99, true) // "$29.99"
 * formatPrice(1000) // "$1,000"
 * ```
 */
export function formatPrice(amount: number, showCents = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(amount);
}

/**
 * Formats a number as currency with the specified currency code.
 *
 * @param amount - The amount to format
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatCurrency(29.99, 'EUR', 'de-DE') // "29,99 €"
 * formatCurrency(29.99, 'GBP') // "£29.99"
 * ```
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formats a number with thousand separators.
 *
 * @param num - The number to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted number string
 *
 * @example
 * ```typescript
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234567.89) // "1,234,567.89"
 * ```
 */
export function formatNumber(num: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Formats a number as a percentage.
 *
 * @param value - The decimal value to format (0.5 = 50%)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string
 *
 * @example
 * ```typescript
 * formatPercent(0.5) // "50%"
 * formatPercent(0.1234, 2) // "12.34%"
 * ```
 */
export function formatPercent(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ============================================================================
// Date & Time Formatting
// ============================================================================

/**
 * Formats a date relative to now (e.g., "2 hours ago", "in 3 days").
 *
 * @param date - The date to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Relative time string
 *
 * @example
 * ```typescript
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() + 86400000)) // "in 1 day"
 * ```
 */
export function formatRelativeTime(
  date: Date | number,
  locale = 'en-US'
): string {
  const now = Date.now();
  const timestamp = date instanceof Date ? date.getTime() : date;
  const diffMs = timestamp - now;
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffWeeks = Math.round(diffDays / 7);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, 'second');
  } else if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, 'day');
  } else if (Math.abs(diffWeeks) < 4) {
    return rtf.format(diffWeeks, 'week');
  } else if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month');
  } else {
    return rtf.format(diffYears, 'year');
  }
}

/**
 * Formats a date in a human-readable format.
 *
 * @param date - The date to format
 * @param options - Intl.DateTimeFormat options
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted date string
 *
 * @example
 * ```typescript
 * formatDate(new Date()) // "January 15, 2024"
 * formatDate(new Date(), { dateStyle: 'short' }) // "1/15/24"
 * ```
 */
export function formatDate(
  date: Date | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long' },
  locale = 'en-US'
): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Formats a date and time in a human-readable format.
 *
 * @param date - The date to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted date and time string
 *
 * @example
 * ```typescript
 * formatDateTime(new Date()) // "January 15, 2024, 2:30 PM"
 * ```
 */
export function formatDateTime(date: Date | number, locale = 'en-US'): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a random ID string for component keys.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Random ID string
 *
 * @example
 * ```typescript
 * generateId() // "id-abc123xyz"
 * generateId('user') // "user-abc123xyz"
 * ```
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generates a UUID v4 string.
 *
 * @returns UUID v4 string
 *
 * @example
 * ```typescript
 * generateUUID() // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Truncates a string to a maximum length with an ellipsis.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length including ellipsis
 * @param ellipsis - The ellipsis string (default: '...')
 * @returns Truncated string
 *
 * @example
 * ```typescript
 * truncate('Hello World', 8) // "Hello..."
 * truncate('Short', 10) // "Short"
 * ```
 */
export function truncate(
  str: string,
  maxLength: number,
  ellipsis = '...'
): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Capitalizes the first letter of a string.
 *
 * @param str - The string to capitalize
 * @returns Capitalized string
 *
 * @example
 * ```typescript
 * capitalize('hello') // "Hello"
 * capitalize('HELLO') // "HELLO"
 * ```
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to title case.
 *
 * @param str - The string to convert
 * @returns Title cased string
 *
 * @example
 * ```typescript
 * titleCase('hello world') // "Hello World"
 * titleCase('the quick brown fox') // "The Quick Brown Fox"
 * ```
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Converts a string to kebab-case.
 *
 * @param str - The string to convert
 * @returns Kebab-cased string
 *
 * @example
 * ```typescript
 * kebabCase('Hello World') // "hello-world"
 * kebabCase('camelCaseString') // "camel-case-string"
 * ```
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Converts a string to camelCase.
 *
 * @param str - The string to convert
 * @returns Camel-cased string
 *
 * @example
 * ```typescript
 * camelCase('hello-world') // "helloWorld"
 * camelCase('Hello World') // "helloWorld"
 * ```
 */
export function camelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
}

/**
 * Safely parses a JSON string.
 *
 * @param json - The JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed value or fallback
 *
 * @example
 * ```typescript
 * safeJsonParse('{"a": 1}', {}) // { a: 1 }
 * safeJsonParse('invalid', {}) // {}
 * ```
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// Function Utilities
// ============================================================================

/**
 * Debounces a function call by the specified delay.
 *
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce(search, 300);
 * // Only calls search after 300ms of no calls
 * debouncedSearch('query');
 * ```
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttles a function to only execute once per specified interval.
 *
 * @param fn - The function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle(handleScroll, 100);
 * // Only calls handleScroll once per 100ms
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Delays execution for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param options - Retry options
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const result = await retry(() => fetchData(), {
 *   attempts: 3,
 *   delay: 1000,
 *   backoff: 2
 * });
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { attempts = 3, delay = 1000, backoff = 2, onRetry } = options;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < attempts) {
        onRetry?.(lastError, attempt);
        await sleep(delay * Math.pow(backoff, attempt - 1));
      }
    }
  }
  throw lastError;
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Groups an array of items by a key.
 *
 * @param items - Array of items to group
 * @param keyFn - Function to extract the key from an item
 * @returns Map of grouped items
 *
 * @example
 * ```typescript
 * const users = [{ name: 'Alice', role: 'admin' }, { name: 'Bob', role: 'user' }];
 * groupBy(users, u => u.role) // Map { 'admin' => [...], 'user' => [...] }
 * ```
 */
export function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/**
 * Removes duplicate items from an array.
 *
 * @param items - Array of items
 * @param keyFn - Optional function to extract a unique key
 * @returns Array without duplicates
 *
 * @example
 * ```typescript
 * unique([1, 2, 2, 3]) // [1, 2, 3]
 * unique([{ id: 1 }, { id: 1 }], x => x.id) // [{ id: 1 }]
 * ```
 */
export function unique<T>(items: T[], keyFn?: (item: T) => unknown): T[] {
  if (keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return [...new Set(items)];
}

/**
 * Chunks an array into smaller arrays of a specified size.
 *
 * @param items - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Type Guards & Checks
// ============================================================================

/**
 * Checks if a value is null or undefined.
 *
 * @param value - Value to check
 * @returns True if null or undefined
 */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks if a value is defined (not null or undefined).
 *
 * @param value - Value to check
 * @returns True if defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, or empty object).
 *
 * @param value - Value to check
 * @returns True if empty
 *
 * @example
 * ```typescript
 * isEmpty(null) // true
 * isEmpty('') // true
 * isEmpty([]) // true
 * isEmpty({}) // true
 * isEmpty('hello') // false
 * ```
 */
export function isEmpty(value: unknown): boolean {
  if (isNil(value)) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Checks if the current environment is the browser.
 */
export const isBrowser = typeof window !== 'undefined';

/**
 * Checks if the current environment is Node.js.
 */
export const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

/**
 * Checks if the current environment is server-side (not browser).
 */
export const isServer = !isBrowser;

// ============================================================================
// DOM Utilities (Browser Only)
// ============================================================================

/**
 * Scrolls to an element with smooth animation.
 *
 * @param elementId - The ID of the element to scroll to
 * @param offset - Optional offset from the top (default: 80px for header)
 */
export function scrollToElement(elementId: string, offset = 80): void {
  if (!isBrowser) return;

  const element = document.getElementById(elementId);
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

/**
 * Copies text to the clipboard.
 *
 * @param text - Text to copy
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (!isBrowser) return;

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

// ============================================================================
// Object Utilities
// ============================================================================

/**
 * Deep clones an object.
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * Picks specified keys from an object.
 *
 * @param obj - Source object
 * @param keys - Keys to pick
 * @returns New object with only specified keys
 *
 * @example
 * ```typescript
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) // { a: 1, c: 3 }
 * ```
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omits specified keys from an object.
 *
 * @param obj - Source object
 * @param keys - Keys to omit
 * @returns New object without specified keys
 *
 * @example
 * ```typescript
 * omit({ a: 1, b: 2, c: 3 }, ['b']) // { a: 1, c: 3 }
 * ```
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Omit<T, K>;
  for (const key of keys) {
    delete (result as T)[key];
  }
  return result;
}

// ============================================================================
// Type Exports
// ============================================================================

export type { ClassValue };
