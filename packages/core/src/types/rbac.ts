/**
 * @fileoverview Role-Based Access Control types for the Relay Platform
 * @module @relay/platform/types/rbac
 */

/**
 * Relay Platform applications
 */
export enum RelayApp {
  /** Shared resources across all apps */
  SHARED = 'shared',
  /** Verity - Document verification platform */
  VERITY = 'verity',
  /** NoteMan - Meeting intelligence platform */
  NOTEMAN = 'noteman',
  /** ShipCheck - Code verification platform */
  SHIPCHECK = 'shipcheck',
}

/**
 * Resource types across all applications
 */
export enum ResourceType {
  // Shared resources
  USER = 'user',
  TEAM = 'team',
  ORGANIZATION = 'organization',
  PROJECT = 'project',
  INTEGRATION = 'integration',
  API_KEY = 'api_key',
  AUDIT_LOG = 'audit_log',
  SETTINGS = 'settings',
  NOTIFICATION = 'notification',
  WEBHOOK = 'webhook',
  BILLING = 'billing',

  // Verity resources
  DOCUMENT = 'document',
  ASSERTION = 'assertion',
  VERIFICATION = 'verification',
  REMEDIATION = 'remediation',
  KNOWLEDGE = 'knowledge',
  PROPAGATION = 'propagation',

  // NoteMan resources
  MEETING = 'meeting',
  TRANSCRIPT = 'transcript',
  MEETING_TASK = 'meeting_task',
  MEETING_SUMMARY = 'meeting_summary',
  WORKSPACE = 'workspace',
  CALENDAR = 'calendar',
  NOTE = 'note',
  DECISION = 'decision',

  // ShipCheck resources
  REPOSITORY = 'repository',
  CODE_VERIFICATION = 'code_verification',
  CODE_FINDING = 'code_finding',
  PULL_REQUEST = 'pull_request',
  PIPELINE = 'pipeline',
  AGENT = 'agent',
  ANALYSIS_REPORT = 'analysis_report',
}

/**
 * Actions that can be performed on resources
 */
export enum Action {
  /** Read/view access */
  READ = 'read',
  /** Create new resources */
  CREATE = 'create',
  /** Update existing resources */
  UPDATE = 'update',
  /** Delete resources */
  DELETE = 'delete',
  /** Full management access (implies all other actions) */
  MANAGE = 'manage',
  /** Execute/run (for pipelines, verifications) */
  EXECUTE = 'execute',
  /** Share with others */
  SHARE = 'share',
  /** Export data */
  EXPORT = 'export',
  /** Comment on resources */
  COMMENT = 'comment',
  /** Approve/reject workflows */
  APPROVE = 'approve',
  /** Archive resources */
  ARCHIVE = 'archive',
}

/**
 * Permission string format: "resource:action" or "resource:action:resourceId"
 */
export type PermissionString = `${ResourceType}:${Action}` | `${ResourceType}:${Action}:${string}`;

/**
 * Structured permission
 */
export interface Permission {
  /** Resource type */
  resource: ResourceType;
  /** Action */
  action: Action;
  /** Optional specific resource ID */
  resourceId?: string;
  /** Conditions for permission */
  conditions?: PermissionCondition[];
}

/**
 * Permission condition
 */
export interface PermissionCondition {
  /** Field to check */
  field: string;
  /** Operator */
  operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte';
  /** Value to compare */
  value: unknown;
}

/**
 * Permission set for a user/role
 */
export interface PermissionSet {
  /** Explicit allows */
  allow: PermissionString[];
  /** Explicit denies (take precedence) */
  deny: PermissionString[];
}

/**
 * Role definition
 */
export interface RoleDefinition {
  /** Role identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Application scope */
  app: RelayApp;
  /** Permissions granted */
  permissions: PermissionSet;
  /** Built-in role (cannot be deleted) */
  builtin: boolean;
  /** Priority (higher = more privileged) */
  priority: number;
}

/**
 * Action implications - manage implies all other actions
 */
export const ACTION_IMPLICATIONS: Record<Action, Action[]> = {
  [Action.MANAGE]: [
    Action.READ,
    Action.CREATE,
    Action.UPDATE,
    Action.DELETE,
    Action.EXECUTE,
    Action.SHARE,
    Action.EXPORT,
    Action.COMMENT,
    Action.APPROVE,
    Action.ARCHIVE,
  ],
  [Action.UPDATE]: [Action.READ],
  [Action.DELETE]: [Action.READ],
  [Action.EXECUTE]: [Action.READ],
  [Action.SHARE]: [Action.READ],
  [Action.EXPORT]: [Action.READ],
  [Action.COMMENT]: [Action.READ],
  [Action.APPROVE]: [Action.READ],
  [Action.ARCHIVE]: [Action.READ, Action.UPDATE],
  [Action.READ]: [],
  [Action.CREATE]: [],
};

/**
 * Resource to app mapping
 */
export const RESOURCE_APP_MAP: Record<ResourceType, RelayApp> = {
  // Shared
  [ResourceType.USER]: RelayApp.SHARED,
  [ResourceType.TEAM]: RelayApp.SHARED,
  [ResourceType.ORGANIZATION]: RelayApp.SHARED,
  [ResourceType.PROJECT]: RelayApp.SHARED,
  [ResourceType.INTEGRATION]: RelayApp.SHARED,
  [ResourceType.API_KEY]: RelayApp.SHARED,
  [ResourceType.AUDIT_LOG]: RelayApp.SHARED,
  [ResourceType.SETTINGS]: RelayApp.SHARED,
  [ResourceType.NOTIFICATION]: RelayApp.SHARED,
  [ResourceType.WEBHOOK]: RelayApp.SHARED,
  [ResourceType.BILLING]: RelayApp.SHARED,

  // Verity
  [ResourceType.DOCUMENT]: RelayApp.VERITY,
  [ResourceType.ASSERTION]: RelayApp.VERITY,
  [ResourceType.VERIFICATION]: RelayApp.VERITY,
  [ResourceType.REMEDIATION]: RelayApp.VERITY,
  [ResourceType.KNOWLEDGE]: RelayApp.VERITY,
  [ResourceType.PROPAGATION]: RelayApp.VERITY,

  // NoteMan
  [ResourceType.MEETING]: RelayApp.NOTEMAN,
  [ResourceType.TRANSCRIPT]: RelayApp.NOTEMAN,
  [ResourceType.MEETING_TASK]: RelayApp.NOTEMAN,
  [ResourceType.MEETING_SUMMARY]: RelayApp.NOTEMAN,
  [ResourceType.WORKSPACE]: RelayApp.NOTEMAN,
  [ResourceType.CALENDAR]: RelayApp.NOTEMAN,
  [ResourceType.NOTE]: RelayApp.NOTEMAN,
  [ResourceType.DECISION]: RelayApp.NOTEMAN,

  // ShipCheck
  [ResourceType.REPOSITORY]: RelayApp.SHIPCHECK,
  [ResourceType.CODE_VERIFICATION]: RelayApp.SHIPCHECK,
  [ResourceType.CODE_FINDING]: RelayApp.SHIPCHECK,
  [ResourceType.PULL_REQUEST]: RelayApp.SHIPCHECK,
  [ResourceType.PIPELINE]: RelayApp.SHIPCHECK,
  [ResourceType.AGENT]: RelayApp.SHIPCHECK,
  [ResourceType.ANALYSIS_REPORT]: RelayApp.SHIPCHECK,
};

/**
 * Parse a permission string into a Permission object
 */
export function parsePermission(permissionStr: PermissionString): Permission {
  const parts = permissionStr.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid permission string: ${permissionStr}`);
  }

  const [resourceStr, actionStr, resourceId] = parts;

  const resource = resourceStr as ResourceType;
  const action = actionStr as Action;

  if (!Object.values(ResourceType).includes(resource)) {
    throw new Error(`Invalid resource type: ${resourceStr}`);
  }
  if (!Object.values(Action).includes(action)) {
    throw new Error(`Invalid action: ${actionStr}`);
  }

  return {
    resource,
    action,
    resourceId,
  };
}

/**
 * Format a Permission object into a permission string
 */
export function formatPermission(permission: Permission): PermissionString {
  const base = `${permission.resource}:${permission.action}` as PermissionString;
  if (permission.resourceId) {
    return `${base}:${permission.resourceId}` as PermissionString;
  }
  return base;
}

/**
 * Check if an action is implied by another action
 */
export function actionImplies(action: Action, impliedAction: Action): boolean {
  if (action === impliedAction) return true;
  return ACTION_IMPLICATIONS[action]?.includes(impliedAction) ?? false;
}

/**
 * Check if a permission set allows a specific permission
 */
export function hasPermission(
  permissionSet: PermissionSet,
  resource: ResourceType,
  action: Action,
  resourceId?: string,
): boolean {
  // Check explicit denies first
  for (const denyStr of permissionSet.deny) {
    const deny = parsePermission(denyStr);
    if (deny.resource === resource) {
      if (!deny.resourceId || deny.resourceId === resourceId) {
        if (deny.action === action || actionImplies(deny.action, action)) {
          return false;
        }
      }
    }
  }

  // Check allows
  for (const allowStr of permissionSet.allow) {
    const allow = parsePermission(allowStr);
    // Wildcard resource check
    if (allow.resource === resource || allowStr.startsWith('*:')) {
      if (!allow.resourceId || allow.resourceId === resourceId) {
        if (allow.action === action || actionImplies(allow.action, action)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Merge multiple permission sets
 */
export function mergePermissionSets(...sets: PermissionSet[]): PermissionSet {
  const merged: PermissionSet = {
    allow: [],
    deny: [],
  };

  for (const set of sets) {
    merged.allow.push(...set.allow);
    merged.deny.push(...set.deny);
  }

  // Deduplicate
  merged.allow = [...new Set(merged.allow)];
  merged.deny = [...new Set(merged.deny)];

  return merged;
}
