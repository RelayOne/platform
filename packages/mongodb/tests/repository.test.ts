import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseRepository } from '../src/repository';
import type { BaseDocument } from '../src/types';
import type { Db, Collection, WithId } from 'mongodb';

// Valid MongoDB ObjectId format (24 hex characters)
const TEST_ID_1 = '507f1f77bcf86cd799439011';
const TEST_ID_2 = '507f1f77bcf86cd799439012';
const NON_EXISTENT_ID = '507f1f77bcf86cd799439099';

// Define test document type
interface TestDocument extends BaseDocument {
  name: string;
  email: string;
  age?: number;
}

// Create a concrete implementation of BaseRepository for testing
class TestRepository extends BaseRepository<TestDocument> {
  constructor(db: Db) {
    super(db, 'test_collection');
  }

  async findByEmail(email: string): Promise<WithId<TestDocument> | null> {
    return this.findOne({ email } as Parameters<typeof this.findOne>[0]);
  }
}

// Mock collection methods
const createMockCollection = () => {
  return {
    findOne: vi.fn(),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: TEST_ID_1 }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: { 0: TEST_ID_1, 1: TEST_ID_2 } }),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 5 }),
    countDocuments: vi.fn().mockResolvedValue(10),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
    distinct: vi.fn().mockResolvedValue(['value1', 'value2']),
    bulkWrite: vi.fn().mockResolvedValue({ insertedCount: 1, modifiedCount: 1 }),
    createIndex: vi.fn().mockResolvedValue('index_name'),
  } as unknown as Collection<TestDocument>;
};

const createMockDb = (collection: Collection<TestDocument>) => {
  return {
    collection: vi.fn().mockReturnValue(collection),
  } as unknown as Db;
};

describe('BaseRepository', () => {
  let mockCollection: ReturnType<typeof createMockCollection>;
  let mockDb: Db;
  let repository: TestRepository;

  beforeEach(() => {
    mockCollection = createMockCollection();
    mockDb = createMockDb(mockCollection as Collection<TestDocument>);
    repository = new TestRepository(mockDb);
  });

  describe('constructor', () => {
    it('should initialize with the correct collection', () => {
      expect(mockDb.collection).toHaveBeenCalledWith('test_collection');
      expect(repository.getCollection()).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find document by id', async () => {
      const mockDoc = { _id: TEST_ID_1, name: 'Test', email: 'test@example.com' };
      (mockCollection.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

      const result = await repository.findById(TEST_ID_1);

      expect(mockCollection.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockDoc);
    });

    it('should return null if document not found', async () => {
      (mockCollection.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repository.findById(NON_EXISTENT_ID);

      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('should find multiple documents by ids', async () => {
      const mockDocs = [
        { _id: TEST_ID_1, name: 'Test1', email: 'test1@example.com' },
        { _id: TEST_ID_2, name: 'Test2', email: 'test2@example.com' },
      ];
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const result = await repository.findByIds([TEST_ID_1, TEST_ID_2]);

      expect(mockCollection.find).toHaveBeenCalled();
      expect(result).toEqual(mockDocs);
    });
  });

  describe('findOne', () => {
    it('should find single document matching filter', async () => {
      const mockDoc = { _id: TEST_ID_1, name: 'Test', email: 'test@example.com' };
      (mockCollection.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

      const result = await repository.findByEmail('test@example.com');

      expect(mockCollection.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockDoc);
    });
  });

  describe('find', () => {
    it('should find all documents matching filter', async () => {
      const mockDocs = [
        { _id: TEST_ID_1, name: 'Test1', email: 'test1@example.com' },
        { _id: TEST_ID_2, name: 'Test2', email: 'test2@example.com' },
      ];
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const result = await repository.find({ name: 'Test' } as Parameters<typeof repository.find>[0]);

      expect(mockCollection.find).toHaveBeenCalled();
      expect(result).toEqual(mockDocs);
    });

    it('should apply query options', async () => {
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);

      await repository.find(
        {} as Parameters<typeof repository.find>[0],
        {
          sort: { createdAt: -1 },
          skip: 10,
          limit: 20,
        }
      );

      expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(cursor.skip).toHaveBeenCalledWith(10);
      expect(cursor.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('findPaginated', () => {
    it('should return paginated results', async () => {
      const mockDocs = [
        { _id: TEST_ID_1, name: 'Test1', email: 'test1@example.com' },
        { _id: TEST_ID_2, name: 'Test2', email: 'test2@example.com' },
      ];
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);
      (mockCollection.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(50);

      const result = await repository.findPaginated({} as Parameters<typeof repository.findPaginated>[0], { page: 2, limit: 10 });

      expect(result.items).toEqual(mockDocs);
      expect(result.total).toBe(50);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('should use default pagination values', async () => {
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockCollection.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await repository.findPaginated({} as Parameters<typeof repository.findPaginated>[0]);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('count', () => {
    it('should count documents matching filter', async () => {
      (mockCollection.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const count = await repository.count({ name: 'Test' } as Parameters<typeof repository.count>[0]);

      expect(mockCollection.countDocuments).toHaveBeenCalled();
      expect(count).toBe(42);
    });
  });

  describe('exists', () => {
    it('should return true if document exists', async () => {
      (mockCollection.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const exists = await repository.exists({ email: 'test@example.com' } as Parameters<typeof repository.exists>[0]);

      expect(exists).toBe(true);
    });

    it('should return false if document does not exist', async () => {
      (mockCollection.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const exists = await repository.exists({ email: 'nonexistent@example.com' } as Parameters<typeof repository.exists>[0]);

      expect(exists).toBe(false);
    });
  });

  describe('create', () => {
    it('should create document with audit fields', async () => {
      const result = await repository.create(
        { name: 'Test', email: 'test@example.com' },
        'user-123'
      );

      expect(mockCollection.insertOne).toHaveBeenCalled();
      const insertedDoc = (mockCollection.insertOne as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(insertedDoc.name).toBe('Test');
      expect(insertedDoc.email).toBe('test@example.com');
      expect(insertedDoc.createdAt).toBeInstanceOf(Date);
      expect(insertedDoc.updatedAt).toBeInstanceOf(Date);
      expect(insertedDoc.createdBy).toBe('user-123');
      expect(insertedDoc.updatedBy).toBe('user-123');
      expect(insertedDoc.isDeleted).toBe(false);
    });
  });

  describe('createMany', () => {
    it('should create multiple documents', async () => {
      const docs = [
        { name: 'Test1', email: 'test1@example.com' },
        { name: 'Test2', email: 'test2@example.com' },
      ];

      const result = await repository.createMany(docs, 'user-123');

      expect(mockCollection.insertMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('updateById', () => {
    it('should update document and return updated version', async () => {
      const updatedDoc = {
        _id: TEST_ID_1,
        name: 'Updated',
        email: 'test@example.com',
        updatedAt: new Date(),
      };
      (mockCollection.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDoc);

      const result = await repository.updateById(TEST_ID_1, { name: 'Updated' }, 'user-123');

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
      expect(result).toEqual(updatedDoc);
    });
  });

  describe('updateMany', () => {
    it('should update multiple documents', async () => {
      const result = await repository.updateMany(
        { name: 'Test' } as Parameters<typeof repository.updateMany>[0],
        { name: 'Updated' },
        'user-123'
      );

      expect(mockCollection.updateMany).toHaveBeenCalled();
      expect(result.modifiedCount).toBe(5);
    });
  });

  describe('upsert', () => {
    it('should create or update document', async () => {
      const doc = { _id: TEST_ID_1, name: 'Upserted', email: 'test@example.com' };
      (mockCollection.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      const result = await repository.upsert(
        { email: 'test@example.com' } as Parameters<typeof repository.upsert>[0],
        { name: 'Upserted', email: 'test@example.com' },
        'user-123'
      );

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
      const call = (mockCollection.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[2]?.upsert).toBe(true);
    });
  });

  describe('softDelete', () => {
    it('should soft delete document by setting isDeleted flag', async () => {
      (mockCollection.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });

      const result = await repository.softDelete(TEST_ID_1, 'user-123');

      expect(mockCollection.updateOne).toHaveBeenCalled();
      const updateCall = (mockCollection.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateCall[1].$set.isDeleted).toBe(true);
      expect(updateCall[1].$set.deletedBy).toBe('user-123');
      expect(result).toBe(true);
    });
  });

  describe('softDeleteMany', () => {
    it('should soft delete multiple documents', async () => {
      (mockCollection.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 3 });

      const result = await repository.softDeleteMany({ name: 'Test' } as Parameters<typeof repository.softDeleteMany>[0], 'user-123');

      expect(mockCollection.updateMany).toHaveBeenCalled();
      expect(result).toBe(3);
    });
  });

  describe('restore', () => {
    it('should restore soft-deleted document', async () => {
      (mockCollection.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });

      const result = await repository.restore(TEST_ID_1, 'user-123');

      expect(mockCollection.updateOne).toHaveBeenCalled();
      const updateCall = (mockCollection.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateCall[1].$set.isDeleted).toBe(false);
      expect(result).toBe(true);
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete document', async () => {
      (mockCollection.deleteOne as ReturnType<typeof vi.fn>).mockResolvedValue({ deletedCount: 1 });

      const result = await repository.hardDelete(TEST_ID_1);

      expect(mockCollection.deleteOne).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('hardDeleteMany', () => {
    it('should permanently delete multiple documents', async () => {
      const result = await repository.hardDeleteMany({ name: 'Test' } as Parameters<typeof repository.hardDeleteMany>[0]);

      expect(mockCollection.deleteMany).toHaveBeenCalled();
      expect(result.deletedCount).toBe(5);
    });
  });

  describe('aggregate', () => {
    it('should execute aggregation pipeline', async () => {
      const mockResults = [{ _id: 'group1', count: 10 }];
      const cursor = mockCollection.aggregate([]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);

      const result = await repository.aggregate([
        { $group: { _id: '$name', count: { $sum: 1 } } },
      ]);

      expect(mockCollection.aggregate).toHaveBeenCalled();
      expect(result).toEqual(mockResults);
    });
  });

  describe('distinct', () => {
    it('should return distinct field values', async () => {
      (mockCollection.distinct as ReturnType<typeof vi.fn>).mockResolvedValue(['value1', 'value2']);

      const result = await repository.distinct('name');

      expect(mockCollection.distinct).toHaveBeenCalledWith('name', expect.any(Object), expect.any(Object));
      expect(result).toEqual(['value1', 'value2']);
    });
  });

  describe('bulkWrite', () => {
    it('should execute bulk operations', async () => {
      const operations = [
        { insertOne: { document: { name: 'Test', email: 'test@example.com' } } },
      ];

      await repository.bulkWrite(operations as Parameters<typeof repository.bulkWrite>[0]);

      expect(mockCollection.bulkWrite).toHaveBeenCalled();
    });
  });

  describe('findDeleted', () => {
    it('should find soft-deleted documents', async () => {
      const mockDocs = [{ _id: TEST_ID_1, name: 'Deleted', isDeleted: true }];
      const cursor = mockCollection.find({} as Parameters<typeof mockCollection.find>[0]);
      (cursor.toArray as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const result = await repository.findDeleted({} as Parameters<typeof repository.findDeleted>[0]);

      expect(mockCollection.find).toHaveBeenCalled();
      expect(result).toEqual(mockDocs);
    });
  });

  describe('ensureIndexes', () => {
    it('should create default indexes', async () => {
      await repository.ensureIndexes();

      expect(mockCollection.createIndex).toHaveBeenCalledTimes(3);
    });
  });
});
