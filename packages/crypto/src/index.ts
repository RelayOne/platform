/**
 * @fileoverview Cryptographic utilities for Relay Platform applications
 * @module @relay/crypto
 *
 * This package provides cryptographic utilities for secure token generation,
 * hashing, encryption, and verification across all Relay Platform applications.
 *
 * @example
 * ```typescript
 * import {
 *   generateSecureToken,
 *   generateId,
 *   sha256,
 *   hmacSha256,
 *   verifyHmac,
 *   aesEncrypt,
 *   aesDecrypt,
 * } from '@relay/crypto';
 *
 * // Generate secure tokens
 * const token = generateSecureToken(32);
 * const id = generateId(21);
 *
 * // Hash data
 * const hash = await sha256('data');
 *
 * // Create and verify HMAC signatures
 * const signature = hmacSha256('data', 'secret');
 * const isValid = verifyHmac('data', signature, 'secret');
 *
 * // Encrypt and decrypt data
 * const encrypted = aesEncrypt('plaintext', { key: hexKey });
 * const decrypted = aesDecrypt(encrypted, { key: hexKey });
 * ```
 */

import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from 'crypto';

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generates a cryptographically secure random string (hex encoded).
 *
 * @param length - Number of random bytes (output will be 2x this length)
 * @returns Hex-encoded random string
 *
 * @example
 * ```typescript
 * generateSecureToken(32) // 64 character hex string
 * ```
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generates a URL-safe random string (base64url encoded).
 *
 * @param length - Number of random bytes
 * @returns Base64url-encoded random string
 *
 * @example
 * ```typescript
 * generateUrlSafeToken(32) // ~43 character URL-safe string
 * ```
 */
export function generateUrlSafeToken(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generates a nanoid-style ID.
 *
 * @param length - Length of the ID (default: 21)
 * @returns Alphanumeric ID string
 *
 * @example
 * ```typescript
 * generateId() // "V1StGXR8_Z5jdHi6B-myT"
 * generateId(10) // "V1StGXR8_Z"
 * ```
 */
export function generateId(length = 21): string {
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}

/**
 * Generates a prefixed ID (useful for typed IDs).
 *
 * @param prefix - Prefix for the ID (e.g., 'user', 'org')
 * @param length - Length of the random part (default: 16)
 * @returns Prefixed ID string
 *
 * @example
 * ```typescript
 * generatePrefixedId('user') // "user_V1StGXR8_Z5jdHi6"
 * generatePrefixedId('org', 12) // "org_V1StGXR8_Z5j"
 * ```
 */
export function generatePrefixedId(prefix: string, length = 16): string {
  return `${prefix}_${generateId(length)}`;
}

/**
 * Generates a numeric verification code.
 *
 * @param length - Length of the code (default: 6)
 * @returns Numeric string code
 *
 * @example
 * ```typescript
 * generateVerificationCode() // "847293"
 * generateVerificationCode(4) // "8472"
 * ```
 */
export function generateVerificationCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += (bytes[i]! % 10).toString();
  }
  return code;
}

/**
 * Generates a random API key.
 *
 * @param prefix - Optional prefix for the key
 * @returns API key string
 *
 * @example
 * ```typescript
 * generateApiKey() // "sk_live_abc123..."
 * generateApiKey('pk_test') // "pk_test_abc123..."
 * ```
 */
export function generateApiKey(prefix = 'sk_live'): string {
  return `${prefix}_${generateUrlSafeToken(32)}`;
}

// ============================================================================
// Hashing
// ============================================================================

/**
 * Hashes data with SHA-256 (async, uses Web Crypto API when available).
 *
 * @param data - String to hash
 * @returns Hex-encoded hash
 *
 * @example
 * ```typescript
 * const hash = await sha256('password');
 * ```
 */
export async function sha256(data: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      dataBuffer
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  return sha256Sync(data);
}

/**
 * Hashes data with SHA-256 (synchronous, Node.js only).
 *
 * @param data - String to hash
 * @returns Hex-encoded hash
 *
 * @example
 * ```typescript
 * const hash = sha256Sync('password');
 * ```
 */
export function sha256Sync(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hashes data with SHA-512.
 *
 * @param data - String to hash
 * @returns Hex-encoded hash
 */
export function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * Hashes data with MD5 (NOT for security, only for checksums).
 *
 * @param data - String to hash
 * @returns Hex-encoded hash
 */
export function md5(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

// ============================================================================
// HMAC Signatures
// ============================================================================

/**
 * Creates an HMAC-SHA256 signature.
 *
 * @param data - Data to sign
 * @param secret - Secret key
 * @returns Hex-encoded signature
 *
 * @example
 * ```typescript
 * const signature = hmacSha256('payload', 'secret');
 * ```
 */
export function hmacSha256(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Creates an HMAC-SHA256 signature (base64url encoded).
 *
 * @param data - Data to sign
 * @param secret - Secret key
 * @returns Base64url-encoded signature
 */
export function hmacSha256Base64(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('base64url');
}

/**
 * Creates an HMAC-SHA512 signature.
 *
 * @param data - Data to sign
 * @param secret - Secret key
 * @returns Hex-encoded signature
 */
export function hmacSha512(data: string, secret: string): string {
  const hmac = createHmac('sha512', secret);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature using timing-safe comparison.
 *
 * @param data - Original data
 * @param signature - Signature to verify (hex)
 * @param secret - Secret key
 * @returns True if signature is valid
 *
 * @example
 * ```typescript
 * const isValid = verifyHmac('payload', signature, 'secret');
 * ```
 */
export function verifyHmac(
  data: string,
  signature: string,
  secret: string
): boolean {
  const expected = hmacSha256(data, secret);
  return secureCompare(expected, signature);
}

/**
 * Verifies an HMAC-SHA256 signature (base64url encoded).
 *
 * @param data - Original data
 * @param signature - Signature to verify (base64url)
 * @param secret - Secret key
 * @returns True if signature is valid
 */
export function verifyHmacBase64(
  data: string,
  signature: string,
  secret: string
): boolean {
  const expected = hmacSha256Base64(data, secret);
  return secureCompare(expected, signature);
}

// ============================================================================
// AES Encryption
// ============================================================================

/**
 * AES-256-GCM encryption configuration.
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
 * Encrypted data structure.
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
 * Encrypts data with AES-256-GCM.
 *
 * @param plaintext - Data to encrypt
 * @param config - Encryption configuration
 * @returns Encrypted data object
 *
 * @example
 * ```typescript
 * const key = generateSecureToken(32); // 64 hex chars = 32 bytes
 * const encrypted = aesEncrypt('secret data', { key });
 * ```
 */
export function aesEncrypt(plaintext: string, config: AesConfig): EncryptedData {
  const key = Buffer.from(config.key, 'hex');
  const ivLength = config.ivLength ?? 12;
  const authTagLength = config.authTagLength ?? 16;

  const iv = randomBytes(ivLength);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength,
  } as unknown as undefined);

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
 * Decrypts data with AES-256-GCM.
 *
 * @param encrypted - Encrypted data object
 * @param config - Encryption configuration
 * @returns Decrypted plaintext
 *
 * @example
 * ```typescript
 * const decrypted = aesDecrypt(encrypted, { key });
 * ```
 */
export function aesDecrypt(encrypted: EncryptedData, config: AesConfig): string {
  const key = Buffer.from(config.key, 'hex');
  const iv = Buffer.from(encrypted.iv, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');
  const authTagLength = config.authTagLength ?? 16;

  const decipher = createDecipheriv('aes-256-gcm', key, iv, {
    authTagLength,
  } as unknown as undefined);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts data to a single string (iv:data:tag format).
 *
 * @param plaintext - Data to encrypt
 * @param key - Encryption key (hex)
 * @returns Encrypted string
 *
 * @example
 * ```typescript
 * const encrypted = encryptToString('secret', key);
 * // "ab12cd34:ef56gh78:ij90kl12"
 * ```
 */
export function encryptToString(plaintext: string, key: string): string {
  const encrypted = aesEncrypt(plaintext, { key });
  return `${encrypted.iv}:${encrypted.data}:${encrypted.tag}`;
}

/**
 * Decrypts data from a single string (iv:data:tag format).
 *
 * @param encryptedString - Encrypted string
 * @param key - Encryption key (hex)
 * @returns Decrypted plaintext
 * @throws Error if string format is invalid
 *
 * @example
 * ```typescript
 * const decrypted = decryptFromString(encrypted, key);
 * ```
 */
export function decryptFromString(encryptedString: string, key: string): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }
  const [iv, data, tag] = parts;
  if (!iv || !data || !tag) {
    throw new Error('Invalid encrypted string format');
  }
  return aesDecrypt({ iv, data, tag }, { key });
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Performs constant-time string comparison to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 *
 * @example
 * ```typescript
 * const isEqual = secureCompare(expected, provided);
 * ```
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    // Use Node.js timing-safe comparison when available
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Fallback for edge cases
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

// ============================================================================
// Masking Utilities
// ============================================================================

/**
 * Masks a sensitive string, showing only first and last N characters.
 *
 * @param str - String to mask
 * @param showFirst - Number of characters to show at start (default: 4)
 * @param showLast - Number of characters to show at end (default: 4)
 * @returns Masked string
 *
 * @example
 * ```typescript
 * maskString('sk_live_abc123xyz456') // "sk_l************z456"
 * maskString('4111111111111111', 4, 4) // "4111********1111"
 * ```
 */
export function maskString(
  str: string,
  showFirst = 4,
  showLast = 4
): string {
  if (str.length <= showFirst + showLast) {
    return '*'.repeat(str.length);
  }
  const first = str.slice(0, showFirst);
  const last = str.slice(-showLast);
  const masked = '*'.repeat(str.length - showFirst - showLast);
  return `${first}${masked}${last}`;
}

/**
 * Masks an email address.
 *
 * @param email - Email to mask
 * @returns Masked email
 *
 * @example
 * ```typescript
 * maskEmail('john.doe@example.com') // "jo***@example.com"
 * ```
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return maskString(email);
  }
  const maskedLocal =
    local.length > 2
      ? local.slice(0, 2) + '*'.repeat(local.length - 2)
      : '*'.repeat(local.length);
  return `${maskedLocal}@${domain}`;
}

/**
 * Masks a phone number.
 *
 * @param phone - Phone number to mask
 * @returns Masked phone number
 *
 * @example
 * ```typescript
 * maskPhone('+14155551234') // "+1******1234"
 * ```
 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) {
    return '*'.repeat(phone.length);
  }
  return phone.slice(0, 2) + '*'.repeat(phone.length - 6) + phone.slice(-4);
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derives a key from a password using PBKDF2.
 *
 * @param password - Password to derive from
 * @param salt - Salt (hex string or will be generated)
 * @param iterations - Number of iterations (default: 100000)
 * @param keyLength - Key length in bytes (default: 32)
 * @returns Object with derived key and salt
 *
 * @example
 * ```typescript
 * const { key, salt } = await deriveKey('password123');
 * // Store salt alongside the key/hash
 * ```
 */
export async function deriveKey(
  password: string,
  salt?: string,
  iterations = 100000,
  keyLength = 32
): Promise<{ key: string; salt: string }> {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(16);

  return new Promise((resolve, reject) => {
    // Using dynamic import pattern for pbkdf2
    import('crypto').then(({ pbkdf2 }) => {
      pbkdf2(
        password,
        saltBuffer,
        iterations,
        keyLength,
        'sha256',
        (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              key: derivedKey.toString('hex'),
              salt: saltBuffer.toString('hex'),
            });
          }
        }
      );
    });
  });
}

// ============================================================================
// Utility Types
// ============================================================================

export type HashAlgorithm = 'sha256' | 'sha512' | 'md5';
export type HmacAlgorithm = 'sha256' | 'sha512';
