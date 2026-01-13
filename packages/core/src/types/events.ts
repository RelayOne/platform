/**
 * @fileoverview Cross-app event types for the Relay Platform
 * @module @relay/platform/types/events
 */

import { RelayApp } from './rbac';

/**
 * Base event structure
 */
export interface BaseEvent {
  /** Unique event identifier */
  id: string;
  /** Event type (e.g., "user.created", "document.verified") */
  type: string;
  /** Source application */
  source: RelayApp;
  /** Event timestamp */
  timestamp: Date;
  /** Organization ID (if applicable) */
  organizationId?: string;
  /** Project ID (if applicable) */
  projectId?: string;
  /** User ID who triggered the event */
  userId?: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** Event schema version */
  version: number;
  /** Event payload */
  payload: unknown;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Authentication event types
 */
export enum AuthEventType {
  /** User logged in via platform SSO */
  PLATFORM_LOGIN = 'auth.platform_login',
  /** User logged out */
  PLATFORM_LOGOUT = 'auth.platform_logout',
  /** Session was refreshed */
  SESSION_REFRESH = 'auth.session_refresh',
  /** MFA status changed */
  MFA_STATUS_CHANGED = 'auth.mfa_status_changed',
  /** User permissions updated */
  PERMISSIONS_UPDATED = 'auth.permissions_updated',
  /** Security invalidation (forced logout) */
  SECURITY_INVALIDATION = 'auth.security_invalidation',
  /** Device change detected */
  DEVICE_CHANGE = 'auth.device_change',
}

/**
 * Logout type
 */
export enum LogoutType {
  /** User-initiated logout */
  USER = 'user',
  /** Session expired */
  EXPIRED = 'expired',
  /** Admin forced logout */
  ADMIN = 'admin',
  /** Security-related logout */
  SECURITY = 'security',
  /** Logout from all devices */
  ALL_DEVICES = 'all_devices',
}

/**
 * Permission changes in an update event
 */
export interface PermissionChanges {
  /** Permissions added */
  added: string[];
  /** Permissions removed */
  removed: string[];
  /** Roles added */
  rolesAdded: string[];
  /** Roles removed */
  rolesRemoved: string[];
}

/**
 * Auth event payloads
 */
export interface AuthEventPayloads {
  [AuthEventType.PLATFORM_LOGIN]: {
    sessionId: string;
    userId: string;
    email: string;
    organizationId?: string;
    apps: RelayApp[];
    loginMethod: 'password' | 'oauth' | 'sso' | 'magic_link';
    mfaUsed: boolean;
    ipAddress?: string;
    userAgent?: string;
  };
  [AuthEventType.PLATFORM_LOGOUT]: {
    sessionId: string;
    userId: string;
    logoutType: LogoutType;
    reason?: string;
    affectedApps: RelayApp[];
  };
  [AuthEventType.SESSION_REFRESH]: {
    sessionId: string;
    userId: string;
    newExpiresAt: string;
  };
  [AuthEventType.MFA_STATUS_CHANGED]: {
    userId: string;
    enabled: boolean;
    method?: string;
  };
  [AuthEventType.PERMISSIONS_UPDATED]: {
    userId: string;
    organizationId: string;
    changes: PermissionChanges;
    updatedBy: string;
  };
  [AuthEventType.SECURITY_INVALIDATION]: {
    userId: string;
    reason: 'password_change' | 'security_breach' | 'admin_action' | 'suspicious_activity';
    affectedSessions: string[];
  };
  [AuthEventType.DEVICE_CHANGE]: {
    userId: string;
    sessionId: string;
    deviceId: string;
    deviceType: 'web' | 'mobile' | 'desktop';
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Typed auth event
 */
export interface AuthEvent<T extends AuthEventType = AuthEventType> extends BaseEvent {
  type: T;
  source: RelayApp.SHARED;
  payload: AuthEventPayloads[T];
}

/**
 * Document event types (Verity)
 */
export enum DocumentEventType {
  DOCUMENT_CREATED = 'verity.document.created',
  DOCUMENT_VERIFIED = 'verity.document.verified',
  DOCUMENT_REMEDIATED = 'verity.document.remediated',
  ASSERTION_EXTRACTED = 'verity.assertion.extracted',
  PROPAGATION_DETECTED = 'verity.propagation.detected',
}

/**
 * Meeting event types (NoteMan)
 */
export enum MeetingEventType {
  MEETING_CREATED = 'noteman.meeting.created',
  MEETING_STARTED = 'noteman.meeting.started',
  MEETING_ENDED = 'noteman.meeting.ended',
  TRANSCRIPT_COMPLETED = 'noteman.transcript.completed',
  SUMMARY_GENERATED = 'noteman.summary.generated',
  ACTION_ITEM_CREATED = 'noteman.action_item.created',
  DECISION_RECORDED = 'noteman.decision.recorded',
}

/**
 * Repository event types (ShipCheck)
 */
export enum RepositoryEventType {
  REPOSITORY_CONNECTED = 'shipcheck.repository.connected',
  ANALYSIS_STARTED = 'shipcheck.analysis.started',
  ANALYSIS_COMPLETED = 'shipcheck.analysis.completed',
  FINDING_CREATED = 'shipcheck.finding.created',
  PR_ANALYZED = 'shipcheck.pr.analyzed',
  PIPELINE_RUN = 'shipcheck.pipeline.run',
}

/**
 * Cross-app workflow event types
 */
export enum WorkflowEventType {
  /** Meeting notes sent to Verity for verification */
  VERIFY_MEETING_NOTES = 'workflow.verify_meeting_notes',
  /** Decision linked to code in ShipCheck */
  LINK_CODE_DECISION = 'workflow.link_code_decision',
  /** Documentation sent to Verity for verification */
  VERIFY_DOCUMENTATION = 'workflow.verify_documentation',
  /** Finding discussion created in NoteMan */
  CREATE_FINDING_DISCUSSION = 'workflow.create_finding_discussion',
  /** Action items synced to ShipCheck tasks */
  SYNC_ACTION_ITEMS = 'workflow.sync_action_items',
}

/**
 * All event types union
 */
export type EventType =
  | AuthEventType
  | DocumentEventType
  | MeetingEventType
  | RepositoryEventType
  | WorkflowEventType;

/**
 * Event topic pattern for pub/sub
 * Format: "{app}.{resource}.{action}" with wildcards (* = single segment, # = multiple)
 */
export type EventTopic = string;

/**
 * Event handler function type
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void>;

/**
 * Event subscription
 */
export interface EventSubscription {
  /** Subscription ID */
  id: string;
  /** Topic pattern */
  topic: EventTopic;
  /** Handler function */
  handler: EventHandler;
  /** Unsubscribe function */
  unsubscribe: () => void;
}

/**
 * Create an auth event
 */
export function createAuthEvent<T extends AuthEventType>(
  type: T,
  payload: AuthEventPayloads[T],
  options: {
    organizationId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): AuthEvent<T> {
  return {
    id: crypto.randomUUID(),
    type,
    source: RelayApp.SHARED,
    timestamp: new Date(),
    version: 1,
    payload,
    ...options,
  };
}

/**
 * Check if topic matches a pattern
 * Supports wildcards: * (single segment), # (zero or more segments)
 */
export function topicMatches(pattern: EventTopic, topic: EventTopic): boolean {
  const patternParts = pattern.split('.');
  const topicParts = topic.split('.');

  let pi = 0;
  let ti = 0;

  while (pi < patternParts.length && ti < topicParts.length) {
    const patternPart = patternParts[pi];

    if (patternPart === '#') {
      // # matches zero or more segments
      if (pi === patternParts.length - 1) {
        return true; // # at end matches everything
      }
      // Try matching remaining pattern at each position
      for (let i = ti; i <= topicParts.length; i++) {
        if (topicMatches(patternParts.slice(pi + 1).join('.'), topicParts.slice(i).join('.'))) {
          return true;
        }
      }
      return false;
    }

    if (patternPart !== '*' && patternPart !== topicParts[ti]) {
      return false;
    }

    pi++;
    ti++;
  }

  // Check remaining pattern for trailing #
  while (pi < patternParts.length && patternParts[pi] === '#') {
    pi++;
  }

  return pi === patternParts.length && ti === topicParts.length;
}

/**
 * Parse event type into topic
 */
export function eventTypeToTopic(eventType: EventType): EventTopic {
  return eventType.replace(/_/g, '.');
}
