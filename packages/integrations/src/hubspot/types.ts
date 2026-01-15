/**
 * @fileoverview HubSpot type definitions
 * @module @relay/integrations/hubspot/types
 */

import type { IntegrationConfig, OAuthToken } from '../common/types';

/**
 * HubSpot authentication configuration using Private App tokens
 */
export interface HubSpotConfig extends IntegrationConfig {
  /** Private App access token */
  accessToken: string;
  /** Portal ID (optional, for multi-portal support) */
  portalId?: string;
}

/**
 * HubSpot OAuth 2.0 configuration
 */
export interface HubSpotOAuthConfig {
  /** OAuth 2.0 client ID */
  clientId: string;
  /** OAuth 2.0 client secret */
  clientSecret: string;
  /** OAuth 2.0 redirect URI */
  redirectUri: string;
  /** Requested OAuth scopes */
  scopes?: HubSpotOAuthScope[];
}

/**
 * HubSpot OAuth scopes
 */
export type HubSpotOAuthScope =
  | 'crm.objects.contacts.read'
  | 'crm.objects.contacts.write'
  | 'crm.objects.companies.read'
  | 'crm.objects.companies.write'
  | 'crm.objects.deals.read'
  | 'crm.objects.deals.write'
  | 'crm.objects.owners.read'
  | 'crm.schemas.contacts.read'
  | 'crm.schemas.companies.read'
  | 'crm.schemas.deals.read'
  | 'sales-email-read'
  | 'tickets'
  | 'e-commerce'
  | 'automation'
  | 'timeline'
  | 'forms'
  | 'files'
  | 'hubdb'
  | 'content';

/**
 * HubSpot OAuth token response
 */
export interface HubSpotOAuthToken extends OAuthToken {
  /** HubSpot portal ID */
  hubId: number;
  /** HubSpot user ID */
  userId: number;
  /** App ID */
  appId: number;
  /** Token type */
  tokenType: 'bearer';
}

/**
 * Base HubSpot CRM object
 */
export interface HubSpotCrmObject {
  /** Object ID */
  id: string;
  /** Object properties */
  properties: Record<string, string | null>;
  /** Created at timestamp */
  createdAt: string;
  /** Updated at timestamp */
  updatedAt: string;
  /** Archived flag */
  archived: boolean;
  /** Archived at timestamp */
  archivedAt?: string;
  /** Associations */
  associations?: Record<string, HubSpotAssociation[]>;
}

/**
 * HubSpot association
 */
export interface HubSpotAssociation {
  /** Associated object ID */
  id: string;
  /** Association type */
  type: string;
}

/**
 * HubSpot Contact
 */
export interface HubSpotContact extends HubSpotCrmObject {
  properties: {
    email?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    phone?: string | null;
    mobilephone?: string | null;
    company?: string | null;
    jobtitle?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    website?: string | null;
    lifecyclestage?: string | null;
    hs_lead_status?: string | null;
    hubspot_owner_id?: string | null;
    createdate?: string | null;
    lastmodifieddate?: string | null;
    [key: string]: string | null | undefined;
  };
}

/**
 * HubSpot Company
 */
export interface HubSpotCompany extends HubSpotCrmObject {
  properties: {
    name?: string | null;
    domain?: string | null;
    description?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    website?: string | null;
    industry?: string | null;
    annualrevenue?: string | null;
    numberofemployees?: string | null;
    type?: string | null;
    hubspot_owner_id?: string | null;
    createdate?: string | null;
    lastmodifieddate?: string | null;
    [key: string]: string | null | undefined;
  };
}

/**
 * HubSpot Deal
 */
export interface HubSpotDeal extends HubSpotCrmObject {
  properties: {
    dealname?: string | null;
    amount?: string | null;
    dealstage?: string | null;
    pipeline?: string | null;
    closedate?: string | null;
    description?: string | null;
    hubspot_owner_id?: string | null;
    dealtype?: string | null;
    hs_priority?: string | null;
    hs_deal_stage_probability?: string | null;
    createdate?: string | null;
    lastmodifieddate?: string | null;
    [key: string]: string | null | undefined;
  };
}

/**
 * HubSpot Ticket
 */
export interface HubSpotTicket extends HubSpotCrmObject {
  properties: {
    subject?: string | null;
    content?: string | null;
    hs_pipeline?: string | null;
    hs_pipeline_stage?: string | null;
    hs_ticket_priority?: string | null;
    hs_ticket_category?: string | null;
    hubspot_owner_id?: string | null;
    createdate?: string | null;
    lastmodifieddate?: string | null;
    [key: string]: string | null | undefined;
  };
}

/**
 * HubSpot Owner
 */
export interface HubSpotOwner {
  /** Owner ID */
  id: string;
  /** Email */
  email: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** User ID */
  userId: number;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Archived flag */
  archived: boolean;
  /** Teams */
  teams?: HubSpotTeam[];
}

/**
 * HubSpot Team
 */
export interface HubSpotTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Is primary flag */
  primary: boolean;
}

/**
 * HubSpot Pipeline
 */
export interface HubSpotPipeline {
  /** Pipeline ID */
  id: string;
  /** Pipeline label */
  label: string;
  /** Display order */
  displayOrder: number;
  /** Archived flag */
  archived: boolean;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Pipeline stages */
  stages: HubSpotPipelineStage[];
}

/**
 * HubSpot Pipeline Stage
 */
export interface HubSpotPipelineStage {
  /** Stage ID */
  id: string;
  /** Stage label */
  label: string;
  /** Display order */
  displayOrder: number;
  /** Metadata */
  metadata: {
    isClosed?: string;
    probability?: string;
    ticketState?: string;
  };
  /** Archived flag */
  archived: boolean;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

/**
 * HubSpot Engagement (Activity)
 */
export interface HubSpotEngagement {
  /** Engagement details */
  engagement: {
    id: number;
    portalId: number;
    active: boolean;
    createdAt: number;
    lastUpdated: number;
    type: 'EMAIL' | 'CALL' | 'MEETING' | 'TASK' | 'NOTE';
    timestamp: number;
    ownerId?: number;
  };
  /** Associations */
  associations: {
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ownerIds?: number[];
    ticketIds?: number[];
  };
  /** Metadata based on engagement type */
  metadata: Record<string, unknown>;
}

/**
 * HubSpot Email Engagement
 */
export interface HubSpotEmailEngagement extends HubSpotEngagement {
  engagement: HubSpotEngagement['engagement'] & {
    type: 'EMAIL';
  };
  metadata: {
    from: { email: string; firstName?: string; lastName?: string };
    to: { email: string; firstName?: string; lastName?: string }[];
    cc?: { email: string; firstName?: string; lastName?: string }[];
    bcc?: { email: string; firstName?: string; lastName?: string }[];
    subject: string;
    html?: string;
    text?: string;
    status?: 'SENT' | 'PENDING' | 'SCHEDULED' | 'FAILED';
  };
}

/**
 * HubSpot Call Engagement
 */
export interface HubSpotCallEngagement extends HubSpotEngagement {
  engagement: HubSpotEngagement['engagement'] & {
    type: 'CALL';
  };
  metadata: {
    toNumber?: string;
    fromNumber?: string;
    status?: 'COMPLETED' | 'BUSY' | 'NO_ANSWER' | 'FAILED' | 'CANCELED';
    durationMilliseconds?: number;
    body?: string;
    disposition?: string;
  };
}

/**
 * HubSpot Meeting Engagement
 */
export interface HubSpotMeetingEngagement extends HubSpotEngagement {
  engagement: HubSpotEngagement['engagement'] & {
    type: 'MEETING';
  };
  metadata: {
    title?: string;
    body?: string;
    startTime?: number;
    endTime?: number;
    internalMeetingNotes?: string;
    meetingOutcome?: string;
  };
}

/**
 * HubSpot Note Engagement
 */
export interface HubSpotNoteEngagement extends HubSpotEngagement {
  engagement: HubSpotEngagement['engagement'] & {
    type: 'NOTE';
  };
  metadata: {
    body: string;
  };
}

/**
 * HubSpot Task Engagement
 */
export interface HubSpotTaskEngagement extends HubSpotEngagement {
  engagement: HubSpotEngagement['engagement'] & {
    type: 'TASK';
  };
  metadata: {
    subject?: string;
    body?: string;
    status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'DEFERRED' | 'COMPLETED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    taskType?: string;
    reminders?: number[];
  };
}

/**
 * HubSpot search request
 */
export interface HubSpotSearchRequest {
  /** Filter groups (AND between groups, OR within groups) */
  filterGroups?: {
    filters: {
      propertyName: string;
      operator: HubSpotSearchOperator;
      value?: string;
      values?: string[];
      highValue?: string;
    }[];
  }[];
  /** Sort options */
  sorts?: {
    propertyName: string;
    direction: 'ASCENDING' | 'DESCENDING';
  }[];
  /** Properties to return */
  properties?: string[];
  /** Number of results */
  limit?: number;
  /** Pagination cursor */
  after?: string;
}

/**
 * HubSpot search operators
 */
export type HubSpotSearchOperator =
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'BETWEEN'
  | 'IN'
  | 'NOT_IN'
  | 'HAS_PROPERTY'
  | 'NOT_HAS_PROPERTY'
  | 'CONTAINS_TOKEN'
  | 'NOT_CONTAINS_TOKEN';

/**
 * HubSpot search response
 */
export interface HubSpotSearchResponse<T extends HubSpotCrmObject> {
  /** Total results */
  total: number;
  /** Results */
  results: T[];
  /** Paging info */
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
}

/**
 * HubSpot batch read request
 */
export interface HubSpotBatchReadRequest {
  /** Properties to return */
  properties: string[];
  /** IDs to read */
  inputs: { id: string }[];
}

/**
 * HubSpot batch response
 */
export interface HubSpotBatchResponse<T extends HubSpotCrmObject> {
  /** Status */
  status: 'COMPLETE' | 'PENDING';
  /** Results */
  results: T[];
  /** Errors */
  errors?: {
    status: string;
    category: string;
    message: string;
    context?: Record<string, string[]>;
  }[];
}

/**
 * HubSpot webhook subscription
 */
export interface HubSpotWebhookSubscription {
  /** Subscription ID */
  id: number;
  /** Event type */
  eventType: HubSpotWebhookEventType;
  /** Property name (for property change events) */
  propertyName?: string;
  /** Active flag */
  active: boolean;
  /** Created at */
  createdAt: string;
}

/**
 * HubSpot webhook event types
 */
export type HubSpotWebhookEventType =
  | 'contact.creation'
  | 'contact.deletion'
  | 'contact.propertyChange'
  | 'contact.merge'
  | 'company.creation'
  | 'company.deletion'
  | 'company.propertyChange'
  | 'company.merge'
  | 'deal.creation'
  | 'deal.deletion'
  | 'deal.propertyChange'
  | 'deal.merge';

/**
 * HubSpot webhook payload
 */
export interface HubSpotWebhookPayload {
  /** Event ID */
  eventId: number;
  /** Subscription ID */
  subscriptionId: number;
  /** Portal ID */
  portalId: number;
  /** App ID */
  appId: number;
  /** Occurred at timestamp */
  occurredAt: number;
  /** Event type */
  subscriptionType: HubSpotWebhookEventType;
  /** Attempt number */
  attemptNumber: number;
  /** Object ID */
  objectId: number;
  /** Property name (for property change events) */
  propertyName?: string;
  /** Property value (for property change events) */
  propertyValue?: string;
  /** Change source */
  changeSource?: string;
  /** Source ID */
  sourceId?: string;
}

/**
 * HubSpot API error
 */
export interface HubSpotApiError {
  /** Error status */
  status: string;
  /** Error message */
  message: string;
  /** Correlation ID */
  correlationId: string;
  /** Error category */
  category: string;
  /** Error context */
  context?: Record<string, string[]>;
  /** Error links */
  links?: Record<string, string>;
}

/**
 * Input for creating a HubSpot object
 */
export interface CreateHubSpotObjectInput {
  /** Object properties */
  properties: Record<string, string>;
  /** Associations to create */
  associations?: {
    to: { id: string };
    types: { associationCategory: string; associationTypeId: number }[];
  }[];
}

/**
 * Input for updating a HubSpot object
 */
export interface UpdateHubSpotObjectInput {
  /** Object ID */
  id: string;
  /** Properties to update */
  properties: Record<string, string>;
}
