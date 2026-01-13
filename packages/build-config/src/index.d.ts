/**
 * @fileoverview Type definitions for build configurations
 * @module @relay/build-config
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
