/**
 * @relay/mongodb - Shared MongoDB utilities for the Relay Platform
 *
 * This package provides:
 * - Connection management with pooling and auto-reconnection
 * - Generic base repository with CRUD operations
 * - Pagination and soft delete support
 * - Transaction support
 * - Health checks
 * - Type-safe queries with Zod validation
 *
 * @example
 * ```typescript
 * import {
 *   createMongoConnection,
 *   BaseRepository,
 *   type PaginatedResult,
 * } from '@relay/mongodb';
 *
 * // Create connection
 * const connection = createMongoConnection({
 *   uri: process.env.MONGODB_URI!,
 *   database: 'myapp',
 * });
 *
 * // Connect
 * const db = await connection.connect();
 *
 * // Create a repository
 * interface User extends BaseDocument {
 *   email: string;
 *   name: string;
 * }
 *
 * class UserRepository extends BaseRepository<User> {
 *   constructor(db: Db) {
 *     super(db, 'users');
 *   }
 *
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.findOne({ email });
 *   }
 * }
 *
 * const userRepo = new UserRepository(db);
 * const user = await userRepo.create({ email: 'test@example.com', name: 'Test' });
 * ```
 *
 * @packageDocumentation
 */

// Connection management
export { MongoConnection, createMongoConnection, createMongoConnectionFromEnv } from './connection';

// Repository pattern
export { BaseRepository } from './repository';

// Types
export type {
  MongoConfig,
  MongoHealthCheck,
  PaginationOptions,
  PaginatedResult,
  SoftDeleteFields,
  AuditFields,
  BaseDocument,
  QueryOptions,
  BulkWriteOperation,
  IndexDefinition,
  ConnectionState,
  ConnectionStateEvent,
  // Re-exported MongoDB types
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
} from './types';

// Zod schemas for validation
export { MongoConfigSchema, PaginationOptionsSchema } from './types';

// Re-export ObjectId for convenience
export { ObjectId } from 'mongodb';
