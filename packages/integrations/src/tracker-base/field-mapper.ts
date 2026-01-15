import type {
  TrackerTask,
  TrackerProject,
  TrackerStatus,
  TrackerPriority,
  TrackerUser,
  TrackerLabel,
  StatusCategory,
  PriorityLevel,
} from './types';

/**
 * @fileoverview Field mapping utilities for cross-platform data transformation.
 * Provides bidirectional mapping between tracker-specific formats and universal models.
 * @packageDocumentation
 */

/**
 * Field mapping direction
 */
export type MappingDirection = 'inbound' | 'outbound' | 'bidirectional';

/**
 * Transform function type
 */
export type TransformFunction = (
  value: unknown,
  context: TransformContext
) => unknown;

/**
 * Transform context with additional data
 */
export interface TransformContext {
  /** Source tracker provider */
  sourceProvider: string;
  /** Target tracker provider */
  targetProvider: string;
  /** Project statuses for status mapping */
  statuses?: TrackerStatus[];
  /** Project members for user mapping */
  members?: TrackerUser[];
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Field mapping configuration
 */
export interface FieldMappingConfig {
  /** Source field path (dot notation) */
  sourceField: string;
  /** Target field path (dot notation) */
  targetField: string;
  /** Transform type */
  transform?:
    | 'direct'
    | 'date'
    | 'status'
    | 'priority'
    | 'user'
    | 'users'
    | 'labels'
    | 'markdown_to_html'
    | 'html_to_markdown'
    | 'custom';
  /** Custom transform function name */
  customTransform?: string;
  /** Default value if source is null/undefined */
  defaultValue?: unknown;
  /** Whether this field is required */
  required?: boolean;
  /** Mapping direction */
  direction?: MappingDirection;
}

/**
 * Status mapping table
 */
export interface StatusMapping {
  /** Source status name/ID */
  source: string;
  /** Target status category */
  category: StatusCategory;
  /** Target status name (optional override) */
  targetName?: string;
}

/**
 * Priority mapping table
 */
export interface PriorityMapping {
  /** Source priority value */
  source: string | number;
  /** Target priority level (0-4) */
  level: PriorityLevel;
  /** Target priority name */
  name: string;
}

/**
 * Built-in transform functions
 */
const TRANSFORMS: Record<string, TransformFunction> = {
  /**
   * Direct copy without transformation
   */
  direct: (value) => value,

  /**
   * Parse date from various formats
   */
  date: (value) => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const date = new Date(value as string | number);
    return isNaN(date.getTime()) ? undefined : date;
  },

  /**
   * Parse Unix timestamp (milliseconds)
   */
  unix_ms: (value) => {
    if (!value) return undefined;
    const ts = typeof value === 'string' ? parseInt(value, 10) : (value as number);
    return new Date(ts);
  },

  /**
   * Parse Unix timestamp (seconds)
   */
  unix_s: (value) => {
    if (!value) return undefined;
    const ts = typeof value === 'string' ? parseInt(value, 10) : (value as number);
    return new Date(ts * 1000);
  },

  /**
   * Convert markdown to HTML (basic)
   */
  markdown_to_html: (value) => {
    if (!value || typeof value !== 'string') return value;
    // Basic markdown conversion
    return value
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  },

  /**
   * Convert HTML to markdown (basic)
   */
  html_to_markdown: (value) => {
    if (!value || typeof value !== 'string') return value;
    // Basic HTML to markdown conversion
    return value
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '');
  },
};

/**
 * Field mapper for cross-platform data transformation.
 *
 * @example
 * ```typescript
 * const mapper = new FieldMapper({
 *   statusMappings: [
 *     { source: 'Backlog', category: 'backlog' },
 *     { source: 'In Progress', category: 'in_progress' },
 *     { source: 'Done', category: 'done' },
 *   ],
 *   priorityMappings: [
 *     { source: 0, level: 0, name: 'None' },
 *     { source: 1, level: 1, name: 'Low' },
 *     { source: 4, level: 4, name: 'Urgent' },
 *   ],
 * });
 *
 * const universalTask = mapper.mapToUniversal(linearIssue, 'linear');
 * ```
 */
export class FieldMapper {
  private statusMappings: Map<string, StatusMapping>;
  private priorityMappings: Map<string | number, PriorityMapping>;
  private customTransforms: Map<string, TransformFunction>;

  /**
   * Creates a new field mapper.
   * @param config - Mapping configuration
   */
  constructor(config?: {
    statusMappings?: StatusMapping[];
    priorityMappings?: PriorityMapping[];
    customTransforms?: Record<string, TransformFunction>;
  }) {
    this.statusMappings = new Map();
    this.priorityMappings = new Map();
    this.customTransforms = new Map();

    if (config?.statusMappings) {
      for (const mapping of config.statusMappings) {
        this.statusMappings.set(mapping.source.toLowerCase(), mapping);
      }
    }

    if (config?.priorityMappings) {
      for (const mapping of config.priorityMappings) {
        this.priorityMappings.set(mapping.source, mapping);
      }
    }

    if (config?.customTransforms) {
      for (const [name, fn] of Object.entries(config.customTransforms)) {
        this.customTransforms.set(name, fn);
      }
    }
  }

  /**
   * Get a value from an object using dot notation path.
   * @param obj - Source object
   * @param path - Dot notation path (e.g., 'user.name')
   * @returns Value at path or undefined
   */
  getPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null) return undefined;

      // Handle array indexing (e.g., 'items[0]')
      const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Set a value on an object using dot notation path.
   * @param obj - Target object
   * @param path - Dot notation path
   * @param value - Value to set
   */
  setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        // Create object or array based on next part
        const nextPart = parts[i + 1];
        current[part] = /^\d+$/.test(nextPart) ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  }

  /**
   * Apply a transform to a value.
   * @param value - Value to transform
   * @param transform - Transform type
   * @param context - Transform context
   * @returns Transformed value
   */
  applyTransform(
    value: unknown,
    transform: string,
    context: TransformContext
  ): unknown {
    const transformFn =
      TRANSFORMS[transform] || this.customTransforms.get(transform);

    if (!transformFn) {
      throw new Error(`Unknown transform: ${transform}`);
    }

    return transformFn(value, context);
  }

  /**
   * Map a status to the universal format.
   * @param status - Source status (name or object)
   * @param context - Transform context
   * @returns Universal status
   */
  mapStatus(status: unknown, context: TransformContext): TrackerStatus | undefined {
    if (!status) return undefined;

    const statusName =
      typeof status === 'string'
        ? status
        : (status as { name?: string }).name || String(status);

    const mapping = this.statusMappings.get(statusName.toLowerCase());

    return {
      id: typeof status === 'object' ? ((status as { id?: string }).id || statusName) : statusName,
      name: mapping?.targetName || statusName,
      category: mapping?.category || 'todo',
    };
  }

  /**
   * Map a priority to the universal format.
   * @param priority - Source priority (number or object)
   * @param context - Transform context
   * @returns Universal priority
   */
  mapPriority(
    priority: unknown,
    context: TransformContext
  ): TrackerPriority | undefined {
    if (priority == null) return undefined;

    const priorityValue =
      typeof priority === 'object'
        ? (priority as { id?: number; level?: number }).id ??
          (priority as { level?: number }).level
        : priority;

    const mapping = this.priorityMappings.get(priorityValue as string | number);

    if (mapping) {
      return {
        level: mapping.level,
        name: mapping.name,
      };
    }

    // Default mapping for numeric priorities
    if (typeof priorityValue === 'number') {
      const level = Math.min(4, Math.max(0, priorityValue)) as PriorityLevel;
      return {
        level,
        name: ['None', 'Low', 'Medium', 'High', 'Urgent'][level],
      };
    }

    return undefined;
  }

  /**
   * Map a user to the universal format.
   * @param user - Source user object
   * @param context - Transform context
   * @returns Universal user
   */
  mapUser(user: unknown, context: TransformContext): TrackerUser | undefined {
    if (!user || typeof user !== 'object') return undefined;

    const u = user as Record<string, unknown>;
    return {
      id: String(u.id || u.gid || ''),
      externalId: String(u.id || u.gid || ''),
      name: String(u.name || u.displayName || u.display_name || 'Unknown'),
      email: u.email as string | undefined,
      avatarUrl: (u.avatarUrl || u.avatar_url || u.photo) as string | undefined,
    };
  }

  /**
   * Map labels to the universal format.
   * @param labels - Source labels array
   * @param context - Transform context
   * @returns Universal labels array
   */
  mapLabels(labels: unknown, context: TransformContext): TrackerLabel[] {
    if (!Array.isArray(labels)) return [];

    return labels.map((label) => {
      if (typeof label === 'string') {
        return { id: label, name: label };
      }
      const l = label as Record<string, unknown>;
      return {
        id: String(l.id || l.gid || ''),
        name: String(l.name || l.title || ''),
        color: l.color as string | undefined,
      };
    });
  }

  /**
   * Map a tracker-specific task to the universal format.
   * @param task - Tracker-specific task object
   * @param provider - Source tracker provider
   * @param mappings - Field mappings to apply
   * @param context - Additional context
   * @returns Universal task
   */
  mapToUniversal(
    task: Record<string, unknown>,
    provider: string,
    mappings: FieldMappingConfig[],
    context?: Partial<TransformContext>
  ): Partial<TrackerTask> {
    const result: Record<string, unknown> = {
      provider,
    };

    const transformContext: TransformContext = {
      sourceProvider: provider,
      targetProvider: 'universal',
      ...context,
    };

    for (const mapping of mappings) {
      if (mapping.direction === 'outbound') continue;

      let value = this.getPath(task, mapping.sourceField);

      if (value === undefined && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }

      if (value === undefined && mapping.required) {
        throw new Error(`Required field missing: ${mapping.sourceField}`);
      }

      if (value !== undefined && mapping.transform) {
        switch (mapping.transform) {
          case 'status':
            value = this.mapStatus(value, transformContext);
            break;
          case 'priority':
            value = this.mapPriority(value, transformContext);
            break;
          case 'user':
            value = this.mapUser(value, transformContext);
            break;
          case 'users':
            value = Array.isArray(value)
              ? value.map((u) => this.mapUser(u, transformContext)).filter(Boolean)
              : [];
            break;
          case 'labels':
            value = this.mapLabels(value, transformContext);
            break;
          default:
            value = this.applyTransform(value, mapping.transform, transformContext);
        }
      }

      if (value !== undefined) {
        this.setPath(result, mapping.targetField, value);
      }
    }

    return result as Partial<TrackerTask>;
  }

  /**
   * Map a universal task to tracker-specific format.
   * @param task - Universal task
   * @param provider - Target tracker provider
   * @param mappings - Field mappings to apply
   * @param context - Additional context
   * @returns Tracker-specific task object
   */
  mapFromUniversal(
    task: Partial<TrackerTask>,
    provider: string,
    mappings: FieldMappingConfig[],
    context?: Partial<TransformContext>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    const transformContext: TransformContext = {
      sourceProvider: 'universal',
      targetProvider: provider,
      ...context,
    };

    for (const mapping of mappings) {
      if (mapping.direction === 'inbound') continue;

      // Swap source and target for outbound mapping
      let value = this.getPath(task as Record<string, unknown>, mapping.targetField);

      if (value === undefined && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }

      if (value !== undefined && mapping.transform) {
        value = this.applyTransform(value, mapping.transform, transformContext);
      }

      if (value !== undefined) {
        this.setPath(result, mapping.sourceField, value);
      }
    }

    return result;
  }

  /**
   * Add a custom transform function.
   * @param name - Transform name
   * @param fn - Transform function
   */
  addTransform(name: string, fn: TransformFunction): void {
    this.customTransforms.set(name, fn);
  }

  /**
   * Add status mappings.
   * @param mappings - Status mappings to add
   */
  addStatusMappings(mappings: StatusMapping[]): void {
    for (const mapping of mappings) {
      this.statusMappings.set(mapping.source.toLowerCase(), mapping);
    }
  }

  /**
   * Add priority mappings.
   * @param mappings - Priority mappings to add
   */
  addPriorityMappings(mappings: PriorityMapping[]): void {
    for (const mapping of mappings) {
      this.priorityMappings.set(mapping.source, mapping);
    }
  }
}
