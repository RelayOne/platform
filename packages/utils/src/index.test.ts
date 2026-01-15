/**
 * @fileoverview Tests for @relay/utils package
 * @module @relay/utils/tests
 *
 * Comprehensive test suite for all utility functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatCompactNumber,
  formatPrice,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatDate,
  formatDateTime,
  generateId,
  generateUUID,
  truncate,
  capitalize,
  titleCase,
  kebabCase,
  camelCase,
  safeJsonParse,
  debounce,
  throttle,
  sleep,
  retry,
  groupBy,
  unique,
  chunk,
  isNil,
  isDefined,
  isEmpty,
  isBrowser,
  isNode,
  isServer,
  deepClone,
  pick,
  omit,
} from './index';

describe('@relay/utils', () => {
  describe('cn (class merge)', () => {
    it('should merge class names', () => {
      expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active')).toBe('base active');
      expect(cn('base', false && 'active')).toBe('base');
    });

    it('should deduplicate Tailwind classes', () => {
      expect(cn('px-2 px-4')).toBe('px-4');
      expect(cn('text-red-500 text-blue-500')).toBe('text-blue-500');
    });

    it('should handle object syntax', () => {
      expect(cn({ 'font-bold': true, 'text-lg': false })).toBe('font-bold');
    });

    it('should handle array syntax', () => {
      expect(cn(['base', 'class'])).toBe('base class');
    });

    it('should handle mixed inputs', () => {
      expect(cn('base', { active: true }, ['extra'])).toBe('base active extra');
    });

    it('should handle null and undefined', () => {
      expect(cn('base', null, undefined, 'end')).toBe('base end');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format small numbers', () => {
      expect(formatCompactNumber(100)).toBe('100');
      expect(formatCompactNumber(999)).toBe('999');
    });

    it('should format thousands', () => {
      expect(formatCompactNumber(1000)).toBe('1K');
      expect(formatCompactNumber(1234)).toBe('1.2K');
      expect(formatCompactNumber(9999)).toBe('10K');
    });

    it('should format millions', () => {
      expect(formatCompactNumber(1000000)).toBe('1M');
      expect(formatCompactNumber(1234567)).toBe('1.2M');
    });

    it('should format billions', () => {
      expect(formatCompactNumber(1000000000)).toBe('1B');
      expect(formatCompactNumber(1234567890)).toBe('1.2B');
    });

    it('should handle zero', () => {
      expect(formatCompactNumber(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(formatCompactNumber(-1234)).toBe('-1.2K');
    });
  });

  describe('formatPrice', () => {
    it('should format price without cents by default', () => {
      expect(formatPrice(29)).toBe('$29');
      expect(formatPrice(29.99)).toBe('$30');
    });

    it('should format price with cents when requested', () => {
      expect(formatPrice(29.99, true)).toBe('$29.99');
      expect(formatPrice(29, true)).toBe('$29.00');
    });

    it('should format large prices', () => {
      expect(formatPrice(1000)).toBe('$1,000');
      expect(formatPrice(1000000)).toBe('$1,000,000');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('$0');
      expect(formatPrice(0, true)).toBe('$0.00');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD by default', () => {
      expect(formatCurrency(29.99)).toBe('$29.99');
    });

    it('should format different currencies', () => {
      expect(formatCurrency(29.99, 'GBP')).toBe('£29.99');
      expect(formatCurrency(29.99, 'JPY')).toBe('¥30');
    });

    it('should respect locale', () => {
      expect(formatCurrency(29.99, 'EUR', 'de-DE')).toContain('29,99');
    });
  });

  describe('formatNumber', () => {
    it('should add thousand separators', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('should preserve decimals', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56');
    });

    it('should handle small numbers', () => {
      expect(formatNumber(42)).toBe('42');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage without decimals', () => {
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(0.1)).toBe('10%');
      expect(formatPercent(1)).toBe('100%');
    });

    it('should format percentage with decimals', () => {
      expect(formatPercent(0.1234, 2)).toBe('12.34%');
      expect(formatPercent(0.5, 1)).toBe('50.0%');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0%');
    });
  });

  describe('formatRelativeTime', () => {
    const now = Date.now();

    it('should format seconds ago', () => {
      const result = formatRelativeTime(new Date(now - 30000));
      expect(result).toContain('second');
    });

    it('should format minutes ago', () => {
      const result = formatRelativeTime(new Date(now - 5 * 60 * 1000));
      expect(result).toContain('minute');
    });

    it('should format hours ago', () => {
      const result = formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000));
      expect(result).toContain('hour');
    });

    it('should format days ago', () => {
      const result = formatRelativeTime(new Date(now - 3 * 24 * 60 * 60 * 1000));
      expect(result).toContain('day');
    });

    it('should format future dates', () => {
      const result = formatRelativeTime(new Date(now + 2 * 60 * 60 * 1000));
      expect(result).toContain('hour');
    });

    it('should accept timestamps', () => {
      const result = formatRelativeTime(now - 60000);
      expect(result).toContain('minute');
    });
  });

  describe('formatDate', () => {
    const testDate = new Date('2024-01-15T12:00:00Z');

    it('should format with default options', () => {
      const result = formatDate(testDate);
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should format with custom options', () => {
      const result = formatDate(testDate, { dateStyle: 'short' });
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    });

    it('should accept timestamps', () => {
      const result = formatDate(testDate.getTime());
      expect(result).toContain('2024');
    });
  });

  describe('formatDateTime', () => {
    const testDate = new Date('2024-01-15T14:30:00Z');

    it('should format date and time', () => {
      const result = formatDateTime(testDate);
      expect(result).toContain('2024');
    });

    it('should accept timestamps', () => {
      const result = formatDateTime(testDate.getTime());
      expect(result).toContain('2024');
    });
  });

  describe('generateId', () => {
    it('should generate ID with default prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^id-[a-z0-9]+$/);
    });

    it('should generate ID with custom prefix', () => {
      const id = generateId('user');
      expect(id).toMatch(/^user-[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()));
      expect(uuids.size).toBe(100);
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('Short', 10)).toBe('Short');
    });

    it('should use custom ellipsis', () => {
      expect(truncate('Hello World', 9, '…')).toBe('Hello Wo…');
    });

    it('should handle edge cases', () => {
      expect(truncate('', 5)).toBe('');
      expect(truncate('Hi', 2)).toBe('Hi');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle already capitalized', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle single character', () => {
      expect(capitalize('a')).toBe('A');
    });
  });

  describe('titleCase', () => {
    it('should convert to title case', () => {
      expect(titleCase('hello world')).toBe('Hello World');
    });

    it('should handle mixed case', () => {
      expect(titleCase('hELLO wORLD')).toBe('Hello World');
    });

    it('should handle single word', () => {
      expect(titleCase('hello')).toBe('Hello');
    });
  });

  describe('kebabCase', () => {
    it('should convert spaces to kebab-case', () => {
      expect(kebabCase('Hello World')).toBe('hello-world');
    });

    it('should convert camelCase to kebab-case', () => {
      expect(kebabCase('camelCaseString')).toBe('camel-case-string');
    });

    it('should handle underscores', () => {
      expect(kebabCase('hello_world')).toBe('hello-world');
    });
  });

  describe('camelCase', () => {
    it('should convert kebab-case to camelCase', () => {
      expect(camelCase('hello-world')).toBe('helloWorld');
    });

    it('should convert spaces to camelCase', () => {
      expect(camelCase('Hello World')).toBe('helloWorld');
    });

    it('should handle underscores', () => {
      expect(camelCase('hello_world')).toBe('helloWorld');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a": 1}', {})).toEqual({ a: 1 });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
    });

    it('should parse arrays', () => {
      expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
    });

    it('should parse primitives', () => {
      expect(safeJsonParse('42', 0)).toBe(42);
      expect(safeJsonParse('"hello"', '')).toBe('hello');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce function calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should throttle function calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should allow calls after throttle period', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1');
      expect(fn).toHaveBeenCalledWith('arg1');
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should sleep for specified duration', async () => {
      let resolved = false;
      const promise = sleep(1000).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(999);
      await Promise.resolve();
      expect(resolved).toBe(false);

      vi.advanceTimersByTime(1);
      await promise;
      expect(resolved).toBe(true);
    });
  });

  describe('retry', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { delay: 1 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { attempts: 3, delay: 1 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await retry(fn, { delay: 1, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });
  });

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
        { name: 'Charlie', role: 'admin' },
      ];
      const groups = groupBy(items, (item) => item.role);

      expect(groups.get('admin')).toHaveLength(2);
      expect(groups.get('user')).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const groups = groupBy([], (x: number) => x);
      expect(groups.size).toBe(0);
    });

    it('should work with numeric keys', () => {
      const items = [1, 2, 3, 4, 5];
      const groups = groupBy(items, (n) => (n % 2 === 0 ? 0 : 1));

      expect(groups.get(0)).toEqual([2, 4]);
      expect(groups.get(1)).toEqual([1, 3, 5]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates from primitive array', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should remove duplicates by key function', () => {
      const items = [
        { id: 1, name: 'A' },
        { id: 1, name: 'B' },
        { id: 2, name: 'C' },
      ];
      const result = unique(items, (x) => x.id);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
    });

    it('should handle empty array', () => {
      expect(unique([])).toEqual([]);
    });

    it('should handle strings', () => {
      expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle exact divisible', () => {
      expect(chunk([1, 2, 3, 4], 2)).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 2)).toEqual([]);
    });

    it('should handle size larger than array', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });
  });

  describe('isNil', () => {
    it('should return true for null and undefined', () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    it('should return false for other values', () => {
      expect(isNil(0)).toBe(false);
      expect(isNil('')).toBe(false);
      expect(isNil(false)).toBe(false);
      expect(isNil([])).toBe(false);
      expect(isNil({})).toBe(false);
    });
  });

  describe('isDefined', () => {
    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });

    it('should return true for other values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
    });
  });

  describe('isEmpty', () => {
    it('should return true for null and undefined', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isEmpty('')).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(isEmpty([])).toBe(true);
    });

    it('should return true for empty object', () => {
      expect(isEmpty({})).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty(0)).toBe(false);
    });
  });

  describe('Environment detection', () => {
    it('should detect Node.js environment', () => {
      expect(isNode).toBe(true);
      expect(isBrowser).toBe(false);
      expect(isServer).toBe(true);
    });
  });

  describe('deepClone', () => {
    it('should clone primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(null)).toBe(null);
    });

    it('should clone arrays', () => {
      const arr = [1, 2, [3, 4]];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone dates', () => {
      const date = new Date('2024-01-15');
      const cloned = deepClone(date);

      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore missing keys', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'c' as 'a'])).toEqual({ a: 1 });
    });

    it('should return empty object for no keys', () => {
      const obj = { a: 1 };
      expect(pick(obj, [])).toEqual({});
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });

    it('should handle missing keys', () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, ['c' as 'a'])).toEqual({ a: 1, b: 2 });
    });

    it('should return copy for no keys', () => {
      const obj = { a: 1 };
      const result = omit(obj, []);
      expect(result).toEqual({ a: 1 });
      expect(result).not.toBe(obj);
    });
  });
});
