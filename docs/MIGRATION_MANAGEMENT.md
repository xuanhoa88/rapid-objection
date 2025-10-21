# Migration Management

The MigrationManager provides comprehensive database schema migration
capabilities in the rapid-objection one-way flow architecture. Each
ConnectionManager has its own MigrationManager that handles migrations specific
to that database connection.

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

The MigrationManager follows the one-way flow design pattern where:

- **ConnectionManager** creates and owns a **MigrationManager**
- **MigrationManager** serves exactly one database connection
- Migrations are automatically tracked and versioned
- Each connection has isolated migration state and management

### Key Features

- **✅ One-Way Flow Architecture**: Clear downward dependency flow
- **✅ Connection-Specific**: Each MigrationManager serves one database
  connection
- **✅ Automatic Tracking**: Migration state tracked in database tables
- **✅ Version Control**: Sequential migration versioning and rollback support
- **✅ Comprehensive Validation**: MigrationValidator ensures migration
  integrity
- **✅ Flexible Execution**: Support for up/down migrations with rollback
- **✅ Event-Driven**: Rich event emission for monitoring and debugging
- **✅ Production Ready**: Robust error handling and timeout management

## Architecture

### One-Way Flow Design

```
ConnectionManager
    ↓ (creates & owns)
MigrationManager
    ↓ (uses)
├── MigrationRunner (execution)
├── MigrationValidator (validation)
└── TimeoutManager (timeout handling)
    ↓
Knex Instance ←→ Migration Files
    ↓
Database Schema Changes
```

### Component Responsibilities

- **ConnectionManager**: Creates MigrationManager, provides migration API
  methods
- **MigrationManager**: Manages migration execution, state tracking, and
  lifecycle
- **MigrationRunner**: Executes migration files with proper transaction handling
- **MigrationValidator**: Validates migration files and execution parameters
- **TimeoutManager**: Handles migration timeouts and cancellation

### One-Way Flow Benefits

1. **✅ Clear Ownership**: Each MigrationManager belongs to exactly one
   ConnectionManager
2. **✅ Isolated State**: Migration state isolated per connection with no shared
   state
3. **✅ Simplified Dependencies**: Clean downward flow, no circular dependencies
4. **✅ Easy Testing**: Straightforward behavior with predictable interactions
5. **✅ Better Performance**: No overhead from complex multi-connection
   management
6. **✅ Enhanced Maintainability**: Focused components with single
   responsibilities

## Components

The MigrationManager consists of 4 focused components:

### 1. **MigrationManager.js** (9.0KB)

**Core migration management for single database connection**

```javascript
// Connection-specific migration manager
const migrationManager = new MigrationManager(config, 'user-service');

// Execute pending migrations
const result = await migrationManager.migrate();
console.log(`Applied ${result.appliedMigrations.length} migrations`);
```

**Key Features:**

- ✅ One-way flow architecture (serves ConnectionManager only)
- ✅ Migration state tracking and versioning
- ✅ Automatic Knex instance integration
- ✅ Rollback and recovery support
- ✅ Event emission for monitoring

### 2. **MigrationRunner.js** (7.8KB)

**Migration file execution and transaction handling**

```javascript
// Executes migration files with proper transaction management
const runner = new MigrationRunner(validator, config, connectionName);
await runner.runMigrations(knexInstance, migrationFiles);
```

**Features:**

- ✅ Transaction-wrapped migration execution
- ✅ Up/down migration support
- ✅ Error handling and rollback on failure
- ✅ Migration file loading and validation
- ✅ State persistence in migration tables

### 3. **MigrationValidator.js** (4.7KB)

**Migration file and parameter validation**

```javascript
// Validates migration files and execution parameters
const validator = new MigrationValidator(config, connectionName);
validator.validateMigrationsPath(migrationPath);
```

**Validation Coverage:**

- ✅ Migration file structure and format
- ✅ Required up/down functions
- ✅ Migration naming conventions
- ✅ Parameter validation for execution
- ✅ Dependency and ordering validation

### 4. **index.js** (212B)

**Clean component exports**

```javascript
// Main exports
export { MigrationManager } from './MigrationManager';
export { MigrationRunner } from './MigrationRunner';
export { MigrationValidator } from './MigrationValidator';
```

## Basic Usage

### 1. Initialize ConnectionManager with Migration Support

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

    // Migration configuration
    migrations: {
      enabled: true,
      directory: './migrations',
      tableName: 'knex_migrations',
      extension: 'js',
    },
  },
  'connection-name'
);

await connectionManager.initialize();
```

### 2. Create Migration Files

```javascript
// migrations/20231201_001_create_users_table.js
export const up = async knex => {
  return knex.schema.createTable('users', table => {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

export const down = async knex => {
  return knex.schema.dropTable('users');
};
```

### 3. Run Migrations

```javascript
// Execute all pending migrations
const result = await connectionManager.migrate();
console.log(`Applied ${result.appliedMigrations.length} migrations`);

// Rollback last migration batch
const rollbackResult = await connectionManager.rollback();
console.log(
  `Rolled back ${rollbackResult.rolledBackMigrations.length} migrations`
);
```

## Advanced Features

### 1. Migration Configuration

```javascript
const connectionManager = new ConnectionManager(
  {
    client: 'postgresql',
    connection: {
      /* ... */
    },

    migrations: {
      enabled: true,
      directory: './database/migrations',
      tableName: 'schema_migrations',
      extension: 'js',
      loadExtensions: ['.js', '.ts'],
      sortDirsSeparately: false,
      timeout: 30000,
      validation: {
        enabled: true,
        strictMode: true,
      },
    },
  },
  'connection-name'
);
```

### 2. Migration File Structure

```javascript
// migrations/20231201_002_add_user_profiles.js
export const up = async knex => {
  // Create profiles table
  await knex.schema.createTable('profiles', table => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users');
    table.text('bio');
    table.string('avatar_url');
    table.timestamps(true, true);
  });

  // Add index for performance
  await knex.schema.alterTable('profiles', table => {
    table.index('user_id');
  });
};

export const down = async knex => {
  await knex.schema.dropTable('profiles');
};

// Optional: Migration metadata
export const config = {
  transaction: true, // Run in transaction (default)
  timeout: 60000, // Custom timeout for this migration
};
```

### 3. Rollback Strategies

```javascript
// Rollback last batch
await connectionManager.rollback();

// Rollback to specific migration
await connectionManager.rollback({ to: '20231201_001' });

// Rollback all migrations
await connectionManager.rollback({ all: true });
```

## API Reference

### MigrationManager Methods

#### `constructor(config, connectionName)`

Creates a new MigrationManager instance for a specific connection.

**Parameters:**

- `config` (Object) - Migration configuration options
- `connectionName` (string) - Name of the connection this manager serves

#### `async initialize()`

Initializes the MigrationManager and sets up migration tracking tables.

**Returns:** Promise<void>

#### `async migrate(options)`

Executes all pending migrations.

**Parameters:**

- `options` (Object, optional) - Migration options
  - `timeout` (number) - Custom timeout in milliseconds

**Returns:** Promise<Object> - Migration result with applied migrations

#### `async rollback(options)`

Rolls back previously applied migrations.

**Parameters:**

- `options` (Object, optional) - Rollback options
  - `all` (boolean) - Rollback all migrations
  - `timeout` (number) - Custom timeout in milliseconds

**Returns:** Promise<Object> - Rollback result with rolled back migrations

#### `async getStatus()`

Gets the current migration status and applied migrations.

**Returns:** Promise<Object> - Status information including applied migrations

#### `async shutdown(options)`

Shuts down the MigrationManager and cleans up resources.

**Parameters:**

- `options` (Object, optional) - Shutdown options
  - `timeout` (number) - Shutdown timeout in milliseconds

**Returns:** Promise<void>

### ConnectionManager Migration Methods

#### `async migrate(options)`

Executes migrations using the connection's MigrationManager.

**Parameters:**

- `options` (Object, optional) - Migration options

**Returns:** Promise<Object> - Migration result

**Throws:** Error when MigrationManager not initialized or migration fails

#### `async rollback(options)`

Reverts migrations using the connection's MigrationManager.

**Parameters:**

- `options` (Object, optional) - Rollback options

**Returns:** Promise<Object> - Rollback result

**Throws:** Error when MigrationManager not initialized or rollback fails

## Configuration

### MigrationManager Configuration

```javascript
const connectionManager = new ConnectionManager(
  {
    // Database connection config
    client: 'postgresql',
    connection: {
      /* ... */
    },

    // MigrationManager configuration
    migrations: {
      enabled: true, // Enable MigrationManager
      directory: './migrations', // Migration files directory
      tableName: 'knex_migrations', // Migration tracking table
      extension: 'js', // Default file extension
      loadExtensions: ['.js', '.ts'], // Supported extensions
      sortDirsSeparately: false, // Sort directories separately
      timeout: 30000, // Default timeout (30 seconds)
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

#### `migrations.enabled` (boolean, default: `true`)

Enables or disables the MigrationManager component.

```javascript
migrations: {
  enabled: false; // Disables migration management
}
```

#### `migrations.directory` (string, default: `'./migrations'`)

Directory containing migration files.

```javascript
migrations: {
  directory: './database/migrations';
}
```

#### `migrations.tableName` (string, default: `'knex_migrations'`)

Name of the table used to track migration state.

```javascript
migrations: {
  tableName: 'schema_migrations';
}
```

#### `migrations.extension` (string, default: `'js'`)

Default file extension for migration files.

```javascript
migrations: {
  extension: 'ts'; // Use TypeScript files
}
```

#### `migrations.timeout` (number, default: `30000`)

Default timeout for migration operations in milliseconds.

```javascript
migrations: {
  timeout: 60000; // 60 second timeout
}
```

### Environment-Specific Configuration

#### Development Configuration

```javascript
migrations: {
  enabled: true,
  directory: './migrations',
  timeout: 60000,           // Longer timeout for development
  validation: {
    enabled: true,          // Catch errors early
    strictMode: true
  }
}
```

#### Production Configuration

```javascript
migrations: {
  enabled: true,
  directory: './dist/migrations',
  timeout: 30000,           // Standard timeout
  validation: {
    enabled: true,          // Always validate in production
    strictMode: true
  }
}
```

#### Testing Configuration

```javascript
migrations: {
  enabled: true,
  directory: './test/migrations',
  timeout: 10000,           // Faster timeout for tests
  validation: {
    enabled: true,
    strictMode: false       // More lenient for test migrations
  }
}
```

## Examples

### Complete Migration Workflow

```javascript
import { ConnectionManager } from 'rapid-objection';

// Initialize connection with migration support
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
    migrations: {
      enabled: true,
      directory: './migrations',
      tableName: 'knex_migrations',
    },
  },
  'main-db'
);

try {
  // Initialize connection
  await connectionManager.initialize();

  // Check migration status
  const status = await connectionManager.getMigrationStatus();
  console.log(`Pending migrations: ${status.pendingMigrations.length}`);

  // Run migrations
  const result = await connectionManager.migrate();
  console.log(`Applied ${result.appliedMigrations.length} migrations`);

  // Your application logic here
} catch (error) {
  console.error('Migration failed:', error);

  // Rollback on error
  try {
    await connectionManager.rollback();
    console.log('Successfully rolled back migrations');
  } catch (rollbackError) {
    console.error('Rollback failed:', rollbackError);
  }
} finally {
  await connectionManager.shutdown();
}
```

### Migration File Examples

#### Basic Table Creation

```javascript
// migrations/20231201_001_create_users.js
export const up = async knex => {
  return knex.schema.createTable('users', table => {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('name').notNullable();
    table.string('password_hash').notNullable();
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
  });
};

export const down = async knex => {
  return knex.schema.dropTable('users');
};
```

#### Complex Schema Changes

```javascript
// migrations/20231201_002_add_user_roles.js
export const up = async knex => {
  // Create roles table
  await knex.schema.createTable('roles', table => {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.text('description');
    table.timestamps(true, true);
  });

  // Create user_roles junction table
  await knex.schema.createTable('user_roles', table => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .unsigned()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('role_id')
      .unsigned()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table.timestamps(true, true);
    table.unique(['user_id', 'role_id']);
  });

  // Insert default roles
  await knex('roles').insert([
    { name: 'admin', description: 'Administrator role' },
    { name: 'user', description: 'Standard user role' },
  ]);
};

export const down = async knex => {
  await knex.schema.dropTable('user_roles');
  await knex.schema.dropTable('roles');
};
```

#### Data Migration

```javascript
// migrations/20231201_003_migrate_user_data.js
export const up = async knex => {
  // Add new column
  await knex.schema.alterTable('users', table => {
    table.string('full_name');
  });

  // Migrate existing data
  const users = await knex('users').select('id', 'name');
  for (const user of users) {
    await knex('users').where('id', user.id).update({ full_name: user.name });
  }

  // Remove old column
  await knex.schema.alterTable('users', table => {
    table.dropColumn('name');
  });
};

export const down = async knex => {
  // Add back old column
  await knex.schema.alterTable('users', table => {
    table.string('name');
  });

  // Migrate data back
  const users = await knex('users').select('id', 'full_name');
  for (const user of users) {
    await knex('users').where('id', user.id).update({ name: user.full_name });
  }

  // Remove new column
  await knex.schema.alterTable('users', table => {
    table.dropColumn('full_name');
  });
};
```

## Best Practices

### 1. Migration File Organization

```javascript
// Use descriptive, sequential naming
migrations/
├── 20231201_001_create_users_table.js
├── 20231201_002_create_posts_table.js
├── 20231201_003_add_user_profiles.js
├── 20231202_001_add_post_categories.js
└── 20231202_002_migrate_legacy_data.js
```

### 2. Always Provide Down Migrations

```javascript
// Every migration should have a corresponding down function
export const up = async knex => {
  // Forward migration
};

export const down = async knex => {
  // Reverse migration - should undo everything in up()
};
```

### 3. Use Transactions for Data Safety

```javascript
// Migrations run in transactions by default
export const up = async knex => {
  // All operations in this function run in a single transaction
  await knex.schema.createTable('users' /* ... */);
  await knex('users').insert(/* initial data */);
  // If any operation fails, entire migration is rolled back
};

// Disable transactions only when necessary
export const config = {
  transaction: false, // Use for operations that can't run in transactions
};
```

### 4. Handle Large Data Migrations

```javascript
// For large datasets, process in batches
export const up = async knex => {
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await knex('old_table')
      .select('*')
      .limit(batchSize)
      .offset(offset);

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    // Process batch
    const transformedData = batch.map(row => ({
      // Transform data
    }));

    await knex('new_table').insert(transformedData);
    offset += batchSize;
  }
};
```

### 5. Testing Migrations

```javascript
// Test both up and down migrations
describe('User table migration', () => {
  let connectionManager;

  beforeEach(async () => {
    connectionManager = new ConnectionManager(testConfig, 'test');
    await connectionManager.initialize();
  });

  afterEach(async () => {
    await connectionManager.shutdown();
  });

  it('should create users table', async () => {
    await connectionManager.migrate();

    const hasTable = await connectionManager.knex.schema.hasTable('users');
    expect(hasTable).toBe(true);
  });

  it('should rollback users table', async () => {
    await connectionManager.migrate();
    await connectionManager.rollback();

    const hasTable = await connectionManager.knex.schema.hasTable('users');
    expect(hasTable).toBe(false);
  });
});
```
