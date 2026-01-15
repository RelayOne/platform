/**
 * @fileoverview Google Drive type definitions
 * @module @relay/integrations/google-drive/types
 */

import type { IntegrationConfig, OAuthToken } from '../common/types';

/**
 * Google Drive authentication configuration
 */
export interface GoogleDriveConfig extends IntegrationConfig {
  /** OAuth 2.0 access token */
  accessToken: string;
}

/**
 * Google Drive OAuth 2.0 configuration
 */
export interface GoogleDriveOAuthConfig {
  /** OAuth 2.0 client ID */
  clientId: string;
  /** OAuth 2.0 client secret */
  clientSecret: string;
  /** OAuth 2.0 redirect URI */
  redirectUri: string;
  /** OAuth 2.0 scopes (defaults to drive.readonly and metadata) */
  scopes?: GoogleDriveScope[];
}

/**
 * Google Drive OAuth token response
 */
export interface GoogleDriveOAuthToken extends OAuthToken {
  /** Token scope */
  scope: string;
  /** ID token (if openid scope requested) */
  idToken?: string;
}

/**
 * Google Drive API scopes
 */
export type GoogleDriveScope =
  | 'https://www.googleapis.com/auth/drive'
  | 'https://www.googleapis.com/auth/drive.readonly'
  | 'https://www.googleapis.com/auth/drive.file'
  | 'https://www.googleapis.com/auth/drive.metadata'
  | 'https://www.googleapis.com/auth/drive.metadata.readonly'
  | 'https://www.googleapis.com/auth/drive.appdata'
  | 'https://www.googleapis.com/auth/drive.photos.readonly'
  | 'https://www.googleapis.com/auth/userinfo.email'
  | 'https://www.googleapis.com/auth/userinfo.profile'
  | 'openid';

/**
 * Google Drive file resource
 */
export interface GoogleDriveFile {
  /** File ID */
  id: string;
  /** File name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Description */
  description?: string;
  /** Whether file is starred */
  starred?: boolean;
  /** Whether file is trashed */
  trashed?: boolean;
  /** Whether explicitly trashed */
  explicitlyTrashed?: boolean;
  /** Parent folder IDs */
  parents?: string[];
  /** File properties */
  properties?: Record<string, string>;
  /** App properties (private to this app) */
  appProperties?: Record<string, string>;
  /** Spaces containing file */
  spaces?: string[];
  /** File version */
  version?: string;
  /** Content hash (MD5) */
  md5Checksum?: string;
  /** File size in bytes (as string) */
  size?: string;
  /** Quota size in bytes (as string) */
  quotaBytesUsed?: string;
  /** Head revision ID */
  headRevisionId?: string;
  /** Content restrictions */
  contentRestrictions?: GoogleDriveContentRestriction[];
  /** Creation time */
  createdTime?: string;
  /** Modification time */
  modifiedTime?: string;
  /** Modification time by me */
  modifiedByMeTime?: string;
  /** View time by me */
  viewedByMeTime?: string;
  /** Shared with me time */
  sharedWithMeTime?: string;
  /** Sharing user */
  sharingUser?: GoogleDriveUser;
  /** Owners */
  owners?: GoogleDriveUser[];
  /** Last modifying user */
  lastModifyingUser?: GoogleDriveUser;
  /** Whether shared */
  shared?: boolean;
  /** Whether owned by me */
  ownedByMe?: boolean;
  /** Viewer can copy */
  viewersCanCopyContent?: boolean;
  /** Copy requires writer permission */
  copyRequiresWriterPermission?: boolean;
  /** Writers can share */
  writersCanShare?: boolean;
  /** Permissions */
  permissions?: GoogleDrivePermission[];
  /** Permission IDs */
  permissionIds?: string[];
  /** Whether has augmented permissions */
  hasAugmentedPermissions?: boolean;
  /** Folder color RGB */
  folderColorRgb?: string;
  /** Original filename */
  originalFilename?: string;
  /** Full file extension */
  fullFileExtension?: string;
  /** File extension */
  fileExtension?: string;
  /** Web content link (download) */
  webContentLink?: string;
  /** Web view link */
  webViewLink?: string;
  /** Icon link */
  iconLink?: string;
  /** Has thumbnail */
  hasThumbnail?: boolean;
  /** Thumbnail link */
  thumbnailLink?: string;
  /** Thumbnail version */
  thumbnailVersion?: string;
  /** Image media metadata */
  imageMediaMetadata?: GoogleDriveImageMetadata;
  /** Video media metadata */
  videoMediaMetadata?: GoogleDriveVideoMetadata;
  /** Capabilities */
  capabilities?: GoogleDriveCapabilities;
  /** Whether full file extension is unrecognized */
  isAppAuthorized?: boolean;
  /** Export links (for Google Docs) */
  exportLinks?: Record<string, string>;
  /** Shortcut details */
  shortcutDetails?: GoogleDriveShortcutDetails;
  /** Content hints */
  contentHints?: GoogleDriveContentHints;
  /** Resource key (for security) */
  resourceKey?: string;
  /** Link share metadata */
  linkShareMetadata?: GoogleDriveLinkShareMetadata;
  /** Label info */
  labelInfo?: GoogleDriveLabelInfo;
  /** SHA1 checksum */
  sha1Checksum?: string;
  /** SHA256 checksum */
  sha256Checksum?: string;
}

/**
 * Google Drive user
 */
export interface GoogleDriveUser {
  /** User ID (permission ID) */
  permissionId?: string;
  /** Display name */
  displayName: string;
  /** Email address */
  emailAddress?: string;
  /** Photo link */
  photoLink?: string;
  /** Whether user is the owner */
  me?: boolean;
}

/**
 * Google Drive permission
 */
export interface GoogleDrivePermission {
  /** Permission ID */
  id: string;
  /** Type (user, group, domain, anyone) */
  type: 'user' | 'group' | 'domain' | 'anyone';
  /** Email address (for user/group) */
  emailAddress?: string;
  /** Domain (for domain type) */
  domain?: string;
  /** Role */
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  /** Allow file discovery */
  allowFileDiscovery?: boolean;
  /** Display name */
  displayName?: string;
  /** Photo link */
  photoLink?: string;
  /** Expiration time */
  expirationTime?: string;
  /** Whether deleted */
  deleted?: boolean;
  /** Whether pending owner */
  pendingOwner?: boolean;
  /** Permission details (for shared drives) */
  permissionDetails?: GoogleDrivePermissionDetail[];
  /** Team drive permission details */
  teamDrivePermissionDetails?: GoogleDriveTeamDrivePermissionDetail[];
}

/**
 * Google Drive permission detail
 */
export interface GoogleDrivePermissionDetail {
  /** Permission type */
  permissionType: 'file' | 'member';
  /** Inherited from */
  inheritedFrom?: string;
  /** Role */
  role: string;
  /** Whether inherited */
  inherited?: boolean;
}

/**
 * Google Drive team drive permission detail
 */
export interface GoogleDriveTeamDrivePermissionDetail {
  /** Team drive permission type */
  teamDrivePermissionType: 'file' | 'member';
  /** Inherited from */
  inheritedFrom?: string;
  /** Role */
  role: string;
  /** Whether inherited */
  inherited?: boolean;
}

/**
 * Google Drive capabilities
 */
export interface GoogleDriveCapabilities {
  canAcceptOwnership?: boolean;
  canAddChildren?: boolean;
  canAddFolderFromAnotherDrive?: boolean;
  canAddMyDriveParent?: boolean;
  canChangeCopyRequiresWriterPermission?: boolean;
  canChangeSecurityUpdateEnabled?: boolean;
  canChangeViewersCanCopyContent?: boolean;
  canComment?: boolean;
  canCopy?: boolean;
  canDelete?: boolean;
  canDeleteChildren?: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  canListChildren?: boolean;
  canModifyContent?: boolean;
  canModifyContentRestriction?: boolean;
  canModifyLabels?: boolean;
  canMoveChildrenOutOfDrive?: boolean;
  canMoveChildrenOutOfTeamDrive?: boolean;
  canMoveChildrenWithinDrive?: boolean;
  canMoveChildrenWithinTeamDrive?: boolean;
  canMoveItemIntoTeamDrive?: boolean;
  canMoveItemOutOfDrive?: boolean;
  canMoveItemOutOfTeamDrive?: boolean;
  canMoveItemWithinDrive?: boolean;
  canMoveItemWithinTeamDrive?: boolean;
  canMoveTeamDriveItem?: boolean;
  canReadDrive?: boolean;
  canReadLabels?: boolean;
  canReadRevisions?: boolean;
  canReadTeamDrive?: boolean;
  canRemoveChildren?: boolean;
  canRemoveMyDriveParent?: boolean;
  canRename?: boolean;
  canShare?: boolean;
  canTrash?: boolean;
  canTrashChildren?: boolean;
  canUntrash?: boolean;
}

/**
 * Google Drive content restriction
 */
export interface GoogleDriveContentRestriction {
  /** Whether read-only */
  readOnly?: boolean;
  /** Reason */
  reason?: string;
  /** Restricting user */
  restrictingUser?: GoogleDriveUser;
  /** Restriction time */
  restrictionTime?: string;
  /** Type */
  type?: string;
}

/**
 * Google Drive image metadata
 */
export interface GoogleDriveImageMetadata {
  width?: number;
  height?: number;
  rotation?: number;
  location?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
  };
  time?: string;
  cameraMake?: string;
  cameraModel?: string;
  exposureTime?: number;
  aperture?: number;
  flashUsed?: boolean;
  focalLength?: number;
  isoSpeed?: number;
  meteringMode?: string;
  sensor?: string;
  exposureMode?: string;
  colorSpace?: string;
  whiteBalance?: string;
  exposureBias?: number;
  maxApertureValue?: number;
  subjectDistance?: number;
  lens?: string;
}

/**
 * Google Drive video metadata
 */
export interface GoogleDriveVideoMetadata {
  width?: number;
  height?: number;
  durationMillis?: string;
}

/**
 * Google Drive shortcut details
 */
export interface GoogleDriveShortcutDetails {
  targetId?: string;
  targetMimeType?: string;
  targetResourceKey?: string;
}

/**
 * Google Drive content hints
 */
export interface GoogleDriveContentHints {
  thumbnail?: {
    image?: string;
    mimeType?: string;
  };
  indexableText?: string;
}

/**
 * Google Drive link share metadata
 */
export interface GoogleDriveLinkShareMetadata {
  securityUpdateEligible?: boolean;
  securityUpdateEnabled?: boolean;
}

/**
 * Google Drive label info
 */
export interface GoogleDriveLabelInfo {
  labels?: GoogleDriveLabel[];
}

/**
 * Google Drive label
 */
export interface GoogleDriveLabel {
  id?: string;
  revisionId?: string;
  fields?: Record<string, GoogleDriveLabelField>;
}

/**
 * Google Drive label field
 */
export interface GoogleDriveLabelField {
  kind?: string;
  id?: string;
  valueType?: string;
  dateString?: string[];
  integer?: string[];
  selection?: string[];
  text?: string[];
  user?: GoogleDriveUser[];
}

/**
 * Google Drive list response
 */
export interface GoogleDriveListResponse {
  /** Next page token */
  nextPageToken?: string;
  /** Kind */
  kind?: string;
  /** Whether search is incomplete */
  incompleteSearch?: boolean;
  /** Files */
  files: GoogleDriveFile[];
}

/**
 * Google Drive about resource
 */
export interface GoogleDriveAbout {
  /** Kind */
  kind?: string;
  /** User */
  user?: GoogleDriveUser;
  /** Storage quota */
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
    usageInDriveTrash?: string;
  };
  /** Import formats */
  importFormats?: Record<string, string[]>;
  /** Export formats */
  exportFormats?: Record<string, string[]>;
  /** Max import sizes */
  maxImportSizes?: Record<string, string>;
  /** Max upload size */
  maxUploadSize?: string;
  /** App installed */
  appInstalled?: boolean;
  /** Folder color palette */
  folderColorPalette?: string[];
  /** Drive themes */
  driveThemes?: Array<{
    id?: string;
    backgroundImageLink?: string;
    colorRgb?: string;
  }>;
  /** Can create drives */
  canCreateDrives?: boolean;
  /** Can create team drives */
  canCreateTeamDrives?: boolean;
}

/**
 * Google Drive watch channel
 */
export interface GoogleDriveChannel {
  /** Channel kind */
  kind?: string;
  /** Channel ID (generated by your app) */
  id: string;
  /** Resource ID (set by Google) */
  resourceId?: string;
  /** Resource URI */
  resourceUri?: string;
  /** Token (arbitrary string passed to callback) */
  token?: string;
  /** Expiration (Unix timestamp in ms) */
  expiration?: string;
  /** Channel type (always 'web_hook') */
  type: 'web_hook';
  /** Webhook URL */
  address: string;
  /** Additional params */
  params?: {
    ttl?: string;
  };
}

/**
 * Google Drive change
 */
export interface GoogleDriveChange {
  /** Change kind */
  kind?: string;
  /** Whether removed */
  removed?: boolean;
  /** Changed file */
  file?: GoogleDriveFile;
  /** File ID */
  fileId?: string;
  /** Change time */
  time?: string;
  /** Drive ID (for shared drives) */
  driveId?: string;
  /** Change type */
  changeType?: 'file' | 'drive';
  /** Drive (for shared drive changes) */
  drive?: GoogleDriveSharedDrive;
}

/**
 * Google Drive changes list response
 */
export interface GoogleDriveChangesResponse {
  /** Kind */
  kind?: string;
  /** Next page token */
  nextPageToken?: string;
  /** New start page token (when changes exhausted) */
  newStartPageToken?: string;
  /** Changes */
  changes: GoogleDriveChange[];
}

/**
 * Google Drive shared drive
 */
export interface GoogleDriveSharedDrive {
  /** Drive ID */
  id?: string;
  /** Drive name */
  name?: string;
  /** Color RGB */
  colorRgb?: string;
  /** Kind */
  kind?: string;
  /** Theme ID */
  themeId?: string;
  /** Background image link */
  backgroundImageLink?: string;
  /** Background image file */
  backgroundImageFile?: {
    id?: string;
    xCoordinate?: number;
    yCoordinate?: number;
    width?: number;
  };
  /** Capabilities */
  capabilities?: GoogleDriveCapabilities;
  /** Creation time */
  createdTime?: string;
  /** Whether hidden */
  hidden?: boolean;
  /** Restrictions */
  restrictions?: {
    adminManagedRestrictions?: boolean;
    copyRequiresWriterPermission?: boolean;
    domainUsersOnly?: boolean;
    driveMembersOnly?: boolean;
    sharingFoldersRequiresOrganizerPermission?: boolean;
  };
  /** Organization unit ID */
  orgUnitId?: string;
}

/**
 * Google Drive comment
 */
export interface GoogleDriveComment {
  /** Comment ID */
  id?: string;
  /** Kind */
  kind?: string;
  /** Created time */
  createdTime?: string;
  /** Modified time */
  modifiedTime?: string;
  /** Author */
  author?: GoogleDriveUser;
  /** HTML content */
  htmlContent?: string;
  /** Plain text content */
  content?: string;
  /** Whether deleted */
  deleted?: boolean;
  /** Whether resolved */
  resolved?: boolean;
  /** Quoted file content */
  quotedFileContent?: {
    mimeType?: string;
    value?: string;
  };
  /** Anchor (region of file) */
  anchor?: string;
  /** Replies */
  replies?: GoogleDriveReply[];
}

/**
 * Google Drive reply
 */
export interface GoogleDriveReply {
  /** Reply ID */
  id?: string;
  /** Kind */
  kind?: string;
  /** Created time */
  createdTime?: string;
  /** Modified time */
  modifiedTime?: string;
  /** Author */
  author?: GoogleDriveUser;
  /** HTML content */
  htmlContent?: string;
  /** Plain text content */
  content?: string;
  /** Whether deleted */
  deleted?: boolean;
  /** Action (resolve/reopen) */
  action?: 'resolve' | 'reopen';
}

/**
 * Google Drive revision
 */
export interface GoogleDriveRevision {
  /** Revision ID */
  id?: string;
  /** Kind */
  kind?: string;
  /** MIME type */
  mimeType?: string;
  /** Modified time */
  modifiedTime?: string;
  /** Keep forever flag */
  keepForever?: boolean;
  /** Whether published */
  published?: boolean;
  /** Publish auto flag */
  publishAuto?: boolean;
  /** Published outside domain flag */
  publishedOutsideDomain?: boolean;
  /** Published link */
  publishedLink?: string;
  /** Last modifying user */
  lastModifyingUser?: GoogleDriveUser;
  /** Original filename */
  originalFilename?: string;
  /** MD5 checksum */
  md5Checksum?: string;
  /** Size */
  size?: string;
  /** Export links */
  exportLinks?: Record<string, string>;
}

/**
 * Input for creating a Google Drive file
 */
export interface CreateGoogleDriveFileInput {
  /** File name */
  name: string;
  /** Parent folder IDs */
  parents?: string[];
  /** MIME type */
  mimeType?: string;
  /** Description */
  description?: string;
  /** Whether starred */
  starred?: boolean;
  /** File properties */
  properties?: Record<string, string>;
  /** App properties */
  appProperties?: Record<string, string>;
  /** Folder color RGB */
  folderColorRgb?: string;
  /** Content hints */
  contentHints?: GoogleDriveContentHints;
  /** Copy requires writer permission */
  copyRequiresWriterPermission?: boolean;
  /** Writers can share */
  writersCanShare?: boolean;
  /** Viewers can copy content */
  viewersCanCopyContent?: boolean;
}

/**
 * Input for updating a Google Drive file
 */
export interface UpdateGoogleDriveFileInput {
  /** File name */
  name?: string;
  /** Description */
  description?: string;
  /** Whether starred */
  starred?: boolean;
  /** Whether trashed */
  trashed?: boolean;
  /** File properties */
  properties?: Record<string, string>;
  /** App properties */
  appProperties?: Record<string, string>;
  /** Folder color RGB */
  folderColorRgb?: string;
  /** Content hints */
  contentHints?: GoogleDriveContentHints;
  /** Copy requires writer permission */
  copyRequiresWriterPermission?: boolean;
  /** Writers can share */
  writersCanShare?: boolean;
  /** Viewers can copy content */
  viewersCanCopyContent?: boolean;
  /** Add parents (folder IDs to add) */
  addParents?: string[];
  /** Remove parents (folder IDs to remove) */
  removeParents?: string[];
}

/**
 * Google Drive webhook notification headers
 */
export interface GoogleDriveWebhookHeaders {
  /** Channel ID */
  'x-goog-channel-id'?: string;
  /** Channel token */
  'x-goog-channel-token'?: string;
  /** Channel expiration (Unix timestamp ms) */
  'x-goog-channel-expiration'?: string;
  /** Resource ID */
  'x-goog-resource-id'?: string;
  /** Resource URI */
  'x-goog-resource-uri'?: string;
  /** Resource state */
  'x-goog-resource-state'?: 'sync' | 'add' | 'remove' | 'update' | 'trash' | 'untrash' | 'change';
  /** Message number */
  'x-goog-message-number'?: string;
  /** Changed fields (comma-separated) */
  'x-goog-changed'?: string;
}

/**
 * Export format for Google Docs files
 */
export interface GoogleDocsExportFormat {
  /** Export MIME type */
  mimeType: string;
  /** File extension */
  extension: string;
}

/**
 * Google Docs MIME type mappings
 */
export const GOOGLE_DOCS_MIME_TYPES = {
  DOCUMENT: 'application/vnd.google-apps.document',
  SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
  PRESENTATION: 'application/vnd.google-apps.presentation',
  DRAWING: 'application/vnd.google-apps.drawing',
  FORM: 'application/vnd.google-apps.form',
  SCRIPT: 'application/vnd.google-apps.script',
  SITE: 'application/vnd.google-apps.site',
  FOLDER: 'application/vnd.google-apps.folder',
  SHORTCUT: 'application/vnd.google-apps.shortcut',
} as const;

/**
 * Default export formats for Google Docs types
 */
export const GOOGLE_DOCS_EXPORT_FORMATS: Record<string, GoogleDocsExportFormat> = {
  [GOOGLE_DOCS_MIME_TYPES.DOCUMENT]: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
  },
  [GOOGLE_DOCS_MIME_TYPES.SPREADSHEET]: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
  },
  [GOOGLE_DOCS_MIME_TYPES.PRESENTATION]: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: '.pptx',
  },
  [GOOGLE_DOCS_MIME_TYPES.DRAWING]: {
    mimeType: 'image/png',
    extension: '.png',
  },
};
