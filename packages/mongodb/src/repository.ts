import { ObjectId, Collection, Db } from 'mongodb';
import type {
  Document,
  Filter,
  UpdateFilter,
  WithId,
  OptionalUnlessRequiredId,
  UpdateResult,
  DeleteResult,
  ClientSession,
  AggregateOptions,
  BulkWriteOptions,
  IndexDefinition,
  PaginationOptions,
  PaginatedResult,
  QueryOptions,
  BulkWriteOperation,
  BaseDocument,
} from './types';
import { PaginationOptionsSchema } from './types';

/**
 * Generic base repository providing common CRUD operations for MongoDB collections.
 * Implements the repository pattern with support for soft deletes, pagination, and transactions.
 * @template T - The document type extending BaseDocument
 */
export abstract class BaseRepository<T extends BaseDocument & Document> {
  protected collection: Collection<T>;
  protected collectionName: string;

  /**
   * Creates a new BaseRepository instance.
   * @param db - The MongoDB database instance
   * @param collectionName - The name of the collection
   */
  constructor(db: Db, collectionName: string) {
    this.collectionName = collectionName;
    this.collection = db.collection<T>(collectionName);
  }

  /**
   * Gets the underlying MongoDB collection.
   * @returns The MongoDB collection
   */
  public getCollection(): Collection<T> {
    return this.collection;
  }

  /**
   * Creates indexes for the collection.
   * Override this method to define collection-specific indexes.
   * @returns Array of index definitions
   */
  protected getIndexes(): IndexDefinition[] {
    return [
      // Default indexes for audit fields
      { spec: { createdAt: -1 } },
      { spec: { updatedAt: -1 } },
      // Soft delete index
      { spec: { isDeleted: 1 }, options: { sparse: true } },
    ];
  }

  /**
   * Ensures all defined indexes exist on the collection.
   */
  public async ensureIndexes(): Promise<void> {
    const indexes = this.getIndexes();
    for (const index of indexes) {
      await this.collection.createIndex(index.spec, index.options);
    }
  }

  /**
   * Finds a single document by its ObjectId.
   * @param id - The document ObjectId (string or ObjectId)
   * @param options - Query options
   * @returns The document or null if not found
   */
  public async findById(
    id: string | ObjectId,
    options?: QueryOptions<T>
  ): Promise<WithId<T> | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const filter = { _id: objectId, isDeleted: { $ne: true } } as Filter<T>;

    return this.collection.findOne(filter, {
      projection: options?.projection,
      session: options?.session,
    });
  }

  /**
   * Finds multiple documents by their ObjectIds.
   * @param ids - Array of document ObjectIds
   * @param options - Query options
   * @returns Array of found documents
   */
  public async findByIds(
    ids: (string | ObjectId)[],
    options?: QueryOptions<T>
  ): Promise<WithId<T>[]> {
    const objectIds = ids.map(id => (typeof id === 'string' ? new ObjectId(id) : id));
    const filter = {
      _id: { $in: objectIds },
      isDeleted: { $ne: true },
    } as Filter<T>;

    return this.collection
      .find(filter, {
        projection: options?.projection,
        sort: options?.sort,
        session: options?.session,
      })
      .toArray();
  }

  /**
   * Finds a single document matching the filter.
   * @param filter - MongoDB filter
   * @param options - Query options
   * @returns The document or null if not found
   */
  public async findOne(
    filter: Filter<T>,
    options?: QueryOptions<T>
  ): Promise<WithId<T> | null> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;

    return this.collection.findOne(safeFilter, {
      projection: options?.projection,
      session: options?.session,
    });
  }

  /**
   * Finds multiple documents matching the filter.
   * @param filter - MongoDB filter
   * @param options - Query options
   * @returns Array of matching documents
   */
  public async find(
    filter: Filter<T>,
    options?: QueryOptions<T>
  ): Promise<WithId<T>[]> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;

    let cursor = this.collection.find(safeFilter, {
      projection: options?.projection,
      session: options?.session,
    });

    if (options?.sort) {
      cursor = cursor.sort(options.sort);
    }
    if (options?.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
  }

  /**
   * Finds all documents in the collection (excluding soft-deleted).
   * @param options - Query options
   * @returns Array of all documents
   */
  public async findAll(options?: QueryOptions<T>): Promise<WithId<T>[]> {
    return this.find({} as Filter<T>, options);
  }

  /**
   * Finds documents with pagination support.
   * @param filter - MongoDB filter
   * @param pagination - Pagination options
   * @param queryOptions - Additional query options
   * @returns Paginated result with items and metadata
   */
  public async findPaginated(
    filter: Filter<T>,
    pagination?: PaginationOptions,
    queryOptions?: Omit<QueryOptions<T>, 'skip' | 'limit' | 'sort'>
  ): Promise<PaginatedResult<WithId<T>>> {
    const validatedPagination = PaginationOptionsSchema.parse(pagination ?? {});
    const { page, limit, sortBy, sortOrder } = validatedPagination;
    const skip = (page - 1) * limit;

    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;

    // Build sort specification
    const sort: Record<string, 1 | -1> = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort['createdAt'] = -1;
    }

    const [items, total] = await Promise.all([
      this.collection
        .find(safeFilter, {
          projection: queryOptions?.projection,
          session: queryOptions?.session,
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(safeFilter, { session: queryOptions?.session }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Counts documents matching the filter.
   * @param filter - MongoDB filter
   * @param session - Optional client session for transactions
   * @returns Number of matching documents
   */
  public async count(filter: Filter<T>, session?: ClientSession): Promise<number> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;
    return this.collection.countDocuments(safeFilter, { session });
  }

  /**
   * Checks if a document exists matching the filter.
   * @param filter - MongoDB filter
   * @param session - Optional client session for transactions
   * @returns True if a document exists
   */
  public async exists(filter: Filter<T>, session?: ClientSession): Promise<boolean> {
    const count = await this.count(filter, session);
    return count > 0;
  }

  /**
   * Creates a new document.
   * @param data - The document data (without _id)
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns The created document with _id
   */
  public async create(
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
    userId?: string,
    session?: ClientSession
  ): Promise<WithId<T>> {
    const now = new Date();
    const document = {
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      isDeleted: false,
    } as OptionalUnlessRequiredId<T>;

    const result = await this.collection.insertOne(document, { session });
    return { ...document, _id: result.insertedId } as WithId<T>;
  }

  /**
   * Creates multiple documents in a single operation.
   * @param documents - Array of document data
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns Array of created documents with _ids
   */
  public async createMany(
    documents: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[],
    userId?: string,
    session?: ClientSession
  ): Promise<WithId<T>[]> {
    const now = new Date();
    const docs = documents.map(doc => ({
      ...doc,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      isDeleted: false,
    })) as OptionalUnlessRequiredId<T>[];

    const result = await this.collection.insertMany(docs, { session });

    return docs.map((doc, index) => ({
      ...doc,
      _id: result.insertedIds[index],
    })) as WithId<T>[];
  }

  /**
   * Updates a document by its ObjectId.
   * @param id - The document ObjectId
   * @param update - The update operations
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns The updated document or null if not found
   */
  public async updateById(
    id: string | ObjectId,
    update: Partial<Omit<T, '_id' | 'createdAt' | 'createdBy'>>,
    userId?: string,
    session?: ClientSession
  ): Promise<WithId<T> | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const filter = { _id: objectId, isDeleted: { $ne: true } } as Filter<T>;

    const updateDoc = {
      $set: {
        ...update,
        updatedAt: new Date(),
        ...(userId && { updatedBy: userId }),
      },
    } as UpdateFilter<T>;

    const result = await this.collection.findOneAndUpdate(filter, updateDoc, {
      returnDocument: 'after',
      session,
    });

    return result;
  }

  /**
   * Updates multiple documents matching the filter.
   * @param filter - MongoDB filter
   * @param update - The update operations
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns Update result with counts
   */
  public async updateMany(
    filter: Filter<T>,
    update: Partial<Omit<T, '_id' | 'createdAt' | 'createdBy'>>,
    userId?: string,
    session?: ClientSession
  ): Promise<UpdateResult> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;

    const updateDoc = {
      $set: {
        ...update,
        updatedAt: new Date(),
        ...(userId && { updatedBy: userId }),
      },
    } as UpdateFilter<T>;

    return this.collection.updateMany(safeFilter, updateDoc, { session });
  }

  /**
   * Creates or updates a document based on the filter.
   * @param filter - MongoDB filter to find existing document
   * @param data - The document data to create or update
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns The upserted document
   */
  public async upsert(
    filter: Filter<T>,
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
    userId?: string,
    session?: ClientSession
  ): Promise<WithId<T>> {
    const now = new Date();

    const updateDoc = {
      $set: {
        ...data,
        updatedAt: now,
        ...(userId && { updatedBy: userId }),
      },
      $setOnInsert: {
        createdAt: now,
        ...(userId && { createdBy: userId }),
        isDeleted: false,
      },
    } as UpdateFilter<T>;

    const result = await this.collection.findOneAndUpdate(filter, updateDoc, {
      upsert: true,
      returnDocument: 'after',
      session,
    });

    return result!;
  }

  /**
   * Soft deletes a document by its ObjectId.
   * @param id - The document ObjectId
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns True if the document was deleted
   */
  public async softDelete(
    id: string | ObjectId,
    userId?: string,
    session?: ClientSession
  ): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const filter = { _id: objectId, isDeleted: { $ne: true } } as Filter<T>;

    const updateDoc = {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(userId && { deletedBy: userId, updatedBy: userId }),
      },
    } as UpdateFilter<T>;

    const result = await this.collection.updateOne(filter, updateDoc, { session });
    return result.modifiedCount > 0;
  }

  /**
   * Soft deletes multiple documents matching the filter.
   * @param filter - MongoDB filter
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns Number of deleted documents
   */
  public async softDeleteMany(
    filter: Filter<T>,
    userId?: string,
    session?: ClientSession
  ): Promise<number> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;

    const updateDoc = {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(userId && { deletedBy: userId, updatedBy: userId }),
      },
    } as UpdateFilter<T>;

    const result = await this.collection.updateMany(safeFilter, updateDoc, { session });
    return result.modifiedCount;
  }

  /**
   * Restores a soft-deleted document.
   * @param id - The document ObjectId
   * @param userId - Optional user ID for audit trail
   * @param session - Optional client session for transactions
   * @returns True if the document was restored
   */
  public async restore(
    id: string | ObjectId,
    userId?: string,
    session?: ClientSession
  ): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const filter = { _id: objectId, isDeleted: true } as Filter<T>;

    const updateDoc = {
      $set: {
        isDeleted: false,
        updatedAt: new Date(),
        ...(userId && { updatedBy: userId }),
      },
      $unset: {
        deletedAt: 1,
        deletedBy: 1,
      },
    } as unknown as UpdateFilter<T>;

    const result = await this.collection.updateOne(filter, updateDoc, { session });
    return result.modifiedCount > 0;
  }

  /**
   * Permanently deletes a document by its ObjectId.
   * @param id - The document ObjectId
   * @param session - Optional client session for transactions
   * @returns True if the document was deleted
   */
  public async hardDelete(id: string | ObjectId, session?: ClientSession): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await this.collection.deleteOne({ _id: objectId } as Filter<T>, { session });
    return result.deletedCount > 0;
  }

  /**
   * Permanently deletes multiple documents matching the filter.
   * @param filter - MongoDB filter
   * @param session - Optional client session for transactions
   * @returns Delete result with count
   */
  public async hardDeleteMany(filter: Filter<T>, session?: ClientSession): Promise<DeleteResult> {
    return this.collection.deleteMany(filter, { session });
  }

  /**
   * Executes an aggregation pipeline.
   * @param pipeline - MongoDB aggregation pipeline stages
   * @param options - Aggregation options
   * @returns Array of aggregation results
   */
  public async aggregate<R extends Document = Document>(
    pipeline: Document[],
    options?: AggregateOptions
  ): Promise<R[]> {
    return this.collection.aggregate<R>(pipeline, options).toArray();
  }

  /**
   * Gets distinct values for a field.
   * @param field - The field name
   * @param filter - Optional MongoDB filter
   * @param session - Optional client session for transactions
   * @returns Array of distinct values
   */
  public async distinct<K extends keyof T>(
    field: K,
    filter?: Filter<T>,
    session?: ClientSession
  ): Promise<T[K][]> {
    const safeFilter = { ...filter, isDeleted: { $ne: true } } as Filter<T>;
    return this.collection.distinct(field as string, safeFilter, { session }) as Promise<T[K][]>;
  }

  /**
   * Executes bulk write operations.
   * @param operations - Array of bulk write operations
   * @param options - Bulk write options
   * @returns Bulk write result
   */
  public async bulkWrite(
    operations: BulkWriteOperation<T>[],
    options?: BulkWriteOptions
  ): Promise<import('mongodb').BulkWriteResult> {
    return this.collection.bulkWrite(operations as Parameters<Collection<T>['bulkWrite']>[0], options);
  }

  /**
   * Finds soft-deleted documents (for admin purposes).
   * @param filter - MongoDB filter
   * @param options - Query options
   * @returns Array of soft-deleted documents
   */
  public async findDeleted(
    filter: Filter<T>,
    options?: QueryOptions<T>
  ): Promise<WithId<T>[]> {
    const deletedFilter = { ...filter, isDeleted: true } as Filter<T>;

    let cursor = this.collection.find(deletedFilter, {
      projection: options?.projection,
      session: options?.session,
    });

    if (options?.sort) {
      cursor = cursor.sort(options.sort);
    }
    if (options?.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
  }
}
