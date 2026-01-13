# @relay/utils

Common utility functions for Relay Platform applications.

## Installation

```bash
pnpm add @relay/utils
```

## Usage

```typescript
import {
  cn,
  formatPrice,
  formatRelativeTime,
  generateId,
  debounce,
  throttle,
  groupBy,
  unique,
  chunk,
} from '@relay/utils';
```

## API Reference

### CSS Class Utilities

#### `cn(...inputs: ClassValue[]): string`

Merges Tailwind CSS classes with proper precedence using clsx and tailwind-merge.

```typescript
cn('px-4 py-2', isActive && 'bg-blue-500', className);
cn('text-sm', { 'font-bold': isBold });
```

### Number Formatting

#### `formatCompactNumber(num: number): string`

Formats numbers in compact notation (1.2K, 3.4M).

#### `formatPrice(amount: number, showCents?: boolean): string`

Formats prices in USD currency format.

#### `formatCurrency(amount: number, currency?: string, locale?: string): string`

Formats numbers as currency with specified code and locale.

#### `formatNumber(num: number, locale?: string): string`

Formats numbers with thousand separators.

#### `formatPercent(value: number, decimals?: number): string`

Formats decimal values as percentages.

### Date & Time Formatting

#### `formatRelativeTime(date: Date | number, locale?: string): string`

Formats dates relative to now ("2 hours ago", "in 3 days").

#### `formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions, locale?: string): string`

Formats dates in human-readable format.

#### `formatDateTime(date: Date | number, locale?: string): string`

Formats dates and times together.

### ID Generation

#### `generateId(prefix?: string): string`

Generates random ID strings for component keys.

#### `generateUUID(): string`

Generates UUID v4 strings.

### String Utilities

#### `truncate(str: string, maxLength: number, ellipsis?: string): string`

Truncates strings with ellipsis.

#### `capitalize(str: string): string`

Capitalizes the first letter.

#### `titleCase(str: string): string`

Converts to title case.

#### `kebabCase(str: string): string`

Converts to kebab-case.

#### `camelCase(str: string): string`

Converts to camelCase.

#### `safeJsonParse<T>(json: string, fallback: T): T`

Safely parses JSON with fallback.

### Function Utilities

#### `debounce<T>(fn: T, delay: number): (...args) => void`

Debounces function calls.

#### `throttle<T>(fn: T, limit: number): (...args) => void`

Throttles function calls.

#### `sleep(ms: number): Promise<void>`

Delays execution.

#### `retry<T>(fn: () => Promise<T>, options?): Promise<T>`

Retries functions with exponential backoff.

### Array Utilities

#### `groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]>`

Groups items by a key.

#### `unique<T>(items: T[], keyFn?: (item: T) => unknown): T[]`

Removes duplicates.

#### `chunk<T>(items: T[], size: number): T[][]`

Splits arrays into chunks.

### Type Guards

#### `isNil(value: unknown): boolean`

Checks for null or undefined.

#### `isDefined<T>(value: T | null | undefined): value is T`

Checks for defined values.

#### `isEmpty(value: unknown): boolean`

Checks for empty values (null, '', [], {}).

### Environment Detection

- `isBrowser` - Is browser environment
- `isNode` - Is Node.js environment
- `isServer` - Is server-side environment

### DOM Utilities

#### `scrollToElement(elementId: string, offset?: number): void`

Smooth scrolls to an element.

#### `copyToClipboard(text: string): Promise<void>`

Copies text to clipboard.

### Object Utilities

#### `deepClone<T>(obj: T): T`

Deep clones an object.

#### `pick<T, K>(obj: T, keys: K[]): Pick<T, K>`

Picks specified keys from an object.

#### `omit<T, K>(obj: T, keys: K[]): Omit<T, K>`

Omits specified keys from an object.

## License

MIT
