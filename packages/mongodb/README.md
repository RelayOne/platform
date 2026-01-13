# @relay/mongodb

Shared MongoDB utilities for the Relay Platform. Provides connection management, repository pattern implementation, and type-safe database operations.

## Features

- **Connection Management**: Singleton pattern with connection pooling and auto-reconnection
- **Repository Pattern**: Generic base repository with CRUD operations
- **Pagination**: Built-in pagination with metadata
- **Soft Deletes**: Support for soft delete and restore operations
- **Audit Fields**: Automatic timestamps and user tracking
- **Transactions**: Transaction support with session management
- **Health Checks**: Connection health monitoring
- **Type Safety**: Full TypeScript support with Zod validation

## Installation

```bash
pnpm add @relay/mongodb mongodb
# or
npm install @relay/mongodb mongodb
```

## Quick Start

```typescript
import {
  createMongoConnection,
  BaseRepository,
  type BaseDocument,
} from '@relay/mongodb';
import type { Db, WithId } from 'mongodb';

// 1. Create connection
const connection = createMongoConnection({
  uri: process.env.MONGODB_URI!,
  database: 'myapp',
  appName: 'my-service',
});

// 2. Connect to database
const db = await connection.connect();

// 3. Define your document type
interface User extends BaseDocument {
  email: string;
  name: string;
  role: 'admin' | 'user';
}

// 4. Create a repository
class UserRepository extends BaseRepository<User> {
  constructor(db: Db) {
    super(db, 'users');
  }

  // Add custom methods
  async findByEmail(email: string): Promise<WithId<User> | null> {
    return this.findOne({ email });
  }

  async findAdmins(): Promise<WithId<User>[]> {
    return this.find({ role: 'admin' });
  }
}

// 5. Use the repository
const userRepo = new UserRepository(db);

// Create a user
const user = await userRepo.create({
  email: 'john@example.com',
  name: 'John Doe',
  role: 'user',
}, 'system');

// Find users with pagination
const { items, total, totalPages } = await userRepo.findPaginated(
  { role: 'user' },
  { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }
);
```

## Connection Configuration

```typescript
import { createMongoConnection, type MongoConfig } from '@relay/mongodb';

const config: MongoConfig = {
  // Required
  uri: 'mongodb://localhost:27017',
  database: 'myapp',

  // Optional - Connection pool
  minPoolSize: 5,      // Default: 5
  maxPoolSize: 100,    // Default: 100

  // Optional - Timeouts
  connectTimeoutMS: 10000,         // Default: 10000
  socketTimeoutMS: 45000,          // Default: 45000
  serverSelectionTimeoutMS: 30000, // Default: 30000

  // Optional - Write settings
  retryWrites: true,               // Default: true
  writeConcern: 'majority',        // 'majority' | 'acknowledged' | number

  // Optional - Read settings
  readPreference: 'primary',       // 'primary' | 'secondary' | 'nearest' | etc.

  // Optional - Application
  appName: 'my-service',

  // Optional - TLS
  tls: true,
  tlsCAFile: '/path/to/ca.pem',
  tlsAllowInvalidCertificates: false,
};

const connection = createMongoConnection(config);
```

## Environment Variables

Use `createMongoConnectionFromEnv()` for configuration via environment variables:

```bash
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=myapp
MONGODB_APP_NAME=my-service
MONGODB_MIN_POOL_SIZE=5
MONGODB_MAX_POOL_SIZE=100
```

```typescript
import { createMongoConnectionFromEnv } from '@relay/mongodb';

const connection = createMongoConnectionFromEnv();
```

## Repository Pattern

### Base Repository Methods

```typescript
class MyRepository extends BaseRepository<MyDocument> {
  constructor(db: Db) {
    super(db, 'my_collection');
  }
}

const repo = new MyRepository(db);

// Find operations
await repo.findById('id');
await repo.findByIds(['id1', 'id2']);
await repo.findOne({ field: 'value' });
await repo.find({ field: 'value' }, { sort: { createdAt: -1 }, limit: 10 });
await repo.findAll();
await repo.findPaginated(filter, { page: 1, limit: 20 });

// Count and existence
await repo.count({ field: 'value' });
await repo.exists({ field: 'value' });

// Create operations
await repo.create(data, userId);
await repo.createMany([data1, data2], userId);

// Update operations
await repo.updateById('id', { field: 'newValue' }, userId);
await repo.updateMany({ filter }, { field: 'newValue' }, userId);
await repo.upsert({ filter }, data, userId);

// Delete operations (soft delete)
await repo.softDelete('id', userId);
await repo.softDeleteMany({ filter }, userId);
await repo.restore('id', userId);

// Delete operations (hard delete)
await repo.hardDelete('id');
await repo.hardDeleteMany({ filter });

// Advanced operations
await repo.aggregate([{ $group: { _id: '$field', count: { $sum: 1 } } }]);
await repo.distinct('fieldName', filter);
await repo.bulkWrite([...operations]);

// Admin operations
await repo.findDeleted({ filter }); // Find soft-deleted documents
await repo.ensureIndexes(); // Create collection indexes
```

### Custom Indexes

Override `getIndexes()` to define collection-specific indexes:

```typescript
class UserRepository extends BaseRepository<User> {
  constructor(db: Db) {
    super(db, 'users');
  }

  protected getIndexes() {
    return [
      ...super.getIndexes(), // Include default indexes
      { spec: { email: 1 }, options: { unique: true } },
      { spec: { role: 1, createdAt: -1 } },
      { spec: { name: 'text', email: 'text' } }, // Text search
    ];
  }
}

// Ensure indexes on startup
await userRepo.ensureIndexes();
```

## Pagination

```typescript
const result = await repo.findPaginated(
  { status: 'active' },
  {
    page: 2,        // Default: 1
    limit: 25,      // Default: 20, max: 100
    sortBy: 'name', // Field to sort by
    sortOrder: 'asc', // 'asc' | 'desc', default: 'desc'
  }
);

// Result structure
{
  items: [...],        // Documents for current page
  total: 100,          // Total matching documents
  page: 2,             // Current page
  limit: 25,           // Items per page
  totalPages: 4,       // Total pages
  hasNextPage: true,   // Whether there's a next page
  hasPreviousPage: true, // Whether there's a previous page
}
```

## Transactions

```typescript
const connection = createMongoConnection(config);

// Execute operations within a transaction
const result = await connection.withTransaction(async (session) => {
  const user = await userRepo.create(
    { email: 'new@example.com', name: 'New User' },
    'system',
    session
  );

  await accountRepo.create(
    { userId: user._id, balance: 0 },
    'system',
    session
  );

  return user;
});
```

## Health Checks

```typescript
const connection = createMongoConnection(config);
await connection.connect();

// Manual health check
const health = await connection.healthCheck();
console.log(health);
// { healthy: true, responseTimeMs: 5, serverInfo: { version: '7.0.0', host: 'localhost', port: 27017 } }

// Periodic health checks
connection.startHealthCheck(30000, (result) => {
  if (!result.healthy) {
    console.error('MongoDB unhealthy:', result.error);
    // Trigger alerts, reconnect, etc.
  }
});

// Stop health checks
connection.stopHealthCheck();
```

## Connection State Monitoring

```typescript
const connection = createMongoConnection(config);

connection.onStateChange((event) => {
  console.log(`Connection state: ${event.previousState} -> ${event.newState}`);
  if (event.error) {
    console.error('Connection error:', event.error);
  }
});

// States: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error'
```

## Soft Deletes

All documents include soft delete support:

```typescript
// Soft delete (sets isDeleted: true, deletedAt, deletedBy)
await repo.softDelete('id', 'user-123');

// Restore soft-deleted document
await repo.restore('id', 'user-123');

// Find operations automatically exclude soft-deleted documents
await repo.find({}); // Only returns non-deleted

// Explicitly find deleted documents (admin use)
await repo.findDeleted({});
```

## Audit Fields

All documents automatically include:

```typescript
interface BaseDocument {
  _id: ObjectId;
  createdAt: Date;      // Set on create
  updatedAt: Date;      // Updated on every modification
  createdBy?: string;   // User ID who created
  updatedBy?: string;   // User ID who last updated
  isDeleted?: boolean;  // Soft delete flag
  deletedAt?: Date;     // When soft deleted
  deletedBy?: string;   // User ID who deleted
}
```

## TypeScript Types

```typescript
import type {
  // Configuration
  MongoConfig,
  MongoHealthCheck,

  // Query types
  PaginationOptions,
  PaginatedResult,
  QueryOptions,
  IndexDefinition,
  BulkWriteOperation,

  // Document types
  BaseDocument,
  AuditFields,
  SoftDeleteFields,

  // Connection
  ConnectionState,
  ConnectionStateEvent,

  // Re-exported MongoDB types
  Db,
  Collection,
  Filter,
  UpdateFilter,
  WithId,
  ObjectId,
  ClientSession,
} from '@relay/mongodb';

// Zod schemas for validation
import { MongoConfigSchema, PaginationOptionsSchema } from '@relay/mongodb';
```

## Best Practices

1. **Use singleton pattern**: `MongoConnection.getInstance()` returns the same instance for identical configs
2. **Close connections gracefully**: Call `connection.disconnect()` on shutdown
3. **Use transactions for multi-document operations**: Ensures atomicity
4. **Define indexes in repositories**: Override `getIndexes()` for collection-specific indexes
5. **Use soft deletes**: Allows data recovery and audit trails
6. **Pass user IDs for audit**: Include `userId` parameter in create/update/delete operations
7. **Handle connection errors**: Use `onStateChange` for monitoring and recovery

## License

MIT
