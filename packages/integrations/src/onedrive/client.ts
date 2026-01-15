/**
 * @fileoverview OneDrive/Microsoft Graph API client
 * @module @relay/integrations/onedrive/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  OneDriveConfig,
  OneDriveItem,
  OneDriveListResponse,
  OneDriveDrive,
  OneDriveUser,
  OneDrivePermission,
  OneDriveSubscription,
  OneDriveThumbnailSet,
  CreateOneDriveItemInput,
  UpdateOneDriveItemInput,
  CreateOneDriveSharingLinkInput,
  OneDriveSharingLink,
} from './types';
import { createHttpClient, withRetry } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, User } from '../common/types';

/**
 * OneDrive integration source identifier
 */
const SOURCE: IntegrationSource = 'onedrive';

/**
 * Microsoft Graph API base URL
 */
const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Default fields for item queries
 */
const DEFAULT_ITEM_SELECT = [
  'id',
  'name',
  'size',
  'createdDateTime',
  'lastModifiedDateTime',
  'webUrl',
  'webDavUrl',
  'description',
  'createdBy',
  'lastModifiedBy',
  'parentReference',
  'file',
  'folder',
  'image',
  'photo',
  'video',
  'audio',
  'deleted',
  'shared',
  'specialFolder',
  'remoteItem',
  'package',
  'root',
  '@microsoft.graph.downloadUrl',
].join(',');

/**
 * OneDrive API client
 * Provides methods for files, folders, permissions, and subscriptions
 */
export class OneDriveClient {
  private http: AxiosInstance;
  private config: OneDriveConfig;

  /**
   * Creates a new OneDrive client
   * @param config - OneDrive configuration
   */
  constructor(config: OneDriveConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: GRAPH_API_URL,
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
            error?: { message?: string; code?: string; innerError?: unknown };
          };
          throw new IntegrationError(
            data.error?.message || 'Microsoft Graph API error',
            this.mapHttpStatus(error.response.status),
            SOURCE,
            {
              statusCode: error.response.status,
              code: data.error?.code,
              innerError: data.error?.innerError,
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
  private validateConfig(config: OneDriveConfig): void {
    if (!config.accessToken) {
      throw new ConfigurationError(SOURCE, 'OneDrive access token is required');
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
      409: IntegrationErrorCode.CONFLICT,
    };
    return statusMap[status] || IntegrationErrorCode.PROVIDER_ERROR;
  }

  /**
   * Gets the drive path prefix for API calls
   */
  private getDrivePath(): string {
    if (this.config.driveId) {
      return `/drives/${this.config.driveId}`;
    }
    return '/me/drive';
  }

  // ==========================================================================
  // User Operations
  // ==========================================================================

  /**
   * Gets the current user
   * @returns Current user
   */
  async getCurrentUser(): Promise<OneDriveUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveUser>('/me', {
        params: {
          $select: 'id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,mobilePhone,officeLocation,businessPhones',
        },
      });
      return data;
    });
  }

  // ==========================================================================
  // Drive Operations
  // ==========================================================================

  /**
   * Gets the current user's default drive
   * @returns Drive information
   */
  async getDrive(): Promise<OneDriveDrive> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveDrive>(`${this.getDrivePath()}`);
      return data;
    });
  }

  /**
   * Lists all drives available to the user
   * @returns List of drives
   */
  async listDrives(): Promise<OneDriveDrive[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ value: OneDriveDrive[] }>('/me/drives');
      return data.value || [];
    });
  }

  /**
   * Gets a shared drive by ID
   * @param driveId - Drive ID
   * @returns Drive information
   */
  async getSharedDrive(driveId: string): Promise<OneDriveDrive> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveDrive>(`/drives/${driveId}`);
      return data;
    });
  }

  // ==========================================================================
  // Item Operations
  // ==========================================================================

  /**
   * Gets an item by ID
   * @param itemId - Item ID
   * @returns Item
   */
  async getItem(itemId: string): Promise<OneDriveItem> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveItem>(
        `${this.getDrivePath()}/items/${itemId}`,
        {
          params: { $select: DEFAULT_ITEM_SELECT },
        }
      );
      return data;
    });
  }

  /**
   * Gets an item by path
   * @param path - Item path (e.g., '/Documents/report.docx')
   * @returns Item
   */
  async getItemByPath(path: string): Promise<OneDriveItem> {
    return withRetry(async () => {
      // Encode path components but not the slashes
      const encodedPath = path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      const { data } = await this.http.get<OneDriveItem>(
        `${this.getDrivePath()}/root:${encodedPath}`,
        {
          params: { $select: DEFAULT_ITEM_SELECT },
        }
      );
      return data;
    });
  }

  /**
   * Lists children of an item
   * @param itemId - Item ID (use 'root' for root folder)
   * @param options - List options
   * @returns Items and pagination info
   */
  async listChildren(
    itemId: string = 'root',
    options?: {
      top?: number;
      skip?: number;
      orderBy?: string;
      filter?: string;
      select?: string;
      expand?: string;
    }
  ): Promise<{ items: OneDriveItem[]; nextLink?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveListResponse>(
        `${this.getDrivePath()}/items/${itemId}/children`,
        {
          params: {
            $top: options?.top || 100,
            $skip: options?.skip,
            $orderby: options?.orderBy,
            $filter: options?.filter,
            $select: options?.select || DEFAULT_ITEM_SELECT,
            $expand: options?.expand,
          },
        }
      );

      return {
        items: data.value || [],
        nextLink: data['@odata.nextLink'],
      };
    });
  }

  /**
   * Lists children by path
   * @param path - Folder path
   * @param options - List options
   * @returns Items and pagination info
   */
  async listChildrenByPath(
    path: string,
    options?: {
      top?: number;
      orderBy?: string;
      select?: string;
    }
  ): Promise<{ items: OneDriveItem[]; nextLink?: string }> {
    return withRetry(async () => {
      const encodedPath = path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      const { data } = await this.http.get<OneDriveListResponse>(
        `${this.getDrivePath()}/root:${encodedPath}:/children`,
        {
          params: {
            $top: options?.top || 100,
            $orderby: options?.orderBy,
            $select: options?.select || DEFAULT_ITEM_SELECT,
          },
        }
      );

      return {
        items: data.value || [],
        nextLink: data['@odata.nextLink'],
      };
    });
  }

  /**
   * Gets the next page of results
   * @param nextLink - Next link URL from previous response
   * @returns Items and next link
   */
  async getNextPage(nextLink: string): Promise<{ items: OneDriveItem[]; nextLink?: string }> {
    return withRetry(async () => {
      const response = await axios.get<OneDriveListResponse>(nextLink, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      return {
        items: response.data.value || [],
        nextLink: response.data['@odata.nextLink'],
      };
    });
  }

  /**
   * Searches for items
   * @param query - Search query
   * @param options - Search options
   * @returns Matching items
   */
  async searchItems(
    query: string,
    options?: {
      top?: number;
      select?: string;
    }
  ): Promise<{ items: OneDriveItem[]; nextLink?: string }> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveListResponse>(
        `${this.getDrivePath()}/root/search(q='${encodeURIComponent(query)}')`,
        {
          params: {
            $top: options?.top || 100,
            $select: options?.select || DEFAULT_ITEM_SELECT,
          },
        }
      );

      return {
        items: data.value || [],
        nextLink: data['@odata.nextLink'],
      };
    });
  }

  /**
   * Creates a folder
   * @param parentId - Parent folder ID
   * @param name - Folder name
   * @param conflictBehavior - Conflict behavior
   * @returns Created folder
   */
  async createFolder(
    parentId: string,
    name: string,
    conflictBehavior: 'rename' | 'replace' | 'fail' = 'fail'
  ): Promise<OneDriveItem> {
    return withRetry(async () => {
      const { data } = await this.http.post<OneDriveItem>(
        `${this.getDrivePath()}/items/${parentId}/children`,
        {
          name,
          folder: {},
          '@microsoft.graph.conflictBehavior': conflictBehavior,
        }
      );
      return data;
    });
  }

  /**
   * Uploads a small file (up to 4MB)
   * @param parentId - Parent folder ID
   * @param filename - File name
   * @param content - File content
   * @param conflictBehavior - Conflict behavior
   * @returns Created file
   */
  async uploadSmallFile(
    parentId: string,
    filename: string,
    content: Buffer | string,
    conflictBehavior: 'rename' | 'replace' | 'fail' = 'fail'
  ): Promise<OneDriveItem> {
    return withRetry(async () => {
      const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;

      const response = await axios.put<OneDriveItem>(
        `${GRAPH_API_URL}${this.getDrivePath()}/items/${parentId}:/${encodeURIComponent(filename)}:/content`,
        contentBuffer,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/octet-stream',
          },
          params: {
            '@microsoft.graph.conflictBehavior': conflictBehavior,
          },
        }
      );

      return response.data;
    });
  }

  /**
   * Creates an upload session for large files (> 4MB)
   * @param parentId - Parent folder ID
   * @param filename - File name
   * @param fileSize - Total file size
   * @param conflictBehavior - Conflict behavior
   * @returns Upload session URL
   */
  async createUploadSession(
    parentId: string,
    filename: string,
    fileSize: number,
    conflictBehavior: 'rename' | 'replace' | 'fail' = 'fail'
  ): Promise<{ uploadUrl: string; expirationDateTime: string }> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ uploadUrl: string; expirationDateTime: string }>(
        `${this.getDrivePath()}/items/${parentId}:/${encodeURIComponent(filename)}:/createUploadSession`,
        {
          item: {
            '@microsoft.graph.conflictBehavior': conflictBehavior,
          },
        }
      );
      return data;
    });
  }

  /**
   * Uploads a chunk to an upload session
   * @param uploadUrl - Upload session URL
   * @param chunk - Chunk data
   * @param rangeStart - Start byte position
   * @param rangeEnd - End byte position
   * @param totalSize - Total file size
   * @returns Upload status or completed file
   */
  async uploadChunk(
    uploadUrl: string,
    chunk: Buffer,
    rangeStart: number,
    rangeEnd: number,
    totalSize: number
  ): Promise<OneDriveItem | { nextExpectedRanges: string[] }> {
    return withRetry(async () => {
      const response = await axios.put(uploadUrl, chunk, {
        headers: {
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
        },
      });

      return response.data;
    });
  }

  /**
   * Updates item metadata
   * @param itemId - Item ID
   * @param updates - Updates to apply
   * @returns Updated item
   */
  async updateItem(itemId: string, updates: UpdateOneDriveItemInput): Promise<OneDriveItem> {
    return withRetry(async () => {
      const { data } = await this.http.patch<OneDriveItem>(
        `${this.getDrivePath()}/items/${itemId}`,
        updates
      );
      return data;
    });
  }

  /**
   * Moves an item to a new location
   * @param itemId - Item ID
   * @param newParentId - New parent folder ID
   * @param newName - Optional new name
   * @returns Moved item
   */
  async moveItem(itemId: string, newParentId: string, newName?: string): Promise<OneDriveItem> {
    return this.updateItem(itemId, {
      parentReference: { id: newParentId },
      name: newName,
    });
  }

  /**
   * Copies an item
   * @param itemId - Item ID
   * @param newParentId - Destination parent folder ID
   * @param newName - Optional new name
   * @returns Copy operation location URL
   */
  async copyItem(itemId: string, newParentId: string, newName?: string): Promise<string> {
    return withRetry(async () => {
      const response = await this.http.post(
        `${this.getDrivePath()}/items/${itemId}/copy`,
        {
          parentReference: { id: newParentId },
          name: newName,
        },
        {
          validateStatus: (status) => status === 202,
        }
      );

      // Returns Location header with async operation URL
      return response.headers['location'] || '';
    });
  }

  /**
   * Deletes an item
   * @param itemId - Item ID
   */
  async deleteItem(itemId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`${this.getDrivePath()}/items/${itemId}`);
    });
  }

  /**
   * Downloads a file
   * @param itemId - Item ID
   * @returns File content as Buffer
   */
  async downloadFile(itemId: string): Promise<Buffer> {
    return withRetry(async () => {
      // Get the download URL first
      const item = await this.getItem(itemId);
      const downloadUrl = item['@microsoft.graph.downloadUrl'];

      if (!downloadUrl) {
        // Fallback to content endpoint
        const response = await axios.get(
          `${GRAPH_API_URL}${this.getDrivePath()}/items/${itemId}/content`,
          {
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
            },
            responseType: 'arraybuffer',
          }
        );
        return Buffer.from(response.data);
      }

      // Use the pre-authenticated download URL
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    });
  }

  // ==========================================================================
  // Permission Operations
  // ==========================================================================

  /**
   * Lists permissions for an item
   * @param itemId - Item ID
   * @returns Permissions
   */
  async listPermissions(itemId: string): Promise<OneDrivePermission[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ value: OneDrivePermission[] }>(
        `${this.getDrivePath()}/items/${itemId}/permissions`
      );
      return data.value || [];
    });
  }

  /**
   * Creates a sharing link
   * @param itemId - Item ID
   * @param input - Sharing link input
   * @returns Created permission with link
   */
  async createSharingLink(
    itemId: string,
    input: CreateOneDriveSharingLinkInput
  ): Promise<OneDrivePermission> {
    return withRetry(async () => {
      const { data } = await this.http.post<OneDrivePermission>(
        `${this.getDrivePath()}/items/${itemId}/createLink`,
        input
      );
      return data;
    });
  }

  /**
   * Shares an item with specific users
   * @param itemId - Item ID
   * @param recipients - Email addresses of recipients
   * @param roles - Roles to grant (read, write)
   * @param options - Sharing options
   * @returns Created permissions
   */
  async shareWithUsers(
    itemId: string,
    recipients: string[],
    roles: ('read' | 'write')[],
    options?: {
      message?: string;
      requireSignIn?: boolean;
      sendInvitation?: boolean;
      expirationDateTime?: string;
      password?: string;
    }
  ): Promise<OneDrivePermission[]> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ value: OneDrivePermission[] }>(
        `${this.getDrivePath()}/items/${itemId}/invite`,
        {
          recipients: recipients.map((email) => ({ email })),
          roles,
          message: options?.message,
          requireSignIn: options?.requireSignIn ?? true,
          sendInvitation: options?.sendInvitation ?? true,
          expirationDateTime: options?.expirationDateTime,
          password: options?.password,
        }
      );
      return data.value || [];
    });
  }

  /**
   * Updates a permission
   * @param itemId - Item ID
   * @param permissionId - Permission ID
   * @param roles - New roles
   * @returns Updated permission
   */
  async updatePermission(
    itemId: string,
    permissionId: string,
    roles: ('read' | 'write')[]
  ): Promise<OneDrivePermission> {
    return withRetry(async () => {
      const { data } = await this.http.patch<OneDrivePermission>(
        `${this.getDrivePath()}/items/${itemId}/permissions/${permissionId}`,
        { roles }
      );
      return data;
    });
  }

  /**
   * Deletes a permission
   * @param itemId - Item ID
   * @param permissionId - Permission ID
   */
  async deletePermission(itemId: string, permissionId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`${this.getDrivePath()}/items/${itemId}/permissions/${permissionId}`);
    });
  }

  // ==========================================================================
  // Thumbnail Operations
  // ==========================================================================

  /**
   * Gets thumbnails for an item
   * @param itemId - Item ID
   * @returns Thumbnails
   */
  async getThumbnails(itemId: string): Promise<OneDriveThumbnailSet[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ value: OneDriveThumbnailSet[] }>(
        `${this.getDrivePath()}/items/${itemId}/thumbnails`
      );
      return data.value || [];
    });
  }

  // ==========================================================================
  // Delta (Change Tracking) Operations
  // ==========================================================================

  /**
   * Gets changes since last sync
   * @param deltaToken - Delta token from previous call (undefined for initial sync)
   * @param options - Delta options
   * @returns Changes and delta link
   */
  async getDelta(
    deltaToken?: string,
    options?: {
      select?: string;
      top?: number;
    }
  ): Promise<{
    items: OneDriveItem[];
    deltaLink?: string;
    nextLink?: string;
  }> {
    return withRetry(async () => {
      let url: string;

      if (deltaToken) {
        // Use the delta token URL directly
        url = deltaToken;
      } else {
        // Initial sync
        url = `${GRAPH_API_URL}${this.getDrivePath()}/root/delta`;
      }

      const response = await axios.get<OneDriveListResponse>(url, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        params: deltaToken ? undefined : {
          $select: options?.select || DEFAULT_ITEM_SELECT,
          $top: options?.top,
        },
      });

      return {
        items: response.data.value || [],
        deltaLink: response.data['@odata.deltaLink'],
        nextLink: response.data['@odata.nextLink'],
      };
    });
  }

  // ==========================================================================
  // Subscription (Webhook) Operations
  // ==========================================================================

  /**
   * Creates a subscription for change notifications
   * @param subscription - Subscription configuration
   * @returns Created subscription
   */
  async createSubscription(subscription: Omit<OneDriveSubscription, 'id'>): Promise<OneDriveSubscription> {
    return withRetry(async () => {
      const { data } = await this.http.post<OneDriveSubscription>('/subscriptions', subscription);
      return data;
    });
  }

  /**
   * Gets a subscription
   * @param subscriptionId - Subscription ID
   * @returns Subscription
   */
  async getSubscription(subscriptionId: string): Promise<OneDriveSubscription> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveSubscription>(`/subscriptions/${subscriptionId}`);
      return data;
    });
  }

  /**
   * Updates a subscription (typically to renew)
   * @param subscriptionId - Subscription ID
   * @param expirationDateTime - New expiration date/time
   * @returns Updated subscription
   */
  async updateSubscription(
    subscriptionId: string,
    expirationDateTime: string
  ): Promise<OneDriveSubscription> {
    return withRetry(async () => {
      const { data } = await this.http.patch<OneDriveSubscription>(
        `/subscriptions/${subscriptionId}`,
        { expirationDateTime }
      );
      return data;
    });
  }

  /**
   * Deletes a subscription
   * @param subscriptionId - Subscription ID
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/subscriptions/${subscriptionId}`);
    });
  }

  /**
   * Lists all subscriptions
   * @returns Subscriptions
   */
  async listSubscriptions(): Promise<OneDriveSubscription[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ value: OneDriveSubscription[] }>('/subscriptions');
      return data.value || [];
    });
  }

  // ==========================================================================
  // Special Folders Operations
  // ==========================================================================

  /**
   * Gets a special folder (Documents, Photos, etc.)
   * @param name - Special folder name
   * @returns Special folder item
   */
  async getSpecialFolder(
    name: 'documents' | 'photos' | 'cameraroll' | 'approot' | 'music'
  ): Promise<OneDriveItem> {
    return withRetry(async () => {
      const { data } = await this.http.get<OneDriveItem>(
        `${this.getDrivePath()}/special/${name}`,
        {
          params: { $select: DEFAULT_ITEM_SELECT },
        }
      );
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
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps OneDrive user to common User type
   * @param user - OneDrive user
   * @returns Common User type
   */
  mapToCommonUser(user: OneDriveUser): User {
    return {
      id: user.id,
      username: user.userPrincipalName,
      displayName: user.displayName,
      email: user.mail || user.userPrincipalName,
    };
  }
}
