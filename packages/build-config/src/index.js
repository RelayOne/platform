/**
 * @fileoverview Shared build configurations for Relay Platform packages
 * @module @relay/build-config
 *
 * This package provides consistent build and test configurations
 * across all Relay Platform packages.
 *
 * @example
 * ```typescript
 * // Import tsup config factory
 * import { createTsupConfig } from '@relay/build-config/tsup';
 *
 * // Import vitest config factory
 * import { createVitestConfig } from '@relay/build-config/vitest';
 * ```
 */

export {
  createTsupConfig,
  createMultiEntryTsupConfig,
  createReactTsupConfig,
  createCliTsupConfig,
  defaultTsupConfig,
} from './tsup.js';

export {
  createVitestConfig,
  createReactVitestConfig,
  createIntegrationVitestConfig,
  defaultVitestConfig,
} from './vitest.js';
