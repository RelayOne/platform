/**
 * @fileoverview Notion API types and Zod schemas.
 * Based on Notion API v2022-06-28.
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Notion rich text schema.
 */
export const NotionRichTextSchema = z.object({
  type: z.enum(['text', 'mention', 'equation']),
  text: z.object({
    content: z.string(),
    link: z.object({ url: z.string() }).nullable().optional(),
  }).optional(),
  mention: z.object({
    type: z.enum(['user', 'page', 'database', 'date', 'link_preview', 'template_mention']),
    user: z.object({ id: z.string() }).optional(),
    page: z.object({ id: z.string() }).optional(),
    database: z.object({ id: z.string() }).optional(),
    date: z.object({
      start: z.string(),
      end: z.string().nullable(),
      time_zone: z.string().nullable(),
    }).optional(),
  }).optional(),
  equation: z.object({
    expression: z.string(),
  }).optional(),
  annotations: z.object({
    bold: z.boolean(),
    italic: z.boolean(),
    strikethrough: z.boolean(),
    underline: z.boolean(),
    code: z.boolean(),
    color: z.string(),
  }),
  plain_text: z.string(),
  href: z.string().nullable(),
});

export type NotionRichText = z.infer<typeof NotionRichTextSchema>;

/**
 * Notion user schema.
 */
export const NotionUserSchema = z.object({
  object: z.literal('user'),
  id: z.string(),
  type: z.enum(['person', 'bot']).optional(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  person: z.object({
    email: z.string(),
  }).optional(),
  bot: z.object({
    owner: z.object({
      type: z.enum(['user', 'workspace']),
      user: z.object({ id: z.string() }).optional(),
      workspace: z.boolean().optional(),
    }),
  }).optional(),
});

export type NotionUser = z.infer<typeof NotionUserSchema>;

/**
 * Notion parent schema.
 */
export const NotionParentSchema = z.object({
  type: z.enum(['database_id', 'page_id', 'workspace', 'block_id']),
  database_id: z.string().optional(),
  page_id: z.string().optional(),
  workspace: z.boolean().optional(),
  block_id: z.string().optional(),
});

export type NotionParent = z.infer<typeof NotionParentSchema>;

/**
 * Notion property value schema.
 */
export const NotionPropertyValueSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.array(NotionRichTextSchema).optional(),
  rich_text: z.array(NotionRichTextSchema).optional(),
  number: z.number().nullable().optional(),
  select: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  }).nullable().optional(),
  multi_select: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  })).optional(),
  status: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  }).nullable().optional(),
  date: z.object({
    start: z.string(),
    end: z.string().nullable(),
    time_zone: z.string().nullable(),
  }).nullable().optional(),
  people: z.array(NotionUserSchema).optional(),
  files: z.array(z.object({
    name: z.string(),
    type: z.enum(['file', 'external']),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional(),
    external: z.object({ url: z.string() }).optional(),
  })).optional(),
  checkbox: z.boolean().optional(),
  url: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  formula: z.object({
    type: z.enum(['string', 'number', 'boolean', 'date']),
    string: z.string().nullable().optional(),
    number: z.number().nullable().optional(),
    boolean: z.boolean().optional(),
    date: z.object({
      start: z.string(),
      end: z.string().nullable(),
    }).nullable().optional(),
  }).optional(),
  relation: z.array(z.object({
    id: z.string(),
  })).optional(),
  rollup: z.object({
    type: z.enum(['number', 'date', 'array', 'incomplete', 'unsupported']),
    number: z.number().nullable().optional(),
    date: z.object({
      start: z.string(),
      end: z.string().nullable(),
    }).nullable().optional(),
    array: z.array(z.unknown()).optional(),
  }).optional(),
  created_time: z.string().optional(),
  created_by: NotionUserSchema.optional(),
  last_edited_time: z.string().optional(),
  last_edited_by: NotionUserSchema.optional(),
});

export type NotionPropertyValue = z.infer<typeof NotionPropertyValueSchema>;

/**
 * Notion database schema.
 */
export const NotionDatabaseSchema = z.object({
  object: z.literal('database'),
  id: z.string(),
  created_time: z.string(),
  created_by: NotionUserSchema,
  last_edited_time: z.string(),
  last_edited_by: NotionUserSchema,
  title: z.array(NotionRichTextSchema),
  description: z.array(NotionRichTextSchema),
  icon: z.object({
    type: z.enum(['emoji', 'external', 'file']),
    emoji: z.string().optional(),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional(),
  }).nullable(),
  cover: z.object({
    type: z.enum(['external', 'file']),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional(),
  }).nullable(),
  properties: z.record(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    title: z.object({}).optional(),
    rich_text: z.object({}).optional(),
    number: z.object({
      format: z.string(),
    }).optional(),
    select: z.object({
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      })),
    }).optional(),
    multi_select: z.object({
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      })),
    }).optional(),
    status: z.object({
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
      })),
      groups: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        option_ids: z.array(z.string()),
      })),
    }).optional(),
    date: z.object({}).optional(),
    people: z.object({}).optional(),
    files: z.object({}).optional(),
    checkbox: z.object({}).optional(),
    url: z.object({}).optional(),
    email: z.object({}).optional(),
    phone_number: z.object({}).optional(),
    formula: z.object({
      expression: z.string(),
    }).optional(),
    relation: z.object({
      database_id: z.string(),
      type: z.enum(['single_property', 'dual_property']).optional(),
      single_property: z.object({}).optional(),
      dual_property: z.object({
        synced_property_id: z.string(),
        synced_property_name: z.string(),
      }).optional(),
    }).optional(),
    rollup: z.object({
      function: z.string(),
      relation_property_id: z.string(),
      relation_property_name: z.string(),
      rollup_property_id: z.string(),
      rollup_property_name: z.string(),
    }).optional(),
    created_time: z.object({}).optional(),
    created_by: z.object({}).optional(),
    last_edited_time: z.object({}).optional(),
    last_edited_by: z.object({}).optional(),
  })),
  parent: NotionParentSchema,
  url: z.string(),
  public_url: z.string().nullable(),
  archived: z.boolean(),
  is_inline: z.boolean(),
});

export type NotionDatabase = z.infer<typeof NotionDatabaseSchema>;

/**
 * Notion page schema.
 */
export const NotionPageSchema = z.object({
  object: z.literal('page'),
  id: z.string(),
  created_time: z.string(),
  created_by: NotionUserSchema,
  last_edited_time: z.string(),
  last_edited_by: NotionUserSchema,
  archived: z.boolean(),
  icon: z.object({
    type: z.enum(['emoji', 'external', 'file']),
    emoji: z.string().optional(),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional(),
  }).nullable(),
  cover: z.object({
    type: z.enum(['external', 'file']),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional(),
  }).nullable(),
  properties: z.record(NotionPropertyValueSchema),
  parent: NotionParentSchema,
  url: z.string(),
  public_url: z.string().nullable(),
});

export type NotionPage = z.infer<typeof NotionPageSchema>;

/**
 * Notion block schema.
 */
export const NotionBlockSchema = z.object({
  object: z.literal('block'),
  id: z.string(),
  parent: NotionParentSchema,
  created_time: z.string(),
  created_by: NotionUserSchema,
  last_edited_time: z.string(),
  last_edited_by: NotionUserSchema,
  has_children: z.boolean(),
  archived: z.boolean(),
  type: z.string(),
  // Block type-specific content is dynamic
});

export type NotionBlock = z.infer<typeof NotionBlockSchema>;

/**
 * Notion comment schema.
 */
export const NotionCommentSchema = z.object({
  object: z.literal('comment'),
  id: z.string(),
  parent: z.object({
    type: z.enum(['page_id', 'block_id']),
    page_id: z.string().optional(),
    block_id: z.string().optional(),
  }),
  discussion_id: z.string(),
  created_time: z.string(),
  created_by: NotionUserSchema,
  rich_text: z.array(NotionRichTextSchema),
});

export type NotionComment = z.infer<typeof NotionCommentSchema>;

/**
 * Notion search result schema.
 */
export const NotionSearchResultSchema = z.object({
  object: z.literal('list'),
  results: z.array(z.union([NotionPageSchema, NotionDatabaseSchema])),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  type: z.enum(['page_or_database']),
  page_or_database: z.object({}),
});

export type NotionSearchResult = z.infer<typeof NotionSearchResultSchema>;

/**
 * Notion query database filter.
 */
export interface NotionDatabaseFilter {
  and?: NotionDatabaseFilter[];
  or?: NotionDatabaseFilter[];
  property?: string;
  title?: {
    equals?: string;
    does_not_equal?: string;
    contains?: string;
    does_not_contain?: string;
    starts_with?: string;
    ends_with?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  rich_text?: {
    equals?: string;
    does_not_equal?: string;
    contains?: string;
    does_not_contain?: string;
    starts_with?: string;
    ends_with?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  number?: {
    equals?: number;
    does_not_equal?: number;
    greater_than?: number;
    less_than?: number;
    greater_than_or_equal_to?: number;
    less_than_or_equal_to?: number;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  checkbox?: {
    equals?: boolean;
    does_not_equal?: boolean;
  };
  select?: {
    equals?: string;
    does_not_equal?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  multi_select?: {
    contains?: string;
    does_not_contain?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  status?: {
    equals?: string;
    does_not_equal?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  date?: {
    equals?: string;
    before?: string;
    after?: string;
    on_or_before?: string;
    on_or_after?: string;
    past_week?: {};
    past_month?: {};
    past_year?: {};
    this_week?: {};
    next_week?: {};
    next_month?: {};
    next_year?: {};
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  people?: {
    contains?: string;
    does_not_contain?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  relation?: {
    contains?: string;
    does_not_contain?: string;
    is_empty?: boolean;
    is_not_empty?: boolean;
  };
  formula?: {
    string?: NotionDatabaseFilter['rich_text'];
    number?: NotionDatabaseFilter['number'];
    checkbox?: NotionDatabaseFilter['checkbox'];
    date?: NotionDatabaseFilter['date'];
  };
  rollup?: {
    any?: NotionDatabaseFilter;
    every?: NotionDatabaseFilter;
    none?: NotionDatabaseFilter;
    number?: NotionDatabaseFilter['number'];
    date?: NotionDatabaseFilter['date'];
  };
}

/**
 * Notion query database sort.
 */
export interface NotionDatabaseSort {
  property?: string;
  timestamp?: 'created_time' | 'last_edited_time';
  direction: 'ascending' | 'descending';
}

/**
 * OAuth 2.0 configuration for Notion.
 */
export interface NotionOAuth2Config {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth redirect URI */
  redirectUri: string;
}

/**
 * Notion OAuth tokens.
 */
export interface NotionOAuthTokens {
  /** Access token */
  accessToken: string;
  /** Token type (always 'bearer') */
  tokenType: string;
  /** Bot ID */
  botId: string;
  /** Workspace info */
  workspace: {
    id: string;
    name: string;
    icon: string | null;
  };
  /** Owner info */
  owner: {
    type: 'user' | 'workspace';
    user?: {
      id: string;
      name: string | null;
      avatar_url: string | null;
      type: string;
      person?: {
        email: string;
      };
    };
  };
  /** Duplicated template IDs */
  duplicatedTemplateId: string | null;
}

/**
 * Input for creating a page in a database.
 */
export interface CreateNotionPageInput {
  /** Page properties */
  properties: Record<string, unknown>;
  /** Page content (children blocks) */
  children?: unknown[];
  /** Icon */
  icon?: {
    type: 'emoji' | 'external';
    emoji?: string;
    external?: { url: string };
  };
  /** Cover */
  cover?: {
    type: 'external';
    external: { url: string };
  };
}

/**
 * Input for updating a page.
 */
export interface UpdateNotionPageInput {
  /** Properties to update */
  properties?: Record<string, unknown>;
  /** Icon to update */
  icon?: {
    type: 'emoji' | 'external';
    emoji?: string;
    external?: { url: string };
  } | null;
  /** Cover to update */
  cover?: {
    type: 'external';
    external: { url: string };
  } | null;
  /** Archive the page */
  archived?: boolean;
}

/**
 * Notion API configuration.
 */
export interface NotionApiConfig {
  /** Access token */
  accessToken: string;
  /** API version */
  notionVersion?: string;
}

/**
 * Notion list response.
 */
export interface NotionListResponse<T> {
  /** Items in the response */
  results: T[];
  /** Next cursor for pagination */
  nextCursor: string | null;
  /** Whether there are more results */
  hasMore: boolean;
}
