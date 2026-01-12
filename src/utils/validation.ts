/**
 * @fileoverview Validation utilities and Zod schemas for the Relay Platform
 * @module @relay/platform/utils/validation
 */

import { z } from 'zod';

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .min(5, 'Email too short')
  .max(254, 'Email too long')
  .toLowerCase()
  .trim();

/**
 * Password validation schema
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/**
 * Strong password schema (for sensitive operations)
 */
export const strongPasswordSchema = passwordSchema.regex(
  /[^a-zA-Z0-9]/,
  'Password must contain a special character',
);

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Slug validation schema (URL-friendly identifier)
 */
export const slugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(64, 'Slug must be at most 64 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

/**
 * Name validation schema
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .trim();

/**
 * URL validation schema
 */
export const urlSchema = z.string().url('Invalid URL');

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Pagination response
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
 * Create a paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
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

/**
 * Date range schema
 */
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      return data.from <= data.to;
    }
    return true;
  },
  { message: 'From date must be before to date' },
);

/**
 * Phone number validation (E.164 format)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (+1234567890)');

/**
 * Hex color validation
 */
export const hexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color');

/**
 * API key format validation
 */
export const apiKeySchema = z
  .string()
  .min(32, 'API key too short')
  .max(128, 'API key too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format');

/**
 * ISO timestamp validation
 */
export const isoTimestampSchema = z.string().datetime({ offset: true });

/**
 * Validate and parse data with a schema
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data (returns result object)
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Format Zod errors into a simple object
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
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  return urlSchema.safeParse(url).success;
}

/**
 * Sanitize a string for use as a slug
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
 * Generate a unique slug with suffix
 */
export function generateUniqueSlug(base: string, suffix?: string): string {
  const baseSlug = toSlug(base);
  if (suffix) {
    return `${baseSlug}-${suffix}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}
