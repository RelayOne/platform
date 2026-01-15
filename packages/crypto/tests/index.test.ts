/**
 * @fileoverview Tests for @relay/crypto package
 * @module @relay/crypto/tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSecureToken,
  generateUrlSafeToken,
  generateId,
  generatePrefixedId,
  generateVerificationCode,
  generateApiKey,
  sha256,
  sha256Sync,
  sha512,
  md5,
  hmacSha256,
  hmacSha256Base64,
  hmacSha512,
  verifyHmac,
  verifyHmacBase64,
  aesEncrypt,
  aesDecrypt,
  encryptToString,
  decryptFromString,
  secureCompare,
  maskString,
  maskEmail,
  maskPhone,
  deriveKey,
  type EncryptedData,
} from '../src/index';

// ============================================================================
// Token Generation Tests
// ============================================================================

describe('Token Generation', () => {
  describe('generateSecureToken', () => {
    it('generates a hex-encoded token of correct length', () => {
      const token = generateSecureToken(32);
      expect(token).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('uses default length of 32 bytes', () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64);
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken(16));
      }
      expect(tokens.size).toBe(100);
    });

    it('generates tokens of various lengths', () => {
      expect(generateSecureToken(8)).toHaveLength(16);
      expect(generateSecureToken(16)).toHaveLength(32);
      expect(generateSecureToken(64)).toHaveLength(128);
    });
  });

  describe('generateUrlSafeToken', () => {
    it('generates a base64url-encoded token', () => {
      const token = generateUrlSafeToken(32);
      // Base64url: A-Z, a-z, 0-9, -, _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateUrlSafeToken(16));
      }
      expect(tokens.size).toBe(100);
    });

    it('produces URL-safe output (no +, /, =)', () => {
      for (let i = 0; i < 50; i++) {
        const token = generateUrlSafeToken(32);
        expect(token).not.toContain('+');
        expect(token).not.toContain('/');
        expect(token).not.toContain('=');
      }
    });
  });

  describe('generateId', () => {
    it('generates an alphanumeric ID of correct length', () => {
      const id = generateId(21);
      expect(id).toHaveLength(21);
      expect(id).toMatch(/^[0-9A-Za-z]+$/);
    });

    it('uses default length of 21', () => {
      const id = generateId();
      expect(id).toHaveLength(21);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId(21));
      }
      expect(ids.size).toBe(100);
    });

    it('generates IDs of various lengths', () => {
      expect(generateId(10)).toHaveLength(10);
      expect(generateId(16)).toHaveLength(16);
      expect(generateId(32)).toHaveLength(32);
    });
  });

  describe('generatePrefixedId', () => {
    it('generates a prefixed ID with underscore separator', () => {
      const id = generatePrefixedId('user');
      expect(id).toMatch(/^user_[0-9A-Za-z]+$/);
    });

    it('uses default length of 16 for random part', () => {
      const id = generatePrefixedId('org');
      const randomPart = id.split('_')[1];
      expect(randomPart).toHaveLength(16);
    });

    it('respects custom length', () => {
      const id = generatePrefixedId('team', 12);
      const randomPart = id.split('_')[1];
      expect(randomPart).toHaveLength(12);
    });

    it('works with various prefixes', () => {
      expect(generatePrefixedId('user')).toMatch(/^user_/);
      expect(generatePrefixedId('org')).toMatch(/^org_/);
      expect(generatePrefixedId('meeting')).toMatch(/^meeting_/);
      expect(generatePrefixedId('task')).toMatch(/^task_/);
    });
  });

  describe('generateVerificationCode', () => {
    it('generates a numeric code of correct length', () => {
      const code = generateVerificationCode(6);
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d+$/);
    });

    it('uses default length of 6', () => {
      const code = generateVerificationCode();
      expect(code).toHaveLength(6);
    });

    it('generates codes of various lengths', () => {
      expect(generateVerificationCode(4)).toHaveLength(4);
      expect(generateVerificationCode(8)).toHaveLength(8);
    });

    it('generates only numeric characters', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateVerificationCode();
        expect(code).toMatch(/^\d+$/);
      }
    });
  });

  describe('generateApiKey', () => {
    it('generates an API key with default prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk_live_[A-Za-z0-9_-]+$/);
    });

    it('uses custom prefix', () => {
      expect(generateApiKey('pk_test')).toMatch(/^pk_test_/);
      expect(generateApiKey('sk_test')).toMatch(/^sk_test_/);
    });

    it('generates unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 50; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(50);
    });
  });
});

// ============================================================================
// Hashing Tests
// ============================================================================

describe('Hashing', () => {
  describe('sha256', () => {
    it('produces consistent hash for same input', async () => {
      const hash1 = await sha256('hello');
      const hash2 = await sha256('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces correct SHA-256 hash', async () => {
      const hash = await sha256('hello');
      // Known SHA-256 hash for "hello"
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('produces 64 character hex output', async () => {
      const hash = await sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await sha256('hello');
      const hash2 = await sha256('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('sha256Sync', () => {
    it('produces consistent hash for same input', () => {
      const hash1 = sha256Sync('hello');
      const hash2 = sha256Sync('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces correct SHA-256 hash', () => {
      const hash = sha256Sync('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('matches async version', async () => {
      const syncHash = sha256Sync('test data');
      const asyncHash = await sha256('test data');
      expect(syncHash).toBe(asyncHash);
    });
  });

  describe('sha512', () => {
    it('produces consistent hash for same input', () => {
      const hash1 = sha512('hello');
      const hash2 = sha512('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces 128 character hex output', () => {
      const hash = sha512('test');
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = sha512('hello');
      const hash2 = sha512('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('md5', () => {
    it('produces consistent hash for same input', () => {
      const hash1 = md5('hello');
      const hash2 = md5('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces correct MD5 hash', () => {
      const hash = md5('hello');
      // Known MD5 hash for "hello"
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('produces 32 character hex output', () => {
      const hash = md5('test');
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });
});

// ============================================================================
// HMAC Tests
// ============================================================================

describe('HMAC', () => {
  const testSecret = 'my-secret-key';
  const testData = 'data to sign';

  describe('hmacSha256', () => {
    it('produces consistent signature for same input', () => {
      const sig1 = hmacSha256(testData, testSecret);
      const sig2 = hmacSha256(testData, testSecret);
      expect(sig1).toBe(sig2);
    });

    it('produces 64 character hex output', () => {
      const sig = hmacSha256(testData, testSecret);
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different signatures for different data', () => {
      const sig1 = hmacSha256('data1', testSecret);
      const sig2 = hmacSha256('data2', testSecret);
      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different secrets', () => {
      const sig1 = hmacSha256(testData, 'secret1');
      const sig2 = hmacSha256(testData, 'secret2');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('hmacSha256Base64', () => {
    it('produces base64url-encoded output', () => {
      const sig = hmacSha256Base64(testData, testSecret);
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces consistent signature', () => {
      const sig1 = hmacSha256Base64(testData, testSecret);
      const sig2 = hmacSha256Base64(testData, testSecret);
      expect(sig1).toBe(sig2);
    });
  });

  describe('hmacSha512', () => {
    it('produces 128 character hex output', () => {
      const sig = hmacSha512(testData, testSecret);
      expect(sig).toHaveLength(128);
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it('produces consistent signature', () => {
      const sig1 = hmacSha512(testData, testSecret);
      const sig2 = hmacSha512(testData, testSecret);
      expect(sig1).toBe(sig2);
    });
  });

  describe('verifyHmac', () => {
    it('returns true for valid signature', () => {
      const signature = hmacSha256(testData, testSecret);
      expect(verifyHmac(testData, signature, testSecret)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const signature = hmacSha256(testData, testSecret);
      expect(verifyHmac(testData, signature, 'wrong-secret')).toBe(false);
    });

    it('returns false for tampered data', () => {
      const signature = hmacSha256(testData, testSecret);
      expect(verifyHmac('tampered data', signature, testSecret)).toBe(false);
    });

    it('returns false for tampered signature', () => {
      const signature = hmacSha256(testData, testSecret);
      const tamperedSig = signature.slice(0, -4) + '0000';
      expect(verifyHmac(testData, tamperedSig, testSecret)).toBe(false);
    });
  });

  describe('verifyHmacBase64', () => {
    it('returns true for valid base64 signature', () => {
      const signature = hmacSha256Base64(testData, testSecret);
      expect(verifyHmacBase64(testData, signature, testSecret)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const signature = hmacSha256Base64(testData, testSecret);
      expect(verifyHmacBase64(testData, signature, 'wrong-secret')).toBe(false);
    });
  });
});

// ============================================================================
// AES Encryption Tests
// ============================================================================

describe('AES Encryption', () => {
  // 32-byte key (64 hex characters)
  const testKey = 'a'.repeat(64);
  const testPlaintext = 'Hello, this is secret data!';

  describe('aesEncrypt', () => {
    it('returns encrypted data structure', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('tag');
    });

    it('produces hex-encoded values', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      expect(encrypted.iv).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.data).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.tag).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different IV for each encryption', () => {
      const enc1 = aesEncrypt(testPlaintext, { key: testKey });
      const enc2 = aesEncrypt(testPlaintext, { key: testKey });
      expect(enc1.iv).not.toBe(enc2.iv);
    });

    it('produces default IV length of 12 bytes (24 hex chars)', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      expect(encrypted.iv).toHaveLength(24);
    });

    it('produces default auth tag length of 16 bytes (32 hex chars)', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      expect(encrypted.tag).toHaveLength(32);
    });
  });

  describe('aesDecrypt', () => {
    it('correctly decrypts encrypted data', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      const decrypted = aesDecrypt(encrypted, { key: testKey });
      expect(decrypted).toBe(testPlaintext);
    });

    it('decrypts unicode data correctly', () => {
      const unicodeText = 'Hello 🌍 World! 日本語 Привет';
      const encrypted = aesEncrypt(unicodeText, { key: testKey });
      const decrypted = aesDecrypt(encrypted, { key: testKey });
      expect(decrypted).toBe(unicodeText);
    });

    it('decrypts empty string', () => {
      const encrypted = aesEncrypt('', { key: testKey });
      const decrypted = aesDecrypt(encrypted, { key: testKey });
      expect(decrypted).toBe('');
    });

    it('decrypts long text', () => {
      const longText = 'A'.repeat(10000);
      const encrypted = aesEncrypt(longText, { key: testKey });
      const decrypted = aesDecrypt(encrypted, { key: testKey });
      expect(decrypted).toBe(longText);
    });

    it('throws on wrong key', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      const wrongKey = 'b'.repeat(64);
      expect(() => aesDecrypt(encrypted, { key: wrongKey })).toThrow();
    });

    it('throws on tampered data', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      const tampered: EncryptedData = {
        ...encrypted,
        data: encrypted.data.slice(0, -4) + '0000',
      };
      expect(() => aesDecrypt(tampered, { key: testKey })).toThrow();
    });

    it('throws on tampered tag', () => {
      const encrypted = aesEncrypt(testPlaintext, { key: testKey });
      const tampered: EncryptedData = {
        ...encrypted,
        tag: encrypted.tag.slice(0, -4) + '0000',
      };
      expect(() => aesDecrypt(tampered, { key: testKey })).toThrow();
    });
  });

  describe('encryptToString', () => {
    it('returns colon-separated string', () => {
      const result = encryptToString(testPlaintext, testKey);
      expect(result).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('has three parts separated by colons', () => {
      const result = encryptToString(testPlaintext, testKey);
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
    });
  });

  describe('decryptFromString', () => {
    it('correctly decrypts string format', () => {
      const encrypted = encryptToString(testPlaintext, testKey);
      const decrypted = decryptFromString(encrypted, testKey);
      expect(decrypted).toBe(testPlaintext);
    });

    it('throws on invalid format (wrong number of parts)', () => {
      expect(() => decryptFromString('invalid', testKey)).toThrow('Invalid encrypted string format');
      expect(() => decryptFromString('a:b', testKey)).toThrow('Invalid encrypted string format');
      expect(() => decryptFromString('a:b:c:d', testKey)).toThrow('Invalid encrypted string format');
    });

    it('throws on empty parts', () => {
      expect(() => decryptFromString('::', testKey)).toThrow('Invalid encrypted string format');
      expect(() => decryptFromString('a::c', testKey)).toThrow('Invalid encrypted string format');
    });
  });
});

// ============================================================================
// Secure Comparison Tests
// ============================================================================

describe('secureCompare', () => {
  it('returns true for equal strings', () => {
    expect(secureCompare('hello', 'hello')).toBe(true);
    expect(secureCompare('', '')).toBe(true);
    expect(secureCompare('a'.repeat(1000), 'a'.repeat(1000))).toBe(true);
  });

  it('returns false for unequal strings', () => {
    expect(secureCompare('hello', 'world')).toBe(false);
    expect(secureCompare('hello', 'hello!')).toBe(false);
    expect(secureCompare('hello', 'Hello')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(secureCompare('short', 'longer string')).toBe(false);
    expect(secureCompare('hello', 'hell')).toBe(false);
  });

  it('handles special characters', () => {
    expect(secureCompare('!@#$%', '!@#$%')).toBe(true);
    expect(secureCompare('日本語', '日本語')).toBe(true);
    expect(secureCompare('🎉', '🎉')).toBe(true);
  });
});

// ============================================================================
// Masking Tests
// ============================================================================

describe('Masking', () => {
  describe('maskString', () => {
    it('masks middle of string with default values', () => {
      const masked = maskString('1234567890123456');
      expect(masked).toBe('1234********3456');
    });

    it('respects showFirst and showLast parameters', () => {
      expect(maskString('1234567890', 2, 2)).toBe('12******90');
      expect(maskString('1234567890', 3, 3)).toBe('123****890');
    });

    it('fully masks short strings', () => {
      expect(maskString('1234')).toBe('****');
      expect(maskString('12345678')).toBe('********');
    });

    it('handles edge cases', () => {
      expect(maskString('')).toBe('');
      expect(maskString('a')).toBe('*');
      expect(maskString('ab')).toBe('**');
    });
  });

  describe('maskEmail', () => {
    it('masks email local part', () => {
      expect(maskEmail('john@example.com')).toBe('jo**@example.com');
      expect(maskEmail('jane.doe@test.org')).toBe('ja******@test.org');
    });

    it('preserves domain', () => {
      const masked = maskEmail('user@domain.com');
      expect(masked).toContain('@domain.com');
    });

    it('handles short local parts', () => {
      expect(maskEmail('ab@test.com')).toBe('**@test.com');
      expect(maskEmail('a@test.com')).toBe('*@test.com');
    });

    it('handles invalid emails', () => {
      const result = maskEmail('notanemail');
      expect(result).toBe('nota**mail');
    });
  });

  describe('maskPhone', () => {
    it('masks middle of phone number', () => {
      expect(maskPhone('+14155551234')).toBe('+1******1234');
    });

    it('shows first 2 and last 4 characters', () => {
      const masked = maskPhone('18005551234');
      expect(masked.slice(0, 2)).toBe('18');
      expect(masked.slice(-4)).toBe('1234');
    });

    it('fully masks short numbers', () => {
      expect(maskPhone('1234')).toBe('****');
      expect(maskPhone('12345')).toBe('*****');
    });
  });
});

// ============================================================================
// Key Derivation Tests
// ============================================================================

describe('deriveKey', () => {
  it('derives a key from password', async () => {
    const result = await deriveKey('password123');
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('salt');
  });

  it('produces 64 character hex key by default', async () => {
    const result = await deriveKey('password');
    expect(result.key).toHaveLength(64);
    expect(result.key).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different salts each time', async () => {
    const result1 = await deriveKey('password');
    const result2 = await deriveKey('password');
    expect(result1.salt).not.toBe(result2.salt);
  });

  it('produces same key with same salt', async () => {
    const result1 = await deriveKey('password');
    const result2 = await deriveKey('password', result1.salt);
    expect(result1.key).toBe(result2.key);
  });

  it('produces different keys for different passwords', async () => {
    const salt = generateSecureToken(16);
    const result1 = await deriveKey('password1', salt);
    const result2 = await deriveKey('password2', salt);
    expect(result1.key).not.toBe(result2.key);
  });

  it('respects custom key length', async () => {
    const result = await deriveKey('password', undefined, 100000, 16);
    expect(result.key).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});
