import { EventEmitter } from 'events';

/**
 * Deeply merge multiple objects with array replacement strategy
 * @param {...Object} sources - Objects to merge (first object is the base)
 * @returns {Object} Deeply merged object
 */
export function mergeConfig(...sources) {
  // Filter out null/undefined sources
  const validSources = sources.filter(source => source != null);

  if (validSources.length === 0) {
    return {};
  }

  if (validSources.length === 1) {
    return validSources[0];
  }

  // Use reduce to merge all sources sequentially
  return validSources.reduce((result, source) => mergeTwoObjects(result, source));
}

/**
 * Internal function to merge exactly two objects
 * @param {Object} target - Target object to merge into
 * @param {Object} source - Source object to merge from
 * @returns {Object} Deeply merged object
 * @private
 */
function mergeTwoObjects(target, source) {
  // Handle null/undefined cases
  if (!source || typeof source !== 'object') {
    return target;
  }

  if (!target || typeof target !== 'object') {
    return source;
  }

  // Handle arrays - replace rather than merge
  if (Array.isArray(source)) {
    return [...source];
  }

  if (Array.isArray(target)) {
    return Array.isArray(source) ? [...source] : source;
  }

  // Create result object starting with target
  const result = { ...target };

  // Recursively merge each property from source
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof RegExp) &&
      !(value instanceof Date)
    ) {
      // Recursively merge nested objects (but not RegExp, Date, or other special objects)
      result[key] = mergeTwoObjects(result[key] || {}, value);
    } else {
      // Direct assignment for primitives, arrays, RegExp, Date, and null values
      result[key] = value;
    }
  }

  return result;
}

/**
 * Simple Configuration Manager for rapid-objection
 * Provides basic configuration management with defaults and event emission
 */
export class ConfigurationManager extends EventEmitter {
  /** @type {Object} */
  #data;

  /**
   * Creates a new ConfigurationManager instance
   * @param {Object} initialConfig - Initial configuration object
   */
  constructor(initialConfig = {}) {
    super();

    // Expand dot notation keys in initial config
    const expandedConfig = this.#expandDotNotation(initialConfig);

    // Detect if database config is at root level and reorganize it
    const organizedConfig = this.#organizeConfiguration(expandedConfig);

    // Initialize configuration with defaults
    this.#data = mergeConfig({}, this.#defaults, organizedConfig);
  }

  /**
   * Expand dot notation keys into nested objects
   * @param {Object} config - Configuration object with potential dot notation keys
   * @returns {Object} Expanded configuration object
   * @private
   */
  #expandDotNotation(config) {
    if (!config || typeof config !== 'object') {
      return config;
    }

    const result = {};

    for (const [key, value] of Object.entries(config)) {
      if (key.includes('.')) {
        // Use the existing setNestedValue method to handle dot notation
        this.#setNestedValue(result, key, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Organize configuration by detecting database config at root level
   * @param {Object} config - Raw configuration object
   * @returns {Object} Organized configuration
   * @private
   */
  #organizeConfiguration(config) {
    if (!config || typeof config !== 'object') {
      return config;
    }

    // List of database-specific keys that might be at root level
    const databaseKeys = [
      'client',
      'connection',
      'host',
      'port',
      'user',
      'password',
      'database',
      'filename',
      'pool',
    ];

    const hasDatabaseKeysAtRoot = databaseKeys.some(key => key in config);

    if (hasDatabaseKeysAtRoot && !config.database) {
      // Move database keys under 'database' property
      const databaseConfig = {};
      const otherConfig = {};

      for (const [key, value] of Object.entries(config)) {
        if (databaseKeys.includes(key)) {
          databaseConfig[key] = value;
        } else {
          otherConfig[key] = value;
        }
      }

      return {
        ...otherConfig,
        database: databaseConfig,
      };
    }

    return config;
  }

  /**
   * Get comprehensive default configuration values
   *
   * Provides comprehensive defaults for all rapid-objection components including:
   * - Database connection and pool settings
   * - Migration and seed management
   * - Model configuration and validation
   * - Transaction and security settings
   * - Multi-app registry and communication
   *
   * All paths are relative to the current working directory and can be overridden
   * through configuration. The returned object is frozen to prevent accidental
   * modification of default values.
   *
   * @returns {Object} Comprehensive default configuration object
   */
  get #defaults() {
    const baseDefaults = {
      // =================================================================
      // DATABASE CONFIGURATION
      // =================================================================
      database: {
        client: 'sqlite3',
        connection: {
          filename: 'database.sqlite',
        },
        useNullAsDefault: true,
        pool: {
          min: 2, // Minimum connections
          max: 10, // Maximum connections
          acquireTimeoutMillis: 30000, // Connection acquisition timeout
          createTimeoutMillis: 30000, // Connection creation timeout
          destroyTimeoutMillis: 5000, // Connection destruction timeout
          idleTimeoutMillis: 30000, // Idle connection timeout
          reapIntervalMillis: 1000, // Pool cleanup interval
          createRetryIntervalMillis: 100, // Retry interval for failed connections
        },
        debug: false, // Enable query debugging
        asyncStackTraces: false, // Enable async stack traces
      },

      // =================================================================
      // MIGRATION CONFIGURATION
      // =================================================================
      migrations: {
        enabled: true, // Enable migration system
        directory: 'migrations',
        tableName: 'knex_migrations', // Migration tracking table
        extension: 'js', // Default file extension
        loadExtensions: ['.js', '.mjs', '.cjs', '.ts'], // Supported extensions
        schemaName: null, // Schema name (PostgreSQL)
        disableTransactions: false, // Disable transaction wrapping
        sortDirsSeparately: false, // Sort directories separately
      },

      // =================================================================
      // SEED CONFIGURATION
      // =================================================================
      seeds: {
        enabled: true, // Enable seed system
        directory: 'seeds',
        tableName: 'knex_seeds', // Seeds tracking table
        loadExtensions: ['.js', '.mjs', '.cjs', '.ts'], // Supported extensions
        recursive: true, // Search subdirectories
        sortDirsSeparately: false, // Sort directories separately
      },

      // =================================================================
      // MODEL CONFIGURATION
      // =================================================================
      models: {
        enabled: true, // Enable model system
        bindKnex: true, // Automatically bind Knex to models
        validateModels: true, // Validate model definitions
        defaultModelOptions: {}, // Default options for all models
      },

      // =================================================================
      // TRANSACTION CONFIGURATION
      // =================================================================
      transactions: {
        enabled: true, // Enable transaction system
        isolationLevel: 'read committed', // Default isolation level
        timeout: 30000, // Transaction timeout (ms)
        maxRetries: 3, // Maximum retry attempts
        retryDelay: 1000, // Retry delay (ms)
        enableDeadlockDetection: true, // Enable deadlock detection
      },

      // =================================================================
      // SECURITY CONFIGURATION
      // =================================================================
      security: {
        enabled: true, // Enable security features
        maxQueryLength: 100000, // Maximum query length
        sanitizeQueries: true, // Sanitize SQL queries
        preventSqlInjection: true, // SQL injection prevention
        enableQueryWhitelist: false, // Enable query whitelist
        logSecurityEvents: true, // Log security events
        encryptSensitiveData: false, // Encrypt sensitive data
      },

      // =================================================================
      // MULTI-APP REGISTRY
      // =================================================================
      registry: {
        enableHealthMonitoring: false, // Enable registry health monitoring
        healthCheckInterval: 30000, // Health check interval (ms)
        healthPerformanceThreshold: 2000, // Performance threshold for health scoring (ms)
        shutdownTimeout: 30000, // Shutdown timeout (ms)
      },
    };

    return Object.freeze(baseDefaults);
  }

  /**
   * Get configuration value
   * @param {string} path - Configuration path (dot notation)
   * @param {*} [defaultValue] - Default value to return if path doesn't exist
   * @returns {*} Configuration value or default value
   * @throws {Error} When path is not a valid string
   */
  get(path, defaultValue = undefined) {
    if (!path || typeof path !== 'string') {
      throw new Error('Configuration path must be a non-empty string');
    }

    const value = this.#getNestedValue(this.#data, path);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} path - Configuration path (dot notation)
   * @param {*} value - Configuration value
   * @throws {Error} When path is not a valid string
   */
  set(path, value) {
    if (!path || typeof path !== 'string') {
      throw new Error('Configuration path must be a non-empty string');
    }

    const previousValue = this.get(path);
    this.#setNestedValue(this.#data, path, value);

    // Emit change event
    this.emit('config-changed', {
      path,
      previousValue,
      newValue: value,
      timestamp: new Date(),
    });
  }

  /**
   * Get all configuration as an object
   * @param {boolean} deepClone - Whether to return a deep clone (default: true)
   * @returns {Object} Configuration object
   * @throws {Error} When cloning fails
   */
  getAll(deepClone = true) {
    if (!deepClone) {
      return this.#data;
    }

    try {
      return this.#deepClone(this.#data);
    } catch (error) {
      this.emit('error', {
        phase: 'get-all',
        error: error.message,
        timestamp: new Date(),
      });
      throw new Error(`Failed to clone configuration: ${error.message}`);
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to get value from
   * @param {string} path - Dot notation path
   * @returns {*} Value at path
   * @private
   */
  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   * @param {Object} obj - Object to set value in
   * @param {string} path - Dot notation path
   * @param {*} value - Value to set
   * @private
   */
  #setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Deep clone an object efficiently
   * @param {*} obj - Object to clone
   * @returns {*} Cloned object
   * @private
   */
  #deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
      return obj.map(item => this.#deepClone(item));
    }

    if (typeof obj === 'object') {
      const cloned = {};
      for (const [key, value] of Object.entries(obj)) {
        cloned[key] = this.#deepClone(value);
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Graceful shutdown with cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.removeAllListeners();
    this.emit('shutdown-completed', {
      timestamp: new Date(),
    });
  }
}
