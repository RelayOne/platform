/**
 * @fileoverview Type definitions for vitest configuration factory
 * @module @relay/build-config/vitest
 */

import type { UserConfig } from 'vitest/config';

/**
 * Default vitest configuration for Relay Platform packages.
 */
export declare const defaultVitestConfig: UserConfig;

/**
 * Create a vitest configuration with platform defaults.
 *
 * @param options - Custom options to merge with defaults
 * @returns Complete vitest configuration
 */
export declare function createVitestConfig(options?: Partial<UserConfig>): UserConfig;

/**
 * Create a vitest configuration for React/browser testing.
 *
 * @param options - Custom options
 * @returns Complete vitest configuration
 */
export declare function createReactVitestConfig(options?: Partial<UserConfig>): UserConfig;

/**
 * Create a vitest configuration for integration tests.
 *
 * @param options - Custom options
 * @returns Complete vitest configuration
 */
export declare function createIntegrationVitestConfig(options?: Partial<UserConfig>): UserConfig;

export default createVitestConfig;
