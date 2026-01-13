/**
 * @fileoverview Shared vitest configuration factory for Relay Platform packages
 * @module @relay/build-config/vitest
 *
 * Provides consistent test configurations across all platform packages.
 *
 * @example
 * ```typescript
 * // vitest.config.ts
 * import { createVitestConfig } from '@relay/build-config/vitest';
 *
 * export default createVitestConfig();
 *
 * // With custom options
 * export default createVitestConfig({
 *   test: {
 *     setupFiles: ['./tests/setup.ts'],
 *   },
 * });
 * ```
 */

/**
 * Default vitest configuration for Relay Platform packages.
 */
export const defaultVitestConfig = {
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/**/*.test.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
};

/**
 * Create a vitest configuration with platform defaults.
 *
 * @param {object} [options] - Custom options to merge
 * @returns {object} Complete vitest configuration
 */
export function createVitestConfig(options = {}) {
  return {
    ...defaultVitestConfig,
    ...options,
    test: {
      ...defaultVitestConfig.test,
      ...options.test,
      coverage: {
        ...defaultVitestConfig.test.coverage,
        ...options.test?.coverage,
      },
    },
  };
}

/**
 * Create a vitest configuration for React/browser testing.
 *
 * @param {object} [options] - Custom options
 * @returns {object} Complete vitest configuration
 */
export function createReactVitestConfig(options = {}) {
  return createVitestConfig({
    ...options,
    test: {
      environment: 'jsdom',
      ...options.test,
    },
  });
}

/**
 * Create a vitest configuration for integration tests.
 *
 * @param {object} [options] - Custom options
 * @returns {object} Complete vitest configuration
 */
export function createIntegrationVitestConfig(options = {}) {
  return createVitestConfig({
    ...options,
    test: {
      include: ['tests/integration/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      ...options.test,
    },
  });
}

export default createVitestConfig;
