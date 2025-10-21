import { EventEmitter } from 'events';
import path from 'path';
import { MigrationManager } from './MigrationManager';
import { SeedManager } from './SeedManager';
import { ModelManager, BaseModel } from './ModelManager';
import { SecurityManager } from './SecurityManager';
import { TransactionManager } from './TransactionManager';
import { TimeoutManager } from './TimeoutManager';
import { InputValidator } from './InputValidator';
import { mergeConfig } from './ConfigurationManager';
import { overrideComponents } from './overrideComponents';

// Default component classes registry for ConnectionManager
const COMPONENT_CLASSES = {
  ModelManager,
  BaseModel,
  MigrationManager,
  SeedManager,
  SecurityManager,
  TransactionManager,
};

/**
 * Validate BaseModel inheritance through method-based validation
 *
 * @param {Function} ModelClass - BaseModel class to validate
 * @throws {Error} When inheritance is invalid
 */
function validateBaseModelInheritance(ModelClass) {
  // Check for required Objection.js Model methods
  const requiredMethods = {
    // Static methods that should exist on the class
    static: ['query', 'fromJson'],
    // Instance methods that should exist on the prototype
    instance: ['$query', 'fromJson', 'toJSON'],
  };

  // Validate static methods
  const missingStaticMethods = requiredMethods.static.filter(
    method => typeof ModelClass[method] !== 'function'
  );

  // Validate instance methods
  const missingInstanceMethods = requiredMethods.instance.filter(
    method => typeof ModelClass.prototype[method] !== 'function'
  );

  const allMissingMethods = [
    ...missingStaticMethods.map(m => `static ${m}`),
    ...missingInstanceMethods.map(m => `instance ${m}`),
  ];

  if (allMissingMethods.length > 0) {
    throw new Error(
      `Class '${ModelClass.name}' does not appear to extend from Objection.js Model. ` +
        `Missing required methods: ${allMissingMethods.join(', ')}`
    );
  }

  // Additional validation: Check if the class can be instantiated
  try {
    // Try to access prototype properties that Objection.js models should have
    if (!ModelClass.prototype || typeof ModelClass.prototype.constructor !== 'function') {
      throw new Error('Invalid prototype structure');
    }
  } catch (error) {
    throw new Error(`Class '${ModelClass.name}' has invalid prototype structure: ${error.message}`);
  }
}

/**
 * Validate required methods exist on the BaseModel class
 *
 * @param {Function} ModelClass - BaseModel class to validate
 * @throws {Error} When required methods are missing
 */
function validateRequiredMethods(ModelClass) {
  // Required instance methods
  const requiredInstanceMethods = ['$query', 'fromJson', 'toJSON'];

  for (const method of requiredInstanceMethods) {
    if (typeof ModelClass.prototype[method] !== 'function') {
      throw new Error(`BaseModel '${ModelClass.name}' missing required instance method: ${method}`);
    }
  }

  // Required static methods
  const requiredStaticMethods = ['query', 'fromJson'];

  for (const method of requiredStaticMethods) {
    if (typeof ModelClass[method] !== 'function') {
      throw new Error(`BaseModel '${ModelClass.name}' missing required static method: ${method}`);
    }
  }
}

/**
 * Validate Objection.js compatibility properties
 *
 * @param {Function} ModelClass - BaseModel class to validate
 * @throws {Error} When properties are invalid
 */
function validateObjectionCompatibility(ModelClass) {
  // Validate tableName if present
  if (Object.prototype.hasOwnProperty.call(ModelClass, 'tableName')) {
    const tableName = ModelClass.tableName;
    if (tableName != null && typeof tableName !== 'string' && typeof tableName !== 'function') {
      throw new Error(`tableName must be string, function, or null. Got: ${typeof tableName}`);
    }
  }

  // Validate jsonSchema if present
  if (Object.prototype.hasOwnProperty.call(ModelClass, 'jsonSchema')) {
    const jsonSchema = ModelClass.jsonSchema;
    if (jsonSchema != null && (typeof jsonSchema !== 'object' || Array.isArray(jsonSchema))) {
      throw new Error(`jsonSchema must be an object or null. Got: ${typeof jsonSchema}`);
    }
  }

  // Validate relationMappings if present
  if (Object.prototype.hasOwnProperty.call(ModelClass, 'relationMappings')) {
    const relationMappings = ModelClass.relationMappings;
    if (
      relationMappings != null &&
      typeof relationMappings !== 'object' &&
      typeof relationMappings !== 'function'
    ) {
      throw new Error(
        `relationMappings must be object, function, or null. Got: ${typeof relationMappings}`
      );
    }
  }

  // Validate idColumn if present
  if (Object.prototype.hasOwnProperty.call(ModelClass, 'idColumn')) {
    const idColumn = ModelClass.idColumn;
    if (idColumn != null && typeof idColumn !== 'string' && !Array.isArray(idColumn)) {
      throw new Error(`idColumn must be string, array, or null. Got: ${typeof idColumn}`);
    }
  }
}

/**
 * Validate and set BaseModel class using InputValidator
 *
 * @param {Function} ModelClass - BaseModel class constructor to validate and set
 * @param {Object} componentRegistry - Component registry to update
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.strict=true] - Whether to perform strict validation
 * @throws {Error} When ModelClass is invalid or doesn't meet requirements
 */
function validateAndSetBaseModel(ModelClass, componentRegistry, options = {}) {
  const { strict = true } = options;

  // Use InputValidator for basic class validation
  const validatedClass = InputValidator.validateClass(ModelClass, 'BaseModel');

  // Perform BaseModel-specific validation
  if (strict) {
    validateBaseModelInheritance(validatedClass);
  }
  validateRequiredMethods(validatedClass);
  validateObjectionCompatibility(validatedClass);

  // Set the validated BaseModel in the component registry
  componentRegistry.BaseModel = validatedClass;

  return validatedClass;
}

/**
 * Manages database connection and components for a single connection in multi-app orchestration.
 * Provides isolated database operations, component management, and connection pooling.
 * Designed for one-way flow from AppRegistry to individual connections.
 */
export class ConnectionManager extends EventEmitter {
  /** @type {boolean} */
  #initialized = false;

  /** @type {string} */
  #connectionName = null;

  /** @type {Object|null} */
  #knexInstance = null;

  /** @type {boolean} */
  #knexValidated = false;

  /** @type {Object} */
  #config = null;

  /** @type {Boolean} */
  #isShared = false;

  /** @type {Object|null} */
  #poolWarmingStatus = null;

  /** @type {SecurityManager|knex.Knex} */
  #securityManager = null;

  /** @type {TransactionManager} */
  #transactionManager = null;

  /** @type {ModelManager} */
  #modelManager = null;

  /** @type {MigrationManager} */
  #migrationManager = null;

  /** @type {SeedManager} */
  #seedManager = null;

  /** @type {string} */
  #cwd = null;

  /**
   * Creates a new ConnectionManager instance for managing a single connection's database operations.
   * Part of the multi-app orchestration system managed by AppRegistry.
   * Supports connection sharing and registry-controlled configuration.
   *
   * @param {Object} [options={}] - Connection configuration options (registry-controlled)
   * @param {Object} options.database - Database connection configuration
   * @param {Object} [options.migrations] - Migration configuration
   * @param {Object} [options.models] - Model configuration
   * @param {Object} [options.transactions] - Transaction configuration
   * @param {Object} [options.security] - Security configuration
   * @param {string|symbol} connectionName - Connection name
   * @param {boolean} isShared - Whether this connection is shared with other connections
   */
  constructor(options, connectionName, isShared = false) {
    super();

    this.#connectionName = connectionName;
    this.#isShared = !!isShared;
    this.#config = mergeConfig({}, options);

    // Set current working directory for this connection
    this.#cwd = this.#config.cwd || process.cwd();

    // Validate configuration
    this.#validateConfiguration();
  }

  /**
   * Ensure this connection is properly initialized.
   * Throws error if connection not initialized, preventing invalid operations.
   *
   * @private
   * @throws {Error} When connection not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('ConnectionManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Resolve directory path to absolute path for consistent file system access.
   * This prevents issues with relative paths when the working directory changes.
   *
   * @param {Object} config - Configuration object containing directory path
   * @param {string} defaultDir - Default directory name if not specified
   * @returns {Object} Modified config with absolute directory path
   * @private
   */
  #resolveDirectoryPath(config, defaultDir) {
    // Initialize directory if not provided
    if (!config.directory) {
      config.directory = defaultDir;
    }

    // Ensure directory is an absolute path for consistent file system access
    if (!path.isAbsolute(config.directory)) {
      config.directory = path.resolve(
        config.cwd || this.#cwd, // Use config cwd or connection's cwd as base
        config.directory // Use provided directory or default
      );
    }

    return config;
  }

  /**
   * Check if this connection is initialized and ready for operations.
   *
   * @returns {boolean} True if connection is initialized, false otherwise
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Check if this connection is shared between multiple connections.
   * Shared connections enable resource optimization in multi-connection scenarios.
   *
   * @returns {boolean} True if connection is shared, false otherwise
   */
  get isShared() {
    return this.#isShared;
  }

  /**
   * Get the name of this connection.
   *
   * @returns {string} Connection name
   */
  get name() {
    return this.#connectionName;
  }

  /**
   * Get the active database connection for this connection.
   * Returns validated Knex instance or null if connection not available.
   * Uses cached validation state for better performance.
   *
   * @returns {Knex|null} Active Knex database connection or null if unavailable
   */
  get knex() {
    // Use cached validation state for performance, with fallback validation
    if (this.#knexInstance && this.#knexValidated) {
      return this.#knexInstance;
    }

    // Fallback to full validation if cache is invalid
    return InputValidator.isValidKnexInstance(this.#knexInstance) ? this.#knexInstance : null;
  }

  /**
   * Get the raw query method for direct SQL execution.
   * Provides clean interface for executing raw queries while maintaining validation.
   *
   * @returns {Function|null} Knex raw method or null if connection not available
   */
  get raw() {
    const knexInstance = this.knex;
    return knexInstance ? knexInstance.raw.bind(knexInstance) : null;
  }

  /**
   * Get the database client information.
   * Provides clean interface for accessing client configuration and methods.
   *
   * @returns {Object|null} Knex client object or null if connection not available
   */
  get client() {
    const knexInstance = this.knex;
    return knexInstance ? knexInstance.client : null;
  }

  /**
   * Get the current working directory for this connection.
   * Used for resolving relative paths in migration and seeding operations.
   *
   * @returns {string} Current working directory path
   */
  get cwd() {
    return this.#cwd;
  }

  /**
   * Initialize database connection and components for the managed connection.
   * Creates secure database connection and initializes all enabled components.
   * Called by AppRegistry as part of multi-app orchestration flow.
   *
   * @param {Object} [options={}] - Initialization options (reserved for future use)
   * @returns {Promise<Object>} Initialization result with success status and connection name
   * @throws {Error} When initialization fails or connection already initialized
   */
  async initialize() {
    if (this.#initialized) {
      this.#emitWarning('initialize', {}, 'ConnectionManager already initialized');
      return { success: true, mode: 'already-initialized' };
    }

    this.#initialized = true;

    try {
      const stats = await InputValidator.checkPathAccess(this.#cwd, true);
      if (!stats.exists) {
        throw new Error(`Current working directory '${this.#cwd}' is not a safe path`);
      }

      await this.#initializeComponents();
      await this.#initializeKnex();

      const result = {
        success: true,
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };

      this.emit('initialized', result);
      return result;
    } catch (error) {
      this.#initialized = false;
      this.#emitError('initialize', {}, error);
      throw error;
    }
  }

  /**
   * Get the enhanced BaseModel class statically (legacy compatibility)
   *
   * Provides static access to the BaseModel class without needing an ConnectionManager instance.
   * Useful for importing and extending BaseModel in app development.
   *
   * @returns {BaseModel} Enhanced BaseModel class with professional features
   * @deprecated Use ConnectionManager.BaseModel instead
   */
  static get BaseModel() {
    return COMPONENT_CLASSES.BaseModel;
  }

  /**
   * Set the BaseModel class statically
   *
   * @param {Function} value - BaseModel class constructor
   */
  static set BaseModel(value) {
    validateAndSetBaseModel(value, COMPONENT_CLASSES, { strict: true });
  }

  /**
   * Get component definitions for this app connection.
   * Returns configuration for all available database components.
   * Used internally for component lifecycle management.
   *
   * @private
   * @returns {Array<Object>} Array of component definitions with creation and enablement logic
   */
  #getComponents() {
    // Component registry with professional property names and clear responsibilities
    const componentRegistry = {
      securityManager: {
        Component: COMPONENT_CLASSES.SecurityManager,
        config: this.#config.security,
        getInstance: () => this.#securityManager,
        setInstance: instance => (this.#securityManager = instance),
      },
      migrationManager: {
        Component: COMPONENT_CLASSES.MigrationManager,
        config: mergeConfig({}, this.#config.migrations, { cwd: this.#cwd }),
        getInstance: () => this.#migrationManager,
        setInstance: instance => (this.#migrationManager = instance),
      },
      seedManager: {
        Component: COMPONENT_CLASSES.SeedManager,
        config: mergeConfig({}, this.#config.seeds, { cwd: this.#cwd }),
        getInstance: () => this.#seedManager,
        setInstance: instance => (this.#seedManager = instance),
      },
      modelManager: {
        Component: COMPONENT_CLASSES.ModelManager,
        config: this.#config.models,
        getInstance: () => this.#modelManager,
        setInstance: instance => (this.#modelManager = instance),
      },
      transactionManager: {
        Component: COMPONENT_CLASSES.TransactionManager,
        config: this.#config.transactions,
        getInstance: () => this.#transactionManager,
        setInstance: instance => (this.#transactionManager = instance),
      },
    };

    // Convert registry to component definitions array with descriptive destructuring
    return Object.entries(componentRegistry).map(
      ([componentName, { Component: ComponentClass, config, getInstance, setInstance }]) => ({
        name: componentName,
        create: () => new ComponentClass(config, this.#connectionName),
        set: setInstance,
        get: getInstance,
        isEnabled: () => config?.enabled === true,
      })
    );
  }

  /**
   * Initialize all enabled database components for this connection.
   * Creates and initializes components based on configuration settings.
   *
   * @private
   * @returns {Promise<void>}
   * @throws {Error} When component initialization fails
   */
  async #initializeComponents() {
    const components = this.#getComponents();
    for (const component of components) {
      try {
        if (component.isEnabled()) {
          const instance = component.create();
          await instance.initialize();
          component.set(instance);
        } else {
          component.set(null);
        }
      } catch (error) {
        this.#emitError('component-initialization', {}, error);
        throw error;
      }
    }
  }

  /**
   * Initialize secure Knex database connection
   * Creates and validates database connection without running migrations or seeds.
   * Follows single responsibility principle - only handles connection creation.
   *
   * @private
   * @returns {Promise<Knex>} Initialized Knex database connection
   * @throws {Error} When connection creation fails or SecurityManager not available
   */
  async #initializeKnex() {
    // Return existing valid and validated instance (enhanced caching)
    if (this.knex && this.#knexValidated) {
      this.emit('knex-reused', {
        connectionName: this.#connectionName,
        client: this.client?.config?.client,
        validated: true,
        timestamp: new Date(),
      });
      return this.#knexInstance;
    }

    // Start performance tracking
    const connectionStartTime = Date.now();

    try {
      this.emit('knex-creation-started', {
        connectionName: this.#connectionName,
        timestamp: new Date(),
      });

      // Create secure Knex instance through SecurityManager or fallback to direct creation
      if (this.#securityManager) {
        this.#knexInstance = await this.#securityManager.createKnexInstance(this.#config.database);
      } else {
        // Fallback: Create Knex instance directly when SecurityManager is disabled
        const knex = require('knex');
        this.#knexInstance = knex(this.#config.database);
        this.#knexInstance.destroyKnexInstance = this.#knexInstance.destroy.bind(
          this.#knexInstance
        );
      }

      // Comprehensive connection validation and health check
      await this.#validateConnection(this.#knexInstance);

      // Mark as validated for caching
      this.#knexValidated = true;

      // Calculate performance metrics
      const connectionDuration = Date.now() - connectionStartTime;

      // Emit successful creation event with performance metrics
      this.emit('knex-created', {
        connectionName: this.#connectionName,
        client: this.#knexInstance.client?.config?.client,
        poolConfig: {
          min: this.#knexInstance.client?.config?.pool?.min || 0,
          max: this.#knexInstance.client?.config?.pool?.max || 10,
        },
        performance: {
          connectionDuration,
          validated: true,
        },
        timestamp: new Date(),
      });

      return this.#knexInstance;
    } catch (error) {
      // Reset validation state
      this.#knexValidated = false;

      // Calculate failed connection duration for metrics
      const failedDuration = Date.now() - connectionStartTime;

      // Clear any partially created instance using SecurityManager
      if (this.#securityManager) {
        await this.#securityManager.destroyKnexInstance();
      }

      this.#resetKnexState();

      this.#emitError(
        'knex-creation',
        {
          phase: 'instance-creation',
          connectionName: this.#connectionName,
          performance: {
            failedDuration,
            validated: false,
          },
        },
        error
      );

      throw new Error(
        `Failed to create Knex instance for connection '${this.#connectionName}': ${error.message}`
      );
    }
  }

  /**
   * Run database migrations for this connection.
   * Executes pending migrations using the connection's MigrationManager.
   * Part of the connection's database lifecycle management.
   *
   * @param {Object} [options={}] - Migration execution options
   * @param {string} [options.to] - Target migration to run to
   * @param {boolean} [options.disableTransactions] - Disable transaction wrapping
   * @returns {Promise<Object>} Migration execution result with applied migrations
   * @throws {Error} When MigrationManager not initialized or migration fails
   */
  async runMigrations(options = {}) {
    this.#ensureInitialized();
    try {
      if (!this.#migrationManager) {
        // MigrationManager is disabled - return success with no migrations run
        return {
          success: true,
          migrationsRun: 0,
          message: 'MigrationManager disabled - no migrations executed',
        };
      }
      const migrationConfig = mergeConfig({}, this.#config.migrations, options);
      this.#resolveDirectoryPath(migrationConfig, 'migrations');
      const result = await this.#migrationManager.migrate({
        ...migrationConfig,
        knex: this.#knexInstance,
      });

      // Transform result to match expected format
      return {
        ...result,
        migrationsRun: (result.migrations || []).length,
      };
    } catch (error) {
      this.#emitError('run-migrations', {}, error);
      throw error;
    }
  }

  /**
   * Rollback database migrations for this connection.
   * Reverts previously applied migrations using the connection's MigrationManager.
   * Part of the connection's database lifecycle management.
   *
   * @param {Object} [options={}] - Rollback execution options
   * @param {string} [options.to] - Target migration to rollback to
   * @param {number} [options.step] - Number of migrations to rollback
   * @returns {Promise<Object>} Rollback execution result with reverted migrations
   * @throws {Error} When MigrationManager not initialized or rollback fails
   */
  async rollbackMigrations(options = {}) {
    this.#ensureInitialized();
    try {
      if (!this.#migrationManager) {
        // MigrationManager is disabled - return success with no migrations rolled back
        return {
          success: true,
          migrationsRolledBack: 0,
          message: 'MigrationManager disabled - no migrations rolled back',
        };
      }
      const migrationConfig = mergeConfig({}, this.#config.migrations, options);
      this.#resolveDirectoryPath(migrationConfig, 'migrations');
      return await this.#migrationManager.rollback({
        ...migrationConfig,
        knex: this.#knexInstance,
      });
    } catch (error) {
      this.#emitError('rollback-migrations', {}, error);
      throw error;
    }
  }

  /**
   * Run database seeds for this connection.
   * Executes seed files to populate database with initial data.
   * Part of the connection's database lifecycle management.
   *
   * @param {Object} [options={}] - Seed execution options
   * @param {boolean} [options.force] - Disable transaction wrapping
   * @returns {Promise<Object>} Seed execution result with applied seeds
   * @throws {Error} When SeedManager not initialized or seeding fails
   */
  async runSeeds(options = {}) {
    this.#ensureInitialized();
    try {
      if (!this.#seedManager) {
        // SeedManager is disabled - return success with no seeds run
        return {
          success: true,
          seedsRun: [],
          message: 'SeedManager disabled - no seeds executed',
        };
      }
      const seedConfig = mergeConfig({}, this.#config.seeds, options);
      this.#resolveDirectoryPath(seedConfig, 'seeds');
      return await this.#seedManager.seed({ ...seedConfig, knex: this.#knexInstance });
    } catch (error) {
      this.#emitError('run-seeds', {}, error);
      throw error;
    }
  }

  /**
   * Rollback database seeds for this connection.
   * Reverts previously applied seed data using the connection's SeedManager.
   * Part of the connection's database lifecycle management.
   *
   * @param {Object} [options={}] - Rollback execution options
   * @param {number} [options.step] - Number of seed batches to rollback
   * @param {boolean} [options.force] - Disable transaction wrapping
   * @returns {Promise<Object>} Rollback execution result with reverted seeds
   * @throws {Error} When SeedManager not initialized or rollback fails
   */
  async rollbackSeeds(options = {}) {
    this.#ensureInitialized();
    try {
      if (!this.#seedManager) {
        // SeedManager is disabled - return success with no seeds rolled back
        return {
          success: true,
          seedsRolledBack: 0,
          message: 'SeedManager disabled - no seeds rolled back',
        };
      }
      const seedConfig = mergeConfig({}, this.#config.seeds, options);
      this.#resolveDirectoryPath(seedConfig, 'seeds');
      return await this.#seedManager.rollback({ ...seedConfig, knex: this.#knexInstance });
    } catch (error) {
      this.#emitError('rollback-seeds', {}, error);
      throw error;
    }
  }

  /**
   * Register a single Objection.js model with this connection.
   * Creates a model class bound to this connection's Knex instance.
   * Part of the connection's model management capabilities.
   *
   * @param {string} modelName - Name of the model
   * @param {Object} modelDefinition - Model definition object
   * @param {string} modelDefinition.tableName - Database table name
   * @param {Object} [modelDefinition.schema] - Model schema definition
   * @param {Object} [modelDefinition.relations] - Model relations definition
   * @param {Object} [modelDefinition.hooks] - Model lifecycle hooks
   * @param {Function} [CustomBaseModel] - Custom BaseModel class to extend from
   * @returns {Promise<Function>} The registered model class
   * @throws {Error} When ModelManager not initialized or registration fails
   */
  async registerModel(modelName, modelDefinition, CustomBaseModel = null) {
    this.#ensureInitialized();
    try {
      if (!this.#modelManager) {
        throw new Error('ModelManager not initialized - models are disabled');
      }
      return await this.#modelManager.registerModel(
        modelName,
        modelDefinition,
        this.#knexInstance,
        CustomBaseModel
      );
    } catch (error) {
      this.#emitError('register-model', { modelName }, error);
      throw error;
    }
  }

  /**
   * Register multiple Objection.js models at once with this connection.
   * Creates model classes bound to this connection's Knex instance.
   * Part of the connection's model management capabilities.
   *
   * @param {Object} modelDefinitions - Object mapping model names to definitions
   * @param {Function} [CustomBaseModel] - Custom BaseModel class to extend from
   * @returns {Promise<Object>} Object mapping model names to registered model classes
   * @throws {Error} When ModelManager not initialized or registration fails
   */
  async registerModels(modelDefinitions, CustomBaseModel = null) {
    this.#ensureInitialized();
    try {
      if (!this.#modelManager) {
        // ModelManager is disabled - return success with no models registered
        return {
          success: true,
          registeredModels: [],
          message: 'ModelManager disabled - no models registered',
        };
      }
      const registeredModels = await this.#modelManager.registerModels(
        modelDefinitions,
        this.#knexInstance,
        CustomBaseModel || this.BaseModel
      );

      // Transform result to match expected format
      return {
        success: true,
        registeredModels,
        modelCount: Object.keys(registeredModels || {}).length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.#emitError(
        'register-models',
        { modelCount: Object.keys(modelDefinitions || {}).length },
        error
      );
      throw error;
    }
  }

  /**
   * Get a registered model by name.
   * Returns the model class for performing database operations.
   *
   * @param {string} modelName - Name of the model
   * @returns {Function|null} The model class or null if not found
   */
  getModel(modelName) {
    this.#ensureInitialized();
    try {
      if (!this.#modelManager) {
        return null;
      }
      return this.#modelManager.getModel(modelName) || null;
    } catch (error) {
      this.#emitError('get-model', { modelName }, error);
      return null;
    }
  }

  /**
   * Get all registered models for this connection.
   * Returns an object mapping model names to model classes.
   *
   * @returns {Object} Object mapping model names to model classes
   */
  getModels() {
    this.#ensureInitialized();
    try {
      return this.#modelManager.getModels() || {};
    } catch (error) {
      this.#emitError('get-models', {}, error);
      return {};
    }
  }

  /**
   * Get list of registered model names for this connection.
   *
   * @returns {string[]} Array of model names
   */
  getModelNames() {
    this.#ensureInitialized();
    try {
      if (!this.#modelManager) {
        return [];
      }
      return this.#modelManager.getModelNames() || [];
    } catch (error) {
      this.#emitError('get-model-names', {}, error);
      return [];
    }
  }

  /**
   * Check if a model is registered with this connection.
   *
   * @param {string} modelName - Name of the model
   * @returns {boolean} True if model is registered
   */
  hasModel(modelName) {
    this.#ensureInitialized();
    try {
      if (!this.#modelManager) {
        return false;
      }
      return this.#modelManager.hasModel(modelName) || false;
    } catch (error) {
      this.#emitError('has-model', { modelName }, error);
      return false;
    }
  }

  /**
   * Clear all registered models for this connection.
   * Removes all model registrations and cleans up model state.
   * Used during connection cleanup and app unregistration.
   *
   * @returns {number} Number of models that were cleared
   * @throws {Error} When ModelManager not initialized or clearing fails
   */
  clearModels() {
    this.#ensureInitialized();
    try {
      return this.#modelManager.clearModels() || 0;
    } catch (error) {
      this.#emitError('clear-models', {}, error);
      throw error;
    }
  }

  /**
   * Execute a function within a database transaction for this connection.
   * Provides automatic transaction management with rollback on errors.
   * Uses the connection's TransactionManager for consistent transaction handling.
   *
   * @param {Function} callback - Function to execute within transaction
   * @param {Object} [options={}] - Transaction options
   * @param {number} [options.timeout] - Transaction timeout in milliseconds
   * @param {string} [options.isolationLevel] - Transaction isolation level
   * @returns {Promise<any>} Result of the callback function execution
   * @throws {Error} When TransactionManager not initialized or transaction fails
   */
  async withTransaction(callback, options = {}) {
    this.#ensureInitialized();
    try {
      if (!this.#transactionManager) {
        // TransactionManager is disabled - execute callback directly without transaction
        return await callback(this.#knexInstance);
      }
      const transactionConfig = mergeConfig({}, this.#config.transactions, options);
      return await this.#transactionManager.withTransaction(callback, {
        ...transactionConfig,
        knex: this.#knexInstance,
      });
    } catch (error) {
      this.#emitError('with-transaction', {}, error);
      throw error;
    }
  }

  /**
   * Abort a specific transaction by force.
   * Forcefully terminates an active transaction and cleans up its resources.
   * Uses the connection's TransactionManager for consistent transaction handling.
   *
   * @param {string} transactionId - ID of the transaction to abort
   * @returns {Promise<boolean>} True if transaction was successfully aborted
   * @throws {Error} When TransactionManager not initialized or transaction not found
   */
  async abortTransaction(transactionId) {
    this.#ensureInitialized();
    try {
      return await this.#transactionManager.abortTransaction(transactionId);
    } catch (error) {
      this.#emitError('abort-transaction', { transactionId }, error);
      throw error;
    }
  }

  /**
   * Warm database connection pool for improved performance.
   * Pre-creates minimum required connections to reduce latency on first requests.
   * Prevents concurrent warming attempts for the same app.
   *
   * @returns {Promise<Object>} Warming result with success status and connection metrics
   * @throws {Error} When connection not available or already warming
   */
  async warmPool() {
    this.#ensureInitialized();
    try {
      // Check if already warming to prevent concurrent warming attempts
      if (this.#poolWarmingStatus?.status === 'warming') {
        const elapsedMs = Date.now() - this.#poolWarmingStatus.startTime.getTime();
        throw new Error(
          `Pool for connection '${this.#connectionName}' is already being warmed (started ${Math.round(elapsedMs / 1000)}s ago)`
        );
      }

      const client = this.client;
      if (!client) {
        throw new Error(`No Knex instance found for connection '${this.#connectionName}'`);
      }

      // Initialize comprehensive warming status
      this.#setPoolWarmingStatus({
        status: 'warming',
        startTime: new Date(),
        phase: 'initializing',
        progress: { current: 0, total: 0 },
        attempts: 0,
        errors: [],
      });

      // Safely access pool configuration with fallbacks
      const { pool } = client;
      const minConnections = Math.max(1, pool.min || pool.config?.min || 2);

      // Update warming status with connection details
      this.#updatePoolWarmingStatus({
        phase: 'connecting',
        progress: { current: 0, total: minConnections },
        poolConfig: {
          min: pool.min || pool.config?.min || 0,
          max: pool.max || pool.config?.max || 0,
          target: minConnections,
        },
      });

      // Create warming connections with progress tracking
      const warmingPromises = Array.from({ length: minConnections }, (_, index) =>
        this.#createWarmConnectionWithTracking(this.#knexInstance, index + 1, minConnections)
      );
      const results = await Promise.allSettled(warmingPromises);
      const successfulConnections = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failedConnections = results.filter(r => r.status === 'rejected');

      // Collect error details from failed connections
      const errors = failedConnections.map((result, index) => ({
        connectionIndex: index + successfulConnections + 1,
        error: result.reason?.message || 'Unknown error',
        timestamp: new Date(),
      }));

      // Set completion status with comprehensive metrics
      this.#setPoolWarmingStatus({
        status: 'completed',
        endTime: new Date(),
        duration: Date.now() - this.#getPoolWarmingStatus().startTime.getTime(),
        phase: 'completed',
        progress: { current: minConnections, total: minConnections },
        results: {
          successful: successfulConnections,
          failed: minConnections - successfulConnections,
          total: minConnections,
          successRate: Math.round((successfulConnections / minConnections) * 100),
        },
        poolState: {
          used: pool.used || 0,
          free: pool.free || 0,
          size: pool.size || 0,
        },
        errors,
      });

      return {
        success: true,
        connectionName: this.#connectionName,
        connectionsWarmed: successfulConnections,
        totalAttempts: minConnections,
        timestamp: new Date(),
      };
    } catch (error) {
      // Set comprehensive error status using helper method
      const startTime = this.#getPoolWarmingStatus()?.startTime || new Date();
      this.#setPoolWarmingStatus({
        status: 'error',
        error: error.message,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        phase: 'failed',
        errorDetails: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date(),
        },
      });

      this.#emitError('pool-warm', {}, error);

      return {
        success: false,
        error: error.message,
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get current pool warming status for this connection.
   * Returns the pool warming status object or null if not warming.
   *
   * @private
   * @returns {Object|null} Current pool warming status or null
   */
  #getPoolWarmingStatus() {
    return this.#poolWarmingStatus;
  }

  /**
   * Set pool warming status for this connection.
   * Replaces the current pool warming status with new data.
   *
   * @private
   * @param {Object} status - New pool warming status object
   */
  #setPoolWarmingStatus(status) {
    this.#poolWarmingStatus = {
      ...status,
      connectionName: this.#connectionName,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update pool warming status for this connection.
   * Merges new data with existing pool warming status.
   *
   * @private
   * @param {Object} updates - Status updates to merge
   */
  #updatePoolWarmingStatus(updates) {
    const currentStatus = this.#getPoolWarmingStatus() || {};
    this.#setPoolWarmingStatus({
      ...currentStatus,
      ...updates,
    });
  }

  /**
   * Create a warming connection with progress tracking.
   * Executes a simple query to establish and validate connection.
   * Updates warming progress as connections are created.
   *
   * @private
   * @param {Object} knex - Knex instance
   * @param {number} connectionIndex - Current connection index (1-based)
   * @param {number} totalConnections - Total connections to create
   * @returns {Promise<boolean>} True if connection successful, false otherwise
   */
  async #createWarmConnectionWithTracking(knex, connectionIndex, totalConnections) {
    try {
      // Update progress before attempting connection
      this.#updatePoolWarmingStatus({
        phase: 'connecting',
        progress: { current: connectionIndex - 1, total: totalConnections },
        currentConnection: connectionIndex,
      });

      // Test connection with a simple query
      await knex.raw('SELECT 1');

      // Update progress after successful connection
      this.#updatePoolWarmingStatus({
        progress: { current: connectionIndex, total: totalConnections },
        attempts: (this.#getPoolWarmingStatus()?.attempts || 0) + 1,
      });

      return true;
    } catch (error) {
      // Track failed connection attempt
      const currentStatus = this.#getPoolWarmingStatus() || {};
      const errors = currentStatus.errors || [];
      errors.push({
        connectionIndex,
        error: error.message,
        timestamp: new Date(),
      });

      this.#updatePoolWarmingStatus({
        attempts: (currentStatus.attempts || 0) + 1,
        errors,
      });

      return false;
    }
  }

  /**
   * Get comprehensive status information for this connection.
   * Provides detailed information about connection state, components, and performance.
   * Used for monitoring and debugging in multi-app orchestration.
   *
   * @returns {Promise<Object>} Comprehensive status with connection, component, and system info
   */
  async getStatus() {
    const componentStatuses = await this.#getComponentStatuses();
    const availableComponents = Object.keys(componentStatuses).filter(
      key => componentStatuses[key] != null
    );
    const initializedComponents = Object.keys(componentStatuses).filter(
      key => componentStatuses[key]?.initialized === true
    );

    const knex = this.knex;
    const hasKnexInstance = !!knex;

    return {
      // Core state (always present)
      initialized: this.#initialized,

      // Operational state
      isRunning: this.#initialized && hasKnexInstance,

      // Connection information
      connection: {
        name: this.#connectionName,
        hasKnexInstance,
        connectionType: knex?.client?.config?.client || null,
        poolSize: knex?.pool?.size || 0,
        poolUsed: knex?.pool?.used || 0,
        poolFree: knex?.pool?.free || 0,
        isShared: this.#isShared,
      },

      // Enhanced component information
      components: {
        available: availableComponents,
        total: Object.keys(componentStatuses).length,
        initialized: initializedComponents,
        // Component health summary
        health: {
          healthy: availableComponents.filter(
            name => componentStatuses[name]?.hasStatus === true && !componentStatuses[name]?.error
          ).length,
          unhealthy: availableComponents.filter(name => componentStatuses[name]?.error).length,
          unavailable: Object.keys(componentStatuses).filter(
            name => componentStatuses[name] == null
          ).length,
        },
      },

      // Enhanced pool and performance metrics
      poolMetrics: (() => {
        const warmingStatus = this.#getPoolWarmingStatus();
        return {
          warming: {
            status: warmingStatus,
            isCurrentlyWarming: warmingStatus?.status === 'warming',
            lastWarmingAttempt: warmingStatus?.startTime || null,
          },
        };
      })(),

      // Database information
      database: {
        client: knex?.client?.config?.client || null,
        connected: hasKnexInstance,
        config: this.#config.database || null,
      },

      // Configuration summary
      configuration: {
        hasDatabase: !!this.#config.database,
        hasMigrations: !!this.#config.migrations,
        hasSeeds: !!this.#config.seeds,
        hasModels: !!this.#config.models,
        hasTransactions: !!this.#config.transactions,
        hasSecurity: !!this.#config.security,
        cwd: this.#cwd,
      },

      timestamp: new Date(),
    };
  }

  /**
   * Get status of all components with proper error handling.
   *
   * @private
   * @returns {Promise<Object>} Component statuses with null for unavailable components
   */
  async #getComponentStatuses() {
    const statuses = {};

    for (const component of this.#getComponents()) {
      const fieldName = component.name;
      const instance = component.get();
      if (!instance) {
        statuses[fieldName] = null;
        continue;
      }

      statuses[fieldName] = { available: true };

      try {
        // Get component status and enhance with availability info
        const componentStatus = await instance.getStatus();
        statuses[fieldName] = {
          ...statuses[fieldName],
          ...componentStatus,
          available: true,
          hasStatus: true,
        };
      } catch (error) {
        statuses[fieldName] = {
          ...statuses[fieldName],
          hasStatus: false,
          error: error.message,
        };
      }
    }

    return statuses;
  }

  /**
   * Override component classes in the ConnectionManager with enhanced validation
   *
   * Provides a robust way to replace default component implementations with custom ones.
   * Must be called before creating any ConnectionManager instances. Supports comprehensive
   * validation and detailed error reporting for better debugging.
   *
   * @param {Object} overrides - Object mapping component names to custom class constructors
   * @param {Object} [options={}] - Override options
   * @param {boolean} [options.strict=true] - If true, performs strict validation and throws on errors; if false, logs warnings
   * @throws {Error} When overrides is invalid or contains invalid components (in strict mode)
   */
  static overrideComponents(overrides, options = {}) {
    // Use functional approach for component override
    return overrideComponents(COMPONENT_CLASSES, overrides, {
      ...options,
      contextName: 'ConnectionManager',
    });
  }

  /**
   * Validate app connection configuration and ensure required fields are present.
   * Validates app name and all component configurations for proper structure.
   * Called during construction to prevent invalid configurations.
   *
   * @private
   * @throws {Error} When configuration is invalid or missing required fields
   */
  #validateConfiguration() {
    if (!this.#connectionName) {
      throw new Error('Connection name must be required');
    }

    // Validate configuration is an object
    if (!this.#config || typeof this.#config !== 'object') {
      throw new Error('ConnectionManager configuration must be a valid object');
    }

    // Validate database configuration (required)
    if (!this.#config.database || typeof this.#config.database !== 'object') {
      throw new Error('Database configuration must be a valid object');
    }

    // Validate optional component configurations
    const optionalConfigs = ['migrations', 'seeds', 'models', 'transactions', 'security'];
    for (const configKey of optionalConfigs) {
      if (this.#config[configKey] != null && typeof this.#config[configKey] !== 'object') {
        throw new Error(`${configKey} configuration must be an object when provided`);
      }
    }

    // Validate shared flag
    if (this.#isShared != null && typeof this.#isShared !== 'boolean') {
      throw new Error('shared must be a boolean value');
    }
  }

  /**
   * Emit error event with consistent structure for monitoring and debugging.
   * Includes app name, phase, and timestamp for comprehensive error tracking.
   * Used internally by all methods for standardized error reporting.
   *
   * @private
   * @param {string} phase - The phase/operation where error occurred
   * @param {Object} context - Additional context information
   * @param {Error} error - The error that occurred
   */
  #emitError(phase, context, error) {
    this.emit('error', {
      phase,
      connectionName: this.#connectionName,
      error: error.message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Emit warning event with consistent structure for monitoring and debugging.
   * Includes app name, phase, and timestamp for comprehensive warning tracking.
   * Used internally for non-fatal issues that should be logged.
   *
   * @private
   * @param {string} phase - The phase/operation where warning occurred
   * @param {Object} context - Additional context information
   * @param {string} message - The warning message
   */
  #emitWarning(phase, context, message) {
    this.emit('warning', {
      phase,
      connectionName: this.#connectionName,
      message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Reset Knex instance and validation state
   * Centralizes the logic for clearing connection state
   *
   * @private
   */
  #resetKnexState() {
    this.#knexInstance = null;
    this.#knexValidated = false;
  }

  /**
   * Validate database connection with comprehensive health checks
   * Tests connection, validates schema access, and checks pool status
   *
   * @private
   * @param {Object} knex - Knex instance
   * @returns {Promise<void>}
   * @throws {Error} When connection validation fails
   */
  async #validateConnection(knex) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Basic connectivity test
        await knex.raw('SELECT 1 as test');

        // Test schema access (database-specific)
        const client = await this.#testSchemaAccess(knex);

        // Validate connection pool status
        await this.#validatePoolStatus(knex);

        // Emit successful validation
        this.emit('knex-validated', {
          connectionName: this.#connectionName,
          client,
          attempt,
          timestamp: new Date(),
        });

        return; // Success - exit retry loop
      } catch (error) {
        if (attempt === maxRetries) {
          throw new Error(
            `Connection validation failed after ${maxRetries} attempts: ${error.message}`
          );
        }

        // Emit retry warning
        this.#emitWarning(
          'connection-validation',
          { attempt, maxRetries, connectionName: this.#connectionName },
          `Validation attempt ${attempt} failed, retrying: ${error.message}`
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  /**
   * Test schema access based on database client type
   *
   * @private
   * @param {Object} knex - Knex instance
   * @returns {Promise<void>}
   */
  async #testSchemaAccess(knex) {
    try {
      switch (knex.client?.config?.client) {
        case 'mysql':
        case 'mysql2':
          await knex.raw('SELECT DATABASE() as current_db');
          break;
        case 'pg':
        case 'postgresql':
          await knex.raw('SELECT current_database(), current_schema()');
          break;
        case 'sqlite3':
          await knex.raw('PRAGMA database_list');
          break;
        case 'mssql':
          await knex.raw('SELECT DB_NAME() as current_db');
          break;
        default:
          // Generic test for unknown clients
          await knex.raw('SELECT 1');
      }
    } catch (error) {
      throw new Error(
        `Schema access test failed for ${knex.client?.config?.client}: ${error.message}`
      );
    }
  }

  /**
   * Validate connection pool status and configuration
   *
   * @private
   * @param {Object} knex - Knex instance
   * @returns {Promise<void>}
   */
  async #validatePoolStatus(knex) {
    try {
      const pool = knex.client?.pool;
      if (!pool) {
        throw new Error('Connection pool not available');
      }

      // Check pool configuration
      const poolConfig = {
        min: pool.min || 0,
        max: pool.max || 10,
        used: pool.numUsed?.() || 0,
        free: pool.numFree?.() || 0,
        pending: pool.numPendingAcquires?.() || 0,
      };

      // Validate pool is not exhausted
      if (poolConfig.used >= poolConfig.max && poolConfig.pending > 0) {
        throw new Error(
          `Connection pool exhausted: ${poolConfig.used}/${poolConfig.max} connections used, ${poolConfig.pending} pending`
        );
      }

      // Emit pool status for monitoring
      this.emit('pool-status', {
        connectionName: this.#connectionName,
        ...poolConfig,
        timestamp: new Date(),
      });
    } catch (error) {
      throw new Error(`Pool validation failed: ${error.message}`);
    }
  }

  /**
   * Check connection health and reset validation if needed
   * Can be called periodically to ensure connection remains valid
   *
   * @returns {Promise<Object>} Health status object with healthy boolean and issues array
   */
  async checkConnectionHealth() {
    try {
      // Quick health check
      await this.raw('SELECT 1');

      // If validation was previously false, re-validate fully
      if (!this.#knexValidated) {
        await this.#validateConnection(this.#knexInstance);
        this.#knexValidated = true;
      }

      this.emit('health-check-passed', {
        connectionName: this.#connectionName,
        validated: this.#knexValidated,
        timestamp: new Date(),
      });

      return { healthy: true, issues: [] };
    } catch (error) {
      this.#knexValidated = false;
      const issues = [error.message];

      this.emit('health-check-failed', {
        connectionName: this.#connectionName,
        error: error.message,
        timestamp: new Date(),
      });

      return { healthy: false, issues };
    }
  }

  /**
   * Shutdown shared components during AppRegistry shutdown
   *
   * @param {number} timeout - Timeout for each connection shutdown
   * @private
   */
  async #shutdownComponents(timeout) {
    const components = this.#getComponents();
    for (const component of components) {
      const instance = component.get();
      if (instance) {
        try {
          // Use timeout protection for component shutdown
          await TimeoutManager.withTimeout(() => instance.shutdown(), timeout, {
            operation: 'component-shutdown',
            component: component.name,
          });

          // Emit success event only after successful shutdown
          this.emit('component-shutdown', {
            component: component.name,
            success: true,
            timestamp: new Date(),
          });
        } catch (error) {
          this.#emitWarning(`Failed to shutdown ${component.name}`, {
            phase: 'component-shutdown',
            component: component.name,
            error: error.message,
          });
        }
      }
      // Always clear the reference
      component.set(null);
    }
  }

  /**
   * Shutdown database connection and cleanup all components.
   * Gracefully closes all components, database connection, and clears state.
   * Called by AppRegistry during app unregistration or system shutdown.
   *
   * @returns {Promise<Object>} Shutdown result with success status and app name
   * @throws {Error} When shutdown process encounters critical errors
   */
  async shutdown(options = {}) {
    const startTime = Date.now();
    const { timeout = 30000 } = options;

    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'ConnectionManager already shut down');
      return {
        success: true,
        reason: 'already-shutdown',
        duration: 0,
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };
    }

    this.#initialized = false;

    try {
      // Shutdown core components
      await this.#shutdownComponents(timeout);

      // Clear all state
      this.#resetKnexState();
      this.#poolWarmingStatus = null;

      const result = {
        success: true,
        duration: Date.now() - startTime,
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };

      this.emit('shutdown-completed', result);
      this.removeAllListeners();

      return result;
    } catch (error) {
      // Restore initialized state on error
      this.#initialized = true;

      this.#emitError('shutdown', {}, error);
      throw error;
    }
  }
}
