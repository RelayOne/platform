/**
 * @fileoverview PR filtering engine for GitHub integration
 * Determines which PRs should be processed based on configuration
 * @module @relay/integrations/github/filters
 */

import type {
  GitHubFilterConfig,
  GitHubPullRequest,
  GitHubPrFile,
  FilterResult,
} from './types';

/**
 * Filters PRs based on configuration rules
 */
export class PrFilterEngine {
  private config: GitHubFilterConfig;

  /**
   * Creates a new filter engine
   * @param config - Filter configuration
   */
  constructor(config: GitHubFilterConfig = {}) {
    this.config = {
      skipDraftPrs: config.skipDraftPrs ?? true,
      skipTargetBranches: config.skipTargetBranches ?? [],
      skipSourceBranches: config.skipSourceBranches ?? [],
      skipLabels: config.skipLabels ?? [],
      requireLabels: config.requireLabels ?? [],
      skipPaths: config.skipPaths ?? [],
      requirePaths: config.requirePaths ?? [],
      maxFilesThreshold: config.maxFilesThreshold ?? 500,
    };
  }

  /**
   * Evaluates a PR against all filter rules
   * @param pr - Pull request to evaluate
   * @param files - Optional list of changed files
   * @returns Filter result (skip or process)
   */
  evaluate(pr: GitHubPullRequest, files?: GitHubPrFile[]): FilterResult {
    // Check draft status
    const draftResult = this.checkDraftStatus(pr);
    if (draftResult.type === 'skip') return draftResult;

    // Check target branch
    const targetBranchResult = this.checkTargetBranch(pr);
    if (targetBranchResult.type === 'skip') return targetBranchResult;

    // Check source branch
    const sourceBranchResult = this.checkSourceBranch(pr);
    if (sourceBranchResult.type === 'skip') return sourceBranchResult;

    // Check skip labels
    const skipLabelsResult = this.checkSkipLabels(pr);
    if (skipLabelsResult.type === 'skip') return skipLabelsResult;

    // Check required labels
    const requireLabelsResult = this.checkRequiredLabels(pr);
    if (requireLabelsResult.type === 'skip') return requireLabelsResult;

    // Check file count threshold
    const fileCountResult = this.checkFileCount(pr);
    if (fileCountResult.type === 'skip') return fileCountResult;

    // Check file paths (if files provided)
    if (files) {
      const skipPathsResult = this.checkSkipPaths(files);
      if (skipPathsResult.type === 'skip') return skipPathsResult;

      const requirePathsResult = this.checkRequiredPaths(files);
      if (requirePathsResult.type === 'skip') return requirePathsResult;
    }

    return { type: 'process' };
  }

  /**
   * Checks if PR is a draft and should be skipped
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkDraftStatus(pr: GitHubPullRequest): FilterResult {
    if (this.config.skipDraftPrs && pr.draft) {
      return { type: 'skip', reason: 'PR is a draft' };
    }
    return { type: 'process' };
  }

  /**
   * Checks if target branch matches skip patterns
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkTargetBranch(pr: GitHubPullRequest): FilterResult {
    const patterns = this.config.skipTargetBranches || [];
    for (const pattern of patterns) {
      if (this.matchesPattern(pr.base.ref, pattern)) {
        return {
          type: 'skip',
          reason: `Target branch '${pr.base.ref}' matches skip pattern '${pattern}'`,
        };
      }
    }
    return { type: 'process' };
  }

  /**
   * Checks if source branch matches skip patterns
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkSourceBranch(pr: GitHubPullRequest): FilterResult {
    const patterns = this.config.skipSourceBranches || [];
    for (const pattern of patterns) {
      if (this.matchesPattern(pr.head.ref, pattern)) {
        return {
          type: 'skip',
          reason: `Source branch '${pr.head.ref}' matches skip pattern '${pattern}'`,
        };
      }
    }
    return { type: 'process' };
  }

  /**
   * Checks if PR has any skip labels
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkSkipLabels(pr: GitHubPullRequest): FilterResult {
    const skipLabels = this.config.skipLabels || [];
    const prLabels = pr.labels.map((l) => l.name.toLowerCase());

    for (const skipLabel of skipLabels) {
      if (prLabels.includes(skipLabel.toLowerCase())) {
        return {
          type: 'skip',
          reason: `PR has skip label '${skipLabel}'`,
        };
      }
    }
    return { type: 'process' };
  }

  /**
   * Checks if PR has required labels
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkRequiredLabels(pr: GitHubPullRequest): FilterResult {
    const requireLabels = this.config.requireLabels || [];
    if (requireLabels.length === 0) {
      return { type: 'process' };
    }

    const prLabels = pr.labels.map((l) => l.name.toLowerCase());
    const hasRequiredLabel = requireLabels.some((required) =>
      prLabels.includes(required.toLowerCase())
    );

    if (!hasRequiredLabel) {
      return {
        type: 'skip',
        reason: `PR missing required labels: ${requireLabels.join(', ')}`,
      };
    }
    return { type: 'process' };
  }

  /**
   * Checks if file count exceeds threshold
   * @param pr - Pull request
   * @returns Filter result
   */
  private checkFileCount(pr: GitHubPullRequest): FilterResult {
    const threshold = this.config.maxFilesThreshold || 500;
    if (pr.changedFiles > threshold) {
      return {
        type: 'skip',
        reason: `PR has ${pr.changedFiles} files (threshold: ${threshold})`,
      };
    }
    return { type: 'process' };
  }

  /**
   * Checks if any files match skip path patterns
   * @param files - Changed files
   * @returns Filter result
   */
  private checkSkipPaths(files: GitHubPrFile[]): FilterResult {
    const patterns = this.config.skipPaths || [];
    if (patterns.length === 0) {
      return { type: 'process' };
    }

    // Check if ALL files match skip patterns (skip only if entire PR is skippable files)
    const allFilesSkippable = files.every((file) =>
      patterns.some((pattern) => this.matchesGlob(file.filename, pattern))
    );

    if (allFilesSkippable && files.length > 0) {
      return {
        type: 'skip',
        reason: 'All changed files match skip patterns',
      };
    }
    return { type: 'process' };
  }

  /**
   * Checks if required paths are present
   * @param files - Changed files
   * @returns Filter result
   */
  private checkRequiredPaths(files: GitHubPrFile[]): FilterResult {
    const patterns = this.config.requirePaths || [];
    if (patterns.length === 0) {
      return { type: 'process' };
    }

    // Check if any file matches a required pattern
    const hasRequiredPath = files.some((file) =>
      patterns.some((pattern) => this.matchesGlob(file.filename, pattern))
    );

    if (!hasRequiredPath) {
      return {
        type: 'skip',
        reason: `No files match required patterns: ${patterns.join(', ')}`,
      };
    }
    return { type: 'process' };
  }

  /**
   * Tests if a string matches a regex pattern
   * @param value - String to test
   * @param pattern - Regex pattern string
   * @returns True if matches
   */
  private matchesPattern(value: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      // Fall back to exact match if regex is invalid
      return value === pattern;
    }
  }

  /**
   * Tests if a path matches a glob-like pattern
   * Supports * (any chars) and ** (any path segment)
   * @param path - File path to test
   * @param pattern - Glob pattern
   * @returns True if matches
   */
  private matchesGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*\*/g, '{{GLOBSTAR}}') // Temporarily replace **
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/{{GLOBSTAR}}/g, '.*'); // ** matches anything

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(path);
    } catch {
      return path.includes(pattern);
    }
  }

  /**
   * Gets the current filter configuration
   * @returns Filter configuration
   */
  getConfig(): GitHubFilterConfig {
    return { ...this.config };
  }

  /**
   * Updates filter configuration
   * @param updates - Partial configuration updates
   */
  updateConfig(updates: Partial<GitHubFilterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Creates a filter info object for webhook response
 * @param result - Filter result
 * @param filterName - Name of the filter that triggered skip
 * @returns Filter info object
 */
export function createFilterInfo(
  result: FilterResult,
  filterName: string
): { skipped: boolean; filterName: string; reason: string } {
  return {
    skipped: result.type === 'skip',
    filterName,
    reason: result.type === 'skip' ? result.reason : 'Processed',
  };
}

/**
 * Default filter configurations for common use cases
 */
export const DefaultFilters = {
  /**
   * Standard filter for code review (skips drafts, docs-only changes)
   */
  codeReview: {
    skipDraftPrs: true,
    skipPaths: ['*.md', 'docs/**', '.github/**', 'LICENSE', 'CHANGELOG*'],
    maxFilesThreshold: 500,
  } satisfies GitHubFilterConfig,

  /**
   * Strict filter requiring specific labels
   */
  labelRequired: {
    skipDraftPrs: true,
    requireLabels: ['ready-for-review', 'needs-review'],
    maxFilesThreshold: 300,
  } satisfies GitHubFilterConfig,

  /**
   * Minimal filter (process almost everything)
   */
  minimal: {
    skipDraftPrs: false,
    maxFilesThreshold: 1000,
  } satisfies GitHubFilterConfig,
};
