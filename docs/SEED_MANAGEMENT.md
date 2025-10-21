# Seed Management

The SeedManager provides comprehensive database seeding capabilities in the
rapid-objection one-way flow architecture. Each ConnectionManager has its own
SeedManager that handles seed data specific to that database connection.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Basic Usage](#basic-usage)
- [Advanced Features](#advanced-features)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The SeedManager follows the one-way flow design pattern where:

- **ConnectionManager** creates and owns a **SeedManager**
- **SeedManager** serves exactly one database connection
- Seeds are automatically tracked and can be run multiple times
- Each connection has isolated seed state and management

### Key Features

- **✅ One-Way Flow Architecture**: Clear downward dependency flow
- **✅ Connection-Specific**: Each SeedManager serves one database connection
- **✅ Automatic Tracking**: Seed execution tracked in database tables
- **✅ Idempotent Operations**: Seeds can be run multiple times safely
- **✅ Comprehensive Validation**: SeedValidator ensures seed file integrity
- **✅ Flexible Execution**: Support for development, testing, and production
  seeds
- **✅ Event-Driven**: Rich event emission for monitoring and debugging
- **✅ Production Ready**: Robust error handling and timeout management

## Architecture

### One-Way Flow Design

```
ConnectionManager
    ↓ (creates & owns)
SeedManager
    ↓ (uses)
├── SeedRunner (execution)
├── SeedValidator (validation)
└── TimeoutManager (timeout handling)
    ↓
Knex Instance ←→ Seed Files
    ↓
Database Data Population
```

### Component Responsibilities

- **ConnectionManager**: Creates SeedManager, provides seeding API methods
- **SeedManager**: Manages seed execution, state tracking, and lifecycle
- **SeedRunner**: Executes seed files with proper transaction handling
- **SeedValidator**: Validates seed files and execution parameters
- **TimeoutManager**: Handles seed timeouts and cancellation

### One-Way Flow Benefits

1. **✅ Clear Ownership**: Each SeedManager belongs to exactly one
   ConnectionManager
2. **✅ Isolated State**: Seed state isolated per connection with no shared
   state
3. **✅ Simplified Dependencies**: Clean downward flow, no circular dependencies
4. **✅ Easy Testing**: Straightforward behavior with predictable interactions
5. **✅ Better Performance**: No overhead from complex multi-connection
   management
6. **✅ Enhanced Maintainability**: Focused components with single
   responsibilities

## Components

The SeedManager consists of 4 focused components:

### 1. **SeedManager.js** (8.4KB)

**Core seed management for single database connection**

```javascript
// Connection-specific seed manager
const seedManager = new SeedManager(config, 'user-service');

// Execute all seed files
const result = await seedManager.seed();
console.log(`Executed ${result.executedSeeds.length} seed files`);
```

**Key Features:**

- ✅ One-way flow architecture (serves ConnectionManager only)
- ✅ Seed state tracking and execution history
- ✅ Automatic Knex instance integration
- ✅ Environment-specific seed execution
- ✅ Event emission for monitoring

### 2. **SeedRunner.js** (15.0KB)

**Seed file execution and transaction handling**

```javascript
// Executes seed files with proper transaction management
const runner = new SeedRunner(validator, config, connectionName);
await runner.seed(knexInstance, seedFiles);
```

**Features:**

- ✅ Transaction-wrapped seed execution
- ✅ Idempotent seed operations
- ✅ Error handling and rollback on failure
- ✅ Seed file loading and validation
- ✅ State persistence in seed tracking tables

### 3. **SeedValidator.js** (4.6KB)

**Seed file and parameter validation**

```javascript
// Validates seed files and execution parameters
const validator = new SeedValidator(config, connectionName);
validator.validateSeedsPath(seedPath);
```

**Validation Coverage:**

- ✅ Seed file structure and format
- ✅ Required seed function exports
- ✅ Seed naming conventions
- ✅ Parameter validation for execution
- ✅ Environment and dependency validation

### 4. **index.js** (182B)

**Clean component exports**

```javascript
// Main exports
export { SeedManager } from './SeedManager';
export { SeedRunner } from './SeedRunner';
export { SeedValidator } from './SeedValidator';
```

## Basic Usage

### 1. Initialize ConnectionManager with Seed Support

```javascript
import { ConnectionManager } from 'rapid-objection';

const connectionManager = new ConnectionManager(
  {
    // Database connection config
    client: 'postgresql',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'dbuser',
      password: 'dbpass',
      database: 'myapp',
    },

    // Seed configuration
    seeds: {
      enabled: true,
      directory: './seeds',
      tableName: 'knex_seeds',
      extension: 'js',
    },
  },
  'connection-name'
);

await connectionManager.initialize();
```

### 2. Create Seed Files

```javascript
// seeds/01_users.js
export const seed = async knex => {
  // Delete existing data (optional)
  await knex('users').del();

  // Insert seed data
  await knex('users').insert([
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password_hash: '$2b$10$...',
      active: true,
    },
    {
      email: 'user@example.com',
      name: 'Regular User',
      password_hash: '$2b$10$...',
      active: true,
    },
  ]);
};
```

### 3. Run Seeds

```javascript
// Execute all seed files
const result = await connectionManager.seed();
console.log(`Executed ${result.executedSeeds.length} seed files`);
```

## Advanced Features

### 1. Seed Configuration

```javascript
const connectionManager = new ConnectionManager(
  {
    client: 'postgresql',
    connection: {
      /* ... */
    },

    seeds: {
      enabled: true,
      directory: './database/seeds',
      tableName: 'seed_history',
      extension: 'js',
      loadExtensions: ['.js', '.ts'],
      sortDirsSeparately: false,
      timeout: 30000,
      validation: {
        enabled: true,
        strictMode: true,
      },
      environments: ['development', 'testing'], // Only run in these environments
    },
  },
  'connection-name'
);
```

### 2. Environment-Specific Seeds

```javascript
// seeds/development/01_dev_users.js
export const seed = async knex => {
  // Development-only seed data
  await knex('users').insert([
    {
      email: 'dev@example.com',
      name: 'Development User',
      password_hash: 'dev-password-hash',
    },
  ]);
};

// seeds/production/01_prod_admin.js
export const seed = async knex => {
  // Production-only seed data
  await knex('users').insert([
    {
      email: 'admin@company.com',
      name: 'Production Admin',
      password_hash: 'secure-production-hash',
    },
  ]);
};
```

### 3. Idempotent Seeds

```javascript
// seeds/02_categories.js
export const seed = async knex => {
  const categories = [
    { name: 'Technology', slug: 'technology' },
    { name: 'Business', slug: 'business' },
    { name: 'Health', slug: 'health' },
  ];

  // Idempotent insert - only insert if doesn't exist
  for (const category of categories) {
    const existing = await knex('categories')
      .where('slug', category.slug)
      .first();

    if (!existing) {
      await knex('categories').insert(category);
    }
  }
};
```

### 4. Seed Dependencies

```javascript
// seeds/03_posts.js
export const seed = async knex => {
  // Ensure users exist first
  const users = await knex('users').select('id');
  if (users.length === 0) {
    throw new Error('Users must be seeded before posts');
  }

  // Seed posts with user references
  await knex('posts').insert([
    {
      title: 'First Post',
      content: 'This is the first post',
      user_id: users[0].id,
    },
    {
      title: 'Second Post',
      content: 'This is the second post',
      user_id: users[1]?.id || users[0].id,
    },
  ]);
};

// Optional: Specify dependencies
export const dependencies = ['01_users.js'];
```

## API Reference

### SeedManager Methods

#### `constructor(config, connectionName)`

Creates a new SeedManager instance for a specific connection.

**Parameters:**

- `config` (Object) - Seed configuration options
- `connectionName` (string) - Name of the connection this manager serves

#### `async initialize()`

Initializes the SeedManager and sets up seed tracking tables.

**Returns:** Promise<void>

#### `async seed(options)`

Executes seed files.

**Parameters:**

- `options` (Object, optional) - Seed options
  - `environment` (string) - Target environment for seeds
  - `timeout` (number) - Custom timeout in milliseconds
  - `force` (boolean) - Force re-run of already executed seeds

**Returns:** Promise<Object> - Seed result with executed seeds

#### `async rollback(options)`

Rolls back seed data (if supported by seed files).

**Parameters:**

- `options` (Object, optional) - Rollback options
  - `timeout` (number) - Custom timeout in milliseconds

**Returns:** Promise<Object> - Rollback result

#### `async getStatus()`

Gets the current seed status and execution history.

**Returns:** Promise<Object> - Status information including executed seeds

#### `async shutdown(options)`

Shuts down the SeedManager and cleans up resources.

**Parameters:**

- `options` (Object, optional) - Shutdown options
  - `timeout` (number) - Shutdown timeout in milliseconds

**Returns:** Promise<void>

### ConnectionManager Seed Methods

#### `async seed(options)`

Executes seeds using the connection's SeedManager.

**Parameters:**

- `options` (Object, optional) - Seed options

**Returns:** Promise<Object> - Seed result

**Throws:** Error when SeedManager not initialized or seeding fails

#### `async rollback(options)`

Reverts seed data using the connection's SeedManager.

**Parameters:**

- `options` (Object, optional) - Rollback options

**Returns:** Promise<Object> - Rollback result

**Throws:** Error when SeedManager not initialized or rollback fails

## Configuration

### SeedManager Configuration

```javascript
const connectionManager = new ConnectionManager(
  {
    // Database connection config
    client: 'postgresql',
    connection: {
      /* ... */
    },

    // SeedManager configuration
    seeds: {
      enabled: true, // Enable SeedManager
      directory: './seeds', // Seed files directory
      tableName: 'knex_seeds', // Seed tracking table
      extension: 'js', // Default file extension
      loadExtensions: ['.js', '.ts'], // Supported extensions
      sortDirsSeparately: false, // Sort directories separately
      timeout: 30000, // Default timeout (30 seconds)
      environments: ['development'], // Allowed environments
      validation: {
        // Validation options
        enabled: true, // Enable validation
        strictMode: true, // Strict validation mode
      },
    },
  },
  'connection-name'
);
```

### Configuration Options

#### `seeds.enabled` (boolean, default: `true`)

Enables or disables the SeedManager component.

```javascript
seeds: {
  enabled: false; // Disables seed management
}
```

#### `seeds.directory` (string, default: `'./seeds'`)

Directory containing seed files.

```javascript
seeds: {
  directory: './database/seeds';
}
```

#### `seeds.tableName` (string, default: `'knex_seeds'`)

Name of the table used to track seed execution.

```javascript
seeds: {
  tableName: 'seed_history';
}
```

#### `seeds.environments` (Array<string>, default: `['development']`)

Environments where seeds are allowed to run.

```javascript
seeds: {
  environments: ['development', 'testing', 'staging'];
}
```

#### `seeds.timeout` (number, default: `30000`)

Default timeout for seed operations in milliseconds.

```javascript
seeds: {
  timeout: 60000; // 60 second timeout
}
```

### Environment-Specific Configuration

#### Development Configuration

```javascript
seeds: {
  enabled: true,
  directory: './seeds/development',
  environments: ['development'],
  timeout: 60000,           // Longer timeout for development
  validation: {
    enabled: true,          // Catch errors early
    strictMode: false       // More lenient for development
  }
}
```

#### Testing Configuration

```javascript
seeds: {
  enabled: true,
  directory: './seeds/testing',
  environments: ['testing'],
  timeout: 10000,           // Faster timeout for tests
  validation: {
    enabled: true,
    strictMode: true        // Strict validation for tests
  }
}
```

#### Production Configuration

```javascript
seeds: {
  enabled: false,           // Usually disabled in production
  directory: './seeds/production',
  environments: ['production'],
  timeout: 30000,
  validation: {
    enabled: true,
    strictMode: true
  }
}
```

## Examples

### Complete Seeding Workflow

```javascript
import { ConnectionManager } from 'rapid-objection';

// Initialize connection with seed support
const connectionManager = new ConnectionManager(
  {
    client: 'postgresql',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'dbuser',
      password: 'dbpass',
      database: 'myapp',
    },
    seeds: {
      enabled: true,
      directory: './seeds',
      environments: ['development', 'testing'],
    },
  },
  'main-db'
);

try {
  // Initialize connection
  await connectionManager.initialize();

  // Check seed status
  const status = await connectionManager.getSeedStatus();
  console.log(`Available seeds: ${status.availableSeeds.length}`);

  // Run seeds
  const result = await connectionManager.seed();
  console.log(`Executed ${result.executedSeeds.length} seeds`);

  // Your application logic here
} catch (error) {
  console.error('Seeding failed:', error);
} finally {
  await connectionManager.shutdown();
}
```

### Seed File Examples

#### Basic Data Seeding

```javascript
// seeds/01_users.js
export const seed = async knex => {
  // Clear existing data
  await knex('users').del();

  // Insert seed data
  await knex('users').insert([
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password_hash: '$2b$10$hash1',
      role: 'admin',
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      email: 'user1@example.com',
      name: 'John Doe',
      password_hash: '$2b$10$hash2',
      role: 'user',
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      email: 'user2@example.com',
      name: 'Jane Smith',
      password_hash: '$2b$10$hash3',
      role: 'user',
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
};
```

#### Relational Data Seeding

```javascript
// seeds/02_posts_and_comments.js
export const seed = async knex => {
  // Clear existing data
  await knex('comments').del();
  await knex('posts').del();

  // Get users for foreign key references
  const users = await knex('users').select('id', 'email');
  const adminUser = users.find(u => u.email === 'admin@example.com');
  const regularUser = users.find(u => u.email === 'user1@example.com');

  // Insert posts
  const posts = await knex('posts')
    .insert([
      {
        title: 'Welcome to Our Blog',
        content: 'This is our first blog post...',
        user_id: adminUser.id,
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        title: 'Getting Started Guide',
        content: "Here's how to get started...",
        user_id: adminUser.id,
        published: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])
    .returning('id');

  // Insert comments
  await knex('comments').insert([
    {
      content: 'Great post!',
      post_id: posts[0].id,
      user_id: regularUser.id,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      content: 'Very helpful, thanks!',
      post_id: posts[1].id,
      user_id: regularUser.id,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
};
```

#### Configuration Data Seeding

```javascript
// seeds/03_system_config.js
export const seed = async knex => {
  const configs = [
    { key: 'site_name', value: 'My Application', type: 'string' },
    { key: 'max_upload_size', value: '10485760', type: 'integer' },
    { key: 'email_notifications', value: 'true', type: 'boolean' },
    { key: 'maintenance_mode', value: 'false', type: 'boolean' },
  ];

  // Idempotent insert - update if exists, insert if not
  for (const config of configs) {
    const existing = await knex('system_config')
      .where('key', config.key)
      .first();

    if (existing) {
      await knex('system_config').where('key', config.key).update({
        value: config.value,
        updated_at: new Date(),
      });
    } else {
      await knex('system_config').insert({
        ...config,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }
};
```

#### Large Dataset Seeding

```javascript
// seeds/04_sample_data.js
export const seed = async knex => {
  // Clear existing data
  await knex('products').del();

  // Generate large dataset
  const batchSize = 1000;
  const totalRecords = 10000;

  for (let i = 0; i < totalRecords; i += batchSize) {
    const batch = [];

    for (let j = 0; j < batchSize && i + j < totalRecords; j++) {
      const recordNum = i + j + 1;
      batch.push({
        name: `Product ${recordNum}`,
        description: `Description for product ${recordNum}`,
        price: Math.floor(Math.random() * 10000) / 100, // Random price
        category_id: Math.floor(Math.random() * 10) + 1,
        active: Math.random() > 0.1, // 90% active
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    await knex('products').insert(batch);
    console.log(
      `Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalRecords / batchSize)}`
    );
  }
};
```

## Best Practices

### 1. Seed File Organization

```javascript
// Organize seeds by purpose and execution order
seeds/
├── 01_users.js              // Core user data
├── 02_roles_permissions.js  // Authorization data
├── 03_categories.js         // Reference data
├── 04_sample_posts.js       // Sample content
└── 99_cleanup.js           // Final cleanup/optimization
```

### 2. Make Seeds Idempotent

```javascript
// Seeds should be safe to run multiple times
export const seed = async knex => {
  // Check if data already exists
  const existingCount = await knex('categories').count('id as count').first();

  if (existingCount.count > 0) {
    console.log('Categories already seeded, skipping...');
    return;
  }

  // Insert data only if it doesn't exist
  await knex('categories').insert([
    { name: 'Technology', slug: 'tech' },
    { name: 'Business', slug: 'business' },
  ]);
};
```

### 3. Handle Dependencies Properly

```javascript
// seeds/05_posts.js
export const seed = async knex => {
  // Verify dependencies exist
  const userCount = await knex('users').count('id as count').first();
  const categoryCount = await knex('categories').count('id as count').first();

  if (userCount.count === 0) {
    throw new Error(
      'Users must be seeded before posts (run 01_users.js first)'
    );
  }

  if (categoryCount.count === 0) {
    throw new Error(
      'Categories must be seeded before posts (run 03_categories.js first)'
    );
  }

  // Proceed with seeding
  const users = await knex('users').select('id').limit(5);
  const categories = await knex('categories').select('id');

  // Create posts with valid foreign keys
  // ...
};
```

### 4. Environment-Specific Seeds

```javascript
// seeds/development/dev_sample_data.js
export const seed = async knex => {
  // Only run in development
  if (process.env.NODE_ENV !== 'development') {
    console.log('Skipping development seeds in non-development environment');
    return;
  }

  // Large sample dataset for development
  await knex('sample_data').insert(generateLargeDataset());
};

// seeds/production/prod_essential_data.js
export const seed = async knex => {
  // Only essential data for production
  await knex('system_settings').insert([
    { key: 'app_version', value: process.env.APP_VERSION || '1.0.0' },
    { key: 'deployment_date', value: new Date().toISOString() },
  ]);
};
```

### 5. Testing Seeds

```javascript
// Test seed execution
describe('Database seeding', () => {
  let connectionManager;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testConfig, 'test');
    await connectionManager.initialize();

    // Clean database before each test
    await connectionManager.knex.raw(
      'TRUNCATE TABLE users, posts, categories CASCADE'
    );
  });

  afterEach(async () => {
    await connectionManager.shutdown();
  });

  it('should seed users successfully', async () => {
    const result = await connectionManager.seed();
    expect(result.executedSeeds).toHaveLength(1);

    const userCount = await connectionManager
      .knex('users')
      .count('id as count')
      .first();
    expect(parseInt(userCount.count)).toBeGreaterThan(0);
  });

  it('should be idempotent', async () => {
    // Run seeds twice
    await connectionManager.seed();
    const firstCount = await connectionManager
      .knex('users')
      .count('id as count')
      .first();

    await connectionManager.seed();
    const secondCount = await connectionManager
      .knex('users')
      .count('id as count')
      .first();

    // Count should be the same
    expect(firstCount.count).toBe(secondCount.count);
  });
});
```

### 6. Performance Optimization

```javascript
// Optimize large seed operations
export const seed = async knex => {
  // Disable foreign key checks for faster inserts (PostgreSQL)
  await knex.raw('SET session_replication_role = replica');

  try {
    // Batch insert for better performance
    const batchSize = 1000;
    const data = generateLargeDataset();

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await knex('large_table').insert(batch);
    }

    // Update sequences (PostgreSQL)
    await knex.raw(
      "SELECT setval('large_table_id_seq', (SELECT MAX(id) FROM large_table))"
    );
  } finally {
    // Re-enable foreign key checks
    await knex.raw('SET session_replication_role = DEFAULT');
  }
};
```
