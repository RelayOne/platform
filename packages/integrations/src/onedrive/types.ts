/**
 * @fileoverview OneDrive/Microsoft Graph type definitions
 * @module @relay/integrations/onedrive/types
 */

import type { IntegrationConfig, OAuthToken } from '../common/types';

/**
 * OneDrive authentication configuration
 */
export interface OneDriveConfig extends IntegrationConfig {
  /** OAuth 2.0 access token */
  accessToken: string;
  /** Drive ID for shared drives (optional) */
  driveId?: string;
}

/**
 * OneDrive OAuth 2.0 configuration
 */
export interface OneDriveOAuthConfig {
  /** OAuth 2.0 client ID */
  clientId: string;
  /** OAuth 2.0 client secret */
  clientSecret: string;
  /** OAuth 2.0 redirect URI */
  redirectUri: string;
  /** Tenant ID (common, organizations, consumers, or specific tenant) */
  tenantId?: string;
  /** OAuth 2.0 scopes */
  scopes?: OneDriveScope[];
}

/**
 * OneDrive OAuth token response
 */
export interface OneDriveOAuthToken extends OAuthToken {
  /** Token scope */
  scope: string;
  /** ID token (if openid scope requested) */
  idToken?: string;
  /** Extension expiry time */
  extExpiresIn?: number;
}

/**
 * OneDrive/Microsoft Graph API scopes
 */
export type OneDriveScope =
  | 'offline_access'
  | 'openid'
  | 'profile'
  | 'email'
  | 'User.Read'
  | 'User.ReadBasic.All'
  | 'Files.Read'
  | 'Files.Read.All'
  | 'Files.ReadWrite'
  | 'Files.ReadWrite.All'
  | 'Files.Read.Selected'
  | 'Files.ReadWrite.Selected'
  | 'Sites.Read.All'
  | 'Sites.ReadWrite.All';

/**
 * OneDrive drive item (file or folder)
 */
export interface OneDriveItem {
  /** Unique identifier */
  id: string;
  /** Item name */
  name: string;
  /** ETag */
  eTag?: string;
  /** cTag (content change tracking) */
  cTag?: string;
  /** Created date/time */
  createdDateTime?: string;
  /** Last modified date/time */
  lastModifiedDateTime?: string;
  /** Size in bytes */
  size?: number;
  /** Web URL */
  webUrl?: string;
  /** Web DAV URL */
  webDavUrl?: string;
  /** Description */
  description?: string;
  /** Created by */
  createdBy?: OneDriveIdentitySet;
  /** Last modified by */
  lastModifiedBy?: OneDriveIdentitySet;
  /** Parent reference */
  parentReference?: OneDriveItemReference;
  /** File facet (present if item is a file) */
  file?: OneDriveFileFacet;
  /** Folder facet (present if item is a folder) */
  folder?: OneDriveFolderFacet;
  /** Image facet */
  image?: OneDriveImageFacet;
  /** Photo facet */
  photo?: OneDrivePhotoFacet;
  /** Video facet */
  video?: OneDriveVideoFacet;
  /** Audio facet */
  audio?: OneDriveAudioFacet;
  /** Location facet */
  location?: OneDriveLocationFacet;
  /** Deleted facet */
  deleted?: OneDriveDeletedFacet;
  /** Shared facet */
  shared?: OneDriveSharedFacet;
  /** Special folder facet */
  specialFolder?: OneDriveSpecialFolderFacet;
  /** Remote item (for shared items) */
  remoteItem?: OneDriveItem;
  /** Package facet (OneNote notebooks, etc.) */
  package?: OneDrivePackageFacet;
  /** Root facet */
  root?: Record<string, never>;
  /** Publication facet */
  publication?: OneDrivePublicationFacet;
  /** Download URL (temporary, expires) */
  '@microsoft.graph.downloadUrl'?: string;
  /** Conflict behavior */
  '@microsoft.graph.conflictBehavior'?: 'rename' | 'replace' | 'fail';
  /** Source URL for upload */
  '@microsoft.graph.sourceUrl'?: string;
  /** Thumbnails */
  thumbnails?: OneDriveThumbnailSet[];
  /** Permissions */
  permissions?: OneDrivePermission[];
  /** Children (for folder expand) */
  children?: OneDriveItem[];
  /** Children count */
  childCount?: number;
}

/**
 * OneDrive identity set
 */
export interface OneDriveIdentitySet {
  /** Application identity */
  application?: OneDriveIdentity;
  /** Device identity */
  device?: OneDriveIdentity;
  /** User identity */
  user?: OneDriveIdentity;
  /** Group identity */
  group?: OneDriveIdentity;
}

/**
 * OneDrive identity
 */
export interface OneDriveIdentity {
  /** Display name */
  displayName?: string;
  /** Unique ID */
  id?: string;
  /** Email (for users) */
  email?: string;
}

/**
 * OneDrive item reference
 */
export interface OneDriveItemReference {
  /** Drive ID */
  driveId?: string;
  /** Drive type (personal, business, documentLibrary) */
  driveType?: 'personal' | 'business' | 'documentLibrary';
  /** Item ID */
  id?: string;
  /** Item name */
  name?: string;
  /** Path from root */
  path?: string;
  /** Share ID */
  shareId?: string;
  /** SharePoint IDs */
  sharepointIds?: OneDriveSharepointIds;
  /** Site ID */
  siteId?: string;
}

/**
 * OneDrive SharePoint IDs
 */
export interface OneDriveSharepointIds {
  /** List ID */
  listId?: string;
  /** List item ID */
  listItemId?: string;
  /** List item unique ID */
  listItemUniqueId?: string;
  /** Site ID */
  siteId?: string;
  /** Site URL */
  siteUrl?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Web ID */
  webId?: string;
}

/**
 * OneDrive file facet
 */
export interface OneDriveFileFacet {
  /** MIME type */
  mimeType?: string;
  /** Hashes */
  hashes?: OneDriveHashesFacet;
  /** Processing metadata */
  processingMetadata?: boolean;
}

/**
 * OneDrive hashes facet
 */
export interface OneDriveHashesFacet {
  /** CRC32 hash */
  crc32Hash?: string;
  /** QuickXor hash */
  quickXorHash?: string;
  /** SHA1 hash */
  sha1Hash?: string;
  /** SHA256 hash */
  sha256Hash?: string;
}

/**
 * OneDrive folder facet
 */
export interface OneDriveFolderFacet {
  /** Child count */
  childCount?: number;
  /** View information */
  view?: OneDriveFolderView;
}

/**
 * OneDrive folder view
 */
export interface OneDriveFolderView {
  /** Sort by */
  sortBy?: 'default' | 'name' | 'type' | 'size' | 'takenOrCreatedDateTime' | 'lastModifiedDateTime' | 'sequence';
  /** Sort order */
  sortOrder?: 'ascending' | 'descending';
  /** View type */
  viewType?: 'default' | 'icons' | 'details' | 'thumbnails';
}

/**
 * OneDrive image facet
 */
export interface OneDriveImageFacet {
  /** Width */
  width?: number;
  /** Height */
  height?: number;
}

/**
 * OneDrive photo facet
 */
export interface OneDrivePhotoFacet {
  /** Camera make */
  cameraMake?: string;
  /** Camera model */
  cameraModel?: string;
  /** Exposure denominator */
  exposureDenominator?: number;
  /** Exposure numerator */
  exposureNumerator?: number;
  /** F number */
  fNumber?: number;
  /** Focal length */
  focalLength?: number;
  /** ISO */
  iso?: number;
  /** Orientation */
  orientation?: number;
  /** Taken date/time */
  takenDateTime?: string;
}

/**
 * OneDrive video facet
 */
export interface OneDriveVideoFacet {
  /** Audio bits per sample */
  audioBitsPerSample?: number;
  /** Audio channels */
  audioChannels?: number;
  /** Audio format */
  audioFormat?: string;
  /** Audio samples per second */
  audioSamplesPerSecond?: number;
  /** Bitrate */
  bitrate?: number;
  /** Duration in ms */
  duration?: number;
  /** Four CC */
  fourCC?: string;
  /** Frame rate */
  frameRate?: number;
  /** Height */
  height?: number;
  /** Width */
  width?: number;
}

/**
 * OneDrive audio facet
 */
export interface OneDriveAudioFacet {
  /** Album */
  album?: string;
  /** Album artist */
  albumArtist?: string;
  /** Artist */
  artist?: string;
  /** Bitrate */
  bitrate?: number;
  /** Composers */
  composers?: string;
  /** Copyright */
  copyright?: string;
  /** Disc */
  disc?: number;
  /** Disc count */
  discCount?: number;
  /** Duration in ms */
  duration?: number;
  /** Genre */
  genre?: string;
  /** Has DRM */
  hasDrm?: boolean;
  /** Is variable bitrate */
  isVariableBitrate?: boolean;
  /** Title */
  title?: string;
  /** Track */
  track?: number;
  /** Track count */
  trackCount?: number;
  /** Year */
  year?: number;
}

/**
 * OneDrive location facet
 */
export interface OneDriveLocationFacet {
  /** Altitude */
  altitude?: number;
  /** Latitude */
  latitude?: number;
  /** Longitude */
  longitude?: number;
}

/**
 * OneDrive deleted facet
 */
export interface OneDriveDeletedFacet {
  /** Deleted state */
  state?: string;
}

/**
 * OneDrive shared facet
 */
export interface OneDriveSharedFacet {
  /** Owner */
  owner?: OneDriveIdentitySet;
  /** Scope (anonymous, organization, users) */
  scope?: 'anonymous' | 'organization' | 'users';
  /** Shared by */
  sharedBy?: OneDriveIdentitySet;
  /** Shared date/time */
  sharedDateTime?: string;
}

/**
 * OneDrive special folder facet
 */
export interface OneDriveSpecialFolderFacet {
  /** Name (documents, photos, music, etc.) */
  name?: string;
}

/**
 * OneDrive package facet
 */
export interface OneDrivePackageFacet {
  /** Package type (oneNote) */
  type?: string;
}

/**
 * OneDrive publication facet
 */
export interface OneDrivePublicationFacet {
  /** Level */
  level?: 'published' | 'checkout';
  /** Version ID */
  versionId?: string;
}

/**
 * OneDrive thumbnail set
 */
export interface OneDriveThumbnailSet {
  /** ID */
  id?: string;
  /** Large thumbnail */
  large?: OneDriveThumbnail;
  /** Medium thumbnail */
  medium?: OneDriveThumbnail;
  /** Small thumbnail */
  small?: OneDriveThumbnail;
  /** Source thumbnail */
  source?: OneDriveThumbnail;
  /** Custom thumbnails */
  [key: string]: OneDriveThumbnail | string | undefined;
}

/**
 * OneDrive thumbnail
 */
export interface OneDriveThumbnail {
  /** Height */
  height?: number;
  /** Width */
  width?: number;
  /** URL */
  url?: string;
  /** Source item ID */
  sourceItemId?: string;
}

/**
 * OneDrive permission
 */
export interface OneDrivePermission {
  /** Permission ID */
  id?: string;
  /** Granted to identity */
  grantedTo?: OneDriveIdentitySet;
  /** Granted to identities (v2) */
  grantedToIdentities?: OneDriveIdentitySet[];
  /** Granted to identities (v2) */
  grantedToIdentitiesV2?: OneDriveSharePointIdentitySet[];
  /** Invitation */
  invitation?: OneDriveSharingInvitation;
  /** Inherited from */
  inheritedFrom?: OneDriveItemReference;
  /** Link */
  link?: OneDriveSharingLink;
  /** Roles */
  roles?: ('read' | 'write' | 'sp.full control' | 'sp.owner')[];
  /** Share ID */
  shareId?: string;
  /** Expiration date/time */
  expirationDateTime?: string;
  /** Has password */
  hasPassword?: boolean;
}

/**
 * OneDrive SharePoint identity set
 */
export interface OneDriveSharePointIdentitySet extends OneDriveIdentitySet {
  /** Site user */
  siteUser?: OneDriveSharePointIdentity;
  /** Site group */
  siteGroup?: OneDriveSharePointIdentity;
}

/**
 * OneDrive SharePoint identity
 */
export interface OneDriveSharePointIdentity extends OneDriveIdentity {
  /** Login name */
  loginName?: string;
}

/**
 * OneDrive sharing invitation
 */
export interface OneDriveSharingInvitation {
  /** Email */
  email?: string;
  /** Invited by */
  invitedBy?: OneDriveIdentitySet;
  /** Redeemed by */
  redeemedBy?: string;
  /** Sign in required */
  signInRequired?: boolean;
}

/**
 * OneDrive sharing link
 */
export interface OneDriveSharingLink {
  /** Application */
  application?: OneDriveIdentity;
  /** Prevents download */
  preventsDownload?: boolean;
  /** Scope */
  scope?: 'anonymous' | 'organization' | 'users';
  /** Type */
  type?: 'view' | 'edit' | 'embed';
  /** Web HTML */
  webHtml?: string;
  /** Web URL */
  webUrl?: string;
}

/**
 * OneDrive list response
 */
export interface OneDriveListResponse {
  /** Items */
  value: OneDriveItem[];
  /** Next page link */
  '@odata.nextLink'?: string;
  /** Delta link */
  '@odata.deltaLink'?: string;
  /** Count */
  '@odata.count'?: number;
}

/**
 * OneDrive drive resource
 */
export interface OneDriveDrive {
  /** Drive ID */
  id?: string;
  /** Drive type */
  driveType?: 'personal' | 'business' | 'documentLibrary';
  /** Name */
  name?: string;
  /** Description */
  description?: string;
  /** Created date/time */
  createdDateTime?: string;
  /** Last modified date/time */
  lastModifiedDateTime?: string;
  /** Web URL */
  webUrl?: string;
  /** Owner */
  owner?: OneDriveIdentitySet;
  /** Quota */
  quota?: OneDriveQuota;
  /** Root folder */
  root?: OneDriveItem;
  /** SharePoint IDs */
  sharepointIds?: OneDriveSharepointIds;
  /** System facet */
  system?: Record<string, never>;
  /** Created by */
  createdBy?: OneDriveIdentitySet;
  /** Last modified by */
  lastModifiedBy?: OneDriveIdentitySet;
}

/**
 * OneDrive quota
 */
export interface OneDriveQuota {
  /** Deleted size */
  deleted?: number;
  /** File count */
  fileCount?: number;
  /** Remaining */
  remaining?: number;
  /** State (normal, nearing, critical, exceeded) */
  state?: 'normal' | 'nearing' | 'critical' | 'exceeded';
  /** Storage plan info */
  storagePlanInformation?: {
    upgradeAvailable?: boolean;
  };
  /** Total */
  total?: number;
  /** Used */
  used?: number;
}

/**
 * OneDrive user
 */
export interface OneDriveUser {
  /** User ID */
  id: string;
  /** Display name */
  displayName: string;
  /** Email (mail) */
  mail?: string;
  /** User principal name */
  userPrincipalName: string;
  /** Given name */
  givenName?: string;
  /** Surname */
  surname?: string;
  /** Job title */
  jobTitle?: string;
  /** Mobile phone */
  mobilePhone?: string;
  /** Office location */
  officeLocation?: string;
  /** Business phones */
  businessPhones?: string[];
}

/**
 * OneDrive subscription (webhook)
 */
export interface OneDriveSubscription {
  /** Subscription ID */
  id?: string;
  /** Resource */
  resource: string;
  /** Change type */
  changeType: 'created' | 'updated' | 'deleted';
  /** Notification URL */
  notificationUrl: string;
  /** Expiration date/time */
  expirationDateTime: string;
  /** Client state (up to 128 chars) */
  clientState?: string;
  /** Application ID */
  applicationId?: string;
  /** Creator ID */
  creatorId?: string;
  /** Latest supported TLS version */
  latestSupportedTlsVersion?: string;
  /** Encryption certificate */
  encryptionCertificate?: string;
  /** Encryption certificate ID */
  encryptionCertificateId?: string;
  /** Include resource data */
  includeResourceData?: boolean;
  /** Lifecycle notification URL */
  lifecycleNotificationUrl?: string;
}

/**
 * OneDrive webhook notification
 */
export interface OneDriveWebhookNotification {
  /** Subscription ID */
  subscriptionId: string;
  /** Subscription expiration date/time */
  subscriptionExpirationDateTime: string;
  /** Change type */
  changeType: 'created' | 'updated' | 'deleted';
  /** Resource */
  resource: string;
  /** Resource data */
  resourceData?: {
    '@odata.type'?: string;
    '@odata.id'?: string;
    '@odata.etag'?: string;
    id?: string;
  };
  /** Client state */
  clientState?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Encrypted content */
  encryptedContent?: {
    data: string;
    dataSignature: string;
    dataKey: string;
    encryptionCertificateId: string;
    encryptionCertificateThumbprint: string;
  };
}

/**
 * OneDrive webhook payload
 */
export interface OneDriveWebhookPayload {
  /** Notifications */
  value: OneDriveWebhookNotification[];
}

/**
 * Input for creating a OneDrive item
 */
export interface CreateOneDriveItemInput {
  /** Item name */
  name: string;
  /** Description */
  description?: string;
  /** Folder facet (include to create folder) */
  folder?: Record<string, never>;
  /** File facet */
  file?: OneDriveFileFacet;
  /** Conflict behavior */
  '@microsoft.graph.conflictBehavior'?: 'rename' | 'replace' | 'fail';
}

/**
 * Input for updating a OneDrive item
 */
export interface UpdateOneDriveItemInput {
  /** Item name */
  name?: string;
  /** Description */
  description?: string;
  /** Parent reference (for moving) */
  parentReference?: OneDriveItemReference;
}

/**
 * Input for creating a sharing link
 */
export interface CreateOneDriveSharingLinkInput {
  /** Link type */
  type: 'view' | 'edit' | 'embed';
  /** Scope */
  scope?: 'anonymous' | 'organization';
  /** Expiration date/time */
  expirationDateTime?: string;
  /** Password */
  password?: string;
  /** Retain inherited permissions */
  retainInheritedPermissions?: boolean;
}

/**
 * OneDrive delta token storage
 */
export interface OneDriveDeltaToken {
  /** Delta link URL */
  deltaLink: string;
  /** Token obtained at */
  obtainedAt: Date;
}
