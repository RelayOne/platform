/**
 * @fileoverview Organization and team types for the Relay Platform
 * @module @relay/platform/types/organization
 */

import type { UserRole } from './user';

/**
 * Organization subscription plan tiers
 */
export enum PlanTier {
  /** Free tier with limited features */
  FREE = 'free',
  /** Starter plan for small teams */
  STARTER = 'starter',
  /** Professional plan for growing teams */
  PRO = 'pro',
  /** Business plan for larger organizations */
  BUSINESS = 'business',
  /** Enterprise plan with custom features */
  ENTERPRISE = 'enterprise',
}

/**
 * Subscription status
 */
export enum SubscriptionStatus {
  /** Active subscription */
  ACTIVE = 'active',
  /** Trial period */
  TRIALING = 'trialing',
  /** Past due payment */
  PAST_DUE = 'past_due',
  /** Subscription canceled */
  CANCELED = 'canceled',
  /** Subscription paused */
  PAUSED = 'paused',
}

/**
 * Organization role (different from global UserRole)
 */
export enum OrganizationRole {
  /** Organization owner with full control */
  OWNER = 'owner',
  /** Organization administrator */
  ADMIN = 'admin',
  /** Regular member */
  MEMBER = 'member',
  /** View-only access */
  VIEWER = 'viewer',
  /** External billing contact */
  BILLING = 'billing',
}

/**
 * Project role within an organization
 */
export enum ProjectRole {
  /** Project owner */
  OWNER = 'owner',
  /** Project lead/manager */
  LEAD = 'lead',
  /** Active contributor */
  CONTRIBUTOR = 'contributor',
  /** Review-only access */
  REVIEWER = 'reviewer',
  /** View-only access */
  VIEWER = 'viewer',
}

/**
 * Plan quota limits
 */
export interface PlanQuotas {
  /** Maximum team members */
  maxMembers: number;
  /** Maximum projects */
  maxProjects: number;
  /** Maximum API requests per month */
  maxApiRequests: number;
  /** Maximum storage in bytes */
  maxStorageBytes: number;
  /** App-specific quotas */
  apps: {
    /** Verity document scans per month */
    verityScans?: number;
    /** NoteMan meeting minutes per month */
    notemanMinutes?: number;
    /** ShipCheck analysis runs per month */
    shipcheckAnalyses?: number;
  };
}

/**
 * Default quotas per plan tier
 */
export const DEFAULT_QUOTAS: Record<PlanTier, PlanQuotas> = {
  [PlanTier.FREE]: {
    maxMembers: 3,
    maxProjects: 2,
    maxApiRequests: 1000,
    maxStorageBytes: 1024 * 1024 * 100, // 100MB
    apps: {
      verityScans: 50,
      notemanMinutes: 300,
      shipcheckAnalyses: 100,
    },
  },
  [PlanTier.STARTER]: {
    maxMembers: 10,
    maxProjects: 10,
    maxApiRequests: 10000,
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    apps: {
      verityScans: 500,
      notemanMinutes: 3000,
      shipcheckAnalyses: 1000,
    },
  },
  [PlanTier.PRO]: {
    maxMembers: 50,
    maxProjects: 50,
    maxApiRequests: 100000,
    maxStorageBytes: 1024 * 1024 * 1024 * 10, // 10GB
    apps: {
      verityScans: 5000,
      notemanMinutes: 30000,
      shipcheckAnalyses: 10000,
    },
  },
  [PlanTier.BUSINESS]: {
    maxMembers: 200,
    maxProjects: 200,
    maxApiRequests: 500000,
    maxStorageBytes: 1024 * 1024 * 1024 * 100, // 100GB
    apps: {
      verityScans: 50000,
      notemanMinutes: 300000,
      shipcheckAnalyses: 100000,
    },
  },
  [PlanTier.ENTERPRISE]: {
    maxMembers: -1, // Unlimited
    maxProjects: -1,
    maxApiRequests: -1,
    maxStorageBytes: -1,
    apps: {
      verityScans: -1,
      notemanMinutes: -1,
      shipcheckAnalyses: -1,
    },
  },
};

/**
 * Current usage statistics
 */
export interface UsageStats {
  /** Current member count */
  memberCount: number;
  /** Current project count */
  projectCount: number;
  /** API requests this period */
  apiRequests: number;
  /** Storage used in bytes */
  storageUsed: number;
  /** App-specific usage */
  apps: {
    verityScans?: number;
    notemanMinutes?: number;
    shipcheckAnalyses?: number;
  };
  /** Usage period start */
  periodStart: Date;
  /** Usage period end */
  periodEnd: Date;
}

/**
 * Billing information
 */
export interface BillingInfo {
  /** Stripe customer ID */
  stripeCustomerId?: string;
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  /** RevenueCat customer ID (mobile) */
  revenuecatCustomerId?: string;
  /** Billing email */
  billingEmail?: string;
  /** Company name for invoices */
  companyName?: string;
  /** Tax ID (VAT, EIN, etc.) */
  taxId?: string;
  /** Billing address */
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

/**
 * Organization settings
 */
export interface OrganizationSettings {
  /** Default timezone */
  timezone: string;
  /** Default locale */
  locale: string;
  /** Allowed email domains for joining */
  allowedDomains?: string[];
  /** Require 2FA for all members */
  require2FA: boolean;
  /** SSO configuration ID */
  ssoConfigId?: string;
  /** Enforce SSO-only login */
  enforceSso: boolean;
  /** Audit log retention days */
  auditLogRetentionDays: number;
  /** Custom branding */
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    faviconUrl?: string;
  };
  /** Feature flags */
  features: Record<string, boolean>;
}

/**
 * Organization entity
 */
export interface Organization {
  /** Unique identifier */
  id: string;
  /** URL-friendly slug */
  slug: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Website URL */
  websiteUrl?: string;
  /** Subscription plan */
  plan: PlanTier;
  /** Subscription status */
  subscriptionStatus: SubscriptionStatus;
  /** Plan quotas */
  quotas: PlanQuotas;
  /** Current usage */
  usage: UsageStats;
  /** Billing information */
  billing?: BillingInfo;
  /** Organization settings */
  settings: OrganizationSettings;
  /** Owner user ID */
  ownerId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Organization membership
 */
export interface OrganizationMembership {
  /** Unique identifier */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** User ID */
  userId: string;
  /** Role within organization */
  role: OrganizationRole;
  /** Custom title/position */
  title?: string;
  /** When user joined */
  joinedAt: Date;
  /** Who invited this user */
  invitedBy?: string;
  /** Custom permissions (overrides) */
  permissions?: string[];
}

/**
 * Team within an organization
 */
export interface Team {
  /** Unique identifier */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** Team name */
  name: string;
  /** Team slug */
  slug: string;
  /** Description */
  description?: string;
  /** Team avatar URL */
  avatarUrl?: string;
  /** Team visibility */
  visibility: 'public' | 'private';
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Team membership
 */
export interface TeamMembership {
  /** Unique identifier */
  id: string;
  /** Team ID */
  teamId: string;
  /** User ID */
  userId: string;
  /** Role within team */
  role: 'lead' | 'member';
  /** When joined */
  joinedAt: Date;
}

/**
 * Project within an organization
 */
export interface Project {
  /** Unique identifier */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** Team ID (optional) */
  teamId?: string;
  /** Project name */
  name: string;
  /** Project slug */
  slug: string;
  /** Description */
  description?: string;
  /** Project visibility */
  visibility: 'public' | 'private' | 'internal';
  /** Project status */
  status: 'active' | 'archived' | 'deleted';
  /** Project color for UI */
  color?: string;
  /** Project icon */
  icon?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Project membership
 */
export interface ProjectMembership {
  /** Unique identifier */
  id: string;
  /** Project ID */
  projectId: string;
  /** User ID */
  userId: string;
  /** Role within project */
  role: ProjectRole;
  /** When joined */
  joinedAt: Date;
}

/**
 * Check if organization has quota remaining
 */
export function hasQuotaRemaining(
  org: Organization,
  quotaType: keyof PlanQuotas | `apps.${string}`,
): boolean {
  const quota = quotaType.startsWith('apps.')
    ? (org.quotas.apps as Record<string, number | undefined>)[quotaType.slice(5)]
    : (org.quotas as Record<string, unknown>)[quotaType];

  if (quota === -1 || quota === undefined) {
    return true; // Unlimited or not tracked
  }

  const usage = quotaType.startsWith('apps.')
    ? (org.usage.apps as Record<string, number | undefined>)[quotaType.slice(5)]
    : (org.usage as Record<string, unknown>)[quotaType];

  return (usage as number) < (quota as number);
}

/**
 * Check if user has organization admin access
 */
export function isOrgAdmin(membership: OrganizationMembership): boolean {
  return membership.role === OrganizationRole.OWNER || membership.role === OrganizationRole.ADMIN;
}
