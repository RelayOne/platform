/**
 * @fileoverview Type definitions for tsup configuration factory
 * @module @relay/build-config/tsup
 */

import type { Options } from 'tsup';

/**
 * Default tsup configuration for Relay Platform packages.
 */
export declare const defaultTsupConfig: Options;

/**
 * Create a tsup configuration with platform defaults.
 *
 * @param options - Custom options to merge with defaults
 * @returns Complete tsup configuration
 */
export declare function createTsupConfig(options?: Partial<Options>): Options;

/**
 * Create a tsup configuration for packages with multiple entry points.
 *
 * @param entries - Array of entry point paths
 * @param options - Additional options
 * @returns Complete tsup configuration
 */
export declare function createMultiEntryTsupConfig(
  entries: string[],
  options?: Partial<Options>
): Options;

/**
 * Create a tsup configuration for packages that include React components.
 *
 * @param options - Custom options
 * @returns Complete tsup configuration
 */
export declare function createReactTsupConfig(options?: Partial<Options>): Options;

/**
 * Create a tsup configuration for CLI packages.
 *
 * @param cliEntry - CLI entry point (default: 'src/cli.ts')
 * @param options - Additional options
 * @returns Complete tsup configuration
 */
export declare function createCliTsupConfig(
  cliEntry?: string,
  options?: Partial<Options>
): Options;

export default createTsupConfig;
