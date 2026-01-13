/**
 * @fileoverview Audit logging for security and compliance
 * @module @relay/logger/audit
 */

import type { AuditEntry, AuditEventType, LogOutput } from './types.js';
import { logger } from './logger.js';

// ============================================================================
// Audit Logger Configuration
// ============================================================================

/** Audit logger configuration */
export interface AuditLoggerConfig {
  /** Service name */
  service: string;
  /** Custom output function */
  output?: LogOutput;
  /** Whether to also log to standard logger */
  echoToLogger?: boolean;
}

const DEFAULT_AUDIT_CONFIG: AuditLoggerConfig = {
  service: process.env['SERVICE_NAME'] ?? 'relay-service',
  echoToLogger: true,
};

let auditConfig: AuditLoggerConfig = { ...DEFAULT_AUDIT_CONFIG };

/**
 * Configure the audit logger.
 * @param config - Partial configuration to merge
 */
export function configureAuditLogger(config: Partial<AuditLoggerConfig>): void {
  auditConfig = { ...auditConfig, ...config };
}

// ============================================================================
// Audit Logger Class
// ============================================================================

/**
 * Audit logger for security-sensitive events.
 *
 * @example
 * ```typescript
 * const audit = new AuditLogger();
 *
 * // Log a successful login
 * audit.log('user.login', {
 *   success: true,
 *   actorId: user.id,
 *   actorEmail: user.email,
 *   actorIp: request.ip,
 * });
 *
 * // Log a failed permission check
 * audit.log('resource.read', {
 *   success: false,
 *   actorId: user.id,
 *   resourceType: 'document',
 *   resourceId: 'doc-123',
 *   details: { reason: 'insufficient permissions' },
 * });
 * ```
 */
export class AuditLogger {
  private requestId?: string;

  /**
   * Create a new AuditLogger instance.
   * @param requestId - Optional request ID for correlation
   */
  constructor(requestId?: string) {
    this.requestId = requestId;
  }

  /**
   * Set the request ID for correlation.
   * @param requestId - Request ID
   * @returns This logger for chaining
   */
  setRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  /**
   * Log an audit event.
   * @param event - Event type
   * @param data - Event data
   */
  log(
    event: AuditEventType,
    data: Omit<AuditEntry, 'timestamp' | 'event'>
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      event,
      requestId: this.requestId ?? data.requestId,
      ...data,
    };

    // Output to custom transport if configured
    if (auditConfig.output) {
      auditConfig.output({
        timestamp: entry.timestamp,
        level: entry.success ? 'info' : 'warn',
        message: `Audit: ${event}`,
        service: auditConfig.service,
        requestId: entry.requestId,
        userId: entry.actorId,
        context: {
          audit: entry,
        },
      });
    }

    // Echo to standard logger if enabled
    if (auditConfig.echoToLogger) {
      const level = entry.success ? 'info' : 'warn';
      logger[level](`Audit: ${event}`, { audit: entry });
    }
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Log a user login event.
   * @param data - Login data
   */
  userLogin(data: {
    success: boolean;
    actorId?: string;
    actorEmail: string;
    actorIp?: string;
    authMethod?: string;
    mfaUsed?: boolean;
    error?: string;
  }): void {
    this.log('user.login', {
      ...data,
      details: {
        authMethod: data.authMethod,
        mfaUsed: data.mfaUsed,
        error: data.error,
      },
    });
  }

  /**
   * Log a user logout event.
   * @param data - Logout data
   */
  userLogout(data: {
    actorId: string;
    actorEmail?: string;
    actorIp?: string;
    reason?: 'user_initiated' | 'session_expired' | 'forced';
  }): void {
    this.log('user.logout', {
      ...data,
      success: true,
      details: { reason: data.reason ?? 'user_initiated' },
    });
  }

  /**
   * Log a resource access event.
   * @param data - Access data
   */
  resourceAccess(data: {
    action: 'create' | 'read' | 'update' | 'delete' | 'share';
    success: boolean;
    actorId: string;
    resourceType: string;
    resourceId: string;
    organizationId?: string;
    details?: Record<string, unknown>;
  }): void {
    const eventMap: Record<string, AuditEventType> = {
      create: 'resource.create',
      read: 'resource.read',
      update: 'resource.update',
      delete: 'resource.delete',
      share: 'resource.share',
    };

    this.log(eventMap[data.action] as AuditEventType, data);
  }

  /**
   * Log an organization member event.
   * @param data - Member event data
   */
  orgMember(data: {
    action: 'add' | 'remove' | 'role_change';
    success: boolean;
    actorId: string;
    organizationId: string;
    targetUserId: string;
    targetEmail?: string;
    oldRole?: string;
    newRole?: string;
  }): void {
    const eventMap: Record<string, AuditEventType> = {
      add: 'org.member_add',
      remove: 'org.member_remove',
      role_change: 'org.member_role_change',
    };

    this.log(eventMap[data.action] as AuditEventType, {
      ...data,
      resourceType: 'org_member',
      resourceId: data.targetUserId,
      details: {
        targetEmail: data.targetEmail,
        oldRole: data.oldRole,
        newRole: data.newRole,
      },
    });
  }

  /**
   * Log an API key event.
   * @param data - API key event data
   */
  apiKey(data: {
    action: 'create' | 'revoke';
    success: boolean;
    actorId: string;
    keyId: string;
    keyName?: string;
    organizationId?: string;
  }): void {
    const eventMap: Record<string, AuditEventType> = {
      create: 'api.key_create',
      revoke: 'api.key_revoke',
    };

    this.log(eventMap[data.action] as AuditEventType, {
      ...data,
      resourceType: 'api_key',
      resourceId: data.keyId,
      details: { keyName: data.keyName },
    });
  }

  /**
   * Log a rate limit event.
   * @param data - Rate limit data
   */
  rateLimit(data: {
    actorId?: string;
    actorIp?: string;
    endpoint: string;
    limit: number;
    current: number;
  }): void {
    this.log('api.rate_limit', {
      ...data,
      success: false,
      resourceType: 'rate_limit',
      resourceId: data.endpoint,
      details: {
        limit: data.limit,
        current: data.current,
      },
    });
  }

  /**
   * Log an admin action.
   * @param data - Admin action data
   */
  adminAction(data: {
    action: 'user_suspend' | 'user_restore' | 'config_change';
    success: boolean;
    actorId: string;
    targetUserId?: string;
    configKey?: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }): void {
    const eventMap: Record<string, AuditEventType> = {
      user_suspend: 'admin.user_suspend',
      user_restore: 'admin.user_restore',
      config_change: 'admin.config_change',
    };

    this.log(eventMap[data.action] as AuditEventType, {
      ...data,
      resourceType: data.targetUserId ? 'user' : 'config',
      resourceId: data.targetUserId ?? data.configKey ?? 'unknown',
      details: {
        reason: data.reason,
        oldValue: data.oldValue,
        newValue: data.newValue,
      },
    });
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default audit logger instance.
 */
export const auditLogger = new AuditLogger();

/**
 * Create an audit logger with request context.
 * @param requestId - Request ID for correlation
 * @returns New AuditLogger instance
 */
export function createAuditLogger(requestId?: string): AuditLogger {
  return new AuditLogger(requestId);
}
