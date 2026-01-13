import { z } from 'zod';
import type {
  MongoClient,
  Db,
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
  UpdateOptions,
  DeleteOptions,
  InsertOneOptions,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  WithId,
  OptionalUnlessRequiredId,
  BulkWriteOptions,
  AggregateOptions,
  CountDocumentsOptions,
  DistinctOptions,
  IndexSpecification,
  CreateIndexesOptions,
  ClientSession,
  TransactionOptions,
} from 'mongodb';

/**
 * MongoDB connection configuration
 */
export interface MongoConfig {
  /** MongoDB connection URI */
  uri: string;
  /** Database name */
  database: string;
  /** Minimum pool size */
  minPoolSize?: number;
  /** Maximum pool size */
  maxPoolSize?: number;
  /** Connection timeout in milliseconds */
  connectTimeoutMS?: number;
  /** Socket timeout in milliseconds */
  socketTimeoutMS?: number;
  /** Server selection timeout in milliseconds */
  serverSelectionTimeoutMS?: number;
  /** Enable retryable writes */
  retryWrites?: boolean;
  /** Write concern level */
  writeConcern?: 'majority' | 'acknowledged' | number;
  /** Read preference */
  readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  /** Application name for monitoring */
  appName?: string;
  /** Enable TLS */
  tls?: boolean;
  /** TLS certificate authority file path */
  tlsCAFile?: string;
  /** Require valid server certificate */
  tlsAllowInvalidCertificates?: boolean;
}

/**
 * Zod schema for MongoDB configuration validation
 */
export const MongoConfigSchema = z.object({
  uri: z.string().min(1),
  database: z.string().min(1),
  minPoolSize: z.number().int().min(0).optional(),
  maxPoolSize: z.number().int().min(1).optional(),
  connectTimeoutMS: z.number().int().min(1000).optional(),
  socketTimeoutMS: z.number().int().min(1000).optional(),
  serverSelectionTimeoutMS: z.number().int().min(1000).optional(),
  retryWrites: z.boolean().optional(),
  writeConcern: z.union([z.literal('majority'), z.literal('acknowledged'), z.number()]).optional(),
  readPreference: z.enum(['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest']).optional(),
  appName: z.string().optional(),
  tls: z.boolean().optional(),
  tlsCAFile: z.string().optional(),
  tlsAllowInvalidCertificates: z.boolean().optional(),
});

/**
 * Health check result for MongoDB connection
 */
export interface MongoHealthCheck {
  /** Whether the connection is healthy */
  healthy: boolean;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Error message if unhealthy */
  error?: string;
  /** Server information */
  serverInfo?: {
    version: string;
    host: string;
    port: number;
  };
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result response
 */
export interface PaginatedResult<T> {
  /** Items for the current page */
  items: T[];
  /** Total number of items matching the query */
  total: number;
  /** Current page number */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

/**
 * Zod schema for pagination options validation
 */
export const PaginationOptionsSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Soft delete metadata
 */
export interface SoftDeleteFields {
  /** Whether the document is deleted */
  isDeleted: boolean;
  /** Timestamp when the document was deleted */
  deletedAt?: Date;
  /** User ID who deleted the document */
  deletedBy?: string;
}

/**
 * Audit timestamp fields
 */
export interface AuditFields {
  /** Timestamp when the document was created */
  createdAt: Date;
  /** Timestamp when the document was last updated */
  updatedAt: Date;
  /** User ID who created the document */
  createdBy?: string;
  /** User ID who last updated the document */
  updatedBy?: string;
}

/**
 * Base document type with common fields
 */
export interface BaseDocument extends AuditFields, Partial<SoftDeleteFields> {
  /** MongoDB ObjectId */
  _id?: unknown;
}

/**
 * Repository query options
 */
export interface QueryOptions<T extends Document> {
  /** Fields to project */
  projection?: Partial<Record<keyof T, 0 | 1>>;
  /** Sort specification */
  sort?: Record<string, 1 | -1>;
  /** Number of documents to skip */
  skip?: number;
  /** Maximum number of documents to return */
  limit?: number;
  /** Session for transactions */
  session?: ClientSession;
}

/**
 * Bulk write operation types
 */
export type BulkWriteOperation<T extends Document> =
  | { insertOne: { document: OptionalUnlessRequiredId<T> } }
  | { updateOne: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean } }
  | { updateMany: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean } }
  | { deleteOne: { filter: Filter<T> } }
  | { deleteMany: { filter: Filter<T> } }
  | { replaceOne: { filter: Filter<T>; replacement: T; upsert?: boolean } };

/**
 * Index definition for repository setup
 */
export interface IndexDefinition {
  /** Index specification */
  spec: IndexSpecification;
  /** Index options */
  options?: CreateIndexesOptions;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/**
 * Connection state change event
 */
export interface ConnectionStateEvent {
  /** Previous state */
  previousState: ConnectionState;
  /** New state */
  newState: ConnectionState;
  /** Timestamp of the change */
  timestamp: Date;
  /** Error if transitioning to error state */
  error?: Error;
}

/**
 * Re-export MongoDB types for convenience
 */
export type {
  MongoClient,
  Db,
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
  UpdateOptions,
  DeleteOptions,
  InsertOneOptions,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  WithId,
  OptionalUnlessRequiredId,
  BulkWriteOptions,
  AggregateOptions,
  CountDocumentsOptions,
  DistinctOptions,
  IndexSpecification,
  CreateIndexesOptions,
  ClientSession,
  TransactionOptions,
};
