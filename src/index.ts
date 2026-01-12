/**
 * @fileoverview Main entry point for @relay/platform
 * @module @relay/platform
 *
 * Shared TypeScript library for the Relay Platform (Verity, NoteMan, ShipCheck)
 *
 * @example
 * ```typescript
 * import { JwtService, RelayApp, DeepLinkingService } from '@relay/platform';
 *
 * // JWT operations
 * const jwt = new JwtService({ secret: process.env.JWT_SECRET });
 * const token = await jwt.generateAccessToken({ sub: userId, email, name });
 *
 * // Deep linking
 * const deepLinks = new DeepLinkingService();
 * const link = deepLinks.generateNavigationUrl('SHIPCHECK', 'repo', repoId);
 * ```
 */

// Types
export * from './types';

// Auth
export * from './auth';

// Services
export * from './services';

// Utils
export * from './utils';

// Integrations
export * from './integrations';

// Re-export commonly used items at top level for convenience
export {
  // Types
  type User,
  type Organization,
  type Team,
  type Project,
  UserRole,
  UserStatus,
  PlanTier,
  OrganizationRole,
  ProjectRole,
  RelayApp,
  ResourceType,
  Action,
  type Permission,
  type PermissionSet,
  AuthEventType,
  LogoutType,
  type BaseEvent,
  type AuthEvent,
} from './types';

export {
  // Auth
  JwtService,
  type PlatformClaims,
  type TokenPair,
  type JwtConfig,
  createJwtService,
  type PlatformSession,
  SessionStatus,
  createSession,
  isSessionExpired,
  isSessionValid,
} from './auth';

export {
  // Services
  DeepLinkingService,
  createDeepLinkingService,
  type DeepLinkContext,
  type DeepLinkResult,
  type ResolvedDeepLink,
  SessionSyncService,
  createSessionSyncService,
  AUTH_EVENTS_CHANNEL,
} from './services';

export {
  // Utils
  generateSecureToken,
  generateId,
  sha256,
  hmacSha256,
  aesEncrypt,
  aesDecrypt,
  encryptToString,
  decryptFromString,
  emailSchema,
  passwordSchema,
  uuidSchema,
  slugSchema,
  validate,
  safeValidate,
  formatZodErrors,
  isValidEmail,
  isValidUuid,
  toSlug,
  RelayError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
  TokenError,
  isRelayError,
  wrapError,
} from './utils';

export {
  // Integrations
  IntegrationProvider,
  IntegrationStatus,
  type OAuthTokens,
  type IntegrationConfig,
  verifyWebhookSignature,
  buildAuthorizationUrl,
  generateCodeVerifier,
} from './integrations';

/**
 * Package version
 */
export const VERSION = '1.0.0';
