# Model Management with Objection.js

The ModelManager provides seamless integration with Objection.js models in the
rapid-objection one-way flow architecture. Each ConnectionManager has its own
ModelManager that handles models specific to that database connection.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Basic Usage](#basic-usage)
- [Advanced Features](#advanced-features)
  - [Model Sharing and Extension](#model-sharing-and-extension)
  - [Plugin System](#plugin-system)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The ModelManager follows the one-way flow design pattern where:

- **ConnectionManager** creates and owns a **ModelManager**
- **ModelManager** serves exactly one database connection
- Models are automatically bound to the connection's Knex instance
- Each connection has isolated model registration and management

### Key Features

- **✅ One-Way Flow Architecture**: Clear downward dependency flow
- **✅ Connection-Specific**: Each ModelManager serves one database connection
- **✅ Automatic Knex Binding**: Models automatically bound to connection's Knex
  instance
- **✅ Dynamic Model Creation**: Create Objection.js models from simple
  definitions
- **✅ Comprehensive Validation**: ModelValidator ensures Objection.js
  compliance
- **✅ Enhanced BaseModel**: Clean, focused Objection.js extension with plugin
  support
- **✅ Plugin System**: Full Objection.js plugin/mixin support with lifecycle
  management
- **✅ Built-in Plugins**: Timestamp, soft delete, and validation plugins
  included
- **✅ Plugin Composition**: Support for multiple plugin application strategies
- **✅ Shared Constants**: DRY principle with consolidated constants
- **✅ Event-Driven**: Rich event emission for monitoring and debugging
- **✅ Production Ready**: Robust error handling and comprehensive testing

## Architecture

### One-Way Flow Design

```
ConnectionManager
    ↓ (creates & owns)
ModelManager
    ↓ (uses)
├── ModelValidator (validation)
├── BaseModel (Objection.js extension)
└── ModelConstants (shared constants)
    ↓
Knex Instance ←→ Registered Models
    ↓
Objection.js Models
```

### Component Responsibilities

- **ConnectionManager**: Creates ModelManager, provides model API methods
- **ModelManager**: Manages model registration, lifecycle, and Knex binding
- **ModelValidator**: Validates model definitions against Objection.js standards
- **BaseModel**: Enhanced Objection.js Model with additional features
- **ModelConstants**: Shared constants for hooks, relations, and SQL keywords

### One-Way Flow Benefits

1. **✅ Clear Ownership**: Each ModelManager belongs to exactly one
   ConnectionManager
2. **✅ Isolated State**: Models are isolated per connection with no shared
   state
3. **✅ Simplified Dependencies**: Clean downward flow, no circular dependencies
4. **✅ Easy Testing**: Straightforward behavior with predictable interactions
5. **✅ Better Performance**: No overhead from complex multi-connection
   management
6. **✅ Enhanced Maintainability**: Focused components with single
   responsibilities

## Components

The ModelManager consists of 5 focused components:

### 1. **ModelManager.js** (14.4KB)

**Core model management for single database connection**

```javascript
// Connection-specific model manager
const modelManager = new ModelManager(config, 'user-service');

// Register models with automatic Knex binding
const UserModel = await modelManager.registerModel('User', {
  tableName: 'users',
  schema: { timestamps: true },
  relations: { posts: { ... } }
});
```

**Key Features:**

- ✅ One-way flow architecture (serves ConnectionManager only)
- ✅ Dynamic model creation from simple definitions
- ✅ Automatic Knex instance binding
- ✅ Lifecycle hook management
- ✅ Event emission for monitoring

### 2. **ModelValidator.js** (11.7KB)

**Comprehensive Objection.js validation**

```javascript
// Validates model definitions against Objection.js standards
const validator = new ModelValidator();
validator.validateModelDefinition('User', {
  tableName: 'users',
  jsonSchema: { type: 'object', properties: { ... } },
  relations: { posts: { relation: 'HasManyRelation', ... } },
  hooks: { $beforeInsert: () => { ... } }
});
```

**Validation Coverage:**

- ✅ SQL identifier rules for table names
- ✅ Reserved SQL keyword checking
- ✅ Objection.js relation types and structure
- ✅ Lifecycle hook validation (13 official hooks)
- ✅ JSON Schema validation
- ✅ Query modifiers and virtual attributes

### 3. **BaseModel.js**

**Professional Objection.js extension with module-level architecture**

**🏗️ Architecture Highlights:**

- ✅ **Module-Level Functions**: Plugin storage and helpers moved outside class
- ✅ **Async Hooks**: All 6 Objection.js hooks are async for consistent error
  handling
- ✅ **Configurable Exclusions**: No hardcoded defaults, fully user-configurable
- ✅ **Field Transformations**: Support for creating computed fields
- ✅ **WeakMap Storage**: Plugin metadata in module-level WeakMap for dynamic
  class support
- ✅ **True Private Fields**: Only uses `#` prefix for private fields, no fake
  `_` prefix methods

```javascript
// Enhanced BaseModel with comprehensive features
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

      // Validation rules
      validation: {
        required: ['email', 'name'],
        types: { name: 'string', age: 'number' },
        length: {
          name: { min: 2, max: 50 },
          email: { max: 100 },
        },
        patterns: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // RegExp object (secure)
          phone: '^\\+?[1-9]\\d{1,14}$', // String pattern (validated for security)
        },
        range: {
          age: { min: 0, max: 120 },
        },
        custom: {
          password: value => {
            if (!value || value.length < 8)
              return 'Password must be at least 8 characters';
            if (!/[A-Z]/.test(value))
              return 'Password must contain uppercase letter';
            if (!/[0-9]/.test(value)) return 'Password must contain a number';
            return true;
          },
        },
      },
    };
  }
}
```

**🔒 Security Features:**

- ✅ **ReDoS Protection**: Validates regex patterns to prevent Regular
  Expression Denial of Service attacks
- ✅ **Pattern Safety**: Detects dangerous regex constructs (nested quantifiers,
  consecutive quantifiers)
- ✅ **Input Validation**: Comprehensive validation of pattern strings before
  RegExp creation
- ✅ **Security Annotations**: Proper ESLint security annotations for dynamic
  RegExp usage
- ✅ **DoS Prevention**: Pattern length limits and dangerous pattern detection

**⚡ Enhanced Validation System:**

- ✅ **Required Fields**: Validates mandatory fields with detailed error context
- ✅ **Type Validation**: Ensures correct data types with expected vs actual
  reporting
- ✅ **Length Constraints**: String min/max length validation with actual length
  reporting
- ✅ **Numeric Ranges**: Number min/max validation with boundary checking
- ✅ **Pattern Matching**: Secure regex validation with ReDoS protection
- ✅ **Custom Validators**: Business logic validation with error context
- ✅ **Rich Error Objects**: Detailed validation errors with field, rule, and
  context information

**🎯 Core Features:**

- ✅ Automatic timestamps (created_at, updated_at)
- ✅ Field filtering for API responses (toPublicJSON)
- ✅ Feature detection (hasTimestamps, hasSoftDeletes)
- ✅ Compatible with ModelManager's dynamic model creation
- ✅ Reduced complexity with helper methods for maintainability
- ✅ Full Objection.js feature support

### 4. **ModelConstants.js** (1.9KB)

**Shared constants (DRY principle)**

```javascript
// Consolidated constants used by all components
export const VALID_OBJECTION_HOOKS = [
  '$beforeInsert',
  '$afterInsert',
  '$beforeUpdate',
  '$afterUpdate',
  '$beforeDelete',
  '$afterDelete',
  '$beforeFind',
  '$afterFind',
  '$beforeValidate',
  '$afterValidate',
  '$formatJson',
  '$parseJson',
  '$formatDatabaseJson',
  '$parseDatabaseJson',
];

export const VALID_RELATION_TYPES = [
  'HasOneRelation',
  'BelongsToOneRelation',
  'HasManyRelation',
  'ManyToManyRelation',
  'HasOneThroughRelation',
];

export const RESERVED_SQL_KEYWORDS = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'FROM',
  'WHERE',
  // ... 60+ SQL keywords
];
```

**Benefits:**

- ✅ Single source of truth for all constants
- ✅ No code duplication between components
- ✅ Easy maintenance and updates
- ✅ Exportable for external use

### 5. **index.js** (298B)

**Clean component exports**

```javascript
// Main exports
export { ModelManager } from './ModelManager';
export { BaseModel } from './BaseModel';
export { ModelValidator } from './ModelValidator';

// Shared constants
export * from './ModelConstants';
```

**Structure Benefits:**

- ✅ 60% smaller than previous complex implementation
- ✅ No redundant or broken dependencies
- ✅ Focused single-responsibility components
- ✅ Clean, maintainable codebase

## Basic Usage

### 1. Initialize ConnectionManager with Model Support

```javascript
import { ConnectionManager } from 'rapid-objection';

const connectionManager = new ConnectionManager(
  {
    client: 'postgresql',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'password',
      database: 'myapp',
    },
  },
  'main'
);

// Initialize with model support
await connectionManager.initialize();
```

### 2. Register Models - Two Approaches

The ModelManager supports **two registration approaches** using the same unified
API:

#### A. Pre-defined Model Classes (NEW)

```javascript
import { Model } from 'objection';

// Define your model class
class User extends Model {
  static get tableName() {
    return 'users';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['email'],
      properties: {
        id: { type: 'integer' },
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string', minLength: 1, maxLength: 255 },
        lastName: { type: 'string', minLength: 1, maxLength: 255 },
      },
    };
  }

  static get relationMappings() {
    return {
      posts: {
        relation: Model.HasManyRelation,
        modelClass: 'Post',
        join: {
          from: 'users.id',
          to: 'posts.userId',
        },
      },
    };
  }

  // Custom instance methods
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  async getPosts() {
    return await this.$relatedQuery('posts');
  }
}

// Register the pre-defined class directly
const UserModel = await connectionManager.registerModel('User', User);

// Use the model (same as any Objection.js model)
const user = await UserModel.query().insert({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
});

console.log(user.fullName); // "John Doe"
const posts = await user.getPosts();
```

#### B. Model Definition Objects (EXISTING)

```javascript
// Register a model with definition object
const UserModel = await connectionManager.registerModel('User', {
  tableName: 'users',
  schema: {
    timestamps: true,
    validation: {
      required: ['email'],
    },
  },
  relations: {
    posts: {
      relation: 'HasManyRelation',
      modelClass: 'Post',
      join: {
        from: 'users.id',
        to: 'posts.user_id',
      },
    },
  },
});

// Use the dynamically created model
const user = await UserModel.query().insert({
  email: 'john@example.com',
  name: 'John Doe',
});
```

### 3. Register Multiple Models (Mixed Types)

You can register multiple models at once, mixing both pre-defined classes and
definition objects:

```javascript
// Pre-defined model classes
class User extends Model {
  static get tableName() {
    return 'users';
  }
  // ... model definition
}

class Post extends Model {
  static get tableName() {
    return 'posts';
  }
  // ... model definition
}

// Mixed registration: classes + definition objects
const models = await connectionManager.registerModels({
  // Pre-defined model class
  User: User,

  // Pre-defined model class
  Post: Post,

  // Definition object (dynamic model creation)
  Comment: {
    tableName: 'comments',
    schema: {
      timestamps: true,
      properties: {
        id: { type: 'integer' },
        content: { type: 'string' },
        postId: { type: 'integer' },
        userId: { type: 'integer' },
      },
    },
    relations: {
      post: {
        relation: 'BelongsToOneRelation',
        modelClass: 'Post',
        join: {
          from: 'comments.postId',
          to: 'posts.id',
        },
      },
      author: {
        relation: 'BelongsToOneRelation',
        modelClass: 'User',
        join: {
          from: 'comments.userId',
          to: 'users.id',
        },
      },
    },
  },

  // Another definition object
  Category: {
    tableName: 'categories',
    schema: {
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
});

// Access registered models
const { User, Post, Comment, Category } = models;

// Use the models
const user = await User.query().insert({ email: 'user@example.com' });
const post = await Post.query().insert({
  title: 'Hello World',
  userId: user.id,
});
const comment = await Comment.query().insert({
  content: 'Great post!',
  postId: post.id,
  userId: user.id,
});
```

### 4. Registration Types and Events

The ModelManager distinguishes between different registration types and emits
events accordingly:

```javascript
// Listen for model registration events
connectionManager.on('model-registered', event => {
  console.log(`Model registered: ${event.modelName}`);
  console.log(`Table: ${event.tableName}`);
  console.log(`Type: ${event.registrationType}`); // 'class' or 'definition'
  console.log(`Total models: ${event.totalModels}`);
});

// Register different types
await connectionManager.registerModel('User', UserClass); // registrationType: 'class'
await connectionManager.registerModel('Comment', commentDef); // registrationType: 'definition'
```

#### Registration Type Benefits:

**Pre-defined Classes (`registrationType: 'class'`)**:

- ✅ Full control over model implementation
- ✅ Custom methods and computed properties
- ✅ Complex business logic
- ✅ IDE support and type checking
- ✅ Easier testing and debugging
- ✅ Reusable across different connections

**Definition Objects (`registrationType: 'definition'`)**:

- ✅ Quick model creation from configuration
- ✅ Dynamic model generation
- ✅ Configuration-driven development
- ✅ Simpler for basic CRUD operations
- ✅ Less boilerplate code
- ✅ Good for generated or templated models

### 5. Access Registered Models

```javascript
// Get a specific model
const UserModel = connectionManager.getModel('User');

// Get all models
const allModels = connectionManager.getModels();

// Get model names
const modelNames = connectionManager.getModelNames();

// Check if model exists
const hasUser = connectionManager.hasModel('User');
```

## Advanced Features

### Model Sharing and Extension

The ModelManager provides a secure and flexible model sharing system that allows
controlled extension of models while protecting against accidental overwrites.

#### Default Behavior: Protected Models

By default, all models are **NOT shared** and are protected from duplication:

```javascript
class UserModel extends Model {
  static get tableName() {
    return 'users';
  }
  // No isShared flag = protected from duplication
}

// First registration succeeds
await connectionManager.registerModel('User', UserModel);

// Second registration throws error
await connectionManager.registerModel('User', OtherModel);
// ❌ Error: Cannot register model 'User': A model with this name already exists and is not shared.
//    Set 'isShared: true' on the existing model to allow extension.
```

#### Enabling Model Sharing

To allow a model to be extended, set the `isShared` flag to `true`:

**For Model Classes:**

```javascript
class SharedUserModel extends Model {
  static get tableName() {
    return 'users';
  }

  static get isShared() {
    return true; // Allow this model to be extended
  }

  // Base functionality
  getName() {
    return this.name;
  }
}

// First registration
await connectionManager.registerModel('User', SharedUserModel);

// Second registration creates inherited model
class EnhancedUserModel extends Model {
  static get tableName() {
    return 'users';
  }

  // Additional functionality
  getFullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

const InheritedUser = await connectionManager.registerModel(
  'User',
  EnhancedUserModel
);
// ✅ Creates Inherited:User class with methods from both models

// InheritedUser variable contains the Inherited:User class
const user = await InheritedUser.query().findById(1);
console.log(user.getName()); // From SharedUserModel
console.log(user.getFullName()); // From EnhancedUserModel
```

**For Definition Objects:**

```javascript
// Register shared model via definition
await connectionManager.registerModel('Category', {
  tableName: 'categories',
  isShared: true, // Allow extension
  schema: {
    name: { type: 'string' },
    description: { type: 'string' },
  },
});

// Extend with additional properties
await connectionManager.registerModel('Category', {
  tableName: 'categories',
  schema: {
    slug: { type: 'string' },
    metadata: { type: 'object' },
  },
});
// ✅ Creates inherited model with combined schema
```

#### Use Cases

**1. Library/Framework Models (Shared)**

Use `isShared: true` for base models that applications should extend:

```javascript
// In your library/framework
class BaseUserModel extends Model {
  static get tableName() {
    return 'users';
  }
  static get isShared() {
    return true;
  } // Allow apps to extend

  // Core authentication
  async authenticate(password) {
    return bcrypt.compare(password, this.password_hash);
  }
}
```

**2. Application Models (Private)**

Leave `isShared` false (default) for application-specific models:

```javascript
// In your application
class CustomerModel extends Model {
  static get tableName() {
    return 'customers';
  }
  // No isShared - private to this application

  // Application-specific logic
  calculateLoyaltyPoints() {
    return this.purchases * 10;
  }
}
```

**3. Plugin Extension**

Plugins can extend shared models:

```javascript
// Plugin extends shared base model
class NotificationUserModel extends Model {
  static get tableName() {
    return 'users';
  }

  async sendNotification(message) {
    // Plugin-specific functionality
  }
}

// If BaseUserModel has isShared: true, this creates Inherited:User class
const ExtendedUser = await connectionManager.registerModel(
  'User',
  NotificationUserModel
);
// ✅ Has both authenticate() and sendNotification()
```

#### Security Benefits

1. **✅ Prevents Accidental Overwrites**: Non-shared models throw errors on
   duplicate registration
2. **✅ Explicit Sharing**: Models must explicitly allow extension
3. **✅ Clear Error Messages**: Developers know exactly how to fix issues
4. **✅ Secure by Default**: Models are protected unless marked as shared
5. **✅ Granular Control**: Each model controls its own extension policy

#### Model Inheritance Details

When a shared model is extended:

- **Class Name**: Inherited model naming
- **Methods**: Both base and derived methods are available
- **Static Properties**: Combined from both models
- **Schema**: Merged with derived properties overriding base
- **Relations**: Combined from both models
- **Modifiers**: Combined from both models
- **Virtual Attributes**: Combined from both models

### Plugin System

The BaseModel includes a comprehensive plugin system that fully supports
Objection.js mixins with enhanced lifecycle management, dependency tracking, and
built-in utilities.

#### Plugin Application Methods

**1. Single Plugin Application**

```javascript
// Apply a single plugin with metadata
const TimestampPlugin = Model => {
  return class extends Model {
    $beforeInsert(queryContext) {
      super.$beforeInsert(queryContext);
      this.created_at = new Date();
      this.updated_at = new Date();
    }

    $beforeUpdate(opt, queryContext) {
      super.$beforeUpdate(opt, queryContext);
      this.updated_at = new Date();
    }
  };
};

// Apply plugin with tracking
const UserModel = BaseModel.plugin(TimestampPlugin, {
  name: 'timestamps',
  version: '1.0.0',
  dependencies: [], // Optional dependencies
});
```

**2. Multiple Plugin Application**

```javascript
// Apply multiple plugins efficiently
const UserModel = BaseModel.plugins(TimestampPlugin, SoftDeletePlugin, {
  plugin: ValidationPlugin,
  options: {
    name: 'validation',
    version: '2.0.0',
    strict: true,
  },
});
```

**3. Functional Composition**

```javascript
// Use Objection.js compose for functional style
const composedMixin = BaseModel.compose(
  TimestampPlugin,
  SoftDeletePlugin,
  ValidationPlugin
);

class User extends composedMixin(BaseModel) {
  static get tableName() {
    return 'users';
  }
}
```

#### Plugin Management

**Check Plugin Status**

```javascript
// Check if plugin is applied
const hasTimestamps = UserModel.hasPlugin('timestamps');
const hasPlugin = UserModel.hasPlugin(TimestampPlugin);

// Get plugin metadata
const metadata = UserModel.getPluginMetadata('timestamps');
console.log(metadata);
// {
//   name: 'timestamps',
//   version: '1.0.0',
//   dependencies: [],
//   appliedAt: Date,
//   options: { ... }
// }

// Get all plugin information
const info = UserModel.getPluginInfo();
console.log(info);
// {
//   totalPlugins: 3,
//   pluginNames: ['timestamps', 'softDelete', 'validation'],
//   plugins: [...], // Full metadata array
//   appliedAt: [...], // Application timestamps
//   dependencies: [...] // All unique dependencies
// }
```

#### Built-in Plugins

**1. Timestamp Plugin**

```javascript
// Built-in timestamp plugin with options
const UserModel = BaseModel.plugin(
  BaseModel.timestampPlugin({
    createdAt: true,
    updatedAt: true,
    createdAtColumn: 'created_at',
    updatedAtColumn: 'updated_at',
  }),
  { name: 'timestamps' }
);

// Automatic timestamp handling
const user = await UserModel.query().insert({
  name: 'John Doe',
  email: 'john@example.com',
  // created_at and updated_at automatically added
});
```

**2. Soft Delete Plugin**

```javascript
// Built-in soft delete plugin
const UserModel = BaseModel.plugin(
  BaseModel.softDeletePlugin({
    deletedAtColumn: 'deleted_at',
    includeDeleted: false, // Exclude deleted by default
  }),
  { name: 'softDelete' }
);

// Soft delete functionality
const user = await UserModel.query().findById(1);

// Soft delete (sets deleted_at)
await user.$beforeDelete(); // or user.delete()

// Restore soft deleted record
await user.restore();

// Force delete (permanent)
await user.forceDelete();

// Check if deleted
const isDeleted = user.isDeleted;

// Query excludes soft deleted by default
const activeUsers = await UserModel.query(); // Only non-deleted
```

**3. Enhanced Validation Plugin**

```javascript
// Built-in validation plugin
const UserModel = BaseModel.plugin(
  BaseModel.validationPlugin({
    strict: true, // Throw errors on validation failure
    skipOnUpdate: false, // Validate on updates too
  }),
  { name: 'validation' }
);

// Enhanced validation with operation context
try {
  const user = await UserModel.query().insert({
    name: '', // Invalid - will trigger validation
    email: 'invalid-email',
  });
} catch (error) {
  console.log(error.type); // 'ValidationError'
  console.log(error.operation); // 'insert'
  console.log(error.data); // Detailed validation errors
}
```

#### Plugin Development Best Practices

**1. Follow Objection.js Mixin Pattern**

```javascript
// ✅ Good: Proper mixin pattern
function MyPlugin(Model) {
  return class extends Model {
    // Your enhancements
    static get myPluginFeature() {
      return 'enabled';
    }

    $beforeInsert(queryContext) {
      super.$beforeInsert(queryContext);
      // Your logic
    }
  };
}

// ❌ Bad: Don't modify global objects
function BadPlugin(Model) {
  Model.prototype.badMethod = function () {}; // Don't do this
  return Model;
}
```

**2. Handle Dependencies**

```javascript
// Plugin with dependencies
function AdvancedPlugin(Model) {
  return class extends Model {
    $beforeInsert(queryContext) {
      super.$beforeInsert(queryContext);

      // Use features from dependency plugins
      if (this.constructor.hasPlugin('timestamps')) {
        console.log('Timestamps are available');
      }
    }
  };
}

// Apply with dependency declaration
const UserModel = BaseModel.plugin(TimestampPlugin, {
  name: 'timestamps',
}).plugin(AdvancedPlugin, {
  name: 'advanced',
  dependencies: ['timestamps'], // Will validate dependency exists
});
```

**3. Plugin Configuration**

```javascript
// Plugin factory with options
function ConfigurablePlugin(options = {}) {
  const { feature1 = true, feature2 = 'default' } = options;

  return function ConfigurablePluginMixin(Model) {
    return class extends Model {
      static get pluginConfig() {
        return { feature1, feature2 };
      }

      // Use configuration in methods
      someMethod() {
        if (feature1) {
          // Feature 1 logic
        }
      }
    };
  };
}

// Apply configured plugin
const UserModel = BaseModel.plugin(
  ConfigurablePlugin({ feature1: false, feature2: 'custom' }),
  { name: 'configurable' }
);
```

#### Plugin Integration with ModelManager

```javascript
// Register models with plugins through ModelManager
const models = {
  User: {
    tableName: 'users',
    schema: {
      timestamps: true,
      softDeletes: true,
      validation: {
        required: ['name', 'email'],
        patterns: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },
      },
    },
    // Apply plugins during model registration
    plugins: [
      { plugin: BaseModel.timestampPlugin(), name: 'timestamps' },
      { plugin: BaseModel.softDeletePlugin(), name: 'softDelete' },
      {
        plugin: BaseModel.validationPlugin({ strict: true }),
        name: 'validation',
      },
    ],
  },
};

// ModelManager can handle plugin application
await connectionManager.registerModels(models);
```

### Enhanced Public JSON System

The BaseModel includes a powerful `toPublicJSON()` method for creating clean,
secure API responses with flexible field filtering, transformations, and preset
configurations.

#### Basic Usage

```javascript
class User extends BaseModel {
  static get schema() {
    return {
      timestamps: true,
      publicExclude: ['internal_notes'],
      publicTransforms: {
        email: email => email.toLowerCase(),
      },
    };
  }
}

// Basic usage - excludes sensitive fields by default
const user = await User.query().findById(1);
const publicData = user.toPublicJSON();
// Result: { id: 1, name: 'John', email: 'john@example.com' }
// Excludes: password, created_at, updated_at, deleted_at, etc.
```

#### Field Filtering Options

**Include/Exclude Fields:**

```javascript
// Include only specific fields
const minimal = user.toPublicJSON({
  include: ['id', 'name', 'email'],
});

// Exclude additional fields
const custom = user.toPublicJSON({
  exclude: ['phone', 'address'],
});

// Include timestamps and internal fields
const detailed = user.toPublicJSON({
  includeTimestamps: true,
  includeInternal: true,
});
```

**Conditional Field Inclusion:**

```javascript
// Include soft delete information
const withDeleted = user.toPublicJSON({
  includeSoftDeletes: true,
});

// Admin view with all fields
const adminView = user.toPublicJSON({
  includeTimestamps: true,
  includeSoftDeletes: true,
  includeInternal: true,
});
```

#### Predefined Presets

```javascript
// Available presets: 'minimal', 'standard', 'full', 'admin'
const presets = User.getPublicJSONPresets();

// Minimal preset - only essential fields
const minimal = user.toPublicJSON({ preset: 'minimal' });
// Result: { id: 1, name: 'John', email: 'john@example.com' }

// Standard preset - normal public fields (default behavior)
const standard = user.toPublicJSON({ preset: 'standard' });

// Full preset - includes timestamps
const full = user.toPublicJSON({ preset: 'full' });

// Admin preset - includes everything
const admin = user.toPublicJSON({ preset: 'admin' });
```

#### Field Transformations

**Basic Transformations:**

```javascript
const transformed = user.toPublicJSON({
  transform: {
    email: email => email.toLowerCase(),
    created_at: date => date.toISOString(),
    name: name => name.toUpperCase(),
  },
});
```

**Advanced Transformations:**

```javascript
const advanced = user.toPublicJSON({
  includeTimestamps: true,
  transform: {
    // Mask sensitive data
    email: email => {
      const [username, domain] = email.split('@');
      return `${username.slice(0, 2)}***@${domain}`;
    },

    // Multiple date formats
    created_at: date => ({
      iso: date.toISOString(),
      unix: Math.floor(date.getTime() / 1000),
      formatted: date.toLocaleDateString(),
    }),

    // Computed fields (access to full object)
    display_name: (_, obj) => `${obj.name} (${obj.role})`,

    // Transform nested objects
    profile: profile => ({
      ...profile,
      avatar_url: `${profile.avatar}?size=medium`,
    }),

    // Remove fields (null transformer)
    internal_id: null,
  },
});
```

#### Schema Integration

**Schema-Defined Exclusions:**

```javascript
class User extends BaseModel {
  static get schema() {
    return {
      // Always exclude these fields from public JSON
      publicExclude: ['internal_notes', 'debug_info'],

      // Custom internal fields
      internalFields: ['system_data', 'audit_log'],

      // Custom timestamp columns
      timestampColumns: {
        createdAt: 'created_on',
        updatedAt: 'modified_on',
      },

      // Custom soft delete column
      softDeleteColumn: 'archived_at',

      // Schema-defined transformations
      publicTransforms: {
        email: email => email.toLowerCase(),
        status: status => status.toUpperCase(),
      },
    };
  }
}
```

#### Custom Public JSON Methods

**Method 1: Manual Assignment (Most Flexible)**

```javascript
// Create method and assign manually
const toAPIv1JSON = User.createPublicJSONMethod({
  includeTimestamps: true,
  transform: {
    created_at: date => Math.floor(date.getTime() / 1000), // Unix timestamp
    updated_at: date => Math.floor(date.getTime() / 1000),
  },
  exclude: ['profile'],
});

// Assign to prototype
User.prototype.toAPIv1JSON = toAPIv1JSON;

// Usage
const user = await User.query().findById(1);
const apiData = user.toAPIv1JSON();
```

**Method 2: Auto-Binding (Convenient)**

```javascript
// Auto-bind to prototype during creation
User.createPublicJSONMethod(
  {
    include: ['id', 'name', 'email', 'profile'],
    transform: {
      profile: profile => ({
        ...profile,
        avatar: profile.avatar + '?size=small',
      }),
    },
  },
  { name: 'toMobileJSON', bindToPrototype: true }
);

// Usage - method is automatically available
const mobileData = user.toMobileJSON();
```

**Method 3: Helper Methods (Recommended)**

```javascript
// Add single method using helper
User.addPublicJSONMethod('toAPIv1JSON', {
  includeTimestamps: true,
  transform: {
    created_at: date => Math.floor(date.getTime() / 1000),
  },
});

// Add multiple methods at once
User.createPublicJSONMethods({
  toMobileJSON: {
    include: ['id', 'name', 'email', 'profile'],
  },
  toWebJSON: {
    includeTimestamps: true,
    exclude: ['phone'],
  },
  toSearchJSON: {
    include: ['id', 'name', 'email'],
    transform: {
      name: name => name.toUpperCase(),
    },
  },
});

// Usage
const user = await User.query().findById(1);
const apiData = user.toAPIv1JSON();
const mobileData = user.toMobileJSON();
const webData = user.toWebJSON();
const searchData = user.toSearchJSON();
```

**Method 4: Standalone Usage**

```javascript
// Use as standalone function
const formatter = User.createPublicJSONMethod({
  preset: 'minimal',
  transform: {
    name: name => name.toUpperCase(),
  },
});

// Call with specific context
const formattedData = formatter.call(user);
```

#### Security Features

**Automatic Sensitive Field Exclusion:**

```javascript
// These fields are ALWAYS excluded (unless includeInternal: true)
const alwaysExcluded = [
  'password',
  'password_hash',
  'secret',
  'token',
  'api_key',
  'private_key',
];

// Safe by default - sensitive fields never exposed
const safeData = user.toPublicJSON();
// Will never include password, tokens, etc.
```

**Error Handling:**

```javascript
const robust = user.toPublicJSON({
  transform: {
    // If transformation fails, field is left unchanged
    risky_field: value => {
      if (!value) throw new Error('Invalid value');
      return value.toUpperCase();
    },
    // Other transformations continue to work
    safe_field: value => value.toLowerCase(),
  },
});
// Transformation errors are logged but don't break the response
```

#### Real-World Examples

**REST API Responses:**

```javascript
// GET /api/users/:id
app.get('/api/users/:id', async (req, res) => {
  const user = await User.query().findById(req.params.id);

  // Different responses based on user role
  if (req.user.role === 'admin') {
    res.json(user.toPublicJSON({ preset: 'admin' }));
  } else if (req.user.id === user.id) {
    res.json(user.toPublicJSON({ preset: 'full' }));
  } else {
    res.json(user.toPublicJSON({ preset: 'minimal' }));
  }
});
```

**API Versioning:**

```javascript
// API v1 - Unix timestamps
const v1Response = user.toPublicJSON({
  includeTimestamps: true,
  transform: {
    created_at: date => Math.floor(date.getTime() / 1000),
    updated_at: date => Math.floor(date.getTime() / 1000),
  },
});

// API v2 - ISO timestamps with timezone
const v2Response = user.toPublicJSON({
  includeTimestamps: true,
  transform: {
    created_at: date => date.toISOString(),
    updated_at: date => date.toISOString(),
  },
});
```

**Mobile vs Web Responses:**

```javascript
// Mobile - minimal data, optimized images
const mobileResponse = user.toPublicJSON({
  include: ['id', 'name', 'avatar'],
  transform: {
    avatar: url => url + '?size=small&format=webp',
  },
});

// Web - full profile with larger images
const webResponse = user.toPublicJSON({
  includeTimestamps: true,
  transform: {
    avatar: url => url + '?size=large',
    created_at: date => date.toLocaleDateString(),
  },
});
```

### Enhanced Validation System

#### Security-First Pattern Validation

The BaseModel includes comprehensive security validation to prevent ReDoS
(Regular Expression Denial of Service) attacks:

```javascript
class User extends BaseModel {
  static get schema() {
    return {
      validation: {
        patterns: {
          // ✅ Safe: RegExp objects are validated directly
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

          // ✅ Safe: String patterns are validated for security
          phone: '^\\+?[1-9]\\d{1,14}$',

          // ❌ Dangerous: These patterns would be rejected
          // dangerous1: '(?:a+)+',  // Nested quantifiers
          // dangerous2: '*+',       // Consecutive quantifiers
          // dangerous3: '{1,}*',    // Quantifier followed by *
        },
      },
    };
  }
}
```

**Security Features:**

- **ReDoS Detection**: Automatically detects dangerous regex patterns
- **Pattern Length Limits**: Prevents DoS attacks with excessively long patterns
- **Safe RegExp Creation**: Validates string patterns before RegExp construction
- **Security Annotations**: Proper ESLint security compliance

#### Comprehensive Validation Rules

```javascript
class Product extends BaseModel {
  static get schema() {
    return {
      validation: {
        // Required field validation
        required: ['name', 'price', 'category'],

        // Type validation with detailed error reporting
        types: {
          name: 'string',
          price: 'number',
          inStock: 'boolean',
        },

        // String length constraints
        length: {
          name: { min: 2, max: 100 },
          description: { max: 500 },
          sku: { min: 3, max: 20 },
        },

        // Numeric range validation
        range: {
          price: { min: 0, max: 999999.99 },
          quantity: { min: 0, max: 10000 },
        },

        // Pattern matching with security validation
        patterns: {
          sku: /^[A-Z]{2}\d{4,8}$/,
          email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        },

        // Custom business logic validation
        custom: {
          price: (value, model) => {
            if (model.category === 'premium' && value < 100) {
              return 'Premium products must be priced at least $100';
            }
            return true;
          },

          availability: (value, model) => {
            if (model.inStock && !value) {
              return 'In-stock products must have availability information';
            }
            return true;
          },
        },
      },
    };
  }
}
```

#### Rich Error Context

Validation errors provide detailed context for debugging and user feedback:

```javascript
try {
  const product = new Product({
    name: 'A', // Too short
    price: 'invalid', // Wrong type
    email: 'not-an-email', // Pattern mismatch
  });

  await product.$validate();
} catch (error) {
  console.log(error.type); // 'ValidationError'
  console.log(error.fields); // ['name', 'price', 'email']
  console.log(error.data); // Detailed error objects:
  /*
  [
    {
      field: 'name',
      rule: 'minLength',
      message: 'name must be at least 2 characters long',
      minLength: 2,
      actualLength: 1,
      value: 'A'
    },
    {
      field: 'price',
      rule: 'type',
      message: 'price must be of type number, got string',
      expected: 'number',
      actual: 'string',
      value: 'invalid'
    },
    {
      field: 'email',
      rule: 'pattern',
      message: 'email does not match the required pattern',
      pattern: '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/',
      value: 'not-an-email'
    }
  ]
  */
}
```

### Custom BaseModel

```javascript
import { BaseModel } from 'rapid-objection';

class CustomBaseModel extends BaseModel {
  static get schema() {
    return {
      ...super.schema,
      softDeletes: true,
      timestamps: true,
    };
  }

  // Add custom instance methods
  toPublicJSON() {
    const json = this.toJSON();
    delete json.deleted_at;
    return json;
  }
}

// Register model with custom BaseModel
const UserModel = await connectionManager.registerModel(
  'User',
  {
    tableName: 'users',
    schema: {
      validation: {
        required: ['email', 'name'],
      },
    },
  },
  CustomBaseModel
);
```

### Lifecycle Hooks

```javascript
const UserModel = await connectionManager.registerModel('User', {
  tableName: 'users',
  hooks: {
    $beforeInsert() {
      this.created_at = new Date();
      this.updated_at = new Date();
    },
    $beforeUpdate() {
      this.updated_at = new Date();
    },
    $afterInsert() {
      console.log('User created:', this.email);
    },
  },
});
```

## API Reference

### ConnectionManager Model Methods

#### `registerModel(modelName, modelDefinition, CustomBaseModel?)`

Register a single Objection.js model with the connection.

**Model Sharing and Extension:**

- By default, models are **NOT shared** (`isShared: false`)
- Attempting to register a duplicate non-shared model **throws an error**
- Set `static isShared = true` on a model class (or `isShared: true` in
  definition) to allow extension
- When a shared model is re-registered, an inherited model is created combining
  both

**Parameters:**

- `modelName` (string): Name of the model
- `modelDefinition` (object|Function): Model definition object OR pre-defined
  model class
  - `tableName` (string): Database table name
  - `isShared` (boolean, optional, default: false): Allow this model to be
    extended
  - `schema` (object, optional): Model schema definition
  - `relations` (object, optional): Model relations definition
  - `hooks` (object, optional): Model lifecycle hooks
- `CustomBaseModel` (Function, optional): Custom BaseModel class to extend from

**Returns:** Promise<Function> - The registered model class (or inherited model
if extending shared model)

**Throws:** Error - When model registration fails or duplicate non-shared model
is registered

**Examples:**

```javascript
// Non-shared model (default) - protected from duplication
class UserModel extends Model {
  static get tableName() {
    return 'users';
  }
}
await connectionManager.registerModel('User', UserModel);
await connectionManager.registerModel('User', OtherModel); // ❌ Throws Error!

// Shared model - allows extension
class SharedUserModel extends Model {
  static get tableName() {
    return 'users';
  }
  static get isShared() {
    return true;
  } // Allow extension
}
await connectionManager.registerModel('User', SharedUserModel);

// Extending model
class ExtendedUserModel extends Model {
  static get tableName() {
    return 'users';
  }
}
const extended = await connectionManager.registerModel(
  'User',
  ExtendedUserModel
); // ✅ Creates inherited model

// Definition object with isShared
await connectionManager.registerModel('Category', {
  tableName: 'categories',
  isShared: true, // Allow extension
  schema: { name: { type: 'string' } },
});
```

#### `registerModels(modelDefinitions, CustomBaseModel?)`

Register multiple models at once.

**Parameters:**

- `modelDefinitions` (object): Object mapping model names to definitions
- `CustomBaseModel` (Function, optional): Custom BaseModel class to extend from

**Returns:** Promise<Object> - Object mapping model names to registered model
classes

#### `getModel(modelName)`

Get a registered model by name.

**Parameters:**

- `modelName` (string): Name of the model

**Returns:** Function|null - The model class or null if not found

#### `getModels()`

Get all registered models.

**Returns:** Object - Object mapping model names to model classes

#### `getModelNames()`

Get list of registered model names.

**Returns:** string[] - Array of model names

#### `hasModel(modelName)`

Check if a model is registered.

**Parameters:**

- `modelName` (string): Name of the model

**Returns:** boolean - True if model is registered

## Configuration

### ModelManager Configuration

```javascript
const connectionManager = new ConnectionManager(
  {
    // Database connection config
    client: 'postgresql',
    connection: {
      /* ... */
    },

    // ModelManager configuration
    models: {
      enabled: true, // Enable ModelManager
      bindKnex: true, // Automatically bind Knex to models
      validateModels: true, // Validate model definitions
      defaultModelOptions: {
        // Default options for all models
        timestamps: true,
        softDeletes: false,
      },
    },
  },
  'connection-name'
);
```

### Configuration Options

#### `models.enabled` (boolean, default: `true`)

Enables or disables the ModelManager component.

```javascript
models: {
  enabled: false; // Disables model management
}
```

#### `models.bindKnex` (boolean, default: `true`)

Automatically binds the connection's Knex instance to registered models.

```javascript
models: {
  bindKnex: false; // Manual Knex binding required
}
```

#### `models.validateModels` (boolean, default: `true`)

Enables comprehensive validation of model definitions using ModelValidator.

```javascript
models: {
  validateModels: false; // Skip validation for performance
}
```

#### `models.defaultModelOptions` (object, default: `{}`)

Default options applied to all registered models.

```javascript
models: {
  defaultModelOptions: {
    timestamps: true,      // Add automatic timestamps
    softDeletes: true,     // Enable soft delete support
    validation: {          // Default validation rules
      required: ['id']
    }
  }
}
```

### Environment-Specific Configuration

#### Development Configuration

```javascript
models: {
  enabled: true,
  validateModels: true,     // Catch errors early
  bindKnex: true,
  defaultModelOptions: {
    timestamps: true        // Helpful for debugging
  }
}
```

#### Production Configuration

```javascript
models: {
  enabled: true,
  validateModels: false,    // Skip validation for performance
  bindKnex: true,
  defaultModelOptions: {}
}
```

#### Testing Configuration

```javascript
models: {
  enabled: true,
  validateModels: true,     // Ensure test data is valid
  bindKnex: true,
  defaultModelOptions: {
    timestamps: false       // Predictable test data
  }
}
```

## Best Practices

### 1. Model Organization

```javascript
// Organize model definitions in separate files
// models/User.js
export const UserDefinition = {
  tableName: 'users',
  schema: {
    /* ... */
  },
  relations: {
    /* ... */
  },
};

// Usage
await connectionManager.registerModels(ModelDefinitions);
```

### 2. Connection-Specific Models

```javascript
// Each connection should have its own set of models
const userServiceModels = await userConnection.registerModels({
  User: userModelDef,
  Profile: profileModelDef,
});
```

### 3. Error Handling

```javascript
try {
  const UserModel = await connectionManager.registerModel('User', {
    tableName: 'users',
    schema: { validation: { required: ['email'] } },
  });
} catch (error) {
  console.error('Model registration failed:', error.message);
}
```

### 4. Lifecycle Management

```javascript
// Proper initialization and shutdown
const connectionManager = new ConnectionManager(config, 'service');

try {
  await connectionManager.initialize();
  await connectionManager.registerModels(modelDefs);
  // Use models...
} finally {
  await connectionManager.shutdown();
}
```

## Events

The ModelManager emits the following events:

- `model-registered`: When a single model is registered
- `models-registered`: When multiple models are registered
- `initialized`: When ModelManager is initialized
- `shutdown-completed`: When shutdown completes
- `warning`: For non-critical issues
- `error`: For error conditions

```javascript
connectionManager.on('model-registered', data => {
  console.log(`Model registered: ${data.modelName} for ${data.connectionName}`);
});
```
