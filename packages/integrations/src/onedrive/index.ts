/**
 * @fileoverview OneDrive/Microsoft Graph integration exports
 * @module @relay/integrations/onedrive
 */

// Client
export { OneDriveClient } from './client';

// OAuth
export {
  OneDriveOAuthClient,
  isTokenValid,
  shouldRefreshToken,
  DEFAULT_ONEDRIVE_SCOPES,
  FULL_ACCESS_SCOPES,
  SHAREPOINT_SCOPES,
} from './oauth';

// Webhooks
export {
  OneDriveWebhookHandler,
  verifyOneDriveWebhook,
  assertOneDriveWebhook,
  parseOneDriveWebhookPayload,
  isValidationRequest,
  createValidationResponse,
  createWebhookResponse,
  verifyEncryptedContent,
  decryptResourceData,
  shouldRenewSubscription,
  calculateSubscriptionExpiration,
} from './webhooks';
export type { OneDriveChangeType, OneDriveWebhookEvent } from './webhooks';

// Types
export type {
  // Config
  OneDriveConfig,
  OneDriveOAuthConfig,
  OneDriveOAuthToken,
  OneDriveScope,
  // Items
  OneDriveItem,
  OneDriveListResponse,
  OneDriveItemReference,
  OneDriveSharepointIds,
  // Facets
  OneDriveFileFacet,
  OneDriveFolderFacet,
  OneDriveImageFacet,
  OneDrivePhotoFacet,
  OneDriveVideoFacet,
  OneDriveAudioFacet,
  OneDriveLocationFacet,
  OneDriveDeletedFacet,
  OneDriveSharedFacet,
  OneDriveSpecialFolderFacet,
  OneDrivePackageFacet,
  OneDrivePublicationFacet,
  OneDriveHashesFacet,
  OneDriveFolderView,
  OneDriveContentRestriction,
  // Identity
  OneDriveIdentitySet,
  OneDriveIdentity,
  OneDriveSharePointIdentitySet,
  OneDriveSharePointIdentity,
  // Permissions
  OneDrivePermission,
  OneDriveSharingInvitation,
  OneDriveSharingLink,
  // Thumbnails
  OneDriveThumbnailSet,
  OneDriveThumbnail,
  // Drives
  OneDriveDrive,
  OneDriveQuota,
  // Users
  OneDriveUser,
  // Subscriptions/Webhooks
  OneDriveSubscription,
  OneDriveWebhookNotification,
  OneDriveWebhookPayload,
  // Input types
  CreateOneDriveItemInput,
  UpdateOneDriveItemInput,
  CreateOneDriveSharingLinkInput,
  // Delta
  OneDriveDeltaToken,
} from './types';
