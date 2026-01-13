/**
 * @fileoverview Cross-app deep linking service for the Relay Platform
 * @module @relay/platform/services/deep-linking
 *
 * Enables secure navigation between Verity, NoteMan, and ShipCheck with
 * preserved authentication context.
 */

import { createHmac } from 'crypto';
import type { RelayApp } from '../types/rbac';

/**
 * Deep link context for cross-app navigation
 */
export interface DeepLinkContext {
  /** Organization ID */
  organizationId?: string;
  /** Team ID */
  teamId?: string;
  /** Project ID */
  projectId?: string;
  /** Resource type */
  resourceType?: string;
  /** Resource ID */
  resourceId?: string;
  /** Additional parameters */
  params?: Record<string, string>;
}

/**
 * Parameters for generating a deep link
 */
export interface GenerateLinkParams {
  /** Target application */
  targetApp: RelayApp;
  /** Target path within the app */
  path: string;
  /** Navigation context */
  context?: DeepLinkContext;
  /** Session ID for auth transfer */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Link expiration in seconds (default: 300 = 5 minutes) */
  expiresIn?: number;
}

/**
 * Generated deep link result
 */
export interface DeepLinkResult {
  /** Full URL to navigate to */
  url: string;
  /** Display-friendly URL (without auth params) */
  displayUrl: string;
  /** Link ID for tracking */
  linkId: string;
  /** Expiration timestamp */
  expiresAt: Date;
}

/**
 * Resolved deep link data
 */
export interface ResolvedDeepLink {
  /** Whether the link is valid */
  valid: boolean;
  /** Target application */
  targetApp?: RelayApp;
  /** Target path */
  path?: string;
  /** Navigation context */
  context?: DeepLinkContext;
  /** Session ID (if auth transfer was included) */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Link ID */
  linkId?: string;
  /** Error message if invalid */
  error?: string;
}

/**
 * App base URLs configuration
 */
export interface AppUrls {
  verity: string;
  noteman: string;
  shipcheck: string;
}

/**
 * Default app URLs (can be overridden via environment)
 */
export const DEFAULT_APP_URLS: AppUrls = {
  verity: process.env['VERITY_URL'] ?? 'https://app.verity.dev',
  noteman: process.env['NOTEMAN_URL'] ?? 'https://app.noteman.dev',
  shipcheck: process.env['SHIPCHECK_URL'] ?? 'https://app.shipcheck.dev',
};

/**
 * Resource type to path mappings per app
 */
export const RESOURCE_PATHS: Record<string, Record<string, string>> = {
  verity: {
    document: '/documents/:id',
    claim: '/claims/:id',
    source: '/sources/:id',
    verification: '/verifications/:id',
  },
  noteman: {
    meeting: '/meetings/:id',
    project: '/projects/:id',
    team: '/teams/:id',
    note: '/notes/:id',
    decision: '/decisions/:id',
  },
  shipcheck: {
    repo: '/repos/:id',
    repository: '/repos/:id',
    finding: '/findings/:id',
    review: '/reviews/:id',
    analysis: '/analyses/:id',
  },
};

/**
 * Deep linking service for cross-app navigation
 */
export class DeepLinkingService {
  private signingKey: string;
  private appUrls: AppUrls;

  /**
   * Create a new deep linking service
   */
  constructor(options: { signingKey?: string; appUrls?: Partial<AppUrls> } = {}) {
    this.signingKey = options.signingKey ?? process.env['DEEP_LINK_SIGNING_KEY'] ?? 'dev-signing-key';
    this.appUrls = { ...DEFAULT_APP_URLS, ...options.appUrls };
  }

  /**
   * Generate a signed deep link
   */
  generateLink(params: GenerateLinkParams): DeepLinkResult {
    const linkId = crypto.randomUUID();
    const expiresIn = params.expiresIn ?? 300; // 5 minutes default
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const expiresTimestamp = Math.floor(expiresAt.getTime() / 1000);

    // Build base URL
    const baseUrl = this.getAppUrl(params.targetApp);
    const url = new URL(params.path, baseUrl);

    // Add deep link parameters
    url.searchParams.set('_rl_id', linkId);
    url.searchParams.set('_rl_exp', expiresTimestamp.toString());

    // Add context if provided
    if (params.context) {
      const contextStr = Buffer.from(JSON.stringify(params.context)).toString('base64url');
      url.searchParams.set('_rl_ctx', contextStr);
    }

    // Add encrypted auth context if provided
    if (params.sessionId || params.userId) {
      const authContext = {
        sid: params.sessionId,
        uid: params.userId,
      };
      const encryptedAuth = this.encryptAuthContext(authContext, linkId);
      url.searchParams.set('_rl_sess', encryptedAuth);
    }

    // Generate signature
    const dataToSign = `${linkId}:${expiresTimestamp}:${params.targetApp}:${params.path}`;
    const signature = this.sign(dataToSign);
    url.searchParams.set('_rl_sig', signature);

    // Create display URL (without sensitive params)
    const displayUrl = new URL(params.path, baseUrl);
    if (params.context?.resourceId) {
      displayUrl.searchParams.set('id', params.context.resourceId);
    }

    return {
      url: url.toString(),
      displayUrl: displayUrl.toString(),
      linkId,
      expiresAt,
    };
  }

  /**
   * Resolve and validate an incoming deep link
   */
  resolveLink(urlString: string): ResolvedDeepLink {
    try {
      const url = new URL(urlString);

      // Extract parameters
      const linkId = url.searchParams.get('_rl_id');
      const expiresStr = url.searchParams.get('_rl_exp');
      const signature = url.searchParams.get('_rl_sig');
      const contextStr = url.searchParams.get('_rl_ctx');
      const authStr = url.searchParams.get('_rl_sess');

      // Validate required params
      if (!linkId || !expiresStr || !signature) {
        return { valid: false, error: 'Missing required deep link parameters' };
      }

      // Check expiration
      const expiresTimestamp = parseInt(expiresStr, 10);
      if (isNaN(expiresTimestamp) || expiresTimestamp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Deep link has expired' };
      }

      // Determine target app from URL
      const targetApp = this.getAppFromUrl(url.origin);
      if (!targetApp) {
        return { valid: false, error: 'Unknown target application' };
      }

      // Get path without query params
      const path = url.pathname;

      // Verify signature
      const dataToSign = `${linkId}:${expiresTimestamp}:${targetApp}:${path}`;
      if (!this.verifySignature(dataToSign, signature)) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Parse context
      let context: DeepLinkContext | undefined;
      if (contextStr) {
        try {
          const decoded = Buffer.from(contextStr, 'base64url').toString('utf-8');
          context = JSON.parse(decoded) as DeepLinkContext;
        } catch {
          // Context parsing failed, continue without it
        }
      }

      // Decrypt auth context
      let sessionId: string | undefined;
      let userId: string | undefined;
      if (authStr && linkId) {
        const authContext = this.decryptAuthContext(authStr, linkId);
        sessionId = authContext?.sid;
        userId = authContext?.uid;
      }

      return {
        valid: true,
        targetApp,
        path,
        context,
        sessionId,
        userId,
        linkId,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse deep link: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate a navigation URL for a specific resource
   */
  generateNavigationUrl(
    targetApp: RelayApp,
    resourceType: string,
    resourceId: string,
    options: {
      sessionId?: string;
      userId?: string;
      context?: Omit<DeepLinkContext, 'resourceType' | 'resourceId'>;
      expiresIn?: number;
    } = {},
  ): DeepLinkResult {
    const appKey = targetApp.toLowerCase();
    const pathTemplate = RESOURCE_PATHS[appKey]?.[resourceType];

    if (!pathTemplate) {
      throw new Error(`Unknown resource type "${resourceType}" for app "${targetApp}"`);
    }

    const path = pathTemplate.replace(':id', resourceId);

    return this.generateLink({
      targetApp,
      path,
      context: {
        ...options.context,
        resourceType,
        resourceId,
      },
      sessionId: options.sessionId,
      userId: options.userId,
      expiresIn: options.expiresIn,
    });
  }

  /**
   * Check if a URL is a deep link
   */
  isDeepLink(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.searchParams.has('_rl_id') && url.searchParams.has('_rl_sig');
    } catch {
      return false;
    }
  }

  /**
   * Get all app information
   */
  getAppInfo(): Array<{ app: RelayApp; url: string; name: string }> {
    return [
      { app: 'VERITY' as RelayApp, url: this.appUrls.verity, name: 'Verity' },
      { app: 'NOTEMAN' as RelayApp, url: this.appUrls.noteman, name: 'NoteMan' },
      { app: 'SHIPCHECK' as RelayApp, url: this.appUrls.shipcheck, name: 'ShipCheck' },
    ];
  }

  /**
   * Get base URL for an app
   */
  private getAppUrl(app: RelayApp): string {
    const key = app.toLowerCase() as keyof AppUrls;
    const url = this.appUrls[key];
    if (!url) {
      throw new Error(`Unknown app: ${app}`);
    }
    return url;
  }

  /**
   * Determine app from URL origin
   */
  private getAppFromUrl(origin: string): RelayApp | null {
    for (const [app, url] of Object.entries(this.appUrls)) {
      if (origin === new URL(url).origin) {
        return app.toUpperCase() as RelayApp;
      }
    }
    return null;
  }

  /**
   * Sign data with HMAC-SHA256
   */
  private sign(data: string): string {
    const hmac = createHmac('sha256', this.signingKey);
    hmac.update(data);
    return hmac.digest('base64url');
  }

  /**
   * Verify a signature
   */
  private verifySignature(data: string, signature: string): boolean {
    const expected = this.sign(data);
    return expected === signature;
  }

  /**
   * Encrypt auth context using XOR with link ID
   * Note: This is a simple obfuscation, not strong encryption
   * For production, use proper encryption
   */
  private encryptAuthContext(context: { sid?: string; uid?: string }, key: string): string {
    const json = JSON.stringify(context);
    const encrypted = this.xorEncrypt(json, key);
    return Buffer.from(encrypted).toString('base64url');
  }

  /**
   * Decrypt auth context
   */
  private decryptAuthContext(encrypted: string, key: string): { sid?: string; uid?: string } | null {
    try {
      const data = Buffer.from(encrypted, 'base64url').toString('utf-8');
      const decrypted = this.xorEncrypt(data, key);
      return JSON.parse(decrypted) as { sid?: string; uid?: string };
    } catch {
      return null;
    }
  }

  /**
   * Simple XOR encryption (same function encrypts and decrypts)
   */
  private xorEncrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const keyCode = key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode ^ keyCode);
    }
    return result;
  }
}

/**
 * Create a deep linking service with environment configuration
 */
export function createDeepLinkingService(options?: {
  signingKey?: string;
  appUrls?: Partial<AppUrls>;
}): DeepLinkingService {
  return new DeepLinkingService(options);
}
