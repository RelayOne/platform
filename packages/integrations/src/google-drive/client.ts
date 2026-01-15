/**
 * @fileoverview Google Drive API client
 * @module @relay/integrations/google-drive/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  GoogleDriveConfig,
  GoogleDriveFile,
  GoogleDriveListResponse,
  GoogleDriveAbout,
  GoogleDriveChannel,
  GoogleDriveChange,
  GoogleDriveChangesResponse,
  GoogleDriveSharedDrive,
  GoogleDriveComment,
  GoogleDriveReply,
  GoogleDriveRevision,
  GoogleDrivePermission,
  CreateGoogleDriveFileInput,
  UpdateGoogleDriveFileInput,
  GOOGLE_DOCS_EXPORT_FORMATS,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, User } from '../common/types';

/**
 * Google Drive integration source identifier
 */
const SOURCE: IntegrationSource = 'google-drive';

/**
 * Google Drive API base URL
 */
const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

/**
 * Google Drive upload API base URL
 */
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Default fields for file queries
 */
const DEFAULT_FILE_FIELDS = [
  'id',
  'name',
  'mimeType',
  'description',
  'starred',
  'trashed',
  'parents',
  'properties',
  'appProperties',
  'version',
  'md5Checksum',
  'size',
  'quotaBytesUsed',
  'createdTime',
  'modifiedTime',
  'modifiedByMeTime',
  'viewedByMeTime',
  'sharedWithMeTime',
  'sharingUser',
  'owners',
  'lastModifyingUser',
  'shared',
  'ownedByMe',
  'capabilities',
  'viewersCanCopyContent',
  'copyRequiresWriterPermission',
  'writersCanShare',
  'permissions',
  'permissionIds',
  'folderColorRgb',
  'originalFilename',
  'fullFileExtension',
  'fileExtension',
  'webContentLink',
  'webViewLink',
  'iconLink',
  'hasThumbnail',
  'thumbnailLink',
  'thumbnailVersion',
  'imageMediaMetadata',
  'videoMediaMetadata',
  'exportLinks',
  'shortcutDetails',
  'resourceKey',
].join(',');

/**
 * Google Drive API client
 * Provides methods for files, folders, permissions, comments, and changes
 */
export class GoogleDriveClient {
  private http: AxiosInstance;
  private config: GoogleDriveConfig;

  /**
   * Creates a new Google Drive client
   * @param config - Google Drive configuration
   */
  constructor(config: GoogleDriveConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: GOOGLE_DRIVE_API_URL,
      timeout: config.timeout || 30000,
    });

    // Add Bearer token to all requests
    this.http.interceptors.request.use((request) => {
      request.headers.Authorization = `Bearer ${config.accessToken}`;
      return request;
    });

    // Add error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.data) {
          const data = error.response.data as {
            error?: { message?: string; code?: number; errors?: unknown[] };
          };
          throw new IntegrationError(
            data.error?.message || 'Google Drive API error',
            this.mapHttpStatus(error.response.status),
            SOURCE,
            {
              statusCode: error.response.status,
              code: data.error?.code,
              errors: data.error?.errors,
            }
          );
        }
        throw error;
      }
    );
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: GoogleDriveConfig): void {
    if (!config.accessToken) {
      throw new ConfigurationError(SOURCE, 'Google Drive access token is required');
    }
  }

  /**
   * Maps HTTP status to error code
   * @param status - HTTP status code
   * @returns Integration error code
   */
  private mapHttpStatus(status: number): IntegrationErrorCode {
    const statusMap: Record<number, IntegrationErrorCode> = {
      401: IntegrationErrorCode.AUTH_FAILED,
      403: IntegrationErrorCode.FORBIDDEN,
      404: IntegrationErrorCode.NOT_FOUND,
      429: IntegrationErrorCode.RATE_LIMITED,
      400: IntegrationErrorCode.INVALID_REQUEST,
    };
    return statusMap[status] || IntegrationErrorCode.PROVIDER_ERROR;
  }

  // ==========================================================================
  // About Operations
  // ==========================================================================

  /**
   * Gets information about the user and their Drive
   * @returns About information
   */
  async getAbout(): Promise<GoogleDriveAbout> {
    return withRetry(async () => {
      const fields = [
        'user',
        'storageQuota',
        'importFormats',
        'exportFormats',
        'maxImportSizes',
        'maxUploadSize',
        'appInstalled',
        'folderColorPalette',
        'driveThemes',
        'canCreateDrives',
        'canCreateTeamDrives',
      ].join(',');

      const { data } = await this.http.get<GoogleDriveAbout>('/about', {
        params: { fields },
      });
      return data;
    });
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Gets a file by ID
   * @param fileId - File ID
   * @param fields - Fields to return
   * @returns File metadata
   */
  async getFile(fileId: string, fields?: string): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDriveFile>(`/files/${fileId}`, {
        params: { fields: fields || DEFAULT_FILE_FIELDS },
      });
      return data;
    });
  }

  /**
   * Lists files
   * @param options - List options
   * @returns Files and pagination info
   */
  async listFiles(options?: {
    query?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
    fields?: string;
    spaces?: string;
    corpora?: 'user' | 'domain' | 'drive' | 'allDrives';
    driveId?: string;
    includeItemsFromAllDrives?: boolean;
    supportsAllDrives?: boolean;
  }): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDriveListResponse>('/files', {
        params: {
          q: options?.query,
          pageSize: options?.pageSize || 100,
          pageToken: options?.pageToken,
          orderBy: options?.orderBy || 'modifiedTime desc',
          fields: options?.fields
            ? `nextPageToken,incompleteSearch,files(${options.fields})`
            : `nextPageToken,incompleteSearch,files(${DEFAULT_FILE_FIELDS})`,
          spaces: options?.spaces || 'drive',
          corpora: options?.corpora,
          driveId: options?.driveId,
          includeItemsFromAllDrives: options?.includeItemsFromAllDrives,
          supportsAllDrives: options?.supportsAllDrives,
        },
      });

      return {
        files: data.files || [],
        nextPageToken: data.nextPageToken,
      };
    });
  }

  /**
   * Lists files in a folder
   * @param folderId - Folder ID (use 'root' for root folder)
   * @param options - List options
   * @returns Files in folder
   */
  async listFolder(
    folderId: string = 'root',
    options?: {
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
      includeTrash?: boolean;
    }
  ): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    const query = `'${folderId}' in parents${options?.includeTrash ? '' : ' and trashed = false'}`;
    return this.listFiles({
      query,
      pageSize: options?.pageSize,
      pageToken: options?.pageToken,
      orderBy: options?.orderBy || 'folder,name',
    });
  }

  /**
   * Searches for files
   * @param searchTerm - Search term
   * @param options - Search options
   * @returns Matching files
   */
  async searchFiles(
    searchTerm: string,
    options?: {
      pageSize?: number;
      pageToken?: string;
      mimeType?: string;
      folderId?: string;
      includeTrash?: boolean;
    }
  ): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    const queryParts: string[] = [`name contains '${escapedTerm}'`];

    if (!options?.includeTrash) {
      queryParts.push('trashed = false');
    }
    if (options?.mimeType) {
      queryParts.push(`mimeType = '${options.mimeType}'`);
    }
    if (options?.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    }

    return this.listFiles({
      query: queryParts.join(' and '),
      pageSize: options?.pageSize,
      pageToken: options?.pageToken,
    });
  }

  /**
   * Creates a new file (metadata only)
   * @param input - File creation input
   * @returns Created file
   */
  async createFile(input: CreateGoogleDriveFileInput): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveFile>('/files', input, {
        params: { fields: DEFAULT_FILE_FIELDS },
      });
      return data;
    });
  }

  /**
   * Creates a folder
   * @param name - Folder name
   * @param parentId - Parent folder ID (optional)
   * @returns Created folder
   */
  async createFolder(name: string, parentId?: string): Promise<GoogleDriveFile> {
    return this.createFile({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    });
  }

  /**
   * Uploads a file with content
   * @param input - File metadata
   * @param content - File content
   * @param mimeType - Content MIME type
   * @returns Created file
   */
  async uploadFile(
    input: CreateGoogleDriveFileInput,
    content: Buffer | string,
    mimeType: string
  ): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      // Use multipart upload for smaller files
      const boundary = `----${Date.now()}`;
      const metadata = JSON.stringify(input);
      const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;

      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\n`),
        Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
        Buffer.from(metadata),
        Buffer.from(`\r\n--${boundary}\r\n`),
        Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
        contentBuffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const response = await axios.post<GoogleDriveFile>(
        `${GOOGLE_DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=${DEFAULT_FILE_FIELDS}`,
        body,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
        }
      );

      return response.data;
    });
  }

  /**
   * Updates file metadata
   * @param fileId - File ID
   * @param input - Update input
   * @returns Updated file
   */
  async updateFile(fileId: string, input: UpdateGoogleDriveFileInput): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      const { addParents, removeParents, ...metadata } = input;
      const { data } = await this.http.patch<GoogleDriveFile>(`/files/${fileId}`, metadata, {
        params: {
          fields: DEFAULT_FILE_FIELDS,
          addParents: addParents?.join(','),
          removeParents: removeParents?.join(','),
        },
      });
      return data;
    });
  }

  /**
   * Updates file content
   * @param fileId - File ID
   * @param content - New content
   * @param mimeType - Content MIME type
   * @returns Updated file
   */
  async updateFileContent(
    fileId: string,
    content: Buffer | string,
    mimeType: string
  ): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;

      const response = await axios.patch<GoogleDriveFile>(
        `${GOOGLE_DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media&fields=${DEFAULT_FILE_FIELDS}`,
        contentBuffer,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': mimeType,
          },
        }
      );

      return response.data;
    });
  }

  /**
   * Copies a file
   * @param fileId - File ID to copy
   * @param input - Optional metadata for the copy
   * @returns Copied file
   */
  async copyFile(fileId: string, input?: CreateGoogleDriveFileInput): Promise<GoogleDriveFile> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveFile>(`/files/${fileId}/copy`, input || {}, {
        params: { fields: DEFAULT_FILE_FIELDS },
      });
      return data;
    });
  }

  /**
   * Moves a file to trash
   * @param fileId - File ID
   * @returns Updated file
   */
  async trashFile(fileId: string): Promise<GoogleDriveFile> {
    return this.updateFile(fileId, { trashed: true });
  }

  /**
   * Restores a file from trash
   * @param fileId - File ID
   * @returns Updated file
   */
  async untrashFile(fileId: string): Promise<GoogleDriveFile> {
    return this.updateFile(fileId, { trashed: false });
  }

  /**
   * Permanently deletes a file
   * @param fileId - File ID
   */
  async deleteFile(fileId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/files/${fileId}`);
    });
  }

  /**
   * Empties the trash
   */
  async emptyTrash(): Promise<void> {
    return withRetry(async () => {
      await this.http.delete('/files/trash');
    });
  }

  /**
   * Downloads a file
   * @param fileId - File ID
   * @returns File content as Buffer
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    return withRetry(async () => {
      const response = await axios.get(`${GOOGLE_DRIVE_API_URL}/files/${fileId}`, {
        params: { alt: 'media' },
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    });
  }

  /**
   * Exports a Google Docs file to a different format
   * @param fileId - File ID
   * @param mimeType - Export MIME type
   * @returns Exported content as Buffer
   */
  async exportFile(fileId: string, mimeType: string): Promise<Buffer> {
    return withRetry(async () => {
      const response = await axios.get(`${GOOGLE_DRIVE_API_URL}/files/${fileId}/export`, {
        params: { mimeType },
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    });
  }

  /**
   * Generates IDs for future file creation
   * @param count - Number of IDs to generate
   * @param space - Space for IDs (drive, appDataFolder)
   * @returns Generated IDs
   */
  async generateIds(count: number = 10, space: string = 'drive'): Promise<string[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ ids: string[] }>('/files/generateIds', {
        params: { count, space },
      });
      return data.ids;
    });
  }

  // ==========================================================================
  // Permission Operations
  // ==========================================================================

  /**
   * Lists permissions for a file
   * @param fileId - File ID
   * @returns Permissions
   */
  async listPermissions(fileId: string): Promise<GoogleDrivePermission[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ permissions: GoogleDrivePermission[] }>(
        `/files/${fileId}/permissions`,
        {
          params: {
            fields: 'permissions(id,type,emailAddress,domain,role,displayName,photoLink,expirationTime,deleted,pendingOwner)',
          },
        }
      );
      return data.permissions || [];
    });
  }

  /**
   * Gets a permission
   * @param fileId - File ID
   * @param permissionId - Permission ID
   * @returns Permission
   */
  async getPermission(fileId: string, permissionId: string): Promise<GoogleDrivePermission> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDrivePermission>(
        `/files/${fileId}/permissions/${permissionId}`,
        {
          params: {
            fields: 'id,type,emailAddress,domain,role,displayName,photoLink,expirationTime,deleted,pendingOwner',
          },
        }
      );
      return data;
    });
  }

  /**
   * Creates a permission (shares a file)
   * @param fileId - File ID
   * @param permission - Permission to create
   * @param options - Creation options
   * @returns Created permission
   */
  async createPermission(
    fileId: string,
    permission: {
      type: 'user' | 'group' | 'domain' | 'anyone';
      role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
      emailAddress?: string;
      domain?: string;
      allowFileDiscovery?: boolean;
      expirationTime?: string;
    },
    options?: {
      sendNotificationEmail?: boolean;
      emailMessage?: string;
      transferOwnership?: boolean;
      moveToNewOwnersRoot?: boolean;
    }
  ): Promise<GoogleDrivePermission> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDrivePermission>(
        `/files/${fileId}/permissions`,
        permission,
        {
          params: {
            sendNotificationEmail: options?.sendNotificationEmail,
            emailMessage: options?.emailMessage,
            transferOwnership: options?.transferOwnership,
            moveToNewOwnersRoot: options?.moveToNewOwnersRoot,
            fields: 'id,type,emailAddress,domain,role,displayName,photoLink,expirationTime',
          },
        }
      );
      return data;
    });
  }

  /**
   * Updates a permission
   * @param fileId - File ID
   * @param permissionId - Permission ID
   * @param updates - Updates to apply
   * @returns Updated permission
   */
  async updatePermission(
    fileId: string,
    permissionId: string,
    updates: {
      role?: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
      expirationTime?: string;
    }
  ): Promise<GoogleDrivePermission> {
    return withRetry(async () => {
      const { data } = await this.http.patch<GoogleDrivePermission>(
        `/files/${fileId}/permissions/${permissionId}`,
        updates,
        {
          params: {
            fields: 'id,type,emailAddress,domain,role,displayName,photoLink,expirationTime',
          },
        }
      );
      return data;
    });
  }

  /**
   * Deletes a permission (unshares)
   * @param fileId - File ID
   * @param permissionId - Permission ID
   */
  async deletePermission(fileId: string, permissionId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/files/${fileId}/permissions/${permissionId}`);
    });
  }

  // ==========================================================================
  // Comment Operations
  // ==========================================================================

  /**
   * Lists comments on a file
   * @param fileId - File ID
   * @param options - List options
   * @returns Comments
   */
  async listComments(
    fileId: string,
    options?: {
      pageSize?: number;
      pageToken?: string;
      includeDeleted?: boolean;
      startModifiedTime?: string;
    }
  ): Promise<{ comments: GoogleDriveComment[]; nextPageToken?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ comments: GoogleDriveComment[]; nextPageToken?: string }>(
        `/files/${fileId}/comments`,
        {
          params: {
            pageSize: options?.pageSize || 100,
            pageToken: options?.pageToken,
            includeDeleted: options?.includeDeleted,
            startModifiedTime: options?.startModifiedTime,
            fields: 'nextPageToken,comments(id,createdTime,modifiedTime,author,htmlContent,content,deleted,resolved,quotedFileContent,anchor,replies)',
          },
        }
      );
      return {
        comments: data.comments || [],
        nextPageToken: data.nextPageToken,
      };
    });
  }

  /**
   * Creates a comment on a file
   * @param fileId - File ID
   * @param content - Comment content
   * @param options - Comment options
   * @returns Created comment
   */
  async createComment(
    fileId: string,
    content: string,
    options?: {
      anchor?: string;
      quotedFileContent?: { mimeType: string; value: string };
    }
  ): Promise<GoogleDriveComment> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveComment>(`/files/${fileId}/comments`, {
        content,
        anchor: options?.anchor,
        quotedFileContent: options?.quotedFileContent,
      }, {
        params: {
          fields: 'id,createdTime,modifiedTime,author,htmlContent,content,deleted,resolved,quotedFileContent,anchor,replies',
        },
      });
      return data;
    });
  }

  /**
   * Deletes a comment
   * @param fileId - File ID
   * @param commentId - Comment ID
   */
  async deleteComment(fileId: string, commentId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/files/${fileId}/comments/${commentId}`);
    });
  }

  /**
   * Creates a reply to a comment
   * @param fileId - File ID
   * @param commentId - Comment ID
   * @param content - Reply content
   * @param action - Optional action (resolve/reopen)
   * @returns Created reply
   */
  async createReply(
    fileId: string,
    commentId: string,
    content: string,
    action?: 'resolve' | 'reopen'
  ): Promise<GoogleDriveReply> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveReply>(
        `/files/${fileId}/comments/${commentId}/replies`,
        { content, action },
        {
          params: {
            fields: 'id,createdTime,modifiedTime,author,htmlContent,content,deleted,action',
          },
        }
      );
      return data;
    });
  }

  // ==========================================================================
  // Revision Operations
  // ==========================================================================

  /**
   * Lists revisions of a file
   * @param fileId - File ID
   * @param options - List options
   * @returns Revisions
   */
  async listRevisions(
    fileId: string,
    options?: { pageSize?: number; pageToken?: string }
  ): Promise<{ revisions: GoogleDriveRevision[]; nextPageToken?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ revisions: GoogleDriveRevision[]; nextPageToken?: string }>(
        `/files/${fileId}/revisions`,
        {
          params: {
            pageSize: options?.pageSize || 100,
            pageToken: options?.pageToken,
            fields: 'nextPageToken,revisions(id,mimeType,modifiedTime,keepForever,published,publishAuto,publishedOutsideDomain,publishedLink,lastModifyingUser,originalFilename,md5Checksum,size,exportLinks)',
          },
        }
      );
      return {
        revisions: data.revisions || [],
        nextPageToken: data.nextPageToken,
      };
    });
  }

  /**
   * Gets a specific revision
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @returns Revision
   */
  async getRevision(fileId: string, revisionId: string): Promise<GoogleDriveRevision> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDriveRevision>(
        `/files/${fileId}/revisions/${revisionId}`,
        {
          params: {
            fields: 'id,mimeType,modifiedTime,keepForever,published,publishAuto,publishedOutsideDomain,publishedLink,lastModifyingUser,originalFilename,md5Checksum,size,exportLinks',
          },
        }
      );
      return data;
    });
  }

  /**
   * Downloads a specific revision
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @returns Revision content as Buffer
   */
  async downloadRevision(fileId: string, revisionId: string): Promise<Buffer> {
    return withRetry(async () => {
      const response = await axios.get(
        `${GOOGLE_DRIVE_API_URL}/files/${fileId}/revisions/${revisionId}`,
        {
          params: { alt: 'media' },
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    });
  }

  /**
   * Updates a revision
   * @param fileId - File ID
   * @param revisionId - Revision ID
   * @param updates - Updates to apply
   * @returns Updated revision
   */
  async updateRevision(
    fileId: string,
    revisionId: string,
    updates: {
      keepForever?: boolean;
      published?: boolean;
      publishAuto?: boolean;
      publishedOutsideDomain?: boolean;
    }
  ): Promise<GoogleDriveRevision> {
    return withRetry(async () => {
      const { data } = await this.http.patch<GoogleDriveRevision>(
        `/files/${fileId}/revisions/${revisionId}`,
        updates
      );
      return data;
    });
  }

  /**
   * Deletes a revision
   * @param fileId - File ID
   * @param revisionId - Revision ID
   */
  async deleteRevision(fileId: string, revisionId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/files/${fileId}/revisions/${revisionId}`);
    });
  }

  // ==========================================================================
  // Changes (Watch) Operations
  // ==========================================================================

  /**
   * Gets the starting page token for changes
   * @param options - Options
   * @returns Start page token
   */
  async getStartPageToken(options?: {
    driveId?: string;
    supportsAllDrives?: boolean;
  }): Promise<string> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ startPageToken: string }>('/changes/startPageToken', {
        params: {
          driveId: options?.driveId,
          supportsAllDrives: options?.supportsAllDrives,
        },
      });
      return data.startPageToken;
    });
  }

  /**
   * Lists changes since the given page token
   * @param pageToken - Page token
   * @param options - List options
   * @returns Changes
   */
  async listChanges(
    pageToken: string,
    options?: {
      pageSize?: number;
      restrictToMyDrive?: boolean;
      spaces?: string;
      includeItemsFromAllDrives?: boolean;
      supportsAllDrives?: boolean;
      driveId?: string;
      includeRemoved?: boolean;
    }
  ): Promise<GoogleDriveChangesResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDriveChangesResponse>('/changes', {
        params: {
          pageToken,
          pageSize: options?.pageSize || 100,
          restrictToMyDrive: options?.restrictToMyDrive,
          spaces: options?.spaces || 'drive',
          includeItemsFromAllDrives: options?.includeItemsFromAllDrives,
          supportsAllDrives: options?.supportsAllDrives,
          driveId: options?.driveId,
          includeRemoved: options?.includeRemoved ?? true,
          fields: `nextPageToken,newStartPageToken,changes(removed,file(${DEFAULT_FILE_FIELDS}),fileId,time,driveId,changeType,drive)`,
        },
      });
      return data;
    });
  }

  /**
   * Creates a watch channel for changes
   * @param pageToken - Page token to start watching from
   * @param channel - Channel configuration
   * @returns Created channel
   */
  async watchChanges(pageToken: string, channel: GoogleDriveChannel): Promise<GoogleDriveChannel> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveChannel>('/changes/watch', channel, {
        params: { pageToken },
      });
      return data;
    });
  }

  /**
   * Stops a watch channel
   * @param channel - Channel to stop
   */
  async stopChannel(channel: { id: string; resourceId: string }): Promise<void> {
    return withRetry(async () => {
      await this.http.post('/channels/stop', channel);
    });
  }

  /**
   * Creates a watch channel for a specific file
   * @param fileId - File ID to watch
   * @param channel - Channel configuration
   * @returns Created channel
   */
  async watchFile(fileId: string, channel: GoogleDriveChannel): Promise<GoogleDriveChannel> {
    return withRetry(async () => {
      const { data } = await this.http.post<GoogleDriveChannel>(`/files/${fileId}/watch`, channel);
      return data;
    });
  }

  // ==========================================================================
  // Shared Drives Operations
  // ==========================================================================

  /**
   * Lists shared drives
   * @param options - List options
   * @returns Shared drives
   */
  async listSharedDrives(options?: {
    pageSize?: number;
    pageToken?: string;
    query?: string;
    useDomainAdminAccess?: boolean;
  }): Promise<{ drives: GoogleDriveSharedDrive[]; nextPageToken?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ drives: GoogleDriveSharedDrive[]; nextPageToken?: string }>(
        '/drives',
        {
          params: {
            pageSize: options?.pageSize || 100,
            pageToken: options?.pageToken,
            q: options?.query,
            useDomainAdminAccess: options?.useDomainAdminAccess,
          },
        }
      );
      return {
        drives: data.drives || [],
        nextPageToken: data.nextPageToken,
      };
    });
  }

  /**
   * Gets a shared drive
   * @param driveId - Drive ID
   * @returns Shared drive
   */
  async getSharedDrive(driveId: string): Promise<GoogleDriveSharedDrive> {
    return withRetry(async () => {
      const { data } = await this.http.get<GoogleDriveSharedDrive>(`/drives/${driveId}`);
      return data;
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Tests the connection
   * @returns Whether connection is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAbout();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps Google Drive user to common User type
   * @param user - Google Drive user
   * @returns Common User type
   */
  mapToCommonUser(user: {
    displayName: string;
    emailAddress?: string;
    photoLink?: string;
    permissionId?: string;
    me?: boolean;
  }): User {
    return {
      id: user.permissionId || user.emailAddress || user.displayName,
      username: user.emailAddress || user.displayName,
      displayName: user.displayName,
      email: user.emailAddress,
      avatarUrl: user.photoLink,
    };
  }
}
