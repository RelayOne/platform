/**
 * @fileoverview Tests for the AuditLogger class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AuditLogger,
  auditLogger,
  createAuditLogger,
  configureAuditLogger,
  configureLogger,
} from '../src/index.js';

describe('AuditLogger', () => {
  let capturedLogs: Array<{ level: string; args: unknown[] }> = [];

  beforeEach(() => {
    capturedLogs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      capturedLogs.push({ level: 'log', args });
    });
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      capturedLogs.push({ level: 'warn', args });
    });

    // Reset config
    configureLogger({
      level: 'debug',
      format: 'json',
      service: 'test-service',
    });
    configureAuditLogger({
      service: 'test-service',
      echoToLogger: true,
    });
  });

  describe('AuditLogger class', () => {
    it('should create audit logger', () => {
      const audit = new AuditLogger();
      expect(audit).toBeInstanceOf(AuditLogger);
    });

    it('should create audit logger with request ID', () => {
      const audit = new AuditLogger('req-123');
      audit.log('user.login', { success: true, actorEmail: 'test@example.com' });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.requestId).toBe('req-123');
    });

    it('should set request ID', () => {
      const audit = new AuditLogger();
      audit.setRequestId('req-456');
      audit.log('user.login', { success: true, actorEmail: 'test@example.com' });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.requestId).toBe('req-456');
    });
  });

  describe('log()', () => {
    it('should log successful events as info', () => {
      auditLogger.log('user.login', {
        success: true,
        actorEmail: 'user@example.com',
      });

      expect(capturedLogs.length).toBe(1);
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('Audit: user.login');
    });

    it('should log failed events as warn', () => {
      auditLogger.log('user.login', {
        success: false,
        actorEmail: 'user@example.com',
      });

      expect(capturedLogs[0].level).toBe('warn');
      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.level).toBe('warn');
    });

    it('should include audit entry in context', () => {
      auditLogger.log('resource.create', {
        success: true,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('resource.create');
      expect(entry.context.audit.actorId).toBe('user-123');
      expect(entry.context.audit.resourceType).toBe('document');
      expect(entry.context.audit.resourceId).toBe('doc-456');
    });

    it('should include timestamp', () => {
      auditLogger.log('user.logout', { success: true, actorId: 'user-123' });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.timestamp).toBeDefined();
    });
  });

  describe('userLogin()', () => {
    it('should log successful login', () => {
      auditLogger.userLogin({
        success: true,
        actorEmail: 'user@example.com',
        actorIp: '192.168.1.1',
        authMethod: 'password',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('user.login');
      expect(entry.context.audit.success).toBe(true);
      expect(entry.context.audit.actorEmail).toBe('user@example.com');
      expect(entry.context.audit.details.authMethod).toBe('password');
    });

    it('should log failed login', () => {
      auditLogger.userLogin({
        success: false,
        actorEmail: 'user@example.com',
        error: 'Invalid password',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.success).toBe(false);
      expect(entry.context.audit.details.error).toBe('Invalid password');
    });

    it('should log MFA usage', () => {
      auditLogger.userLogin({
        success: true,
        actorEmail: 'user@example.com',
        mfaUsed: true,
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.details.mfaUsed).toBe(true);
    });
  });

  describe('userLogout()', () => {
    it('should log user logout', () => {
      auditLogger.userLogout({
        actorId: 'user-123',
        reason: 'user_initiated',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('user.logout');
      expect(entry.context.audit.actorId).toBe('user-123');
      expect(entry.context.audit.details.reason).toBe('user_initiated');
    });
  });

  describe('resourceAccess()', () => {
    it('should log resource create', () => {
      auditLogger.resourceAccess({
        action: 'create',
        success: true,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('resource.create');
    });

    it('should log resource read', () => {
      auditLogger.resourceAccess({
        action: 'read',
        success: true,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('resource.read');
    });

    it('should log resource update', () => {
      auditLogger.resourceAccess({
        action: 'update',
        success: true,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('resource.update');
    });

    it('should log resource delete', () => {
      auditLogger.resourceAccess({
        action: 'delete',
        success: true,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('resource.delete');
    });

    it('should log failed access', () => {
      auditLogger.resourceAccess({
        action: 'read',
        success: false,
        actorId: 'user-123',
        resourceType: 'document',
        resourceId: 'doc-456',
        details: { reason: 'permission denied' },
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.success).toBe(false);
      expect(entry.context.audit.details.reason).toBe('permission denied');
    });
  });

  describe('orgMember()', () => {
    it('should log member add', () => {
      auditLogger.orgMember({
        action: 'add',
        success: true,
        actorId: 'admin-123',
        organizationId: 'org-456',
        targetUserId: 'user-789',
        targetEmail: 'new@example.com',
        newRole: 'member',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('org.member_add');
      expect(entry.context.audit.details.targetEmail).toBe('new@example.com');
      expect(entry.context.audit.details.newRole).toBe('member');
    });

    it('should log role change', () => {
      auditLogger.orgMember({
        action: 'role_change',
        success: true,
        actorId: 'admin-123',
        organizationId: 'org-456',
        targetUserId: 'user-789',
        oldRole: 'member',
        newRole: 'admin',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('org.member_role_change');
      expect(entry.context.audit.details.oldRole).toBe('member');
      expect(entry.context.audit.details.newRole).toBe('admin');
    });
  });

  describe('apiKey()', () => {
    it('should log API key creation', () => {
      auditLogger.apiKey({
        action: 'create',
        success: true,
        actorId: 'user-123',
        keyId: 'key-456',
        keyName: 'Production Key',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('api.key_create');
      expect(entry.context.audit.resourceId).toBe('key-456');
      expect(entry.context.audit.details.keyName).toBe('Production Key');
    });

    it('should log API key revocation', () => {
      auditLogger.apiKey({
        action: 'revoke',
        success: true,
        actorId: 'user-123',
        keyId: 'key-456',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('api.key_revoke');
    });
  });

  describe('rateLimit()', () => {
    it('should log rate limit event', () => {
      auditLogger.rateLimit({
        actorId: 'user-123',
        actorIp: '192.168.1.1',
        endpoint: '/api/users',
        limit: 100,
        current: 150,
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('api.rate_limit');
      expect(entry.context.audit.success).toBe(false);
      expect(entry.context.audit.details.limit).toBe(100);
      expect(entry.context.audit.details.current).toBe(150);
    });
  });

  describe('adminAction()', () => {
    it('should log user suspension', () => {
      auditLogger.adminAction({
        action: 'user_suspend',
        success: true,
        actorId: 'admin-123',
        targetUserId: 'user-456',
        reason: 'TOS violation',
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('admin.user_suspend');
      expect(entry.context.audit.details.reason).toBe('TOS violation');
    });

    it('should log config change', () => {
      auditLogger.adminAction({
        action: 'config_change',
        success: true,
        actorId: 'admin-123',
        configKey: 'max_file_size',
        oldValue: 1000000,
        newValue: 2000000,
      });

      const entry = JSON.parse(capturedLogs[0].args[0] as string);
      expect(entry.context.audit.event).toBe('admin.config_change');
      expect(entry.context.audit.details.oldValue).toBe(1000000);
      expect(entry.context.audit.details.newValue).toBe(2000000);
    });
  });

  describe('createAuditLogger()', () => {
    it('should create new audit logger instance', () => {
      const audit = createAuditLogger('req-123');
      expect(audit).toBeInstanceOf(AuditLogger);
    });
  });

  describe('default auditLogger', () => {
    it('should be available as singleton', () => {
      expect(auditLogger).toBeInstanceOf(AuditLogger);
    });
  });
});
