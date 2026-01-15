# @relay/mongodb

MongoDB utilities and connection management for Relay Platform applications.

## Features

- **Connection pooling** - Efficient connection management with configurable pool sizes
- **Automatic reconnection** - Handles connection failures gracefully
- **Base repository pattern** - Abstract class for common CRUD operations
- **Pagination support** - Built-in paginated query support
- **TypeScript-first** - Full type safety with generics
- **Environment-based configuration** - Easy setup via environment variables

## Installation

```bash
pnpm add @relay/mongodb
```

## Quick Start

```typescript
import {
  MongoConnection,
  createMongoConnectionFromEnv,
  BaseRepository,
  ObjectId,
} from '@relay/mongodb';

// Create connection from environment variables
const connection = createMongoConnectionFromEnv();

// Connect to database
const db = await connection.connect();

// Access collections
const users = connection.getCollection('users');
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `relay` |
| `MONGODB_MAX_POOL_SIZE` | Maximum connection pool size | `10` |
| `MONGODB_MIN_POOL_SIZE` | Minimum connection pool size | `1` |
| `MONGO_URL` | Fallback connection string | - |
| `MONGO_DB` | Fallback database name | - |

## API Reference

### MongoConnection

Main connection class for managing MongoDB connections.

```typescript
import { MongoConnection, MongoConnectionConfig } from '@relay/mongodb';

const config: MongoConnectionConfig = {
  url: 'mongodb://localhost:27017',
  dbName: 'myapp',
  options: {
    maxPoolSize: 20,
    minPoolSize: 5,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    retryReads: true,
  },
};

const connection = new MongoConnection(config);

// Connect
const db = await connection.connect();

// Get database instance
const db = connection.getDb();

// Get typed collection
const users = connection.getCollection<UserDocument>('users');

// Check connection status
const isConnected = connection.isConnected();

// Close connection
await connection.close();
```

### BaseRepository

Abstract class providing common CRUD operations for collections.

```typescript
import { BaseRepository, BaseDocument, ObjectId, Db } from '@relay/mongodb';

// Define your document type
interface User extends BaseDocument {
  email: string;
  name: string;
  role: 'admin' | 'user';
}

// Create repository class
class UserRepository extends BaseRepository<User> {
  constructor(db: Db) {
    super(db, 'users');
  }

  // Add custom methods
  async findByEmail(email: string): Promise<User | null> {
    return this.collection.findOne({ email });
  }

  async findByRole(role: string): Promise<User[]> {
    return this.find({ role });
  }
}

// Usage
const userRepo = new UserRepository(db);

// Find by ID
const user = await userRepo.findById('507f1f77bcf86cd799439011');

// Find with filter
const admins = await userRepo.find({ role: 'admin' });

// Find with pagination
const result = await userRepo.findPaginated(
  { role: 'user' },
  { page: 1, limit: 20, sort: { created_at: -1 } }
);

// Insert document (timestamps added automatically)
const newUser = await userRepo.insert({
  email: 'user@example.com',
  name: 'John Doe',
  role: 'user',
});

// Update document
const updated = await userRepo.updateById(userId, {
  name: 'Jane Doe',
});

// Delete document
const deleted = await userRepo.deleteById(userId);

// Count documents
const count = await userRepo.count({ role: 'admin' });

// Check existence
const exists = await userRepo.exists({ email: 'user@example.com' });
```

### Utility Functions

```typescript
import {
  ObjectId,
  newObjectId,
  toObjectId,
  requireObjectId,
} from '@relay/mongodb';

// Create new ObjectId
const id = newObjectId();

// Convert string to ObjectId (safe)
const objectId = toObjectId('507f1f77bcf86cd799439011');

// Convert string to ObjectId (throws on invalid)
const validId = requireObjectId('507f1f77bcf86cd799439011');
```

## Type Definitions

### BaseDocument

All documents in repositories extend this interface:

```typescript
interface BaseDocument {
  _id: ObjectId;
  created_at: Date;
  updated_at: Date;
}
```

### PaginatedResult

Returned by `findPaginated`:

```typescript
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
```

### PaginationOptions

Options for paginated queries:

```typescript
interface PaginationOptions {
  page?: number;        // Default: 1
  limit?: number;       // Default: 20
  sort?: Record<string, 1 | -1>;  // Default: { created_at: -1 }
}
```

## Best Practices

1. **Use repository pattern** - Extend `BaseRepository` for type-safe data access
2. **Create indexes** - Define indexes in your startup routine for query performance
3. **Handle connection errors** - Always wrap connection in try-catch
4. **Close connections on shutdown** - Use `connection.close()` for graceful shutdown
5. **Use transactions for multi-document operations** - Access `connection.getClient()` for session support

## Testing

```bash
pnpm test
```

## License

MIT
