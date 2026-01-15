/**
 * @fileoverview HubSpot CRM API client
 * @module @relay/integrations/hubspot/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  HubSpotConfig,
  HubSpotContact,
  HubSpotCompany,
  HubSpotDeal,
  HubSpotTicket,
  HubSpotOwner,
  HubSpotPipeline,
  HubSpotEngagement,
  HubSpotSearchRequest,
  HubSpotSearchResponse,
  HubSpotCrmObject,
  CreateHubSpotObjectInput,
  UpdateHubSpotObjectInput,
  HubSpotBatchReadRequest,
  HubSpotBatchResponse,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, User, Issue, Comment } from '../common/types';

/**
 * HubSpot integration source identifier
 */
const SOURCE: IntegrationSource = 'hubspot';

/**
 * HubSpot API base URL
 */
const HUBSPOT_API_URL = 'https://api.hubapi.com';

/**
 * HubSpot CRM API client
 * Provides methods for contacts, companies, deals, tickets, and engagements
 */
export class HubSpotClient {
  private http: AxiosInstance;
  private config: HubSpotConfig;

  /**
   * Creates a new HubSpot client
   * @param config - HubSpot configuration
   */
  constructor(config: HubSpotConfig) {
    this.validateConfig(config);
    this.config = config;

    this.http = createHttpClient(SOURCE, {
      baseUrl: HUBSPOT_API_URL,
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

    // Add HubSpot-specific error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.data) {
          const data = error.response.data as { message?: string; category?: string; status?: string };
          throw new IntegrationError(
            data.message || 'HubSpot API error',
            this.mapErrorCategory(data.category),
            SOURCE,
            {
              statusCode: error.response.status,
              details: data,
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
  private validateConfig(config: HubSpotConfig): void {
    if (!config.accessToken) {
      throw new ConfigurationError(SOURCE, 'HubSpot access token is required');
    }
  }

  /**
   * Maps HubSpot error categories to integration error codes
   * @param category - HubSpot error category
   * @returns Integration error code
   */
  private mapErrorCategory(category?: string): IntegrationErrorCode {
    const categoryMap: Record<string, IntegrationErrorCode> = {
      AUTHENTICATION_ERROR: IntegrationErrorCode.AUTH_FAILED,
      RATE_LIMIT_EXCEEDED: IntegrationErrorCode.RATE_LIMITED,
      NOT_FOUND: IntegrationErrorCode.NOT_FOUND,
      INVALID_INPUT: IntegrationErrorCode.INVALID_REQUEST,
      VALIDATION_ERROR: IntegrationErrorCode.INVALID_REQUEST,
      FORBIDDEN: IntegrationErrorCode.FORBIDDEN,
    };
    return categoryMap[category || ''] || IntegrationErrorCode.PROVIDER_ERROR;
  }

  // ==========================================================================
  // Contact Operations
  // ==========================================================================

  /**
   * Gets a contact by ID
   * @param contactId - Contact ID
   * @param properties - Properties to retrieve
   * @param associations - Associations to include
   * @returns Contact record
   */
  async getContact(
    contactId: string,
    properties?: string[],
    associations?: string[]
  ): Promise<HubSpotContact> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (properties && properties.length > 0) {
        params.properties = properties.join(',');
      }
      if (associations && associations.length > 0) {
        params.associations = associations.join(',');
      }

      const { data } = await this.http.get(`/crm/v3/objects/contacts/${contactId}`, { params });
      return data as HubSpotContact;
    });
  }

  /**
   * Creates a new contact
   * @param input - Contact creation input
   * @returns Created contact
   */
  async createContact(input: CreateHubSpotObjectInput): Promise<HubSpotContact> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/contacts', input);
      return data as HubSpotContact;
    });
  }

  /**
   * Updates a contact
   * @param contactId - Contact ID
   * @param properties - Properties to update
   * @returns Updated contact
   */
  async updateContact(contactId: string, properties: Record<string, string>): Promise<HubSpotContact> {
    return withRetry(async () => {
      const { data } = await this.http.patch(`/crm/v3/objects/contacts/${contactId}`, { properties });
      return data as HubSpotContact;
    });
  }

  /**
   * Deletes a contact (archives it)
   * @param contactId - Contact ID
   */
  async deleteContact(contactId: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/crm/v3/objects/contacts/${contactId}`);
    });
  }

  /**
   * Searches contacts
   * @param request - Search request
   * @returns Search results
   */
  async searchContacts(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse<HubSpotContact>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/contacts/search', request);
      return data as HubSpotSearchResponse<HubSpotContact>;
    });
  }

  /**
   * Gets contact by email
   * @param email - Email address
   * @param properties - Properties to retrieve
   * @returns Contact or undefined
   */
  async getContactByEmail(email: string, properties?: string[]): Promise<HubSpotContact | undefined> {
    const result = await this.searchContacts({
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email,
        }],
      }],
      properties: properties || ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage'],
      limit: 1,
    });

    return result.results[0];
  }

  // ==========================================================================
  // Company Operations
  // ==========================================================================

  /**
   * Gets a company by ID
   * @param companyId - Company ID
   * @param properties - Properties to retrieve
   * @param associations - Associations to include
   * @returns Company record
   */
  async getCompany(
    companyId: string,
    properties?: string[],
    associations?: string[]
  ): Promise<HubSpotCompany> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (properties && properties.length > 0) {
        params.properties = properties.join(',');
      }
      if (associations && associations.length > 0) {
        params.associations = associations.join(',');
      }

      const { data } = await this.http.get(`/crm/v3/objects/companies/${companyId}`, { params });
      return data as HubSpotCompany;
    });
  }

  /**
   * Creates a new company
   * @param input - Company creation input
   * @returns Created company
   */
  async createCompany(input: CreateHubSpotObjectInput): Promise<HubSpotCompany> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/companies', input);
      return data as HubSpotCompany;
    });
  }

  /**
   * Updates a company
   * @param companyId - Company ID
   * @param properties - Properties to update
   * @returns Updated company
   */
  async updateCompany(companyId: string, properties: Record<string, string>): Promise<HubSpotCompany> {
    return withRetry(async () => {
      const { data } = await this.http.patch(`/crm/v3/objects/companies/${companyId}`, { properties });
      return data as HubSpotCompany;
    });
  }

  /**
   * Searches companies
   * @param request - Search request
   * @returns Search results
   */
  async searchCompanies(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse<HubSpotCompany>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/companies/search', request);
      return data as HubSpotSearchResponse<HubSpotCompany>;
    });
  }

  /**
   * Gets company by domain
   * @param domain - Company domain
   * @param properties - Properties to retrieve
   * @returns Company or undefined
   */
  async getCompanyByDomain(domain: string, properties?: string[]): Promise<HubSpotCompany | undefined> {
    const result = await this.searchCompanies({
      filterGroups: [{
        filters: [{
          propertyName: 'domain',
          operator: 'EQ',
          value: domain,
        }],
      }],
      properties: properties || ['name', 'domain', 'industry', 'phone', 'website'],
      limit: 1,
    });

    return result.results[0];
  }

  // ==========================================================================
  // Deal Operations
  // ==========================================================================

  /**
   * Gets a deal by ID
   * @param dealId - Deal ID
   * @param properties - Properties to retrieve
   * @param associations - Associations to include
   * @returns Deal record
   */
  async getDeal(
    dealId: string,
    properties?: string[],
    associations?: string[]
  ): Promise<HubSpotDeal> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (properties && properties.length > 0) {
        params.properties = properties.join(',');
      }
      if (associations && associations.length > 0) {
        params.associations = associations.join(',');
      }

      const { data } = await this.http.get(`/crm/v3/objects/deals/${dealId}`, { params });
      return data as HubSpotDeal;
    });
  }

  /**
   * Creates a new deal
   * @param input - Deal creation input
   * @returns Created deal
   */
  async createDeal(input: CreateHubSpotObjectInput): Promise<HubSpotDeal> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/deals', input);
      return data as HubSpotDeal;
    });
  }

  /**
   * Updates a deal
   * @param dealId - Deal ID
   * @param properties - Properties to update
   * @returns Updated deal
   */
  async updateDeal(dealId: string, properties: Record<string, string>): Promise<HubSpotDeal> {
    return withRetry(async () => {
      const { data } = await this.http.patch(`/crm/v3/objects/deals/${dealId}`, { properties });
      return data as HubSpotDeal;
    });
  }

  /**
   * Searches deals
   * @param request - Search request
   * @returns Search results
   */
  async searchDeals(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse<HubSpotDeal>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/deals/search', request);
      return data as HubSpotSearchResponse<HubSpotDeal>;
    });
  }

  /**
   * Gets deals by pipeline stage
   * @param pipelineId - Pipeline ID
   * @param stageId - Stage ID
   * @param properties - Properties to retrieve
   * @returns Deals in the stage
   */
  async getDealsByStage(
    pipelineId: string,
    stageId: string,
    properties?: string[]
  ): Promise<HubSpotDeal[]> {
    const result = await this.searchDeals({
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
          { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        ],
      }],
      properties: properties || ['dealname', 'amount', 'dealstage', 'closedate', 'hubspot_owner_id'],
      limit: 100,
    });

    return result.results;
  }

  // ==========================================================================
  // Ticket Operations
  // ==========================================================================

  /**
   * Gets a ticket by ID
   * @param ticketId - Ticket ID
   * @param properties - Properties to retrieve
   * @returns Ticket record
   */
  async getTicket(ticketId: string, properties?: string[]): Promise<HubSpotTicket> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (properties && properties.length > 0) {
        params.properties = properties.join(',');
      }

      const { data } = await this.http.get(`/crm/v3/objects/tickets/${ticketId}`, { params });
      return data as HubSpotTicket;
    });
  }

  /**
   * Creates a new ticket
   * @param input - Ticket creation input
   * @returns Created ticket
   */
  async createTicket(input: CreateHubSpotObjectInput): Promise<HubSpotTicket> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/tickets', input);
      return data as HubSpotTicket;
    });
  }

  /**
   * Updates a ticket
   * @param ticketId - Ticket ID
   * @param properties - Properties to update
   * @returns Updated ticket
   */
  async updateTicket(ticketId: string, properties: Record<string, string>): Promise<HubSpotTicket> {
    return withRetry(async () => {
      const { data } = await this.http.patch(`/crm/v3/objects/tickets/${ticketId}`, { properties });
      return data as HubSpotTicket;
    });
  }

  /**
   * Searches tickets
   * @param request - Search request
   * @returns Search results
   */
  async searchTickets(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse<HubSpotTicket>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/tickets/search', request);
      return data as HubSpotSearchResponse<HubSpotTicket>;
    });
  }

  // ==========================================================================
  // Pipeline Operations
  // ==========================================================================

  /**
   * Gets deal pipelines
   * @returns Deal pipelines
   */
  async getDealPipelines(): Promise<HubSpotPipeline[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/crm/v3/pipelines/deals');
      return data.results as HubSpotPipeline[];
    });
  }

  /**
   * Gets a specific deal pipeline
   * @param pipelineId - Pipeline ID
   * @returns Pipeline details
   */
  async getDealPipeline(pipelineId: string): Promise<HubSpotPipeline> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/crm/v3/pipelines/deals/${pipelineId}`);
      return data as HubSpotPipeline;
    });
  }

  /**
   * Gets ticket pipelines
   * @returns Ticket pipelines
   */
  async getTicketPipelines(): Promise<HubSpotPipeline[]> {
    return withRetry(async () => {
      const { data } = await this.http.get('/crm/v3/pipelines/tickets');
      return data.results as HubSpotPipeline[];
    });
  }

  // ==========================================================================
  // Owner Operations
  // ==========================================================================

  /**
   * Gets all owners
   * @param email - Filter by email
   * @returns Owners
   */
  async getOwners(email?: string): Promise<HubSpotOwner[]> {
    return withRetry(async () => {
      const params: Record<string, string> = {};
      if (email) {
        params.email = email;
      }

      const { data } = await this.http.get('/crm/v3/owners', { params });
      return data.results as HubSpotOwner[];
    });
  }

  /**
   * Gets an owner by ID
   * @param ownerId - Owner ID
   * @returns Owner details
   */
  async getOwner(ownerId: string): Promise<HubSpotOwner> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/crm/v3/owners/${ownerId}`);
      return data as HubSpotOwner;
    });
  }

  // ==========================================================================
  // Engagement Operations
  // ==========================================================================

  /**
   * Creates an engagement (activity)
   * @param engagement - Engagement to create
   * @returns Created engagement
   */
  async createEngagement(engagement: Partial<HubSpotEngagement>): Promise<HubSpotEngagement> {
    return withRetry(async () => {
      const { data } = await this.http.post('/engagements/v1/engagements', engagement);
      return data as HubSpotEngagement;
    });
  }

  /**
   * Gets an engagement by ID
   * @param engagementId - Engagement ID
   * @returns Engagement details
   */
  async getEngagement(engagementId: number): Promise<HubSpotEngagement> {
    return withRetry(async () => {
      const { data } = await this.http.get(`/engagements/v1/engagements/${engagementId}`);
      return data as HubSpotEngagement;
    });
  }

  /**
   * Logs a call activity
   * @param options - Call details
   * @returns Created engagement
   */
  async logCall(options: {
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ownerId?: number;
    toNumber?: string;
    fromNumber?: string;
    status?: 'COMPLETED' | 'BUSY' | 'NO_ANSWER' | 'FAILED' | 'CANCELED';
    durationMs?: number;
    body?: string;
    disposition?: string;
  }): Promise<HubSpotEngagement> {
    return this.createEngagement({
      engagement: {
        active: true,
        type: 'CALL',
        timestamp: Date.now(),
        ownerId: options.ownerId,
      } as HubSpotEngagement['engagement'],
      associations: {
        contactIds: options.contactIds,
        companyIds: options.companyIds,
        dealIds: options.dealIds,
      },
      metadata: {
        toNumber: options.toNumber,
        fromNumber: options.fromNumber,
        status: options.status || 'COMPLETED',
        durationMilliseconds: options.durationMs,
        body: options.body,
        disposition: options.disposition,
      },
    });
  }

  /**
   * Logs a note
   * @param options - Note details
   * @returns Created engagement
   */
  async logNote(options: {
    body: string;
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ownerId?: number;
  }): Promise<HubSpotEngagement> {
    return this.createEngagement({
      engagement: {
        active: true,
        type: 'NOTE',
        timestamp: Date.now(),
        ownerId: options.ownerId,
      } as HubSpotEngagement['engagement'],
      associations: {
        contactIds: options.contactIds,
        companyIds: options.companyIds,
        dealIds: options.dealIds,
      },
      metadata: {
        body: options.body,
      },
    });
  }

  /**
   * Creates a task
   * @param options - Task details
   * @returns Created engagement
   */
  async createTask(options: {
    subject: string;
    body?: string;
    status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'DEFERRED' | 'COMPLETED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    contactIds?: number[];
    companyIds?: number[];
    dealIds?: number[];
    ownerId?: number;
  }): Promise<HubSpotEngagement> {
    return this.createEngagement({
      engagement: {
        active: true,
        type: 'TASK',
        timestamp: Date.now(),
        ownerId: options.ownerId,
      } as HubSpotEngagement['engagement'],
      associations: {
        contactIds: options.contactIds,
        companyIds: options.companyIds,
        dealIds: options.dealIds,
      },
      metadata: {
        subject: options.subject,
        body: options.body,
        status: options.status || 'NOT_STARTED',
        priority: options.priority || 'MEDIUM',
      },
    });
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Batch read contacts
   * @param request - Batch read request
   * @returns Batch response
   */
  async batchReadContacts(request: HubSpotBatchReadRequest): Promise<HubSpotBatchResponse<HubSpotContact>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/contacts/batch/read', request);
      return data as HubSpotBatchResponse<HubSpotContact>;
    });
  }

  /**
   * Batch create contacts
   * @param inputs - Contacts to create
   * @returns Batch response
   */
  async batchCreateContacts(inputs: CreateHubSpotObjectInput[]): Promise<HubSpotBatchResponse<HubSpotContact>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/contacts/batch/create', { inputs });
      return data as HubSpotBatchResponse<HubSpotContact>;
    });
  }

  /**
   * Batch update contacts
   * @param inputs - Updates to apply
   * @returns Batch response
   */
  async batchUpdateContacts(inputs: UpdateHubSpotObjectInput[]): Promise<HubSpotBatchResponse<HubSpotContact>> {
    return withRetry(async () => {
      const { data } = await this.http.post('/crm/v3/objects/contacts/batch/update', { inputs });
      return data as HubSpotBatchResponse<HubSpotContact>;
    });
  }

  // ==========================================================================
  // Association Operations
  // ==========================================================================

  /**
   * Creates an association between objects
   * @param fromObjectType - Source object type
   * @param fromObjectId - Source object ID
   * @param toObjectType - Target object type
   * @param toObjectId - Target object ID
   * @param associationType - Association type
   */
  async createAssociation(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
    associationType: string
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.put(
        `/crm/v3/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}/${associationType}`
      );
    });
  }

  /**
   * Removes an association between objects
   * @param fromObjectType - Source object type
   * @param fromObjectId - Source object ID
   * @param toObjectType - Target object type
   * @param toObjectId - Target object ID
   * @param associationType - Association type
   */
  async removeAssociation(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
    associationType: string
  ): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(
        `/crm/v3/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}/${associationType}`
      );
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
      await this.getOwners();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps HubSpot owner to common User type
   * @param owner - HubSpot owner
   * @returns Common User type
   */
  mapToCommonUser(owner: HubSpotOwner): User {
    return {
      id: owner.id,
      username: owner.email,
      displayName: `${owner.firstName} ${owner.lastName}`.trim(),
      email: owner.email,
    };
  }

  /**
   * Maps HubSpot ticket to common Issue type
   * @param ticket - HubSpot ticket
   * @returns Common Issue type
   */
  mapTicketToCommonIssue(ticket: HubSpotTicket): Issue {
    return {
      id: ticket.id,
      key: ticket.id,
      title: ticket.properties.subject || 'Untitled Ticket',
      description: ticket.properties.content || undefined,
      status: ticket.properties.hs_pipeline_stage || 'unknown',
      priority: ticket.properties.hs_ticket_priority || undefined,
      type: 'Ticket',
      createdAt: new Date(ticket.createdAt),
      updatedAt: new Date(ticket.updatedAt),
      url: `https://app.hubspot.com/contacts/${this.config.portalId || ''}/ticket/${ticket.id}`,
      reporter: {
        id: ticket.properties.hubspot_owner_id || 'unknown',
        username: 'unknown',
      },
    };
  }
}
