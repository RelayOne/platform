/**
 * @fileoverview Pipedrive API client
 * @module @relay/integrations/pipedrive/client
 */

import axios, { AxiosInstance } from 'axios';
import type {
  PipedriveConfig,
  PipedriveApiResponse,
  PipedrivePerson,
  PipedriveOrganization,
  PipedriveDeal,
  PipedriveActivity,
  PipedrivePipeline,
  PipedriveStage,
  PipedriveUser,
  PipedriveNote,
  CreatePipedrivePersonInput,
  CreatePipedriveDealInput,
  CreatePipedriveOrganizationInput,
  CreatePipedriveActivityInput,
} from './types';
import { createHttpClient, withRetry, bearerAuthHeaders } from '../common/http';
import { ConfigurationError, IntegrationError, IntegrationErrorCode } from '../common/errors';
import type { IntegrationSource, User, Issue } from '../common/types';

/**
 * Pipedrive integration source identifier
 */
const SOURCE: IntegrationSource = 'pipedrive';

/**
 * Pipedrive API base URL
 */
const PIPEDRIVE_API_URL = 'https://api.pipedrive.com/v1';

/**
 * Pipedrive API client
 * Provides methods for persons, organizations, deals, activities, and pipelines
 */
export class PipedriveClient {
  private http: AxiosInstance;
  private config: PipedriveConfig;

  /**
   * Creates a new Pipedrive client
   * @param config - Pipedrive configuration
   */
  constructor(config: PipedriveConfig) {
    this.validateConfig(config);
    this.config = config;

    // Use company domain if provided, otherwise use default API
    const baseUrl = config.companyDomain
      ? `https://${config.companyDomain}.pipedrive.com/api/v1`
      : PIPEDRIVE_API_URL;

    this.http = createHttpClient(SOURCE, {
      baseUrl,
      timeout: config.timeout || 30000,
    });

    // Add API token to all requests
    this.http.interceptors.request.use((request) => {
      // Pipedrive accepts token as query param or header
      request.params = {
        ...request.params,
        api_token: config.apiToken,
      };
      return request;
    });

    // Add error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.data) {
          const data = error.response.data as { error?: string; error_info?: string; success: boolean };
          throw new IntegrationError(
            data.error || data.error_info || 'Pipedrive API error',
            this.mapHttpStatus(error.response.status),
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
  private validateConfig(config: PipedriveConfig): void {
    if (!config.apiToken) {
      throw new ConfigurationError(SOURCE, 'Pipedrive API token is required');
    }
  }

  /**
   * Maps HTTP status to error code
   * @param status - HTTP status code
   * @returns Integration error code
   */
  private mapHttpStatus(status: number): IntegrationErrorCode {
    const statusMap: Record<number, IntegrationErrorCode> = {
      401: IntegrationErrorCode.AUTH_FAILED,
      403: IntegrationErrorCode.FORBIDDEN,
      404: IntegrationErrorCode.NOT_FOUND,
      429: IntegrationErrorCode.RATE_LIMITED,
      400: IntegrationErrorCode.INVALID_REQUEST,
    };
    return statusMap[status] || IntegrationErrorCode.PROVIDER_ERROR;
  }

  // ==========================================================================
  // Person Operations
  // ==========================================================================

  /**
   * Gets a person by ID
   * @param personId - Person ID
   * @returns Person record
   */
  async getPerson(personId: number): Promise<PipedrivePerson> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedrivePerson>>(`/persons/${personId}`);
      return data.data;
    });
  }

  /**
   * Creates a new person
   * @param input - Person creation input
   * @returns Created person
   */
  async createPerson(input: CreatePipedrivePersonInput): Promise<PipedrivePerson> {
    return withRetry(async () => {
      const { data } = await this.http.post<PipedriveApiResponse<PipedrivePerson>>('/persons', input);
      return data.data;
    });
  }

  /**
   * Updates a person
   * @param personId - Person ID
   * @param updates - Fields to update
   * @returns Updated person
   */
  async updatePerson(personId: number, updates: Partial<CreatePipedrivePersonInput>): Promise<PipedrivePerson> {
    return withRetry(async () => {
      const { data } = await this.http.put<PipedriveApiResponse<PipedrivePerson>>(`/persons/${personId}`, updates);
      return data.data;
    });
  }

  /**
   * Deletes a person
   * @param personId - Person ID
   */
  async deletePerson(personId: number): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/persons/${personId}`);
    });
  }

  /**
   * Lists persons with pagination
   * @param options - List options
   * @returns Persons
   */
  async listPersons(options?: {
    start?: number;
    limit?: number;
    sort?: string;
    filter_id?: number;
  }): Promise<{ persons: PipedrivePerson[]; hasMore: boolean; nextStart?: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedrivePerson[]>>('/persons', {
        params: {
          start: options?.start || 0,
          limit: options?.limit || 100,
          sort: options?.sort,
          filter_id: options?.filter_id,
        },
      });

      return {
        persons: data.data || [],
        hasMore: data.additional_data?.pagination?.more_items_in_collection || false,
        nextStart: data.additional_data?.pagination?.next_start,
      };
    });
  }

  /**
   * Searches persons
   * @param term - Search term
   * @param options - Search options
   * @returns Matching persons
   */
  async searchPersons(
    term: string,
    options?: { fields?: string; limit?: number; start?: number }
  ): Promise<PipedrivePerson[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<{ items: { item: PipedrivePerson }[] }>>('/persons/search', {
        params: {
          term,
          fields: options?.fields || 'name,email,phone',
          limit: options?.limit || 100,
          start: options?.start || 0,
        },
      });

      return (data.data?.items || []).map((r) => r.item);
    });
  }

  // ==========================================================================
  // Organization Operations
  // ==========================================================================

  /**
   * Gets an organization by ID
   * @param orgId - Organization ID
   * @returns Organization record
   */
  async getOrganization(orgId: number): Promise<PipedriveOrganization> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveOrganization>>(`/organizations/${orgId}`);
      return data.data;
    });
  }

  /**
   * Creates a new organization
   * @param input - Organization creation input
   * @returns Created organization
   */
  async createOrganization(input: CreatePipedriveOrganizationInput): Promise<PipedriveOrganization> {
    return withRetry(async () => {
      const { data } = await this.http.post<PipedriveApiResponse<PipedriveOrganization>>('/organizations', input);
      return data.data;
    });
  }

  /**
   * Updates an organization
   * @param orgId - Organization ID
   * @param updates - Fields to update
   * @returns Updated organization
   */
  async updateOrganization(orgId: number, updates: Partial<CreatePipedriveOrganizationInput>): Promise<PipedriveOrganization> {
    return withRetry(async () => {
      const { data } = await this.http.put<PipedriveApiResponse<PipedriveOrganization>>(`/organizations/${orgId}`, updates);
      return data.data;
    });
  }

  /**
   * Lists organizations with pagination
   * @param options - List options
   * @returns Organizations
   */
  async listOrganizations(options?: {
    start?: number;
    limit?: number;
    sort?: string;
    filter_id?: number;
  }): Promise<{ organizations: PipedriveOrganization[]; hasMore: boolean; nextStart?: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveOrganization[]>>('/organizations', {
        params: {
          start: options?.start || 0,
          limit: options?.limit || 100,
          sort: options?.sort,
          filter_id: options?.filter_id,
        },
      });

      return {
        organizations: data.data || [],
        hasMore: data.additional_data?.pagination?.more_items_in_collection || false,
        nextStart: data.additional_data?.pagination?.next_start,
      };
    });
  }

  // ==========================================================================
  // Deal Operations
  // ==========================================================================

  /**
   * Gets a deal by ID
   * @param dealId - Deal ID
   * @returns Deal record
   */
  async getDeal(dealId: number): Promise<PipedriveDeal> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveDeal>>(`/deals/${dealId}`);
      return data.data;
    });
  }

  /**
   * Creates a new deal
   * @param input - Deal creation input
   * @returns Created deal
   */
  async createDeal(input: CreatePipedriveDealInput): Promise<PipedriveDeal> {
    return withRetry(async () => {
      const { data } = await this.http.post<PipedriveApiResponse<PipedriveDeal>>('/deals', input);
      return data.data;
    });
  }

  /**
   * Updates a deal
   * @param dealId - Deal ID
   * @param updates - Fields to update
   * @returns Updated deal
   */
  async updateDeal(dealId: number, updates: Partial<CreatePipedriveDealInput>): Promise<PipedriveDeal> {
    return withRetry(async () => {
      const { data } = await this.http.put<PipedriveApiResponse<PipedriveDeal>>(`/deals/${dealId}`, updates);
      return data.data;
    });
  }

  /**
   * Deletes a deal
   * @param dealId - Deal ID
   */
  async deleteDeal(dealId: number): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/deals/${dealId}`);
    });
  }

  /**
   * Lists deals with pagination
   * @param options - List options
   * @returns Deals
   */
  async listDeals(options?: {
    start?: number;
    limit?: number;
    sort?: string;
    filter_id?: number;
    status?: 'open' | 'won' | 'lost' | 'deleted' | 'all_not_deleted';
    stage_id?: number;
    user_id?: number;
  }): Promise<{ deals: PipedriveDeal[]; hasMore: boolean; nextStart?: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveDeal[]>>('/deals', {
        params: {
          start: options?.start || 0,
          limit: options?.limit || 100,
          sort: options?.sort,
          filter_id: options?.filter_id,
          status: options?.status,
          stage_id: options?.stage_id,
          user_id: options?.user_id,
        },
      });

      return {
        deals: data.data || [],
        hasMore: data.additional_data?.pagination?.more_items_in_collection || false,
        nextStart: data.additional_data?.pagination?.next_start,
      };
    });
  }

  /**
   * Searches deals
   * @param term - Search term
   * @param options - Search options
   * @returns Matching deals
   */
  async searchDeals(
    term: string,
    options?: { fields?: string; limit?: number; start?: number; status?: string }
  ): Promise<PipedriveDeal[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<{ items: { item: PipedriveDeal }[] }>>('/deals/search', {
        params: {
          term,
          fields: options?.fields || 'title',
          limit: options?.limit || 100,
          start: options?.start || 0,
          status: options?.status,
        },
      });

      return (data.data?.items || []).map((r) => r.item);
    });
  }

  // ==========================================================================
  // Activity Operations
  // ==========================================================================

  /**
   * Gets an activity by ID
   * @param activityId - Activity ID
   * @returns Activity record
   */
  async getActivity(activityId: number): Promise<PipedriveActivity> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveActivity>>(`/activities/${activityId}`);
      return data.data;
    });
  }

  /**
   * Creates a new activity
   * @param input - Activity creation input
   * @returns Created activity
   */
  async createActivity(input: CreatePipedriveActivityInput): Promise<PipedriveActivity> {
    return withRetry(async () => {
      const { data } = await this.http.post<PipedriveApiResponse<PipedriveActivity>>('/activities', input);
      return data.data;
    });
  }

  /**
   * Updates an activity
   * @param activityId - Activity ID
   * @param updates - Fields to update
   * @returns Updated activity
   */
  async updateActivity(activityId: number, updates: Partial<CreatePipedriveActivityInput>): Promise<PipedriveActivity> {
    return withRetry(async () => {
      const { data } = await this.http.put<PipedriveApiResponse<PipedriveActivity>>(`/activities/${activityId}`, updates);
      return data.data;
    });
  }

  /**
   * Marks an activity as done
   * @param activityId - Activity ID
   * @returns Updated activity
   */
  async markActivityDone(activityId: number): Promise<PipedriveActivity> {
    return this.updateActivity(activityId, { done: 1 });
  }

  /**
   * Lists activities with pagination
   * @param options - List options
   * @returns Activities
   */
  async listActivities(options?: {
    start?: number;
    limit?: number;
    type?: string;
    done?: 0 | 1;
    user_id?: number;
    filter_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<{ activities: PipedriveActivity[]; hasMore: boolean; nextStart?: number }> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveActivity[]>>('/activities', {
        params: {
          start: options?.start || 0,
          limit: options?.limit || 100,
          type: options?.type,
          done: options?.done,
          user_id: options?.user_id,
          filter_id: options?.filter_id,
          start_date: options?.start_date,
          end_date: options?.end_date,
        },
      });

      return {
        activities: data.data || [],
        hasMore: data.additional_data?.pagination?.more_items_in_collection || false,
        nextStart: data.additional_data?.pagination?.next_start,
      };
    });
  }

  // ==========================================================================
  // Pipeline and Stage Operations
  // ==========================================================================

  /**
   * Gets all pipelines
   * @returns Pipelines
   */
  async getPipelines(): Promise<PipedrivePipeline[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedrivePipeline[]>>('/pipelines');
      return data.data || [];
    });
  }

  /**
   * Gets a pipeline by ID
   * @param pipelineId - Pipeline ID
   * @returns Pipeline
   */
  async getPipeline(pipelineId: number): Promise<PipedrivePipeline> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedrivePipeline>>(`/pipelines/${pipelineId}`);
      return data.data;
    });
  }

  /**
   * Gets stages for a pipeline
   * @param pipelineId - Pipeline ID
   * @returns Stages
   */
  async getStages(pipelineId?: number): Promise<PipedriveStage[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveStage[]>>('/stages', {
        params: pipelineId ? { pipeline_id: pipelineId } : undefined,
      });
      return data.data || [];
    });
  }

  /**
   * Gets a stage by ID
   * @param stageId - Stage ID
   * @returns Stage
   */
  async getStage(stageId: number): Promise<PipedriveStage> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveStage>>(`/stages/${stageId}`);
      return data.data;
    });
  }

  // ==========================================================================
  // User Operations
  // ==========================================================================

  /**
   * Gets the current user
   * @returns Current user
   */
  async getCurrentUser(): Promise<PipedriveUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveUser>>('/users/me');
      return data.data;
    });
  }

  /**
   * Gets a user by ID
   * @param userId - User ID
   * @returns User
   */
  async getUser(userId: number): Promise<PipedriveUser> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveUser>>(`/users/${userId}`);
      return data.data;
    });
  }

  /**
   * Lists all users
   * @returns Users
   */
  async listUsers(): Promise<PipedriveUser[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveUser[]>>('/users');
      return data.data || [];
    });
  }

  // ==========================================================================
  // Note Operations
  // ==========================================================================

  /**
   * Creates a note
   * @param content - Note content (HTML supported)
   * @param options - Note options
   * @returns Created note
   */
  async createNote(
    content: string,
    options?: { deal_id?: number; person_id?: number; org_id?: number; pinned_to_deal_flag?: boolean }
  ): Promise<PipedriveNote> {
    return withRetry(async () => {
      const { data } = await this.http.post<PipedriveApiResponse<PipedriveNote>>('/notes', {
        content,
        ...options,
      });
      return data.data;
    });
  }

  /**
   * Gets a note by ID
   * @param noteId - Note ID
   * @returns Note
   */
  async getNote(noteId: number): Promise<PipedriveNote> {
    return withRetry(async () => {
      const { data } = await this.http.get<PipedriveApiResponse<PipedriveNote>>(`/notes/${noteId}`);
      return data.data;
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
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Maps Pipedrive user to common User type
   * @param user - Pipedrive user
   * @returns Common User type
   */
  mapToCommonUser(user: PipedriveUser): User {
    return {
      id: String(user.id),
      username: user.email,
      displayName: user.name,
      email: user.email,
      avatarUrl: user.icon_url || undefined,
    };
  }

  /**
   * Maps Pipedrive activity to common Issue type
   * @param activity - Pipedrive activity
   * @returns Common Issue type
   */
  mapActivityToCommonIssue(activity: PipedriveActivity): Issue {
    return {
      id: String(activity.id),
      key: String(activity.id),
      title: activity.subject,
      description: activity.note || undefined,
      status: activity.done ? 'done' : 'open',
      type: activity.type,
      createdAt: new Date(activity.add_time),
      updatedAt: new Date(activity.update_time),
      url: `https://app.pipedrive.com/activities/${activity.id}`,
      reporter: {
        id: String(activity.user_id),
        username: activity.owner_name,
      },
    };
  }
}
