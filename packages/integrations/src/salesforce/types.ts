/**
 * @fileoverview Salesforce type definitions
 * @module @relay/integrations/salesforce/types
 */

import type { IntegrationConfig, OAuthToken } from '../common/types';

/**
 * Salesforce authentication configuration using OAuth 2.0 Web Server flow
 */
export interface SalesforceConfig extends IntegrationConfig {
  /** Salesforce instance URL (e.g., https://yourcompany.salesforce.com) */
  instanceUrl: string;
  /** OAuth 2.0 access token */
  accessToken: string;
  /** OAuth 2.0 refresh token for token renewal */
  refreshToken?: string;
  /** API version (default: v59.0) */
  apiVersion?: string;
}

/**
 * Salesforce OAuth 2.0 configuration for authorization flows
 */
export interface SalesforceOAuthConfig {
  /** OAuth 2.0 client ID (Consumer Key) */
  clientId: string;
  /** OAuth 2.0 client secret (Consumer Secret) */
  clientSecret: string;
  /** OAuth 2.0 redirect URI */
  redirectUri: string;
  /** Salesforce login URL (default: https://login.salesforce.com) */
  loginUrl?: string;
  /** Requested OAuth scopes */
  scopes?: SalesforceOAuthScope[];
}

/**
 * Salesforce JWT Bearer flow configuration for server-to-server auth
 */
export interface SalesforceJwtConfig {
  /** OAuth 2.0 client ID (Consumer Key) */
  clientId: string;
  /** Private key in PEM format for JWT signing */
  privateKey: string;
  /** Username of the Salesforce user to authenticate as */
  username: string;
  /** Salesforce login URL (default: https://login.salesforce.com) */
  loginUrl?: string;
  /** Salesforce instance URL (required for sandbox) */
  instanceUrl?: string;
}

/**
 * Salesforce OAuth scopes
 */
export type SalesforceOAuthScope =
  | 'api'
  | 'refresh_token'
  | 'offline_access'
  | 'full'
  | 'id'
  | 'profile'
  | 'email'
  | 'address'
  | 'phone'
  | 'openid'
  | 'custom_permissions'
  | 'wave_api'
  | 'eclair_api'
  | 'chatter_api'
  | 'web'
  | 'visualforce'
  | 'content';

/**
 * Salesforce OAuth token response
 */
export interface SalesforceOAuthToken extends OAuthToken {
  /** Salesforce instance URL */
  instanceUrl: string;
  /** Salesforce user ID */
  id: string;
  /** Token issued at timestamp */
  issuedAt: string;
  /** Token signature */
  signature: string;
}

/**
 * Salesforce SObject (generic record type)
 */
export interface SalesforceSObject {
  /** Record ID */
  Id: string;
  /** Object type */
  attributes: {
    type: string;
    url: string;
  };
  /** Record name (if applicable) */
  Name?: string;
  /** Created date */
  CreatedDate?: string;
  /** Last modified date */
  LastModifiedDate?: string;
  /** Created by ID */
  CreatedById?: string;
  /** Last modified by ID */
  LastModifiedById?: string;
  /** System modstamp */
  SystemModstamp?: string;
  /** Is deleted flag */
  IsDeleted?: boolean;
  /** Additional fields */
  [key: string]: unknown;
}

/**
 * Salesforce Lead record
 */
export interface SalesforceLead extends SalesforceSObject {
  /** Lead first name */
  FirstName?: string;
  /** Lead last name */
  LastName: string;
  /** Company name */
  Company: string;
  /** Lead title */
  Title?: string;
  /** Lead email */
  Email?: string;
  /** Lead phone */
  Phone?: string;
  /** Lead mobile */
  MobilePhone?: string;
  /** Lead website */
  Website?: string;
  /** Lead description */
  Description?: string;
  /** Lead source */
  LeadSource?: string;
  /** Lead status */
  Status: string;
  /** Industry */
  Industry?: string;
  /** Annual revenue */
  AnnualRevenue?: number;
  /** Number of employees */
  NumberOfEmployees?: number;
  /** Owner ID */
  OwnerId?: string;
  /** Is converted flag */
  IsConverted?: boolean;
  /** Converted date */
  ConvertedDate?: string;
  /** Converted account ID */
  ConvertedAccountId?: string;
  /** Converted contact ID */
  ConvertedContactId?: string;
  /** Converted opportunity ID */
  ConvertedOpportunityId?: string;
  /** Street address */
  Street?: string;
  /** City */
  City?: string;
  /** State/Province */
  State?: string;
  /** Postal code */
  PostalCode?: string;
  /** Country */
  Country?: string;
  /** Rating */
  Rating?: 'Hot' | 'Warm' | 'Cold';
}

/**
 * Salesforce Contact record
 */
export interface SalesforceContact extends SalesforceSObject {
  /** Contact first name */
  FirstName?: string;
  /** Contact last name */
  LastName: string;
  /** Account ID */
  AccountId?: string;
  /** Contact title */
  Title?: string;
  /** Contact email */
  Email?: string;
  /** Contact phone */
  Phone?: string;
  /** Contact mobile */
  MobilePhone?: string;
  /** Contact fax */
  Fax?: string;
  /** Mailing street */
  MailingStreet?: string;
  /** Mailing city */
  MailingCity?: string;
  /** Mailing state */
  MailingState?: string;
  /** Mailing postal code */
  MailingPostalCode?: string;
  /** Mailing country */
  MailingCountry?: string;
  /** Other street */
  OtherStreet?: string;
  /** Other city */
  OtherCity?: string;
  /** Other state */
  OtherState?: string;
  /** Other postal code */
  OtherPostalCode?: string;
  /** Other country */
  OtherCountry?: string;
  /** Department */
  Department?: string;
  /** Birthdate */
  Birthdate?: string;
  /** Description */
  Description?: string;
  /** Owner ID */
  OwnerId?: string;
  /** Reports to ID */
  ReportsToId?: string;
  /** Lead source */
  LeadSource?: string;
}

/**
 * Salesforce Account record
 */
export interface SalesforceAccount extends SalesforceSObject {
  /** Account name */
  Name: string;
  /** Account type */
  Type?: string;
  /** Parent account ID */
  ParentId?: string;
  /** Billing street */
  BillingStreet?: string;
  /** Billing city */
  BillingCity?: string;
  /** Billing state */
  BillingState?: string;
  /** Billing postal code */
  BillingPostalCode?: string;
  /** Billing country */
  BillingCountry?: string;
  /** Shipping street */
  ShippingStreet?: string;
  /** Shipping city */
  ShippingCity?: string;
  /** Shipping state */
  ShippingState?: string;
  /** Shipping postal code */
  ShippingPostalCode?: string;
  /** Shipping country */
  ShippingCountry?: string;
  /** Phone */
  Phone?: string;
  /** Fax */
  Fax?: string;
  /** Website */
  Website?: string;
  /** Industry */
  Industry?: string;
  /** Annual revenue */
  AnnualRevenue?: number;
  /** Number of employees */
  NumberOfEmployees?: number;
  /** Description */
  Description?: string;
  /** Owner ID */
  OwnerId?: string;
  /** Account source */
  AccountSource?: string;
  /** SIC code */
  Sic?: string;
  /** Ticker symbol */
  TickerSymbol?: string;
  /** Rating */
  Rating?: 'Hot' | 'Warm' | 'Cold';
  /** Ownership */
  Ownership?: 'Public' | 'Private' | 'Subsidiary' | 'Other';
}

/**
 * Salesforce Opportunity record
 */
export interface SalesforceOpportunity extends SalesforceSObject {
  /** Opportunity name */
  Name: string;
  /** Account ID */
  AccountId?: string;
  /** Opportunity amount */
  Amount?: number;
  /** Close date */
  CloseDate: string;
  /** Stage name */
  StageName: string;
  /** Probability (0-100) */
  Probability?: number;
  /** Opportunity type */
  Type?: string;
  /** Lead source */
  LeadSource?: string;
  /** Next step */
  NextStep?: string;
  /** Description */
  Description?: string;
  /** Owner ID */
  OwnerId?: string;
  /** Is closed flag */
  IsClosed?: boolean;
  /** Is won flag */
  IsWon?: boolean;
  /** Forecast category */
  ForecastCategory?: 'Pipeline' | 'BestCase' | 'MostLikely' | 'Closed' | 'Omitted';
  /** Forecast category name */
  ForecastCategoryName?: string;
  /** Campaign ID */
  CampaignId?: string;
  /** Has opportunity line items */
  HasOpportunityLineItem?: boolean;
  /** Pricebook ID */
  Pricebook2Id?: string;
}

/**
 * Salesforce Task record
 */
export interface SalesforceTask extends SalesforceSObject {
  /** Subject */
  Subject?: string;
  /** Activity date */
  ActivityDate?: string;
  /** Status */
  Status: string;
  /** Priority */
  Priority: 'High' | 'Normal' | 'Low';
  /** Who ID (contact or lead) */
  WhoId?: string;
  /** What ID (account, opportunity, etc.) */
  WhatId?: string;
  /** Owner ID */
  OwnerId?: string;
  /** Description */
  Description?: string;
  /** Is closed flag */
  IsClosed?: boolean;
  /** Is high priority flag */
  IsHighPriority?: boolean;
  /** Call type */
  CallType?: 'Internal' | 'Inbound' | 'Outbound';
  /** Call duration (seconds) */
  CallDurationInSeconds?: number;
  /** Call result */
  CallDisposition?: string;
  /** Task type */
  TaskSubtype?: 'Task' | 'Email' | 'Call';
}

/**
 * Salesforce Event record
 */
export interface SalesforceEvent extends SalesforceSObject {
  /** Subject */
  Subject?: string;
  /** Location */
  Location?: string;
  /** Is all day event */
  IsAllDayEvent?: boolean;
  /** Start datetime */
  StartDateTime?: string;
  /** End datetime */
  EndDateTime?: string;
  /** Activity date */
  ActivityDate?: string;
  /** Activity datetime */
  ActivityDateTime?: string;
  /** Duration (minutes) */
  DurationInMinutes?: number;
  /** Who ID (contact or lead) */
  WhoId?: string;
  /** What ID (account, opportunity, etc.) */
  WhatId?: string;
  /** Owner ID */
  OwnerId?: string;
  /** Description */
  Description?: string;
  /** Show as */
  ShowAs?: 'Busy' | 'OutOfOffice' | 'Free';
  /** Is private flag */
  IsPrivate?: boolean;
  /** Is reminder set */
  IsReminderSet?: boolean;
  /** Reminder datetime */
  ReminderDateTime?: string;
}

/**
 * Salesforce User record
 */
export interface SalesforceUser extends SalesforceSObject {
  /** Username */
  Username: string;
  /** First name */
  FirstName?: string;
  /** Last name */
  LastName: string;
  /** Email */
  Email: string;
  /** Alias */
  Alias: string;
  /** Title */
  Title?: string;
  /** Department */
  Department?: string;
  /** Division */
  Division?: string;
  /** Company name */
  CompanyName?: string;
  /** Phone */
  Phone?: string;
  /** Mobile phone */
  MobilePhone?: string;
  /** Fax */
  Fax?: string;
  /** Is active flag */
  IsActive: boolean;
  /** Profile ID */
  ProfileId: string;
  /** User role ID */
  UserRoleId?: string;
  /** Manager ID */
  ManagerId?: string;
  /** Small photo URL */
  SmallPhotoUrl?: string;
  /** Full photo URL */
  FullPhotoUrl?: string;
  /** Time zone */
  TimeZoneSidKey: string;
  /** Locale */
  LocaleSidKey: string;
  /** Language */
  LanguageLocaleKey: string;
  /** Email encoding */
  EmailEncodingKey: string;
}

/**
 * SOQL query result
 */
export interface SalesforceQueryResult<T extends SalesforceSObject = SalesforceSObject> {
  /** Total size of records matching query */
  totalSize: number;
  /** Whether query is done (no more pages) */
  done: boolean;
  /** Next records URL for pagination */
  nextRecordsUrl?: string;
  /** Query records */
  records: T[];
}

/**
 * Salesforce describe result for an object
 */
export interface SalesforceObjectDescribe {
  /** Object name */
  name: string;
  /** Object label */
  label: string;
  /** Object label (plural) */
  labelPlural: string;
  /** Key prefix */
  keyPrefix: string;
  /** Is custom object */
  custom: boolean;
  /** Is createable */
  createable: boolean;
  /** Is deletable */
  deletable: boolean;
  /** Is updateable */
  updateable: boolean;
  /** Is queryable */
  queryable: boolean;
  /** Is searchable */
  searchable: boolean;
  /** Fields */
  fields: SalesforceFieldDescribe[];
  /** Record type infos */
  recordTypeInfos: SalesforceRecordTypeInfo[];
}

/**
 * Salesforce field describe
 */
export interface SalesforceFieldDescribe {
  /** Field name */
  name: string;
  /** Field label */
  label: string;
  /** Field type */
  type: string;
  /** Is createable */
  createable: boolean;
  /** Is updateable */
  updateable: boolean;
  /** Is nillable */
  nillable: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Length (for string fields) */
  length?: number;
  /** Precision (for number fields) */
  precision?: number;
  /** Scale (for number fields) */
  scale?: number;
  /** Picklist values */
  picklistValues?: SalesforcePicklistValue[];
  /** Reference to (for lookup fields) */
  referenceTo?: string[];
  /** Relationship name */
  relationshipName?: string;
}

/**
 * Salesforce picklist value
 */
export interface SalesforcePicklistValue {
  /** Value */
  value: string;
  /** Label */
  label: string;
  /** Is active */
  active: boolean;
  /** Is default */
  defaultValue: boolean;
}

/**
 * Salesforce record type info
 */
export interface SalesforceRecordTypeInfo {
  /** Record type ID */
  recordTypeId: string;
  /** Name */
  name: string;
  /** Is available */
  available: boolean;
  /** Is default */
  defaultRecordTypeMapping: boolean;
  /** Is master */
  master: boolean;
}

/**
 * Input for creating a Salesforce record
 */
export interface CreateSalesforceRecordInput {
  /** Object type (e.g., Lead, Contact, Account) */
  objectType: string;
  /** Field values */
  fields: Record<string, unknown>;
}

/**
 * Input for updating a Salesforce record
 */
export interface UpdateSalesforceRecordInput {
  /** Object type */
  objectType: string;
  /** Record ID */
  id: string;
  /** Field values to update */
  fields: Record<string, unknown>;
}

/**
 * Bulk API job info
 */
export interface SalesforceBulkJob {
  /** Job ID */
  id: string;
  /** Operation */
  operation: 'insert' | 'update' | 'upsert' | 'delete' | 'hardDelete' | 'query' | 'queryAll';
  /** Object type */
  object: string;
  /** State */
  state: 'Open' | 'UploadComplete' | 'InProgress' | 'Aborted' | 'JobComplete' | 'Failed';
  /** Content type */
  contentType: 'CSV';
  /** API version */
  apiVersion: string;
  /** Created by ID */
  createdById: string;
  /** Created date */
  createdDate: string;
  /** System modstamp */
  systemModstamp: string;
  /** Concurrency mode */
  concurrencyMode: 'Parallel';
  /** Number of records processed */
  numberRecordsProcessed?: number;
  /** Number of records failed */
  numberRecordsFailed?: number;
  /** Job type */
  jobType: 'V2Ingest' | 'V2Query';
  /** Line ending */
  lineEnding?: 'LF' | 'CRLF';
  /** Column delimiter */
  columnDelimiter?: 'BACKQUOTE' | 'CARET' | 'COMMA' | 'PIPE' | 'SEMICOLON' | 'TAB';
}

/**
 * Bulk API job result
 */
export interface SalesforceBulkJobResult {
  /** Success count */
  successfulResults: number;
  /** Failed count */
  failedResults: number;
  /** Unprocessed count */
  unprocessedRecords: number;
}

/**
 * Salesforce Platform Event
 */
export interface SalesforcePlatformEvent {
  /** Event type */
  type: string;
  /** Schema */
  schema: string;
  /** Payload */
  payload: Record<string, unknown>;
  /** Event ID */
  event: {
    replayId: number;
    EventApiName: string;
    EventUuid: string;
    CreatedById: string;
    CreatedDate: string;
  };
}

/**
 * Salesforce Outbound Message
 */
export interface SalesforceOutboundMessage {
  /** Organization ID */
  OrganizationId: string;
  /** Action ID */
  ActionId: string;
  /** Session ID */
  SessionId?: string;
  /** Enterprise URL */
  EnterpriseUrl: string;
  /** Partner URL */
  PartnerUrl: string;
  /** Notifications */
  Notification: {
    Id: string;
    sObject: SalesforceSObject;
  }[];
}

/**
 * Salesforce API error response
 */
export interface SalesforceApiError {
  /** Error message */
  message: string;
  /** Error code */
  errorCode: string;
  /** Fields affected */
  fields?: string[];
}

/**
 * Salesforce composite request
 */
export interface SalesforceCompositeRequest {
  /** Requests */
  compositeRequest: {
    /** Method */
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    /** URL */
    url: string;
    /** Reference ID */
    referenceId: string;
    /** Body */
    body?: unknown;
  }[];
  /** All or none flag */
  allOrNone?: boolean;
}

/**
 * Salesforce composite response
 */
export interface SalesforceCompositeResponse {
  /** Responses */
  compositeResponse: {
    /** Body */
    body: unknown;
    /** HTTP headers */
    httpHeaders: Record<string, string>;
    /** HTTP status code */
    httpStatusCode: number;
    /** Reference ID */
    referenceId: string;
  }[];
}
