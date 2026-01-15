/**
 * @fileoverview Salesforce integration exports
 * @module @relay/integrations/salesforce
 */

// Client
export { SalesforceClient } from './client';

// OAuth
export {
  SalesforceOAuthClient,
  SalesforceJwtOAuthClient,
  isTokenValid,
  shouldRefreshToken,
} from './oauth';

// Webhooks
export {
  SalesforceOutboundMessageHandler,
  SalesforcePlatformEventHandler,
  SalesforceChangeDataCaptureHandler,
  verifyWebhookSignature,
  assertWebhookSignature,
  SALESFORCE_IP_RANGES,
} from './webhooks';
export type { SalesforceWebhookEventType, SalesforceWebhookEvent } from './webhooks';

// Types
export type {
  // Config
  SalesforceConfig,
  SalesforceOAuthConfig,
  SalesforceJwtConfig,
  SalesforceOAuthScope,
  SalesforceOAuthToken,
  // SObjects
  SalesforceSObject,
  SalesforceLead,
  SalesforceContact,
  SalesforceAccount,
  SalesforceOpportunity,
  SalesforceTask,
  SalesforceEvent,
  SalesforceUser,
  // Query results
  SalesforceQueryResult,
  // Metadata
  SalesforceObjectDescribe,
  SalesforceFieldDescribe,
  SalesforcePicklistValue,
  SalesforceRecordTypeInfo,
  // Operations
  CreateSalesforceRecordInput,
  UpdateSalesforceRecordInput,
  // Bulk API
  SalesforceBulkJob,
  SalesforceBulkJobResult,
  // Events
  SalesforcePlatformEvent,
  SalesforceOutboundMessage,
  // Composite
  SalesforceCompositeRequest,
  SalesforceCompositeResponse,
  // Errors
  SalesforceApiError,
} from './types';
