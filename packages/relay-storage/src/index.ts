/**
 * @fileoverview Cloud storage service for Relay Platform
 * Supports DigitalOcean Spaces, AWS S3, and local filesystem storage.
 * Uses S3-compatible API for cloud providers.
 * @module @relay/storage
 */

import { readFile, writeFile, unlink, mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import crypto from 'crypto';

/**
 * Storage provider type.
 */
export type StorageProvider = 'spaces' | 's3' | 'local';

/**
 * Storage configuration.
 */
export interface StorageConfig {
  /** Storage provider to use */
  provider: StorageProvider;
  /** Bucket name (for cloud providers) */
  bucket: string;
  /** Region (for cloud providers) */
  region: string;
  /** Access key ID (for cloud providers) */
  accessKeyId?: string;
  /** Secret access key (for cloud providers) */
  secretAccessKey?: string;
  /** Custom endpoint (for DO Spaces) */
  endpoint?: string;
  /** Local storage path */
  localPath?: string;
  /** CDN URL (optional, for public URLs) */
  cdnUrl?: string;
}

/**
 * Upload result.
 */
export interface UploadResult {
  /** Whether upload was successful */
  success: boolean;
  /** Storage key/path of uploaded file */
  key?: string;
  /** Public URL if available */
  url?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Download result.
 */
export interface DownloadResult {
  /** Whether download was successful */
  success: boolean;
  /** File content as buffer */
  data?: Buffer;
  /** Content type */
  contentType?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Delete result.
 */
export interface DeleteResult {
  /** Whether deletion was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Get storage configuration from environment variables.
 * @returns Storage configuration
 */
export function getStorageConfig(): StorageConfig {
  // Determine provider based on environment
  let provider: StorageProvider = 'local';

  if (process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET) {
    provider = 'spaces';
  } else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET
  ) {
    provider = 's3';
  }

  return {
    provider,
    bucket: process.env.DO_SPACES_BUCKET || process.env.S3_BUCKET || 'relay-storage',
    region: process.env.DO_SPACES_REGION || process.env.AWS_REGION || 'nyc3',
    accessKeyId: process.env.DO_SPACES_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.DO_SPACES_SECRET || process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.DO_SPACES_ENDPOINT,
    localPath: process.env.LOCAL_STORAGE_PATH || './storage',
    cdnUrl: process.env.DO_SPACES_CDN_URL || process.env.S3_CDN_URL,
  };
}

/**
 * Generate S3-compatible authorization signature.
 * Uses AWS Signature Version 4 for S3/Spaces API.
 * @param method - HTTP method
 * @param path - Request path
 * @param config - Storage configuration
 * @param contentType - Content type for uploads
 * @param contentHash - SHA256 hash of content
 * @returns Headers for signed request
 */
export function generateSignedHeaders(
  method: string,
  path: string,
  config: StorageConfig,
  contentType?: string,
  contentHash?: string
): Record<string, string> {
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('Storage credentials not configured');
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Determine host
  let host: string;
  if (config.provider === 'spaces' && config.endpoint) {
    host = new URL(config.endpoint).host;
  } else if (config.provider === 'spaces') {
    host = `${config.bucket}.${config.region}.digitaloceanspaces.com`;
  } else {
    host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  }

  const service = 's3';
  const region = config.region;

  // Create canonical request components
  const canonicalUri = path.startsWith('/') ? path : `/${path}`;
  const canonicalQueryString = '';
  const payloadHash = contentHash || 'UNSIGNED-PAYLOAD';

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  if (contentType) {
    canonicalHeaders.splice(1, 0, `content-type:${contentType}`);
  }

  const signedHeaders = contentType
    ? 'content-type;host;x-amz-content-sha256;x-amz-date'
    : 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders.join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Use Node crypto for HMAC-SHA256
  const encoder = new TextEncoder();

  /**
   * Helper function for HMAC-SHA256.
   * @param key - HMAC key
   * @param data - Data to hash
   * @returns HMAC-SHA256 hash
   */
  function hmacSha256Sync(key: Uint8Array, data: string): Uint8Array {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  /**
   * Helper function for SHA256 hex hash.
   * @param data - Data to hash
   * @returns SHA256 hash as hex string
   */
  function sha256Hex(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  const canonicalRequestHash = sha256Hex(canonicalRequest);

  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Calculate signature
  const kDate = hmacSha256Sync(encoder.encode('AWS4' + config.secretAccessKey), dateStamp);
  const kRegion = hmacSha256Sync(kDate, region);
  const kService = hmacSha256Sync(kRegion, service);
  const kSigning = hmacSha256Sync(kService, 'aws4_request');
  const signature = hmacSha256Sync(kSigning, stringToSign);
  const signatureHex = Buffer.from(signature).toString('hex');

  const authorizationHeader = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

  const headers: Record<string, string> = {
    Host: host,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    Authorization: authorizationHeader,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

/**
 * Get the endpoint URL for storage operations.
 * @param config - Storage configuration
 * @returns Endpoint URL
 */
export function getEndpointUrl(config: StorageConfig): string {
  if (config.endpoint) {
    return config.endpoint;
  }
  if (config.provider === 'spaces') {
    return `https://${config.bucket}.${config.region}.digitaloceanspaces.com`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}

/**
 * Upload a file to storage.
 * @param key - Storage key/path
 * @param data - File content
 * @param contentType - MIME type
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Upload result
 */
export async function uploadFile(
  key: string,
  data: Buffer | string,
  contentType: string = 'application/octet-stream',
  config?: StorageConfig
): Promise<UploadResult> {
  const storageConfig = config || getStorageConfig();
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;

  try {
    if (storageConfig.provider === 'local') {
      return await uploadLocal(key, buffer, storageConfig);
    }

    return await uploadToCloud(key, buffer, contentType, storageConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    console.error(`Storage upload error for ${key}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Upload file to local filesystem.
 * @param key - Storage key/path
 * @param data - File content
 * @param config - Storage configuration
 * @returns Upload result
 */
async function uploadLocal(
  key: string,
  data: Buffer,
  config: StorageConfig
): Promise<UploadResult> {
  const filePath = join(config.localPath || './storage', key);
  const dir = dirname(filePath);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Write file
  await writeFile(filePath, data);

  return {
    success: true,
    key,
    url: `/storage/${key}`,
  };
}

/**
 * Upload file to S3-compatible cloud storage.
 * @param key - Storage key/path
 * @param data - File content
 * @param contentType - MIME type
 * @param config - Storage configuration
 * @returns Upload result
 */
async function uploadToCloud(
  key: string,
  data: Buffer,
  contentType: string,
  config: StorageConfig
): Promise<UploadResult> {
  const contentHash = crypto.createHash('sha256').update(data).digest('hex');
  const path = `/${key}`;

  const headers = generateSignedHeaders('PUT', path, config, contentType, contentHash);
  const endpoint = getEndpointUrl(config);
  const url = `${endpoint}${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Length': data.length.toString(),
    },
    body: new Uint8Array(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  // Build public URL
  let publicUrl: string;
  if (config.cdnUrl) {
    publicUrl = `${config.cdnUrl}/${key}`;
  } else {
    publicUrl = `${endpoint}/${key}`;
  }

  return {
    success: true,
    key,
    url: publicUrl,
  };
}

/**
 * Download a file from storage.
 * @param key - Storage key/path
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Download result with file data
 */
export async function downloadFile(key: string, config?: StorageConfig): Promise<DownloadResult> {
  const storageConfig = config || getStorageConfig();

  try {
    if (storageConfig.provider === 'local') {
      return await downloadLocal(key, storageConfig);
    }

    return await downloadFromCloud(key, storageConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Download failed';
    console.error(`Storage download error for ${key}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Download file from local filesystem.
 * @param key - Storage key/path
 * @param config - Storage configuration
 * @returns Download result
 */
async function downloadLocal(key: string, config: StorageConfig): Promise<DownloadResult> {
  const filePath = join(config.localPath || './storage', key);

  // Check if file exists
  try {
    await stat(filePath);
  } catch {
    return { success: false, error: 'File not found' };
  }

  const data = await readFile(filePath);

  // Guess content type from extension
  const ext = key.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    json: 'application/json',
    txt: 'text/plain',
    html: 'text/html',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  };

  return {
    success: true,
    data,
    contentType: contentTypes[ext || ''] || 'application/octet-stream',
  };
}

/**
 * Download file from S3-compatible cloud storage.
 * @param key - Storage key/path
 * @param config - Storage configuration
 * @returns Download result
 */
async function downloadFromCloud(key: string, config: StorageConfig): Promise<DownloadResult> {
  const path = `/${key}`;
  const headers = generateSignedHeaders('GET', path, config);
  const endpoint = getEndpointUrl(config);
  const url = `${endpoint}${path}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { success: false, error: 'File not found' };
    }
    const errorText = await response.text();
    throw new Error(`Download failed: ${response.status} - ${errorText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  return {
    success: true,
    data,
    contentType,
  };
}

/**
 * Delete a file from storage.
 * @param key - Storage key/path
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Whether deletion was successful
 */
export async function deleteFile(key: string, config?: StorageConfig): Promise<DeleteResult> {
  const storageConfig = config || getStorageConfig();

  try {
    if (storageConfig.provider === 'local') {
      const filePath = join(storageConfig.localPath || './storage', key);
      await unlink(filePath);
      return { success: true };
    }

    const path = `/${key}`;
    const headers = generateSignedHeaders('DELETE', path, storageConfig);
    const endpoint = getEndpointUrl(storageConfig);
    const url = `${endpoint}${path}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Delete failed: ${response.status} - ${errorText}`);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Delete failed';
    console.error(`Storage delete error for ${key}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if a file exists in storage.
 * @param key - Storage key/path
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Whether file exists
 */
export async function fileExists(key: string, config?: StorageConfig): Promise<boolean> {
  const storageConfig = config || getStorageConfig();

  try {
    if (storageConfig.provider === 'local') {
      const filePath = join(storageConfig.localPath || './storage', key);
      await stat(filePath);
      return true;
    }

    const path = `/${key}`;
    const headers = generateSignedHeaders('HEAD', path, storageConfig);
    const endpoint = getEndpointUrl(storageConfig);
    const url = `${endpoint}${path}`;

    const response = await fetch(url, {
      method: 'HEAD',
      headers,
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a pre-signed URL for direct upload/download.
 * Note: This is a simplified implementation. For production use with proper
 * pre-signed URLs, consider using the AWS SDK or equivalent.
 * @param key - Storage key/path
 * @param operation - 'get' or 'put'
 * @param expiresInSeconds - URL expiration time
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Pre-signed URL
 */
export function generatePresignedUrl(
  key: string,
  operation: 'get' | 'put',
  expiresInSeconds: number = 3600,
  config?: StorageConfig
): string {
  const storageConfig = config || getStorageConfig();

  if (storageConfig.provider === 'local') {
    // For local, return a simple path
    return `/storage/${key}`;
  }

  // For cloud storage, generate a URL
  // This is a simplified implementation - in production, use AWS SDK
  const endpoint = getEndpointUrl(storageConfig);

  // For simplicity, return the public URL (requires bucket to be public or use proper signing)
  if (storageConfig.cdnUrl) {
    return `${storageConfig.cdnUrl}/${key}`;
  }

  return `${endpoint}/${key}`;
}

/**
 * Get current storage provider info.
 * @param config - Optional storage configuration (defaults to environment-based config)
 * @returns Storage provider details
 */
export function getStorageInfo(config?: StorageConfig): {
  provider: StorageProvider;
  bucket: string;
  region: string;
  configured: boolean;
} {
  const storageConfig = config || getStorageConfig();

  return {
    provider: storageConfig.provider,
    bucket: storageConfig.bucket,
    region: storageConfig.region,
    configured: storageConfig.provider !== 'local' || !!storageConfig.localPath,
  };
}

/**
 * Storage key generators for common content types.
 */
export const storageKeys = {
  /**
   * Generate key for user content.
   * @param userId - User ID
   * @param filename - Filename
   * @returns Storage key
   */
  user: (userId: string, filename: string): string => `users/${userId}/${filename}`,

  /**
   * Generate key for organization content.
   * @param orgId - Organization ID
   * @param filename - Filename
   * @returns Storage key
   */
  organization: (orgId: string, filename: string): string => `orgs/${orgId}/${filename}`,

  /**
   * Generate key with timestamp prefix for versioning.
   * @param prefix - Key prefix
   * @param filename - Filename
   * @returns Storage key with timestamp
   */
  timestamped: (prefix: string, filename: string): string => {
    const timestamp = Date.now();
    return `${prefix}/${timestamp}-${filename}`;
  },

  /**
   * Generate key with date-based hierarchy.
   * @param prefix - Key prefix
   * @param filename - Filename
   * @returns Storage key with date hierarchy
   */
  dated: (prefix: string, filename: string): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${prefix}/${year}/${month}/${day}/${filename}`;
  },
};
