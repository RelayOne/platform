/**
 * @fileoverview Cryptographic utilities for the Relay Platform
 * @module @relay/platform/utils/crypto
 */

import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a URL-safe random string
 */
export function generateUrlSafeToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a nanoid-style ID
 */
export function generateId(length: number = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}

/**
 * Hash data with SHA-256
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash data with SHA-256 (synchronous, Node.js only)
 */
export function sha256Sync(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create an HMAC-SHA256 signature
 */
export function hmacSha256(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Create an HMAC-SHA256 signature (base64url encoded)
 */
export function hmacSha256Base64(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('base64url');
}

/**
 * Verify an HMAC-SHA256 signature (timing-safe comparison)
 */
export function verifyHmac(data: string, signature: string, secret: string): boolean {
  const expected = hmacSha256(data, secret);
  if (expected.length !== signature.length) {
    return false;
  }
  // Timing-safe comparison
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * AES-256-GCM encryption configuration
 */
export interface AesConfig {
  /** Encryption key (32 bytes / 64 hex characters) */
  key: string;
  /** IV length in bytes (default: 12 for GCM) */
  ivLength?: number;
  /** Auth tag length in bytes (default: 16) */
  authTagLength?: number;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /** Initialization vector (hex) */
  iv: string;
  /** Encrypted data (hex) */
  data: string;
  /** Authentication tag (hex) */
  tag: string;
}

/**
 * Encrypt data with AES-256-GCM
 */
export function aesEncrypt(plaintext: string, config: AesConfig): EncryptedData {
  const key = Buffer.from(config.key, 'hex');
  const ivLength = config.ivLength ?? 12;
  const authTagLength = config.authTagLength ?? 16;

  const iv = randomBytes(ivLength);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    data: encrypted,
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt data with AES-256-GCM
 */
export function aesDecrypt(encrypted: EncryptedData, config: AesConfig): string {
  const key = Buffer.from(config.key, 'hex');
  const iv = Buffer.from(encrypted.iv, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');
  const authTagLength = config.authTagLength ?? 16;

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt data to a single string (iv:data:tag)
 */
export function encryptToString(plaintext: string, key: string): string {
  const encrypted = aesEncrypt(plaintext, { key });
  return `${encrypted.iv}:${encrypted.data}:${encrypted.tag}`;
}

/**
 * Decrypt data from a single string (iv:data:tag)
 */
export function decryptFromString(encryptedString: string, key: string): string {
  const [iv, data, tag] = encryptedString.split(':');
  if (!iv || !data || !tag) {
    throw new Error('Invalid encrypted string format');
  }
  return aesDecrypt({ iv, data, tag }, { key });
}

/**
 * Constant-time string comparison
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Mask a sensitive string (show first/last N characters)
 */
export function maskString(str: string, showFirst: number = 4, showLast: number = 4): string {
  if (str.length <= showFirst + showLast) {
    return '*'.repeat(str.length);
  }
  const first = str.slice(0, showFirst);
  const last = str.slice(-showLast);
  const masked = '*'.repeat(str.length - showFirst - showLast);
  return `${first}${masked}${last}`;
}

/**
 * Generate a verification code (numeric)
 */
export function generateVerificationCode(length: number = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += (bytes[i]! % 10).toString();
  }
  return code;
}
