/**
 * @fileoverview Pipedrive type definitions
 * @module @relay/integrations/pipedrive/types
 */

import type { IntegrationConfig, OAuthToken } from '../common/types';

/**
 * Pipedrive authentication configuration
 */
export interface PipedriveConfig extends IntegrationConfig {
  /** API token or OAuth access token */
  apiToken: string;
  /** Company domain (e.g., 'yourcompany' for yourcompany.pipedrive.com) */
  companyDomain?: string;
}

/**
 * Pipedrive OAuth 2.0 configuration
 */
export interface PipedriveOAuthConfig {
  /** OAuth 2.0 client ID */
  clientId: string;
  /** OAuth 2.0 client secret */
  clientSecret: string;
  /** OAuth 2.0 redirect URI */
  redirectUri: string;
}

/**
 * Pipedrive OAuth token response
 */
export interface PipedriveOAuthToken extends OAuthToken {
  /** API domain for this token */
  apiDomain: string;
  /** Token scope */
  scope: string;
}

/**
 * Pipedrive API response wrapper
 */
export interface PipedriveApiResponse<T> {
  /** Success flag */
  success: boolean;
  /** Response data */
  data: T;
  /** Additional data info */
  additional_data?: {
    pagination?: PipedrivePagination;
  };
  /** Related objects */
  related_objects?: Record<string, Record<string, unknown>>;
}

/**
 * Pipedrive pagination info
 */
export interface PipedrivePagination {
  /** Start index */
  start: number;
  /** Limit */
  limit: number;
  /** More items available */
  more_items_in_collection: boolean;
  /** Next start */
  next_start?: number;
}

/**
 * Pipedrive Person (Contact)
 */
export interface PipedrivePerson {
  /** Person ID */
  id: number;
  /** Company ID (owner) */
  company_id: number;
  /** Owner ID (user) */
  owner_id: number;
  /** Organization ID */
  org_id: number | null;
  /** Person name */
  name: string;
  /** First name */
  first_name: string;
  /** Last name */
  last_name: string;
  /** Open deals count */
  open_deals_count: number;
  /** Related open deals count */
  related_open_deals_count: number;
  /** Closed deals count */
  closed_deals_count: number;
  /** Related closed deals count */
  related_closed_deals_count: number;
  /** Email addresses */
  email: PipedriveField[];
  /** Phone numbers */
  phone: PipedriveField[];
  /** Primary email */
  primary_email?: string;
  /** Update time */
  update_time: string;
  /** Add time */
  add_time: string;
  /** Visible to */
  visible_to: string;
  /** Picture ID */
  picture_id?: {
    value: number;
    item_type: string;
    item_id: number;
    active_flag: boolean;
    add_time: string;
    update_time: string;
    added_by_user_id: number;
    pictures: {
      128: string;
      512: string;
    };
  };
  /** Label IDs */
  label_ids?: number[];
  /** Active flag */
  active_flag: boolean;
  /** Organization */
  org_name?: string;
  /** Owner name */
  owner_name?: string;
  /** CC email */
  cc_email?: string;
  /** Custom fields */
  [key: string]: unknown;
}

/**
 * Pipedrive field with label/value pairs
 */
export interface PipedriveField {
  /** Value */
  value: string;
  /** Is primary */
  primary: boolean;
  /** Label */
  label: string;
}

/**
 * Pipedrive Organization (Company)
 */
export interface PipedriveOrganization {
  /** Organization ID */
  id: number;
  /** Company ID (owner) */
  company_id: number;
  /** Owner ID (user) */
  owner_id: number;
  /** Organization name */
  name: string;
  /** Open deals count */
  open_deals_count: number;
  /** Related open deals count */
  related_open_deals_count: number;
  /** Closed deals count */
  closed_deals_count: number;
  /** Related closed deals count */
  related_closed_deals_count: number;
  /** Email count */
  email_messages_count: number;
  /** People count */
  people_count: number;
  /** Activities count */
  activities_count: number;
  /** Done activities count */
  done_activities_count: number;
  /** Undone activities count */
  undone_activities_count: number;
  /** Files count */
  files_count: number;
  /** Notes count */
  notes_count: number;
  /** Followers count */
  followers_count: number;
  /** Address */
  address?: string;
  /** Address subpremise */
  address_subpremise?: string;
  /** Address street number */
  address_street_number?: string;
  /** Address route */
  address_route?: string;
  /** Address sublocality */
  address_sublocality?: string;
  /** Address locality */
  address_locality?: string;
  /** Address admin area level 1 */
  address_admin_area_level_1?: string;
  /** Address admin area level 2 */
  address_admin_area_level_2?: string;
  /** Address country */
  address_country?: string;
  /** Address postal code */
  address_postal_code?: string;
  /** Address formatted address */
  address_formatted_address?: string;
  /** Update time */
  update_time: string;
  /** Add time */
  add_time: string;
  /** Visible to */
  visible_to: string;
  /** Next activity date */
  next_activity_date?: string;
  /** Next activity time */
  next_activity_time?: string;
  /** Next activity ID */
  next_activity_id?: number;
  /** Last activity ID */
  last_activity_id?: number;
  /** Last activity date */
  last_activity_date?: string;
  /** Label IDs */
  label_ids?: number[];
  /** Active flag */
  active_flag: boolean;
  /** CC email */
  cc_email?: string;
  /** Owner name */
  owner_name?: string;
  /** Custom fields */
  [key: string]: unknown;
}

/**
 * Pipedrive Deal
 */
export interface PipedriveDeal {
  /** Deal ID */
  id: number;
  /** Creator user ID */
  creator_user_id: number;
  /** User ID (owner) */
  user_id: number;
  /** Person ID */
  person_id: number | null;
  /** Organization ID */
  org_id: number | null;
  /** Stage ID */
  stage_id: number;
  /** Deal title */
  title: string;
  /** Deal value */
  value: number;
  /** Currency */
  currency: string;
  /** Add time */
  add_time: string;
  /** Update time */
  update_time: string;
  /** Stage change time */
  stage_change_time: string;
  /** Active flag */
  active: boolean;
  /** Deleted flag */
  deleted: boolean;
  /** Status */
  status: 'open' | 'won' | 'lost' | 'deleted';
  /** Probability */
  probability: number | null;
  /** Next activity date */
  next_activity_date: string | null;
  /** Next activity time */
  next_activity_time: string | null;
  /** Next activity ID */
  next_activity_id: number | null;
  /** Last activity ID */
  last_activity_id: number | null;
  /** Last activity date */
  last_activity_date: string | null;
  /** Lost reason */
  lost_reason: string | null;
  /** Visible to */
  visible_to: string;
  /** Close time */
  close_time: string | null;
  /** Pipeline ID */
  pipeline_id: number;
  /** Won time */
  won_time: string | null;
  /** First won time */
  first_won_time: string | null;
  /** Lost time */
  lost_time: string | null;
  /** Products count */
  products_count: number;
  /** Files count */
  files_count: number;
  /** Notes count */
  notes_count: number;
  /** Followers count */
  followers_count: number;
  /** Email messages count */
  email_messages_count: number;
  /** Activities count */
  activities_count: number;
  /** Done activities count */
  done_activities_count: number;
  /** Undone activities count */
  undone_activities_count: number;
  /** Participants count */
  participants_count: number;
  /** Expected close date */
  expected_close_date: string | null;
  /** Last incoming mail time */
  last_incoming_mail_time: string | null;
  /** Last outgoing mail time */
  last_outgoing_mail_time: string | null;
  /** Label IDs */
  label: number[];
  /** Stage order number */
  stage_order_nr: number;
  /** Person name */
  person_name: string | null;
  /** Organization name */
  org_name: string | null;
  /** Next activity subject */
  next_activity_subject: string | null;
  /** Next activity type */
  next_activity_type: string | null;
  /** Next activity duration */
  next_activity_duration: string | null;
  /** Next activity note */
  next_activity_note: string | null;
  /** Formatted value */
  formatted_value: string;
  /** Weighted value */
  weighted_value: number;
  /** Formatted weighted value */
  formatted_weighted_value: string;
  /** Weighted value currency */
  weighted_value_currency: string;
  /** Rotten time */
  rotten_time: string | null;
  /** Owner name */
  owner_name: string;
  /** CC email */
  cc_email: string;
  /** Origin */
  origin: string;
  /** Origin ID */
  origin_id: string | null;
  /** Custom fields */
  [key: string]: unknown;
}

/**
 * Pipedrive Activity
 */
export interface PipedriveActivity {
  /** Activity ID */
  id: number;
  /** Company ID */
  company_id: number;
  /** User ID (owner) */
  user_id: number;
  /** Done flag */
  done: boolean;
  /** Activity type */
  type: string;
  /** Reference type */
  reference_type: string | null;
  /** Reference ID */
  reference_id: number | null;
  /** Conference meeting client */
  conference_meeting_client: string | null;
  /** Conference meeting URL */
  conference_meeting_url: string | null;
  /** Conference meeting ID */
  conference_meeting_id: string | null;
  /** Due date */
  due_date: string;
  /** Due time */
  due_time: string;
  /** Duration */
  duration: string;
  /** Busy flag */
  busy_flag: boolean;
  /** Add time */
  add_time: string;
  /** Marked as done time */
  marked_as_done_time: string | null;
  /** Last notification time */
  last_notification_time: string | null;
  /** Last notification user ID */
  last_notification_user_id: number | null;
  /** Notification language ID */
  notification_language_id: number | null;
  /** Subject */
  subject: string;
  /** Public description */
  public_description: string | null;
  /** Calendar sync include context */
  calendar_sync_include_context: string | null;
  /** Location */
  location: string | null;
  /** Organization ID */
  org_id: number | null;
  /** Person ID */
  person_id: number | null;
  /** Deal ID */
  deal_id: number | null;
  /** Lead ID */
  lead_id: string | null;
  /** Active flag */
  active_flag: boolean;
  /** Update time */
  update_time: string;
  /** Update user ID */
  update_user_id: number | null;
  /** Google calendar event ID */
  gcal_event_id: string | null;
  /** Google calendar ID */
  google_calendar_id: string | null;
  /** Google calendar etag */
  google_calendar_etag: string | null;
  /** Source timezone */
  source_timezone: string | null;
  /** Rec rule */
  rec_rule: string | null;
  /** Rec rule extension */
  rec_rule_extension: string | null;
  /** Rec master activity ID */
  rec_master_activity_id: number | null;
  /** Series */
  series: unknown[];
  /** Note */
  note: string | null;
  /** Created by user ID */
  created_by_user_id: number;
  /** Location subpremise */
  location_subpremise: string | null;
  /** Location street number */
  location_street_number: string | null;
  /** Location route */
  location_route: string | null;
  /** Location sublocality */
  location_sublocality: string | null;
  /** Location locality */
  location_locality: string | null;
  /** Location admin area level 1 */
  location_admin_area_level_1: string | null;
  /** Location admin area level 2 */
  location_admin_area_level_2: string | null;
  /** Location country */
  location_country: string | null;
  /** Location postal code */
  location_postal_code: string | null;
  /** Location formatted address */
  location_formatted_address: string | null;
  /** Attendees */
  attendees: unknown[] | null;
  /** Participants */
  participants: unknown[] | null;
  /** Organization name */
  org_name: string | null;
  /** Person name */
  person_name: string | null;
  /** Deal title */
  deal_title: string | null;
  /** Owner name */
  owner_name: string;
  /** Person dropbox bcc */
  person_dropbox_bcc: string | null;
  /** Deal dropbox bcc */
  deal_dropbox_bcc: string | null;
  /** Assigned to user ID */
  assigned_to_user_id: number;
  /** File info */
  file: unknown;
}

/**
 * Pipedrive Pipeline
 */
export interface PipedrivePipeline {
  /** Pipeline ID */
  id: number;
  /** Pipeline name */
  name: string;
  /** URL title */
  url_title: string;
  /** Order number */
  order_nr: number;
  /** Active flag */
  active: boolean;
  /** Deal probability */
  deal_probability: boolean;
  /** Add time */
  add_time: string;
  /** Update time */
  update_time: string;
  /** Selected flag */
  selected: boolean;
}

/**
 * Pipedrive Stage
 */
export interface PipedriveStage {
  /** Stage ID */
  id: number;
  /** Order number */
  order_nr: number;
  /** Stage name */
  name: string;
  /** Active flag */
  active_flag: boolean;
  /** Deal probability */
  deal_probability: number;
  /** Pipeline ID */
  pipeline_id: number;
  /** Rotten flag */
  rotten_flag: boolean;
  /** Rotten days */
  rotten_days: number | null;
  /** Add time */
  add_time: string;
  /** Update time */
  update_time: string;
  /** Pipeline name */
  pipeline_name: string;
  /** Pipeline deal probability */
  pipeline_deal_probability: boolean;
}

/**
 * Pipedrive User
 */
export interface PipedriveUser {
  /** User ID */
  id: number;
  /** User name */
  name: string;
  /** Default currency */
  default_currency: string;
  /** Locale */
  locale: string;
  /** Language ID */
  lang: number;
  /** Email */
  email: string;
  /** Phone */
  phone: string | null;
  /** Activated flag */
  activated: boolean;
  /** Last login */
  last_login: string;
  /** Created */
  created: string;
  /** Modified */
  modified: string;
  /** Role ID */
  role_id: number;
  /** Active flag */
  active_flag: boolean;
  /** Timezone name */
  timezone_name: string;
  /** Timezone offset */
  timezone_offset: string;
  /** Icon URL */
  icon_url: string | null;
  /** Is admin flag */
  is_admin: number;
  /** Is you flag */
  is_you: boolean;
  /** Company ID */
  company_id: number;
  /** Company name */
  company_name: string;
  /** Company domain */
  company_domain: string;
  /** Company country */
  company_country: string;
  /** Company industry */
  company_industry: string;
}

/**
 * Pipedrive Note
 */
export interface PipedriveNote {
  /** Note ID */
  id: number;
  /** User ID */
  user_id: number;
  /** Deal ID */
  deal_id: number | null;
  /** Person ID */
  person_id: number | null;
  /** Organization ID */
  org_id: number | null;
  /** Lead ID */
  lead_id: string | null;
  /** Content */
  content: string;
  /** Add time */
  add_time: string;
  /** Update time */
  update_time: string;
  /** Active flag */
  active_flag: boolean;
  /** Pinned to deal flag */
  pinned_to_deal_flag: boolean;
  /** Pinned to person flag */
  pinned_to_person_flag: boolean;
  /** Pinned to organization flag */
  pinned_to_organization_flag: boolean;
  /** Last update user ID */
  last_update_user_id: number | null;
  /** Organization */
  organization: { name: string } | null;
  /** Person */
  person: { name: string } | null;
  /** Deal */
  deal: { title: string } | null;
  /** User */
  user: { email: string; name: string; icon_url: string | null };
}

/**
 * Pipedrive webhook subscription
 */
export interface PipedriveWebhookSubscription {
  /** Subscription ID */
  id: number;
  /** Company ID */
  company_id: number;
  /** User ID */
  user_id: number;
  /** Event action */
  event_action: PipedriveWebhookAction;
  /** Event object */
  event_object: PipedriveWebhookObject;
  /** Subscription URL */
  subscription_url: string;
  /** Active flag */
  is_active: number;
  /** Add time */
  add_time: string;
  /** Remove time */
  remove_time: string | null;
  /** Type */
  type: string;
  /** HTTP auth user */
  http_auth_user: string | null;
  /** HTTP auth password */
  http_auth_password: string | null;
}

/**
 * Pipedrive webhook actions
 */
export type PipedriveWebhookAction = 'added' | 'updated' | 'deleted' | 'merged' | '*';

/**
 * Pipedrive webhook objects
 */
export type PipedriveWebhookObject =
  | 'activity'
  | 'activityType'
  | 'deal'
  | 'note'
  | 'organization'
  | 'person'
  | 'pipeline'
  | 'product'
  | 'stage'
  | 'user'
  | '*';

/**
 * Pipedrive webhook payload
 */
export interface PipedriveWebhookPayload<T = unknown> {
  /** Version */
  v: number;
  /** Matches filters */
  matches_filters: {
    current: unknown[];
    previous?: unknown[];
  };
  /** Meta */
  meta: {
    v: number;
    action: PipedriveWebhookAction;
    object: PipedriveWebhookObject;
    id: number;
    company_id: number;
    user_id: number;
    host: string;
    timestamp: number;
    timestamp_micro: number;
    permitted_user_ids: number[];
    trans_pending: boolean;
    is_bulk_update: boolean;
    pipedrive_service_name: string | null;
    matches_filters: {
      current: unknown[];
      previous?: unknown[];
    };
    webhook_id: string;
  };
  /** Current object state */
  current: T;
  /** Previous object state (for updates) */
  previous?: T;
  /** Event */
  event: string;
  /** Retry count */
  retry: number;
}

/**
 * Input for creating a Pipedrive person
 */
export interface CreatePipedrivePersonInput {
  /** Name (required) */
  name: string;
  /** Owner ID */
  owner_id?: number;
  /** Organization ID */
  org_id?: number;
  /** Email addresses */
  email?: string | PipedriveField[];
  /** Phone numbers */
  phone?: string | PipedriveField[];
  /** Visible to */
  visible_to?: '1' | '3' | '5' | '7';
  /** Marketing status */
  marketing_status?: 'no_consent' | 'unsubscribed' | 'subscribed' | 'archived';
  /** Add time */
  add_time?: string;
}

/**
 * Input for creating a Pipedrive deal
 */
export interface CreatePipedriveDealInput {
  /** Title (required) */
  title: string;
  /** Value */
  value?: number;
  /** Currency */
  currency?: string;
  /** User ID (owner) */
  user_id?: number;
  /** Person ID */
  person_id?: number;
  /** Organization ID */
  org_id?: number;
  /** Pipeline ID */
  pipeline_id?: number;
  /** Stage ID */
  stage_id?: number;
  /** Status */
  status?: 'open' | 'won' | 'lost';
  /** Expected close date */
  expected_close_date?: string;
  /** Probability */
  probability?: number;
  /** Lost reason */
  lost_reason?: string;
  /** Visible to */
  visible_to?: '1' | '3' | '5' | '7';
  /** Add time */
  add_time?: string;
}

/**
 * Input for creating a Pipedrive organization
 */
export interface CreatePipedriveOrganizationInput {
  /** Name (required) */
  name: string;
  /** Owner ID */
  owner_id?: number;
  /** Address */
  address?: string;
  /** Visible to */
  visible_to?: '1' | '3' | '5' | '7';
  /** Add time */
  add_time?: string;
}

/**
 * Input for creating a Pipedrive activity
 */
export interface CreatePipedriveActivityInput {
  /** Subject (required) */
  subject: string;
  /** Type */
  type?: string;
  /** Due date */
  due_date?: string;
  /** Due time */
  due_time?: string;
  /** Duration */
  duration?: string;
  /** User ID (owner) */
  user_id?: number;
  /** Deal ID */
  deal_id?: number;
  /** Person ID */
  person_id?: number;
  /** Organization ID */
  org_id?: number;
  /** Note */
  note?: string;
  /** Location */
  location?: string;
  /** Public description */
  public_description?: string;
  /** Done flag */
  done?: 0 | 1;
  /** Busy flag */
  busy_flag?: boolean;
}
