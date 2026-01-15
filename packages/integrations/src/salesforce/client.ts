/**
 * @fileoverview Salesforce API client
 * @module @relay/integrations/salesforce/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  SalesforceConfig,
  SalesforceSObject,
  SalesforceLead,
  SalesforceContact,
  SalesforceAccount,
  SalesforceOpportunity,
  SalesforceTask,
  SalesforceEvent,
  SalesforceUser,
  SalesforceQueryResult,
  SalesforceObjectDescribe,
  CreateSalesforceRecordInput,
  UpdateSalesforceRecordInput,
  SalesforceBulkJob,
  SalesforceCompositeRequest,
  SalesforceCompositeResponse,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, User, Issue, Comment } from '../common/types';

/**
 * Salesforce integration source identifier
 */
const SOURCE: IntegrationSource = 'salesforce';

/**
 * Default Salesforce API version
 */
const DEFAULT_API_VERSION = 'v59.0';

/**
 * Salesforce REST API client
 * Provides methods for CRUD operations, SOQL queries, and metadata access
 */
export class SalesforceClient {
  private http: AxiosInstance;
  private config: SalesforceConfig;
  private apiVersion: string;

  /**
   * Creates a new Salesforce client
   * @param config - Salesforce configuration
   */
  constructor(config: SalesforceConfig) {
    this.validateConfig(config);
    this.config = config;
    this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;

    const baseUrl = `${config.instanceUrl}/services/data/${this.apiVersion}`;

    this.http = createHttpClient(SOURCE, {
      baseUrl,
      timeout: config.timeout || 30000,
    });

    // Add auth headers
    this.http.interceptors.request.use((request) => {
      request.headers = {
        ...request.headers,
        ...bearerAuthHeaders(config.accessToken),
      };
      return request;
    });

    // Add Salesforce-specific error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.data) {
          const data = error.response.data;
          if (Array.isArray(data) && data.length > 0) {
            const sfError = data[0] as { message: string; errorCode: string };
            throw new IntegrationError(
              sfError.message,
              this.mapErrorCode(sfError.errorCode),
              SOURCE,
              {
                statusCode: error.response.status,
                details: data,
              }
            );
          }
        }
        throw error;
      }
    );
  }

  /**
   * Validates configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: SalesforceConfig): void {
    if (!config.instanceUrl) {
      throw new ConfigurationError(SOURCE, 'Salesforce instance URL is required');
    }
    if (!config.accessToken) {
      throw new ConfigurationError(SOURCE, 'Salesforce access token is required');
    }
  }

  /**
   * Maps Salesforce error codes to integration error codes
   * @param errorCode - Salesforce error code
   * @returns Integration error code
   */
  private mapErrorCode(errorCode: string): IntegrationErrorCode {
    const codeMap: Record<string, IntegrationErrorCode> = {
      INVALID_SESSION_ID: IntegrationErrorCode.AUTH_FAILED,
      REQUEST_LIMIT_EXCEEDED: IntegrationErrorCode.RATE_LIMITED,
      NOT_FOUND: IntegrationErrorCode.NOT_FOUND,
      INSUFFICIENT_ACCESS_OR_READONLY: IntegrationErrorCode.FORBIDDEN,
      INVALID_FIELD: IntegrationErrorCode.INVALID_REQUEST,
      MALFORMED_ID: IntegrationErrorCode.INVALID_REQUEST,
      MALFORMED_QUERY: IntegrationErrorCode.INVALID_REQUEST,
    };
    return codeMap[errorCode] || IntegrationErrorCode.PROVIDER_ERROR;
  }

  // ==========================================================================
  // SOQL Query Operations
  // ==========================================================================

  /**
   * Executes a SOQL query
   * @param soql - SOQL query string
   * @returns Query result with records
   */
  async query<T extends SalesforceSObject = SalesforceSObject>(
    soql: string
  ): Promise<SalesforceQueryResult<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get('/query', {
        params: { q: soql },
      });
      return data as SalesforceQueryResult<T>;
    });
  }

  /**
   * Fetches the next page of query results
   * @param nextRecordsUrl - URL for next page from previous query
   * @returns Next page of query results
   */
  async queryMore<T extends SalesforceSObject = SalesforceSObject>(
    nextRecordsUrl: string
  ): Promise<SalesforceQueryResult<T>> {
    return withRetry(async () => {
      // nextRecordsUrl is a relative path like /services/data/v59.0/query/...
      const { data } = await axios.get(`${this.config.instanceUrl}${nextRecordsUrl}`, {
        headers: bearerAuthHeaders(this.config.accessToken),
      });
      return data as SalesforceQueryResult<T>;
    });
  }

  /**
   * Executes a SOQL query and fetches all pages
   * @param soql - SOQL query string
   * @returns All records from the query
   */
  async queryAll<T extends SalesforceSObject = SalesforceSObject>(
    soql: string
  ): Promise<T[]> {
    const allRecords: T[] = [];
    let result = await this.query<T>(soql);
    allRecords.push(...result.records);

    while (!result.done && result.nextRecordsUrl) {
      result = await this.queryMore<T>(result.nextRecordsUrl);
      allRecords.push(...result.records);
    }

    return allRecords;
  }

  /**
   * Searches records using SOSL
   * @param sosl - SOSL search string
   * @returns Search results
   */
  async search(sosl: string): Promise<SalesforceSObject[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/search', {
        params: { q: sosl },
      });
      return data.searchRecords as SalesforceSObject[];
    });
  }

  // ==========================================================================
  // Generic Record Operations
  // ==========================================================================

  /**
   * Gets a record by ID
   * @param objectType - SObject type (e.g., 'Account', 'Lead')
   * @param id - Record ID
   * @param fields - Optional fields to retrieve
   * @returns Record data
   */
  async getRecord<T extends SalesforceSObject = SalesforceSObject>(
    objectType: string,
    id: string,
    fields?: string[]
  ): Promise<T> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (fields && fields.length > 0) {
        params.fields = fields.join(',');
      }
      const { data } = await this.http.get(`/sobjects/${objectType}/${id}`, { params });
      return data as T;
    });
  }

  /**
   * Creates a new record
   * @param input - Record creation input
   * @returns Created record ID
   */
  async createRecord(input: CreateSalesforceRecordInput): Promise<{ id: string; success: boolean }> {
    return withRetry(async () => {
      const { data } = await this.http.post(`/sobjects/${input.objectType}`, input.fields);
      return data as { id: string; success: boolean };
    });
  }

  /**
   * Updates an existing record
   * @param input - Record update input
   */
  async updateRecord(input: UpdateSalesforceRecordInput): Promise<void> {
    return withRetry(async () => {
      await this.http.patch(`/sobjects/${input.objectType}/${input.id}`, input.fields);
    });
  }

  /**
   * Deletes a record
   * @param objectType - SObject type
   * @param id - Record ID
   */
  async deleteRecord(objectType: string, id: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/sobjects/${objectType}/${id}`);
    });
  }

  /**
   * Upserts a record using an external ID field
   * @param objectType - SObject type
   * @param externalIdField - External ID field name
   * @param externalIdValue - External ID value
   * @param fields - Field values
   * @returns Result with ID and created flag
   */
  async upsertRecord(
    objectType: string,
    externalIdField: string,
    externalIdValue: string,
    fields: Record<string, unknown>
  ): Promise<{ id: string; success: boolean; created: boolean }> {
    return withRetry(async () => {
      const { data } = await this.http.patch(
        `/sobjects/${objectType}/${externalIdField}/${externalIdValue}`,
        fields
      );
      return data as { id: string; success: boolean; created: boolean };
    });
  }

  // ==========================================================================
  // Lead Operations
  // ==========================================================================

  /**
   * Gets a lead by ID
   * @param id - Lead ID
   * @returns Lead record
   */
  async getLead(id: string): Promise<SalesforceLead> {
    return this.getRecord<SalesforceLead>('Lead', id);
  }

  /**
   * Creates a new lead
   * @param lead - Lead data
   * @returns Created lead ID
   */
  async createLead(lead: Partial<SalesforceLead>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Lead', fields: lead });
  }

  /**
   * Updates a lead
   * @param id - Lead ID
   * @param updates - Fields to update
   */
  async updateLead(id: string, updates: Partial<SalesforceLead>): Promise<void> {
    return this.updateRecord({ objectType: 'Lead', id, fields: updates });
  }

  /**
   * Searches leads
   * @param criteria - Search criteria
   * @returns Matching leads
   */
  async searchLeads(criteria: {
    email?: string;
    company?: string;
    status?: string;
    limit?: number;
  }): Promise<SalesforceLead[]> {
    const conditions: string[] = [];
    if (criteria.email) {
      conditions.push(`Email = '${this.escapeSOQL(criteria.email)}'`);
    }
    if (criteria.company) {
      conditions.push(`Company LIKE '%${this.escapeSOQL(criteria.company)}%'`);
    }
    if (criteria.status) {
      conditions.push(`Status = '${this.escapeSOQL(criteria.status)}'`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit || 100;

    const soql = `SELECT Id, Name, FirstName, LastName, Email, Company, Title, Phone, Status, LeadSource, Industry, Rating, OwnerId, CreatedDate, LastModifiedDate FROM Lead ${where} ORDER BY CreatedDate DESC LIMIT ${limit}`;

    const result = await this.query<SalesforceLead>(soql);
    return result.records;
  }

  // ==========================================================================
  // Contact Operations
  // ==========================================================================

  /**
   * Gets a contact by ID
   * @param id - Contact ID
   * @returns Contact record
   */
  async getContact(id: string): Promise<SalesforceContact> {
    return this.getRecord<SalesforceContact>('Contact', id);
  }

  /**
   * Creates a new contact
   * @param contact - Contact data
   * @returns Created contact ID
   */
  async createContact(contact: Partial<SalesforceContact>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Contact', fields: contact });
  }

  /**
   * Updates a contact
   * @param id - Contact ID
   * @param updates - Fields to update
   */
  async updateContact(id: string, updates: Partial<SalesforceContact>): Promise<void> {
    return this.updateRecord({ objectType: 'Contact', id, fields: updates });
  }

  /**
   * Searches contacts
   * @param criteria - Search criteria
   * @returns Matching contacts
   */
  async searchContacts(criteria: {
    email?: string;
    accountId?: string;
    name?: string;
    limit?: number;
  }): Promise<SalesforceContact[]> {
    const conditions: string[] = [];
    if (criteria.email) {
      conditions.push(`Email = '${this.escapeSOQL(criteria.email)}'`);
    }
    if (criteria.accountId) {
      conditions.push(`AccountId = '${criteria.accountId}'`);
    }
    if (criteria.name) {
      conditions.push(`Name LIKE '%${this.escapeSOQL(criteria.name)}%'`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit || 100;

    const soql = `SELECT Id, Name, FirstName, LastName, Email, Phone, Title, AccountId, Department, LeadSource, OwnerId, CreatedDate, LastModifiedDate FROM Contact ${where} ORDER BY CreatedDate DESC LIMIT ${limit}`;

    const result = await this.query<SalesforceContact>(soql);
    return result.records;
  }

  // ==========================================================================
  // Account Operations
  // ==========================================================================

  /**
   * Gets an account by ID
   * @param id - Account ID
   * @returns Account record
   */
  async getAccount(id: string): Promise<SalesforceAccount> {
    return this.getRecord<SalesforceAccount>('Account', id);
  }

  /**
   * Creates a new account
   * @param account - Account data
   * @returns Created account ID
   */
  async createAccount(account: Partial<SalesforceAccount>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Account', fields: account });
  }

  /**
   * Updates an account
   * @param id - Account ID
   * @param updates - Fields to update
   */
  async updateAccount(id: string, updates: Partial<SalesforceAccount>): Promise<void> {
    return this.updateRecord({ objectType: 'Account', id, fields: updates });
  }

  /**
   * Searches accounts
   * @param criteria - Search criteria
   * @returns Matching accounts
   */
  async searchAccounts(criteria: {
    name?: string;
    industry?: string;
    type?: string;
    limit?: number;
  }): Promise<SalesforceAccount[]> {
    const conditions: string[] = [];
    if (criteria.name) {
      conditions.push(`Name LIKE '%${this.escapeSOQL(criteria.name)}%'`);
    }
    if (criteria.industry) {
      conditions.push(`Industry = '${this.escapeSOQL(criteria.industry)}'`);
    }
    if (criteria.type) {
      conditions.push(`Type = '${this.escapeSOQL(criteria.type)}'`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit || 100;

    const soql = `SELECT Id, Name, Type, Industry, Phone, Website, AnnualRevenue, NumberOfEmployees, OwnerId, CreatedDate, LastModifiedDate FROM Account ${where} ORDER BY CreatedDate DESC LIMIT ${limit}`;

    const result = await this.query<SalesforceAccount>(soql);
    return result.records;
  }

  // ==========================================================================
  // Opportunity Operations
  // ==========================================================================

  /**
   * Gets an opportunity by ID
   * @param id - Opportunity ID
   * @returns Opportunity record
   */
  async getOpportunity(id: string): Promise<SalesforceOpportunity> {
    return this.getRecord<SalesforceOpportunity>('Opportunity', id);
  }

  /**
   * Creates a new opportunity
   * @param opportunity - Opportunity data
   * @returns Created opportunity ID
   */
  async createOpportunity(opportunity: Partial<SalesforceOpportunity>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Opportunity', fields: opportunity });
  }

  /**
   * Updates an opportunity
   * @param id - Opportunity ID
   * @param updates - Fields to update
   */
  async updateOpportunity(id: string, updates: Partial<SalesforceOpportunity>): Promise<void> {
    return this.updateRecord({ objectType: 'Opportunity', id, fields: updates });
  }

  /**
   * Gets opportunities by account
   * @param accountId - Account ID
   * @param options - Query options
   * @returns Opportunities for the account
   */
  async getOpportunitiesByAccount(
    accountId: string,
    options?: { stageName?: string; isClosed?: boolean; limit?: number }
  ): Promise<SalesforceOpportunity[]> {
    const conditions: string[] = [`AccountId = '${accountId}'`];
    if (options?.stageName) {
      conditions.push(`StageName = '${this.escapeSOQL(options.stageName)}'`);
    }
    if (options?.isClosed !== undefined) {
      conditions.push(`IsClosed = ${options.isClosed}`);
    }

    const limit = options?.limit || 100;
    const soql = `SELECT Id, Name, AccountId, Amount, CloseDate, StageName, Probability, Type, LeadSource, IsClosed, IsWon, OwnerId, CreatedDate, LastModifiedDate FROM Opportunity WHERE ${conditions.join(' AND ')} ORDER BY CloseDate DESC LIMIT ${limit}`;

    const result = await this.query<SalesforceOpportunity>(soql);
    return result.records;
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  /**
   * Gets a task by ID
   * @param id - Task ID
   * @returns Task record
   */
  async getTask(id: string): Promise<SalesforceTask> {
    return this.getRecord<SalesforceTask>('Task', id);
  }

  /**
   * Creates a new task
   * @param task - Task data
   * @returns Created task ID
   */
  async createTask(task: Partial<SalesforceTask>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Task', fields: task });
  }

  /**
   * Updates a task
   * @param id - Task ID
   * @param updates - Fields to update
   */
  async updateTask(id: string, updates: Partial<SalesforceTask>): Promise<void> {
    return this.updateRecord({ objectType: 'Task', id, fields: updates });
  }

  /**
   * Logs a call activity
   * @param options - Call details
   * @returns Created task ID
   */
  async logCall(options: {
    whoId?: string;
    whatId?: string;
    subject: string;
    description?: string;
    callType?: 'Internal' | 'Inbound' | 'Outbound';
    callDurationSeconds?: number;
    callResult?: string;
  }): Promise<{ id: string; success: boolean }> {
    return this.createTask({
      Subject: options.subject,
      WhoId: options.whoId,
      WhatId: options.whatId,
      Description: options.description,
      TaskSubtype: 'Call',
      CallType: options.callType,
      CallDurationInSeconds: options.callDurationSeconds,
      CallDisposition: options.callResult,
      Status: 'Completed',
      Priority: 'Normal',
    });
  }

  // ==========================================================================
  // Event Operations
  // ==========================================================================

  /**
   * Gets an event by ID
   * @param id - Event ID
   * @returns Event record
   */
  async getEvent(id: string): Promise<SalesforceEvent> {
    return this.getRecord<SalesforceEvent>('Event', id);
  }

  /**
   * Creates a new event
   * @param event - Event data
   * @returns Created event ID
   */
  async createEvent(event: Partial<SalesforceEvent>): Promise<{ id: string; success: boolean }> {
    return this.createRecord({ objectType: 'Event', fields: event });
  }

  /**
   * Schedules a meeting
   * @param options - Meeting details
   * @returns Created event ID
   */
  async scheduleMeeting(options: {
    subject: string;
    startDateTime: Date;
    endDateTime: Date;
    whoId?: string;
    whatId?: string;
    location?: string;
    description?: string;
  }): Promise<{ id: string; success: boolean }> {
    return this.createEvent({
      Subject: options.subject,
      StartDateTime: options.startDateTime.toISOString(),
      EndDateTime: options.endDateTime.toISOString(),
      WhoId: options.whoId,
      WhatId: options.whatId,
      Location: options.location,
      Description: options.description,
    });
  }

  // ==========================================================================
  // User Operations
  // ==========================================================================

  /**
   * Gets a user by ID
   * @param id - User ID
   * @returns User record
   */
  async getUser(id: string): Promise<SalesforceUser> {
    return this.getRecord<SalesforceUser>('User', id);
  }

  /**
   * Gets the current user
   * @returns Current user record
   */
  async getCurrentUser(): Promise<SalesforceUser> {
    return withRetry(async () => {
      const { data } = await this.http.get('/chatter/users/me');
      return this.getUser(data.id);
    });
  }

  /**
   * Searches users
   * @param criteria - Search criteria
   * @returns Matching users
   */
  async searchUsers(criteria: {
    name?: string;
    email?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<SalesforceUser[]> {
    const conditions: string[] = [];
    if (criteria.name) {
      conditions.push(`Name LIKE '%${this.escapeSOQL(criteria.name)}%'`);
    }
    if (criteria.email) {
      conditions.push(`Email = '${this.escapeSOQL(criteria.email)}'`);
    }
    if (criteria.isActive !== undefined) {
      conditions.push(`IsActive = ${criteria.isActive}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit || 100;

    const soql = `SELECT Id, Username, Name, FirstName, LastName, Email, Alias, Title, Department, IsActive, ProfileId, SmallPhotoUrl FROM User ${where} ORDER BY Name LIMIT ${limit}`;

    const result = await this.query<SalesforceUser>(soql);
    return result.records;
  }

  // ==========================================================================
  // Metadata Operations
  // ==========================================================================

  /**
   * Describes an SObject
   * @param objectType - SObject type name
   * @returns Object describe result
   */
  async describeObject(objectType: string): Promise<SalesforceObjectDescribe> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/sobjects/${objectType}/describe`);
      return data as SalesforceObjectDescribe;
    });
  }

  /**
   * Lists all available SObjects
   * @returns List of SObject names and metadata
   */
  async listObjects(): Promise<{ name: string; label: string; custom: boolean; queryable: boolean }[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/sobjects');
      return data.sobjects.map((obj: Record<string, unknown>) => ({
        name: obj.name as string,
        label: obj.label as string,
        custom: obj.custom as boolean,
        queryable: obj.queryable as boolean,
      }));
    });
  }

  /**
   * Gets API limits
   * @returns Current API limit usage
   */
  async getLimits(): Promise<Record<string, { Max: number; Remaining: number }>> {
    return withRetry(async () => {
      const { data } = await this.http.get('/limits');
      return data as Record<string, { Max: number; Remaining: number }>;
    });
  }

  // ==========================================================================
  // Composite Operations
  // ==========================================================================

  /**
   * Executes a composite request (multiple operations in one call)
   * @param request - Composite request
   * @returns Composite response
   */
  async composite(request: SalesforceCompositeRequest): Promise<SalesforceCompositeResponse> {
    return withRetry(async () => {
      const { data } = await this.http.post('/composite', request);
      return data as SalesforceCompositeResponse;
    });
  }

  /**
   * Creates multiple records in a single request
   * @param records - Records to create (max 200)
   * @returns Creation results
   */
  async createMultiple(
    records: { objectType: string; fields: Record<string, unknown> }[]
  ): Promise<{ id: string; success: boolean; errors: unknown[] }[]> {
    if (records.length > 200) {
      throw new IntegrationError(
        'Maximum 200 records per composite create request',
        IntegrationErrorCode.INVALID_REQUEST,
        SOURCE
      );
    }

    const compositeRequest: SalesforceCompositeRequest = {
      allOrNone: false,
      compositeRequest: records.map((record, index) => ({
        method: 'POST',
        url: `/services/data/${this.apiVersion}/sobjects/${record.objectType}`,
        referenceId: `ref${index}`,
        body: record.fields,
      })),
    };

    const response = await this.composite(compositeRequest);
    return response.compositeResponse.map((r) => r.body as { id: string; success: boolean; errors: unknown[] });
  }

  // ==========================================================================
  // Bulk API 2.0 Operations
  // ==========================================================================

  /**
   * Creates a bulk ingest job
   * @param objectType - SObject type
   * @param operation - Operation type
   * @returns Created job
   */
  async createBulkJob(
    objectType: string,
    operation: 'insert' | 'update' | 'upsert' | 'delete'
  ): Promise<SalesforceBulkJob> {
    return withRetry(async () => {
      const { data } = await this.http.post('/jobs/ingest', {
        object: objectType,
        operation,
        contentType: 'CSV',
        lineEnding: 'LF',
      });
      return data as SalesforceBulkJob;
    });
  }

  /**
   * Uploads data to a bulk job
   * @param jobId - Job ID
   * @param csvData - CSV data to upload
   */
  async uploadBulkJobData(jobId: string, csvData: string): Promise<void> {
    return withRetry(async () => {
      await this.http.put(`/jobs/ingest/${jobId}/batches`, csvData, {
        headers: {
          'Content-Type': 'text/csv',
        },
      });
    });
  }

  /**
   * Closes a bulk job (marks as ready for processing)
   * @param jobId - Job ID
   * @returns Updated job
   */
  async closeBulkJob(jobId: string): Promise<SalesforceBulkJob> {
    return withRetry(async () => {
      const { data } = await this.http.patch(`/jobs/ingest/${jobId}`, {
        state: 'UploadComplete',
      });
      return data as SalesforceBulkJob;
    });
  }

  /**
   * Gets bulk job status
   * @param jobId - Job ID
   * @returns Job status
   */
  async getBulkJobStatus(jobId: string): Promise<SalesforceBulkJob> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/jobs/ingest/${jobId}`);
      return data as SalesforceBulkJob;
    });
  }

  /**
   * Gets successful results from a bulk job
   * @param jobId - Job ID
   * @returns CSV of successful records
   */
  async getBulkJobSuccessfulResults(jobId: string): Promise<string> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/jobs/ingest/${jobId}/successfulResults`, {
        headers: { Accept: 'text/csv' },
      });
      return data as string;
    });
  }

  /**
   * Gets failed results from a bulk job
   * @param jobId - Job ID
   * @returns CSV of failed records
   */
  async getBulkJobFailedResults(jobId: string): Promise<string> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/jobs/ingest/${jobId}/failedResults`, {
        headers: { Accept: 'text/csv' },
      });
      return data as string;
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Escapes special characters in SOQL strings
   * @param value - String to escape
   * @returns Escaped string
   */
  private escapeSOQL(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  /**
   * Tests the connection
   * @returns Whether connection is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getLimits();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps Salesforce user to common User type
   * @param user - Salesforce user
   * @returns Common User type
   */
  mapToCommonUser(user: SalesforceUser): User {
    return {
      id: user.Id,
      username: user.Username,
      displayName: `${user.FirstName || ''} ${user.LastName}`.trim(),
      email: user.Email,
      avatarUrl: user.SmallPhotoUrl,
    };
  }

  /**
   * Maps Salesforce task to common Issue type (for compatibility)
   * @param task - Salesforce task
   * @returns Common Issue type
   */
  mapTaskToCommonIssue(task: SalesforceTask): Issue {
    return {
      id: task.Id,
      key: task.Id,
      title: task.Subject || 'Untitled Task',
      description: task.Description,
      status: task.Status,
      priority: task.Priority,
      type: task.TaskSubtype || 'Task',
      createdAt: new Date(task.CreatedDate || Date.now()),
      updatedAt: new Date(task.LastModifiedDate || Date.now()),
      url: `${this.config.instanceUrl}/${task.Id}`,
      reporter: {
        id: task.OwnerId || 'unknown',
        username: task.OwnerId || 'unknown',
      },
    };
  }
}
