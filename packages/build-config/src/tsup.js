/**
 * @fileoverview Shared tsup configuration factory for Relay Platform packages
 * @module @relay/build-config/tsup
 *
 * Provides consistent build configurations across all platform packages.
 *
 * @example
 * ```typescript
 * // tsup.config.ts
 * import { createTsupConfig } from '@relay/build-config/tsup';
 *
 * export default createTsupConfig();
 *
 * // With custom options
 * export default createTsupConfig({
 *   entry: ['src/index.ts', 'src/cli.ts'],
 *   external: ['react'],
 * });
 * ```
 */

/**
 * Default tsup configuration for Relay Platform packages.
 * @type {import('tsup').Options}
 */
export const defaultTsupConfig = {
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  splitting: false,
  outDir: 'dist',
};

/**
 * Create a tsup configuration with platform defaults.
 *
 * @param {Partial<import('tsup').Options>} [options] - Custom options to merge
 * @returns {import('tsup').Options} Complete tsup configuration
 */
export function createTsupConfig(options = {}) {
  return {
    ...defaultTsupConfig,
    ...options,
    entry: options.entry ?? ['src/index.ts'],
  };
}

/**
 * Create a tsup configuration for packages with multiple entry points.
 *
 * @param {string[]} entries - Array of entry point paths
 * @param {Partial<import('tsup').Options>} [options] - Additional options
 * @returns {import('tsup').Options} Complete tsup configuration
 */
export function createMultiEntryTsupConfig(entries, options = {}) {
  return createTsupConfig({
    ...options,
    entry: entries,
    splitting: true, // Enable code splitting for multiple entries
  });
}

/**
 * Create a tsup configuration for packages that include React components.
 *
 * @param {Partial<import('tsup').Options>} [options] - Custom options
 * @returns {import('tsup').Options} Complete tsup configuration
 */
export function createReactTsupConfig(options = {}) {
  return createTsupConfig({
    ...options,
    external: ['react', 'react-dom', ...(options.external ?? [])],
    esbuildOptions(esbuildOptions) {
      esbuildOptions.jsx = 'automatic';
      options.esbuildOptions?.(esbuildOptions);
    },
  });
}

/**
 * Create a tsup configuration for CLI packages.
 *
 * @param {string} [cliEntry='src/cli.ts'] - CLI entry point
 * @param {Partial<import('tsup').Options>} [options] - Additional options
 * @returns {import('tsup').Options} Complete tsup configuration
 */
export function createCliTsupConfig(cliEntry = 'src/cli.ts', options = {}) {
  return createTsupConfig({
    ...options,
    entry: [cliEntry, ...(options.entry ?? [])],
    banner: {
      js: '#!/usr/bin/env node',
    },
  });
}

export default createTsupConfig;
