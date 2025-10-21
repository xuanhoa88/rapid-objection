# 🚀 Rapid-Objection

**Professional database management system with one-way flow architecture**

A powerful, production-ready database management framework built on Knex.js and
Objection.js, designed for multi-app orchestration with comprehensive
auto-execution capabilities, rollback operations, and advanced connection
management.

## ✨ Key Features

### 🎯 **Multi-App Orchestration**

- **AppRegistry**: Central orchestrator managing multiple database connections
- **Connection Sharing**: Intelligent connection reuse with reference counting
- **Isolated Operations**: Each app operates independently with its own
  connection context
- **Resource Management**: Automatic cleanup and proper resource disposal

### ⚡ **Auto-Execution Engine**

- **Auto-Migrations**: Automatically run pending migrations on app registration
- **Auto-Seeding**: Automatically populate database with seed data
- **Auto-Model Registration**: Automatically register Objection.js models
- **Configurable Behavior**: Enable/disable auto-operations per component

### 🛡️ **Comprehensive Rollback System**

- **Sequential Rollback**: Proper dependency-aware rollback (seeds → migrations
  → models)
- **Error Resilience**: Continues cleanup even on partial failures
- **Force Cleanup**: Ensures complete cleanup in all scenarios
- **Rich Monitoring**: Detailed events for operational visibility

### 🔧 **Advanced Connection Management**

- **Connection Pooling**: Efficient database connection management
- **Timeout Protection**: Prevents hanging operations
- **Graceful Shutdown**: Clean resource disposal on app termination

### 📊 **Professional Features**

- **Security Manager**: Secure database connection creation
- **Transaction Manager**: Advanced transaction handling with isolation levels
- **Migration Manager**: Comprehensive schema migration system
- **Enhanced BaseModel**: Professional Objection.js extension with security
  validation
- **Plugin System**: Extensible architecture with dynamic plugin loading

### 🔒 **Security-First Validation**

- **ReDoS Protection**: Prevents Regular Expression Denial of Service attacks
- **Pattern Safety**: Validates regex patterns for dangerous constructs
- **Input Validation**: Comprehensive validation before RegExp creation
- **Security Annotations**: ESLint security compliance for dynamic patterns
- **Rich Error Context**: Detailed validation errors with field-level
  information

### 🔌 **Plugin System**

- **Dynamic Loading**: Runtime plugin management with timeout protection
- **Lifecycle Hooks**: Rich integration points with AppRegistry events
- **Concurrent Loading**: Optimized batch processing for multiple plugins
- **Error Isolation**: Plugin failures don't affect core system stability
- **Seed Manager**: Flexible database seeding with rollback support
- **Model Manager**: Dynamic Objection.js model registration and management

## 🏗️ Architecture

### One-Way Flow Design

```
AppRegistry (Orchestrator)
    ├── ConnectionManager (Per-App Instance)
    │   ├── SecurityManager
    │   ├── MigrationManager
    │   ├── SeedManager
    │   ├── ModelManager
    │   └── TransactionManager
    ├── PluginManager (Extensibility)
    │   ├── Plugin Loading & Lifecycle
    │   ├── Event Coordination
    │   └── Plugin Ecosystem
    │       ├── @rapid-objection/backup-plugin
    │       ├── @rapid-objection/monitoring-plugin
    │       └── Custom Plugins
    └── Shared Services
        ├── ConfigurationManager
```

## 🔌 Plugin System

Rapid-objection features a powerful plugin system that allows you to extend
functionality without modifying the core:

### Key Features

- **🔧 Extensible**: Add optional features through plugins
- **⚡ Performant**: Optimized loading with controlled concurrency
- **🛡️ Robust**: Comprehensive error handling and timeout protection
- **🎯 Developer-Friendly**: Rich API and clear lifecycle hooks

### Quick Plugin Example

```javascript
import { AppRegistry } from 'rapid-objection';

const appRegistry = new AppRegistry({
  plugins: {
    'backup-plugin': {
      enabled: true,
      module: '@rapid-objection/backup-plugin',
      config: {
        directory: './backups',
        schedule: '0 2 * * *', // Daily at 2 AM
      },
    },
  },
});

// Initialize with plugins
const result = await appRegistry.initialize();
console.log(`Loaded ${result.pluginCount} plugins`);
```

📚 **[Complete Plugin Documentation](./docs/PLUGIN_SYSTEM.md)**

## 🚀 Quick Start

### Installation

Install using your preferred package manager:

```bash
# npm
npm install rapid-objection

# yarn
yarn add rapid-objection

# pnpm
pnpm add rapid-objection
```

### Basic Usage

```javascript
import { AppRegistry } from 'rapid-objection';

// Initialize the registry
const appRegistry = new AppRegistry({
  registry: {
    shutdownTimeout: 30000,
    healthCheckInterval: 60000,
  },
});

await appRegistry.initialize();

// Register an app with auto-execution
const connection = await appRegistry.registerApp('myApp', {
  database: {
    client: 'postgresql',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'user',
      password: 'password',
      database: 'mydb',
    },
  },

  // Auto-execute migrations
  migrations: {
    enabled: true,
    directory: './migrations',
  },

  // Auto-execute seeds
  seeds: {
    enabled: true,
    directory: './seeds',
  },

  // Auto-register models
  models: {
    enabled: true,
    definitions: {
      User: {
        tableName: 'users',
        schema: {
          timestamps: true,
          validation: {
            required: ['email', 'name'],
          },
        },
      },
      Post: {
        tableName: 'posts',
        schema: {
          timestamps: true,
          validation: {
            required: ['title', 'user_id'],
          },
        },
      },
    },
  },
});

// Models are now ready to use!
const User = connection.getModel('User');
const users = await User.query();
```

## 📋 Configuration

### AppRegistry Configuration

```javascript
const config = {
  // Registry-level settings
  registry: {
    shutdownTimeout: 30000, // Timeout for app shutdown
    healthCheckInterval: 60000, // Health check interval (0 = disabled)
  },
};
```

### App-Level Configuration

```javascript
const appConfig = {
  // Database connection (required)
  database: {
    client: 'postgresql', // Database client
    connection: {
      /* ... */
    }, // Connection details
  },

  // Migration settings
  migrations: {
    enabled: true, // Enable auto-migration
    directory: './migrations', // Migration directory
    tableName: 'knex_migrations', // Migration table name
  },

  // Seed settings
  seeds: {
    enabled: true, // Enable auto-seeding
    directory: './seeds', // Seed directory
  },

  // Model settings
  models: {
    enabled: true, // Enable auto-registration
    definitions: {
      // Model definitions
      ModelName: {
        tableName: 'table_name',
        schema: {
          timestamps: true, // Enable created_at/updated_at
          softDeletes: true, // Enable soft deletes
          validation: {
            required: ['field1'], // Required fields
            types: {
              // Field type validation
              email: 'string',
              age: 'number',
            },
          },
        },
      },
    },
  },

  // Security settings
  security: {
    enabled: true, // Enable security features
    ssl: false, // SSL configuration
  },

  // Transaction settings
  transactions: {
    enabled: true, // Enable transaction management
    isolationLevel: 'READ_COMMITTED',
  },

  // Plugin settings
  plugins: {
    'backup-plugin': {
      enabled: true, // Enable plugin
      module: '@rapid-objection/backup-plugin',
      config: {
        directory: './backups', // Plugin-specific config
        compression: true,
        schedule: '0 2 * * *', // Daily at 2 AM
      },
    },
    'monitoring-plugin': {
      enabled: true,
      module: '@rapid-objection/monitoring-plugin',
      config: {
        endpoint: 'http://prometheus:9090',
        interval: 30000,
      },
    },
  },
};
```

## 🔄 Advanced Usage

### Connection Sharing

```javascript
// Register first app
const connection1 = await appRegistry.registerApp('app1', {
  database: {
    /* config */
  },
  reusable: true, // Make connection shareable
});

// Reuse connection for second app
const connection2 = await appRegistry.registerApp('app2', {
  useConnection: 'app1', // Reuse app1's connection
});
```

### Manual Operations

```javascript
// Manual migration control
await connection.runMigrations({ to: 'latest' });
await connection.rollbackMigrations({ step: 1 });

// Manual seeding control
await connection.runSeeds();
await connection.rollbackSeeds({ steps: 2 });

// Manual model management
const User = await connection.registerModel('User', {
  tableName: 'users',
  schema: { timestamps: true },
});

const models = await connection.registerModels({
  User: { tableName: 'users' },
  Post: { tableName: 'posts' },
});
```

### Transaction Management

```javascript
// Execute within transaction
const result = await connection.withTransaction(async trx => {
  const user = await User.query(trx).insert({ name: 'John' });
  const post = await Post.query(trx).insert({
    title: 'Hello World',
    user_id: user.id,
  });
  return { user, post };
});

// Advanced transaction options
await connection.withTransaction(
  async trx => {
    // Transaction logic
  },
  {
    isolationLevel: 'SERIALIZABLE',
    timeout: 30000,
  }
);
```

### Monitoring & Events

```javascript
// Monitor app lifecycle
appRegistry.on('app-registered', data => {
  console.log(`App ${data.appName} registered`);
});

appRegistry.on('app-unregistered', data => {
  console.log(`App ${data.appName} unregistered`);
});

// Monitor auto-operations
appRegistry.on('auto-migration-completed', data => {
  console.log(`Migrations completed for ${data.appName}`);
});

appRegistry.on('auto-seed-completed', data => {
  console.log(`Seeds completed for ${data.appName}`);
});

// Monitor rollback operations
appRegistry.on('app-rollback-completed', data => {
  console.log(`Rollback completed in ${data.duration}ms`);
  console.log('Operations:', data.operations);
});
```

## 🛠️ API Reference

### AppRegistry

#### Methods

- `initialize()` - Initialize the registry
- `registerApp(name, config)` - Register a new app
- `unregisterApp(name, options)` - Unregister an app
- `getApp(name)` - Get registered app connection
- `getStatus()` - Get comprehensive status
- `shutdown(options)` - Shutdown all apps

#### Events

- `initialized` - Registry initialized
- `app-registered` - App registered successfully
- `app-unregistered` - App unregistered successfully
- `auto-migration-started/completed` - Migration auto-execution
- `auto-seed-started/completed` - Seed auto-execution
- `auto-model-registration-started/completed` - Model auto-registration
- `app-rollback-started/completed/failed` - Rollback operations

### ConnectionManager

#### Methods

- `initialize()` - Initialize connection and components
- `runMigrations(options)` - Execute migrations
- `rollbackMigrations(options)` - Rollback migrations
- `runSeeds(options)` - Execute seeds
- `rollbackSeeds(options)` - Rollback seeds
- `registerModel(name, definition)` - Register single model
- `registerModels(definitions)` - Register multiple models
- `getModel(name)` - Get registered model
- `clearModels()` - Clear all models
- `withTransaction(callback, options)` - Execute in transaction
- `getStatus()` - Get connection status
- `shutdown()` - Shutdown connection

## 🔒 Security Features

- **Secure Connection Creation**: Validated database connections
- **Input Validation**: Comprehensive parameter validation
- **Path Safety**: Safe file system operations
- **SQL Injection Prevention**: Parameterized queries via Knex.js
- **Connection Pooling**: Secure connection management

## 📈 Performance Features

- **Connection Reuse**: Efficient resource utilization
- **Pool Warming**: Pre-warmed connection pools
- **Timeout Management**: Prevents hanging operations
- **Memory Management**: Proper cleanup and garbage collection

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 📝 Migration Example

```javascript
// migrations/001_create_users.js
exports.up = function (knex) {
  return knex.schema.createTable('users', function (table) {
    table.increments('id');
    table.string('email').notNullable().unique();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
```

## 🌱 Seed Example

```javascript
// seeds/001_users.js
exports.seed = function (knex) {
  return knex('users')
    .del()
    .then(function () {
      return knex('users').insert([
        { email: 'john@example.com', name: 'John Doe' },
        { email: 'jane@example.com', name: 'Jane Smith' },
      ]);
    });
};
```

## 🎯 Enhanced BaseModel Example

### 🏗️ Architecture

**Key Features:**

- ✅ **Module-Level Functions**: Plugin storage and helpers outside class for
  better encapsulation
- ✅ **Async Hooks**: All 6 Objection.js hooks are async for consistent error
  handling
- ✅ **Configurable Exclusions**: No hardcoded defaults, fully user-configurable
- ✅ **Field Transformations**: Support for creating computed fields
- ✅ **WeakMap Storage**: Plugin metadata in module-level WeakMap for dynamic
  class support
- ✅ **True Private Fields**: Only uses `#` prefix for private fields, no fake
  `_` prefix methods

```javascript
import { BaseModel } from 'rapid-objection';

// Professional BaseModel with comprehensive features
class User extends BaseModel {
  static get tableName() {
    return 'users';
  }

  static get schema() {
    return {
      // Configurable field exclusion (no hardcoded defaults)
      alwaysExclude: ['password', 'ssn', 'api_key'],
      internalFields: ['admin_notes', 'debug_data'],
      publicExclude: ['legacy_field'],

      // Timestamps
      timestamps: true,
      timestampColumns: {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },

      // Soft deletes
      softDeletes: true,
      softDeleteColumn: 'deleted_at',

      // Validation rules
      validation: {
        // Required field validation
        required: ['email', 'name'],

        // Type validation with detailed error reporting
        types: {
          email: 'string',
          name: 'string',
          age: 'number',
        },

        // String length constraints
        length: {
          name: { min: 2, max: 50 },
          email: { max: 100 },
        },

        // Secure pattern matching with ReDoS protection
        patterns: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // RegExp object (secure)
          phone: '^\\+?[1-9]\\d{1,14}$', // String pattern (validated for security)
        },

        // Numeric range validation
        range: {
          age: { min: 0, max: 120 },
        },

        // Custom business logic validation
        custom: {
          email: value => {
            if (value && value.includes('+')) {
              return 'Email addresses cannot contain + symbols';
            }
            return true;
          },
        },
      },
    };
  }

  // Async hooks for proper error handling
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    // Your async logic here
  }

  async $beforeUpdate(opt, queryContext) {
    await super.$beforeUpdate(opt, queryContext);
    // Your async logic here
  }

  static get relationMappings() {
    return {
      posts: {
        relation: BaseModel.HasManyRelation,
        modelClass: 'Post',
        join: {
          from: 'users.id',
          to: 'posts.user_id',
        },
      },
    };
  }
}
```

### 🔒 Security Validation in Action

```javascript
// The enhanced BaseModel provides comprehensive security validation
try {
  const user = new User({
    name: 'A', // Too short (min: 2)
    email: 'invalid-email', // Pattern mismatch
    age: 'twenty-five', // Wrong type
    phone: '(?:a+)+', // Dangerous ReDoS pattern - automatically rejected!
  });

  await user.$validate();
} catch (error) {
  console.log(error.type); // 'ValidationError'
  console.log(error.fields); // ['name', 'email', 'age', 'phone']

  // Rich error context for each validation failure:
  error.data.forEach(err => {
    console.log(`${err.field}: ${err.message}`);
    // name: name must be at least 2 characters long
    // email: email does not match the required pattern
    // age: age must be of type number, got string
    // phone: Pattern contains potentially dangerous constructs that could cause ReDoS
  });
}
```

**🔒 Security Benefits:**

- **ReDoS Attack Prevention**: Automatically detects and blocks dangerous regex
  patterns
- **Input Validation**: Comprehensive validation before expensive operations
- **Security Compliance**: ESLint security annotations and OWASP compliance
- **Production Safety**: Professional validation suitable for high-security
  environments
- **Developer Guidance**: Clear error messages help developers avoid security
  pitfalls

### 📤 Public JSON Serialization

```javascript
const user = await User.query().findById(1);

// Basic usage - respects schema configuration
const publicData = user.toPublicJSON();
// Excludes: password, ssn, api_key (alwaysExclude)
// Excludes: admin_notes, debug_data (internalFields)
// Excludes: legacy_field (publicExclude)

// With preset
const minimal = user.toPublicJSON({ preset: 'minimal' });

// With field transformations (can create new computed fields)
const transformed = user.toPublicJSON({
  transform: {
    email: email => email.toLowerCase(),
    display_name: (_, obj) => `${obj.first_name} ${obj.last_name}`,
    age_group: (_, obj) => (obj.age < 18 ? 'minor' : 'adult'),
  },
});

// With custom exclusions and inclusions
const custom = user.toPublicJSON({
  exclude: ['internal_notes'],
  includeTimestamps: true,
  includeInternal: true, // Include internalFields
});
```

**✨ Serialization Features:**

- **Configurable Exclusions**: Define `alwaysExclude`, `internalFields`,
  `publicExclude` in schema
- **Field Transformations**: Transform existing fields or create new computed
  fields
- **Presets**: Predefined configurations (minimal, standard, full, admin)
- **No Hardcoded Defaults**: Everything is user-configurable through schema

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- 📖 [Documentation](https://github.com/xuanhoa88/rapid-objection/docs)
- 🔌 [Plugin System Guide](./docs/PLUGIN_SYSTEM.md)
- 🐛 [Issue Tracker](https://github.com/xuanhoa88/rapid-objection/issues)
- 💬 [Discussions](https://github.com/xuanhoa88/rapid-objection/discussions)

---

**Built with ❤️ for professional database management**
