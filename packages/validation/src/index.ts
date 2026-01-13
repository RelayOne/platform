/**
 * @fileoverview Zod validation schemas and utilities for Relay Platform applications
 * @module @relay/validation
 *
 * This package provides a collection of reusable Zod schemas and validation
 * utilities that are shared across all Relay Platform applications.
 *
 * @example
 * ```typescript
 * import {
 *   emailSchema,
 *   passwordSchema,
 *   paginationSchema,
 *   validate,
 *   safeValidate,
 *   formatZodErrors,
 * } from '@relay/validation';
 *
 * // Validate email
 * const email = emailSchema.parse('user@example.com');
 *
 * // Safe validation with error handling
 * const result = safeValidate(passwordSchema, 'weak');
 * if (!result.success) {
 *   console.log(formatZodErrors(result.errors));
 * }
 * ```
 */

import { z } from 'zod';

// ============================================================================
// Basic Field Schemas
// ============================================================================

/**
 * Email validation schema.
 * - Must be a valid email format
 * - Minimum 5 characters, maximum 254 characters
 * - Automatically lowercased and trimmed
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .min(5, 'Email too short')
  .max(254, 'Email too long')
  .toLowerCase()
  .trim();

/**
 * Standard password validation schema.
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - Must contain lowercase, uppercase, and number
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/**
 * Strong password schema for sensitive operations.
 * - Includes all standard password requirements
 * - Must also contain a special character
 */
export const strongPasswordSchema = passwordSchema.regex(
  /[^a-zA-Z0-9]/,
  'Password must contain a special character'
);

/**
 * UUID validation schema.
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Slug validation schema (URL-friendly identifier).
 * - Lowercase alphanumeric with hyphens
 * - 2-64 characters
 */
export const slugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(64, 'Slug must be at most 64 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with hyphens'
  );

/**
 * Name validation schema.
 * - 1-100 characters
 * - Automatically trimmed
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .trim();

/**
 * Display name validation schema.
 * - 2-50 characters
 * - Automatically trimmed
 */
export const displayNameSchema = z
  .string()
  .min(2, 'Display name must be at least 2 characters')
  .max(50, 'Display name too long')
  .trim();

/**
 * URL validation schema.
 */
export const urlSchema = z.string().url('Invalid URL');

/**
 * Optional URL validation schema.
 */
export const optionalUrlSchema = z.string().url('Invalid URL').optional().or(z.literal(''));

/**
 * Phone number validation (E.164 format).
 * Format: +[country code][number] (e.g., +14155551234)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (+1234567890)');

/**
 * Hex color validation.
 * Supports both 3 and 6 character formats.
 */
export const hexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color');

/**
 * API key format validation.
 * - 32-128 characters
 * - Alphanumeric with underscores and hyphens
 */
export const apiKeySchema = z
  .string()
  .min(32, 'API key too short')
  .max(128, 'API key too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format');

/**
 * ISO timestamp validation (with timezone offset).
 */
export const isoTimestampSchema = z.string().datetime({ offset: true });

/**
 * MongoDB ObjectId validation.
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

/**
 * Description validation schema.
 * - Maximum 1000 characters
 * - Optional
 */
export const descriptionSchema = z
  .string()
  .max(1000, 'Description too long')
  .optional();

/**
 * Non-empty string validation.
 */
export const nonEmptyStringSchema = z.string().min(1, 'This field is required');

// ============================================================================
// Pagination Schemas
// ============================================================================

/**
 * Pagination parameters schema.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Pagination parameters type.
 */
export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Cursor-based pagination schema.
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

/**
 * Cursor pagination parameters type.
 */
export type CursorPaginationParams = z.infer<typeof cursorPaginationSchema>;

/**
 * Paginated response structure.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Cursor-based paginated response structure.
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    prevCursor: string | null;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Creates a paginated response object.
 *
 * @param data - Array of items
 * @param total - Total count of all items
 * @param params - Pagination parameters
 * @returns Paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

// ============================================================================
// Date Schemas
// ============================================================================

/**
 * Date range schema with validation.
 */
export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return data.from <= data.to;
      }
      return true;
    },
    { message: 'From date must be before to date' }
  );

/**
 * Date range type.
 */
export type DateRange = z.infer<typeof dateRangeSchema>;

/**
 * Future date validation.
 */
export const futureDateSchema = z.coerce.date().refine(
  (date) => date > new Date(),
  { message: 'Date must be in the future' }
);

/**
 * Past date validation.
 */
export const pastDateSchema = z.coerce.date().refine(
  (date) => date < new Date(),
  { message: 'Date must be in the past' }
);

// ============================================================================
// Search & Filter Schemas
// ============================================================================

/**
 * Search query schema.
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

/**
 * Search query type.
 */
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ============================================================================
// Common Entity Schemas
// ============================================================================

/**
 * Base entity schema with common fields.
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Timestamps schema.
 */
export const timestampsSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Soft delete schema.
 */
export const softDeleteSchema = z.object({
  deletedAt: z.coerce.date().nullable().optional(),
  isDeleted: z.boolean().default(false),
});

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates data with a schema, throwing on failure.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * const email = validate(emailSchema, 'user@example.com');
 * ```
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validates data, returning a result object.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Success with data or failure with errors
 *
 * @example
 * ```typescript
 * const result = safeValidate(emailSchema, input);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.log(result.errors);
 * }
 * ```
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Formats Zod errors into a simple object.
 *
 * @param error - Zod error object
 * @returns Object mapping field paths to error messages
 *
 * @example
 * ```typescript
 * const result = safeValidate(schema, data);
 * if (!result.success) {
 *   const errors = formatZodErrors(result.errors);
 *   // { email: ['Invalid email'], password: ['Too short'] }
 * }
 * ```
 */
export function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  return formatted;

}

/**
 * Formats Zod errors into a flat array of messages.
 *
 * @param error - Zod error object
 * @returns Array of error messages with field paths
 */
export function formatZodErrorsFlat(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Gets the first error message from a Zod error.
 *
 * @param error - Zod error object
 * @returns First error message or undefined
 */
export function getFirstZodError(error: z.ZodError): string | undefined {
  return error.issues[0]?.message;
}

// ============================================================================
// Type Checking Utilities
// ============================================================================

/**
 * Checks if a string is a valid email.
 *
 * @param email - String to check
 * @returns True if valid email
 */
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

/**
 * Checks if a string is a valid UUID.
 *
 * @param id - String to check
 * @returns True if valid UUID
 */
export function isValidUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

/**
 * Checks if a string is a valid URL.
 *
 * @param url - String to check
 * @returns True if valid URL
 */
export function isValidUrl(url: string): boolean {
  return urlSchema.safeParse(url).success;
}

/**
 * Checks if a string is a valid slug.
 *
 * @param slug - String to check
 * @returns True if valid slug
 */
export function isValidSlug(slug: string): boolean {
  return slugSchema.safeParse(slug).success;
}

/**
 * Checks if a string is a valid phone number (E.164).
 *
 * @param phone - String to check
 * @returns True if valid phone number
 */
export function isValidPhone(phone: string): boolean {
  return phoneSchema.safeParse(phone).success;
}

/**
 * Checks if a string is a valid MongoDB ObjectId.
 *
 * @param id - String to check
 * @returns True if valid ObjectId
 */
export function isValidObjectId(id: string): boolean {
  return objectIdSchema.safeParse(id).success;
}

// ============================================================================
// String Transformation Utilities
// ============================================================================

/**
 * Sanitizes a string for use as a slug.
 *
 * @param str - String to sanitize
 * @returns URL-friendly slug
 *
 * @example
 * ```typescript
 * toSlug('Hello World!') // "hello-world"
 * toSlug('My  Title') // "my-title"
 * ```
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a unique slug with a suffix.
 *
 * @param base - Base string for the slug
 * @param suffix - Optional suffix (uses timestamp if not provided)
 * @returns Unique slug
 *
 * @example
 * ```typescript
 * generateUniqueSlug('my-post') // "my-post-lq5x7"
 * generateUniqueSlug('my-post', 'v2') // "my-post-v2"
 * ```
 */
export function generateUniqueSlug(base: string, suffix?: string): string {
  const baseSlug = toSlug(base);
  if (suffix) {
    return `${baseSlug}-${suffix}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

// ============================================================================
// Re-exports from Zod
// ============================================================================

export { z };
export type { ZodError, ZodIssue, ZodSchema } from 'zod';
