import { EventEmitter } from 'events';
import { mergeConfig } from './ConfigurationManager';
import { InputValidator } from './InputValidator';

/**
 * Security manager for a single database connection.
 * Provides secure Knex instance creation and validation for one ConnectionManager.
 * Simplified design focused on serving a single connection in the one-way flow architecture.
 */
export class SecurityManager extends EventEmitter {
  /** @type {Object} */
  #config;

  /** @type {Object} */
  #queryValidationPatterns;

  /** @type {Array<string>} */
  #blockedPatterns;

  /** @type {Set<string>} */
  #allowedOperations;

  /** @type {boolean} */
  #initialized = false;

  /** @type {Function} */
  #knexFactory;

  /** @type {Object|null} */
  #knexInstance = null;

  /** @type {string} */
  #connectionName = null;

  constructor(config = {}, connectionName = 'default') {
    super();

    // Validate parameters
    if (config != null && typeof config !== 'object') {
      throw new Error('Config must be an object or null');
    }
    if (typeof connectionName !== 'string' || connectionName.trim() === '') {
      throw new Error('Connection name must be a non-empty string');
    }

    // Store connection name for this SecurityManager
    this.#connectionName = connectionName;

    // Merge with comprehensive defaults
    this.#config = mergeConfig({ enabled: true }, config);
  }

  /**
   * Set Knex factory function for this connection.
   * Simplified validation for single connection SecurityManager.
   * @param {Function} value - Knex factory function
   * @throws {Error} If value is not a valid function
   */
  set knexFactory(value) {
    if (value != null && typeof value !== 'function') {
      throw new Error('knexFactory must be a function, null, or undefined');
    }

    this.#knexFactory = value;

    // Emit factory change event for monitoring
    this.emit('knex-factory-updated', {
      connectionName: this.#connectionName,
      hasFactory: !!value,
      timestamp: new Date(),
    });
  }

  /**
   * Get current Knex factory function
   * @returns {Function|null} Current factory function or null if not set
   */
  get knexFactory() {
    return this.#knexFactory;
  }

  /**
   * Check if Knex factory is available
   * @returns {boolean} True if factory is available
   */
  get hasKnexFactory() {
    return typeof this.#knexFactory === 'function';
  }

  /**
   * Check if SecurityManager is initialized
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Initialize SecurityManager with enhanced error handling and monitoring.
   * Sets up Knex factory, query validation, and security patterns.
   * Part of the ConnectionManager initialization flow.
   *
   * @returns {Promise<Object>} Initialization result with success status
   * @throws {Error} When initialization fails or already initialized
   */
  async initialize() {
    // Check if already initialized
    if (this.#initialized) {
      this.#emitWarning('initialize', {}, 'SecurityManager is already initialized');
      return { success: true, mode: 'already-initialized' };
    }

    this.#initialized = true;

    try {
      // Emit initialization start event
      this.emit('initialization-started', {
        timestamp: new Date(),
      });

      // Auto-detect and load Knex factory if not provided
      if (!this.#knexFactory) {
        await this.#loadKnexFactory();
      }

      // Verify factory is available after loading
      if (!this.#knexFactory || typeof this.#knexFactory !== 'function') {
        throw new Error('Knex factory is not available after initialization');
      }

      // Initialize query validation patterns
      this.#initializeQueryValidation();

      const result = {
        success: true,
        configuration: {
          validateQueries: this.#config.validateQueries,
          enableSqlInjectionPrevention: this.#config.enableSqlInjectionPrevention,
          logSecurityEvents: this.#config.logSecurityEvents,
          maxQueryLength: this.#config.maxQueryLength,
        },
        metrics: {
          allowedOperationsCount: this.#allowedOperations.size,
          blockedPatternsCount: this.#blockedPatterns.length,
        },
        knexFactory: {
          available: this.hasKnexFactory,
          source: this.#knexFactory ? 'loaded' : 'none',
        },
        timestamp: new Date(),
      };

      // Emit success event with comprehensive data
      this.emit('initialized', result);
      return result;
    } catch (error) {
      // Reset initialization state on error
      this.#initialized = false;

      this.#emitError('initialize', { phase: 'setup' }, error);
      throw new Error(`Failed to initialize SecurityManager: ${error.message}`);
    }
  }

  /**
   * Initialize query validation patterns
   * @private
   */
  #initializeQueryValidation() {
    // Ensure config fields exist with defaults
    const allowedOps = this.#config.allowedOperations || [];
    const blockedKws = this.#config.blockedKeywords || [];
    const maxLength = this.#config.maxQueryLength || 50000;

    this.#allowedOperations = new Set([
      'select',
      'insert',
      'update',
      'delete',
      'begin',
      'commit',
      'rollback',
      'savepoint',
      'release',
      // Normalize allowedOperations to lowercase
      ...allowedOps.map(op => op.toLowerCase()),
    ]);

    // SQL injection patterns to block
    this.#blockedPatterns = [
      /union\s+select/gi,
      /;\s*drop\s+/gi,
      /;\s*delete\s+from/gi,
      /;\s*insert\s+into/gi,
      /;\s*update\s+.*set/gi,
      /;\s*create\s+/gi,
      /;\s*alter\s+/gi,
      /;\s*truncate\s+/gi,
      /exec\s*\(/gi,
      /execute\s*\(/gi,
      /xp_cmdshell/gi,
      /sp_executesql/gi,
      /--.*$/gm,
      /\/\*.*?\*\//gs,
    ];

    // Common query validation patterns
    this.#queryValidationPatterns = {
      hasBalancedQuotes: sql => {
        const singleQuotes = (sql.match(/'/g) || []).length;
        const doubleQuotes = (sql.match(/"/g) || []).length;
        return singleQuotes % 2 === 0 && doubleQuotes % 2 === 0;
      },

      hasBalancedParentheses: sql => {
        let count = 0;
        for (const char of sql) {
          if (char === '(') count++;
          if (char === ')') count--;
          if (count < 0) return false;
        }
        return count === 0;
      },

      hasValidLength: sql => {
        return sql.length <= maxLength;
      },

      containsOnlyAllowedOperations: sql => {
        const normalizedSql = sql.toLowerCase().trim();
        const firstWord = normalizedSql.split(/\s+/)[0];
        return this.#allowedOperations.has(firstWord);
      },

      doesNotContainBlockedKeywords: sql => {
        const normalizedSql = sql.toLowerCase();
        return !blockedKws.some(keyword => normalizedSql.includes(keyword.toLowerCase()));
      },
    };
  }

  /**
   * Load Knex factory automatically
   * @private
   */
  async #loadKnexFactory() {
    let loadSource = 'unknown';

    try {
      // Try ESM import first
      try {
        const knexModule = await import('knex');
        this.#knexFactory = knexModule.default || knexModule;
        loadSource = 'esm-import';
      } catch (esmError) {
        // Fallback to CommonJS require for Node.js 12+
        try {
          this.#knexFactory = require('knex');
          loadSource = 'commonjs-require';
        } catch (cjsError) {
          throw new Error(
            `Failed to load Knex: ESM (${esmError.message}), CommonJS (${cjsError.message})`
          );
        }
      }

      // Validate loaded factory
      if (!this.#knexFactory || typeof this.#knexFactory !== 'function') {
        throw new Error('Loaded Knex module is not a valid factory function');
      }

      // Emit factory loaded event
      this.emit('knex-factory-loaded', {
        source: loadSource,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit('error', {
        phase: 'knex-factory-load',
        error: error.message,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Create secure Knex instance for this connection.
   * Simplified to serve a single connection with validation and security.
   * Part of the one-way flow where SecurityManager serves one ConnectionManager.
   *
   * @param {Object} config - Knex configuration object
   * @returns {Promise<Knex>} Secure Knex instance with validation hooks
   * @throws {Error} If factory is not available, config is invalid, or creation fails
   */
  async createKnexInstance(config) {
    // Validate SecurityManager state
    if (!this.#initialized) {
      const error = new Error('SecurityManager not initialized - cannot create Knex instance');
      this.#emitError('knex-creation', { phase: 'initialization-check' }, error);
      throw error;
    }

    // Return existing instance if already created
    if (this.#knexInstance && InputValidator.isValidKnexInstance(this.#knexInstance)) {
      this.emit('knex-reused', {
        connectionName: this.#connectionName,
        timestamp: new Date(),
      });
      return this.#knexInstance;
    }

    // Validate factory availability
    if (!this.#knexFactory || typeof this.#knexFactory !== 'function') {
      const error = new Error(
        'Knex factory is not available. Ensure SecurityManager is initialized.'
      );
      this.#emitError('knex-creation', { phase: 'factory-check' }, error);
      throw error;
    }

    // Validate configuration
    if (!config || typeof config !== 'object') {
      const error = new Error('Invalid Knex configuration - must be a valid object');
      this.#emitError('knex-creation', { phase: 'config-validation' }, error);
      throw error;
    }

    const creationStartTime = Date.now();

    try {
      // Emit creation start event
      this.emit('knex-creation-started', {
        connectionName: this.#connectionName,
        client: config.client,
        timestamp: new Date(),
      });

      // Create new Knex instance through factory
      const knex = this.#knexFactory(config);

      // Validate created instance
      if (!knex || typeof knex.raw !== 'function') {
        throw new Error('Factory produced invalid Knex instance - missing required methods');
      }

      // Validate additional Knex methods
      if (typeof knex.destroy !== 'function' || typeof knex.client !== 'object') {
        throw new Error(
          'Factory produced incomplete Knex instance - missing client or destroy method'
        );
      }

      // Store the single instance
      this.#knexInstance = knex;
    } catch (error) {
      this.#emitError(
        'knex-creation',
        {
          phase: 'factory-execution',
          duration: Date.now() - creationStartTime,
        },
        error
      );
      throw new Error(`Failed to create Knex instance: ${error.message}`);
    }

    try {
      // Define security metadata on the instance
      const createdAt = new Date();

      Object.defineProperty(this.#knexInstance, '_CONNECTION_NAME', {
        value: this.#connectionName,
        writable: false,
        configurable: false,
        enumerable: true,
      });

      Object.defineProperty(this.#knexInstance, '_CREATED_AT', {
        value: createdAt,
        writable: false,
        configurable: false,
        enumerable: true,
      });

      Object.defineProperty(this.#knexInstance, '_SECURITY_MANAGER', {
        value: true,
        writable: false,
        configurable: false,
        enumerable: false,
      });

      // Add query validation hook if enabled
      if (this.#config.validateQueries) {
        this.#addQueryValidationHook(this.#knexInstance);
      }

      const creationDuration = Date.now() - creationStartTime;

      // Emit successful creation event
      this.emit('knex-instance-created', {
        connectionName: this.#connectionName,
        client: config.client,
        poolConfig: {
          min: config.pool?.min || 0,
          max: config.pool?.max || 10,
        },
        validationEnabled: this.#config.validateQueries,
        duration: creationDuration,
        timestamp: createdAt,
      });

      return this.#knexInstance;
    } catch (error) {
      // Clean up on error
      this.destroyKnexInstance();

      this.#emitError(
        'knex-creation',
        {
          phase: 'security-setup',
          duration: Date.now() - creationStartTime,
        },
        error
      );
      throw new Error(`Failed to secure Knex instance: ${error.message}`);
    }
  }

  /**
   * Destroy the Knex instance for this connection.
   * Simplified to handle single instance destruction with proper cleanup.
   *
   * @param {number} timeout - Timeout in milliseconds (default: 10000)
   * @returns {Promise<boolean>} True if instance was destroyed successfully
   */
  async destroyKnexInstance(timeout = 10000) {
    // Check if instance exists
    if (!this.#knexInstance) {
      this.#emitWarning('knex-destruction', {}, 'No Knex instance to destroy');
      return false;
    }

    // Validate instance is still valid
    if (!InputValidator.isValidKnexInstance(this.#knexInstance)) {
      // Clear invalid instance
      this.#knexInstance = null;
      this.#emitWarning('knex-destruction', {}, 'Clearing invalid Knex instance');
      return false;
    }

    const destructionStartTime = Date.now();
    const createdAt = this.#knexInstance._CREATED_AT || new Date();
    let destructionSuccess = false;

    // Emit destruction start event
    this.emit('knex-destruction-started', {
      connectionName: this.#connectionName,
      createdAt,
      lifetime: Date.now() - createdAt.getTime(),
      timeout,
      timestamp: new Date(),
    });

    // Destroy the instance
    try {
      await this.#knexInstance.destroy();
      destructionSuccess = true;
    } catch (error) {
      this.#emitWarning(
        'knex-destruction',
        {
          timeout: false,
          duration: Date.now() - destructionStartTime,
        },
        `Failed to destroy Knex instance: ${error.message}`
      );
    }

    // Clear the instance reference
    this.#knexInstance = null;

    const destructionDuration = Date.now() - destructionStartTime;
    const lifetime = Date.now() - createdAt.getTime();

    // Emit destruction completion event
    this.emit('knex-instance-destroyed', {
      connectionName: this.#connectionName,
      destructionSuccess,
      duration: destructionDuration,
      lifetime,
      timestamp: new Date(),
    });

    return destructionSuccess;
  }

  /**
   * Add query validation hook to Knex
   */
  #addQueryValidationHook(knex) {
    const originalQuery = knex.client.query;
    const self = this;

    knex.client.query = function (connection, obj) {
      // Validate the query before execution
      const sql = typeof obj === 'string' ? obj : obj.sql;

      try {
        self.#validateQuery(sql, 'knex-hook');
      } catch (error) {
        self.#logSecurityEvent('query-blocked', {
          sql: self.#sanitizeQueryForLogging(sql),
          reason: error.message,
          connection: connection?.database || 'unknown',
        });

        return Promise.reject(error);
      }

      // Log successful validation
      self.#logSecurityEvent('query-validated', {
        sql: self.#sanitizeQueryForLogging(sql),
        connection: connection?.database || 'unknown',
      });

      // Execute original query
      return originalQuery.call(this, connection, obj);
    };
  }

  /**
   * Validate SQL query for security issues
   * @param {string} sql - SQL query to validate
   * @param {string} context - Validation context (default: 'unknown')
   * @returns {boolean} True if valid
   * @throws {Error} If query is invalid or SecurityManager not initialized
   */
  #validateQuery(sql, context = 'unknown') {
    // Check if initialized
    if (!this.#initialized || !this.#queryValidationPatterns) {
      throw new Error(
        'SecurityManager must be initialized before validating queries. Call initialize() first.'
      );
    }

    // Skip validation if disabled
    if (!this.#config.validateQueries) {
      return true;
    }

    if (!sql || typeof sql !== 'string') {
      throw new Error('Invalid query: SQL must be a non-empty string');
    }

    const trimmedSql = sql.trim();

    if (!trimmedSql) {
      throw new Error('Invalid query: SQL cannot be empty');
    }

    // Check query length
    if (!this.#queryValidationPatterns.hasValidLength(trimmedSql)) {
      throw new Error(`Query too long: exceeds ${this.#config.maxQueryLength} characters`);
    }

    // Check for balanced quotes
    if (!this.#queryValidationPatterns.hasBalancedQuotes(trimmedSql)) {
      throw new Error('Invalid query: unbalanced quotes detected');
    }

    // Check for balanced parentheses
    if (!this.#queryValidationPatterns.hasBalancedParentheses(trimmedSql)) {
      throw new Error('Invalid query: unbalanced parentheses detected');
    }

    // Check allowed operations
    if (!this.#queryValidationPatterns.containsOnlyAllowedOperations(trimmedSql)) {
      throw new Error('Invalid query: operation not allowed');
    }

    // Check for blocked keywords
    if (!this.#queryValidationPatterns.doesNotContainBlockedKeywords(trimmedSql)) {
      throw new Error('Invalid query: contains blocked keywords');
    }

    // Check for SQL injection patterns
    for (const pattern of this.#blockedPatterns) {
      if (pattern.test(trimmedSql)) {
        throw new Error('Invalid query: potential SQL injection detected');
      }
    }

    // Additional custom validation
    this.#performCustomValidation(trimmedSql, context);

    return true;
  }

  /**
   * Perform custom validation rules
   */
  #performCustomValidation(sql, context) {
    // Check for multiple statements (unless explicitly allowed)
    if (!this.#config.allowMultipleStatements && sql.includes(';')) {
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      if (statements.length > 1) {
        throw new Error('Invalid query: multiple statements not allowed');
      }
    }

    // Check for potentially dangerous functions
    const dangerousFunctions = [
      'load_file',
      'into outfile',
      'into dumpfile',
      'benchmark',
      'sleep',
      'pg_sleep',
      'waitfor delay',
    ];

    const lowerSql = sql.toLowerCase();
    for (const func of dangerousFunctions) {
      if (lowerSql.includes(func)) {
        throw new Error(`Invalid query: dangerous function '${func}' detected`);
      }
    }

    // Context-specific validation
    if (context === 'app' && sql.toLowerCase().includes('information_schema')) {
      throw new Error('Invalid query: access to information_schema not allowed for apps');
    }
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  #sanitizeQueryForLogging(sql) {
    if (!sql) return '';

    let sanitized = sql;

    // Remove potential passwords/secrets from INSERT/UPDATE statements
    sanitized = sanitized.replace(/(password|secret|token|key)\s*=\s*['"][^'"]*['"]/gi, '$1=***');

    // Remove values from INSERT statements
    sanitized = sanitized.replace(
      /insert\s+into\s+\w+\s*\([^)]*\)\s*values\s*\([^)]*\)/gi,
      'INSERT INTO table(...) VALUES(...)'
    );

    // Truncate if too long
    if (sanitized.length > 200) {
      sanitized = `${sanitized.substring(0, 200)}...`;
    }

    return sanitized;
  }

  /**
   * Log security events
   */
  #logSecurityEvent(type, data) {
    if (!this.#config.logSecurityEvents) {
      return;
    }

    const event = mergeConfig(
      {
        type,
        timestamp: new Date(),
      },
      data
    );

    // In production, this should go to a proper logging system
    if (type === 'query-blocked') {
      // eslint-disable-next-line no-console
      console.warn('🛡️ Security Event:', event);
    } else {
      // eslint-disable-next-line no-console
      console.log('🛡️ Security Event:', event);
    }
  }

  /**
   * Add or update validation rule
   * @param {string} name - Rule name
   * @param {Function} validator - Validation function
   * @throws {Error} If validator is not a function or SecurityManager not initialized
   */
  updateValidationRule(name, validator) {
    if (!this.#initialized || !this.#queryValidationPatterns) {
      throw new Error(
        'SecurityManager must be initialized before adding validation rules. Call initialize() first.'
      );
    }

    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.#queryValidationPatterns[name] = validator;

    this.emit('validation-rule-updated', {
      ruleName: name,
      timestamp: new Date(),
    });
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration to apply
   * @returns {Object} Updated configuration
   */
  updateConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
      throw new Error('Configuration must be a valid object');
    }

    const oldConfig = mergeConfig({}, this.#config);
    this.#config = mergeConfig(oldConfig, newConfig);

    // Reinitialize validation if patterns changed
    // Only reinitialize if already initialized (otherwise wait for initialize() call)
    if (
      this.#initialized &&
      (newConfig.allowedOperations || newConfig.blockedKeywords || newConfig.maxQueryLength)
    ) {
      this.#initializeQueryValidation();
    }

    // Emit standard config-updated event
    this.emit('config-updated', {
      oldConfig,
      newConfig: this.#config,
      timestamp: new Date(),
    });

    // Also log security event for audit trail
    this.#logSecurityEvent('config-updated', {
      oldConfig,
      newConfig: this.#config,
    });

    return this.#config;
  }

  /**
   * Get security status for this connection.
   * Simplified status reporting for single connection SecurityManager.
   * Part of the one-way flow architecture status reporting.
   *
   * @returns {Object} Status with security configuration and connection info
   */
  getStatus() {
    const hasInstance =
      this.#knexInstance && InputValidator.isValidKnexInstance(this.#knexInstance);

    return {
      // Core state (always present)
      initialized: this.#initialized,

      // Operational state
      isRunning: this.#initialized && this.hasKnexFactory,

      // Connection information
      connection: {
        name: this.#connectionName,
        hasKnexInstance: hasInstance,
        instanceCreatedAt: hasInstance ? this.#knexInstance._CREATED_AT : null,
        instanceLifetime:
          hasInstance && this.#knexInstance._CREATED_AT
            ? Date.now() - this.#knexInstance._CREATED_AT.getTime()
            : null,
      },

      // Configuration summary
      configuration: {
        validateQueries: this.#config.validateQueries,
        enableSqlInjectionPrevention: this.#config.enableSqlInjectionPrevention,
        logSecurityEvents: this.#config.logSecurityEvents,
        maxQueryLength: this.#config.maxQueryLength,
        allowMultipleStatements: this.#config.allowMultipleStatements,
        enabled: this.#config.enabled,
      },

      // Security metrics
      metrics: {
        allowedOperationsCount: this.#allowedOperations?.size || 0,
        blockedPatternsCount: this.#blockedPatterns?.length || 0,
        validationRulesCount: Object.keys(this.#queryValidationPatterns || {}).length,
      },

      // Knex factory status
      knexFactory: {
        available: this.hasKnexFactory,
        type: this.#knexFactory ? 'loaded' : 'none',
        source: this.#knexFactory ? 'external-or-auto' : 'none',
      },

      // Instance tracking
      totalInstances: hasInstance ? 1 : 0,
      activeConnections: hasInstance ? 1 : 0,

      // Statistics
      statistics: {
        totalCreated: hasInstance ? 1 : 0,
        totalDestroyed: 0,
        currentActive: hasInstance ? 1 : 0,
      },

      // Timestamp (always present)
      timestamp: new Date(),

      // Full config (optional, for debugging)
      config: { ...this.#config },
    };
  }

  /**
   * Emit standardized warning event
   * @param {string} phase - Operation phase
   * @param {Object} context - Additional context
   * @param {string} message - Warning message
   * @private
   */
  #emitWarning(phase, context = {}, message) {
    this.emit('warning', {
      phase,
      message,
      ...context,
      timestamp: new Date(),
    });
  }

  /**
   * Emit standardized error event
   * @param {string} phase - Operation phase
   * @param {Object} context - Additional context
   * @param {Error} error - Error object
   * @private
   */
  #emitError(phase, context = {}, error) {
    this.emit('error', {
      phase,
      error: error.message,
      ...context,
      timestamp: new Date(),
    });
  }

  /**
   * Shutdown SecurityManager with cleanup of the Knex instance.
   * Simplified shutdown for single connection SecurityManager.
   * Part of the ConnectionManager shutdown flow.
   *
   * @param {Object} options - Options object
   * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
   * @returns {Promise<Object>} Shutdown result with success status
   */
  async shutdown({ timeout = 10000 } = {}) {
    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'SecurityManager already shut down');
      return {
        success: true,
        reason: 'already-shutdown',
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };
    }

    // Reset initialization state
    this.#initialized = false;

    try {
      // Emit shutdown start event
      this.emit('shutdown-started', {
        connectionName: this.#connectionName,
        hasKnexInstance: !!this.#knexInstance,
        timeout,
        timestamp: new Date(),
      });

      // Destroy Knex instance if it exists
      const instanceDestroyed = await this.destroyKnexInstance(timeout);

      const result = {
        success: true,
        connectionName: this.#connectionName,
        instanceDestroyed,
        timestamp: new Date(),
      };

      this.emit('shutdown-completed', result);
      return result;
    } catch (error) {
      this.#emitWarning('shutdown', {}, `SecurityManager shutdown failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      // Reset all state
      this.#queryValidationPatterns = {};
      this.#blockedPatterns = [];
      this.#allowedOperations = new Set();
      this.#knexInstance = null;

      this.removeAllListeners();
    }
  }
}
