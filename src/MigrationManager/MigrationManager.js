import { EventEmitter } from 'events';
import { MigrationRunner } from './MigrationRunner';
import { MigrationValidator } from './MigrationValidator';
import { mergeConfig } from '../ConfigurationManager';
import { TimeoutManager } from '../TimeoutManager';
import { overrideComponents } from '../overrideComponents';

// Default component classes registry for MigrationManager
const COMPONENT_CLASSES = {
  MigrationRunner,
  MigrationValidator,
  TimeoutManager,
};

/**
 * Migration manager for a single database connection.
 */
export class MigrationManager extends EventEmitter {
  /** @type {MigrationValidator} */
  #validator;

  /** @type {MigrationRunner} */
  #runner;

  /** @type {boolean} */
  #initialized = false;

  /** @type {Object} */
  #config;

  /** @type {string} */
  #connectionName = null;

  /**
   * Create a new MigrationManager instance for a single connection
   *
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Connection name for this MigrationManager
   */
  constructor(config = {}, connectionName = 'default') {
    super();

    // Store connection name for this MigrationManager
    this.#connectionName = connectionName;

    // Merge with comprehensive defaults
    this.#config = mergeConfig({ enabled: true }, config);

    this.#validator = new COMPONENT_CLASSES.MigrationValidator(
      this.#config.validation,
      this.#connectionName
    );
    this.#runner = new COMPONENT_CLASSES.MigrationRunner(
      this.#validator,
      this.#config,
      this.#connectionName
    );
  }

  /**
   * Ensure manager is initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('MigrationManager not initialized. Call initialize() first.');
    }
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
   * Initialize MigrationManager with enhanced error handling and monitoring.
   * Sets up migration components and validation.
   * Part of the ConnectionManager initialization flow.
   *
   * @returns {Promise<Object>} Initialization result with success status
   * @throws {Error} When initialization fails or already initialized
   */
  async initialize() {
    // Check if already initialized
    if (this.#initialized) {
      this.#emitWarning('initialize', {}, 'MigrationManager is already initialized');
      return { success: true, mode: 'already-initialized' };
    }

    this.#initialized = true;

    try {
      // Emit initialization start event
      this.emit('initialization-started', {
        connectionName: this.#connectionName,
        timestamp: new Date(),
      });

      // Initialize components
      await this.#validator.initialize();
      await this.#runner.initialize();

      // Auto-run migrations if knex instance is provided in config
      const result = {
        success: true,
        connectionName: this.#connectionName,
        configuration: {
          validation: this.#config.validation || {},
          runner: this.#config.runner || {},
        },
        components: {
          validator: !!this.#validator,
          runner: !!this.#runner,
        },
        timestamp: new Date(),
      };

      this.emit('initialization-completed', result);
      return result;
    } catch (error) {
      this.#initialized = false;
      this.#emitError('initialize', { connectionName: this.#connectionName }, error);
      throw error;
    }
  }

  /**
   * Run migrations with process ownership tracking.
   * Automatically includes the connection name as appName for process ownership.
   *
   * @param {Object} options - Migration options
   * @returns {Promise<Object>} Migration result
   * @throws {Error} If MigrationManager is not initialized
   */
  async migrate(options = {}) {
    this.#ensureInitialized();

    // Include connection name as appName for process ownership tracking
    const migrationOptions = {
      ...options,
      appName: options.appName || this.#connectionName,
    };

    return await this.#runner.migrate(migrationOptions);
  }

  /**
   * Rollback migrations with app-specific filtering.
   * Automatically includes the connection name as appName for process ownership filtering.
   *
   * @param {Object} options - Rollback options
   * @returns {Promise<Object>} Rollback result
   * @throws {Error} If MigrationManager is not initialized
   */
  async rollback(options = {}) {
    this.#ensureInitialized();

    // Include connection name as appName for app-specific rollback filtering
    const rollbackOptions = {
      ...options,
      appName: options.appName || this.#connectionName,
    };

    return await this.#runner.rollback(rollbackOptions);
  }

  /**
   * Get migration status for this connection.
   * Simplified status reporting for single connection MigrationManager.
   * Part of the one-way flow architecture status reporting.
   *
   * @returns {Object} Status with migration configuration and connection info
   */
  getStatus() {
    // Get detailed component statuses
    const validatorStatus = this.#validator?.getStatus() || { initialized: false };
    const runnerStatus = this.#runner?.getStatus() || { initialized: false };

    return {
      // Core state (always present)
      initialized: this.#initialized,

      // Operational state
      migrationsRunning: runnerStatus.runningMigrations > 0,

      // Connection information
      connection: {
        name: this.#connectionName,
        hasValidator: !!this.#validator,
        hasRunner: !!this.#runner,
      },

      // Sub-components status
      components: {
        validator: {
          available: !!this.#validator,
          status: validatorStatus,
        },
        runner: {
          available: !!this.#runner,
          status: runnerStatus,
        },
      },

      // Configuration summary
      configuration: {
        validation: this.#config.validation || {},
        runner: this.#config.runner || {},
      },

      // Timestamp (always present)
      timestamp: new Date(),
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
      connectionName: this.#connectionName,
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
      connectionName: this.#connectionName,
      ...context,
      timestamp: new Date(),
    });
  }

  /**
   * Override component classes in the MigrationManager with enhanced validation
   *
   * Provides a robust way to replace default component implementations with custom ones.
   * Must be called before creating any MigrationManager instances. Supports comprehensive
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
      contextName: 'MigrationManager',
    });
  }

  /**
   * Shutdown MigrationManager with cleanup of components.
   * Simplified shutdown for single connection MigrationManager.
   * Part of the ConnectionManager shutdown flow.
   *
   * @param {Object} options - Options object
   * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
   * @returns {Promise<Object>} Shutdown result with success status
   */
  async shutdown({ timeout = 30000 } = {}) {
    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'MigrationManager already shut down');
      return { success: false, reason: 'already-shutdown' };
    }

    // Reset initialization state
    this.#initialized = false;

    try {
      // Emit shutdown start event
      this.emit('shutdown-started', {
        connectionName: this.#connectionName,
        hasValidator: !!this.#validator,
        hasRunner: !!this.#runner,
        timeout,
        timestamp: new Date(),
      });

      const startTime = Date.now();
      const shutdownStats = { shutdownCount: 0, errors: [] };

      // Shutdown components in reverse order with timeout protection
      const components = [
        { name: 'MigrationRunner', component: this.#runner },
        { name: 'MigrationValidator', component: this.#validator },
      ];

      for (const { name, component } of components) {
        try {
          await TimeoutManager.withTimeout(() => component.shutdown(), timeout, {
            operation: `${name} shutdown`,
            component: name,
          });
          shutdownStats.shutdownCount++;
          this.emit('component-shutdown', {
            component: name,
            connectionName: this.#connectionName,
            timestamp: new Date(),
          });
        } catch (error) {
          const errorMsg = `Failed to shutdown ${name}: ${error.message}`;
          shutdownStats.errors.push(errorMsg);
          this.#emitWarning(
            'component-shutdown',
            {
              component: name,
              connectionName: this.#connectionName,
            },
            errorMsg
          );
        }
      }

      const result = {
        success: true,
        connectionName: this.#connectionName,
        shutdownTime: Date.now() - startTime,
        statistics: shutdownStats,
        timestamp: new Date(),
      };

      this.emit('shutdown-completed', result);
      return result;
    } catch (error) {
      this.#emitWarning('shutdown', {}, `MigrationManager shutdown failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      // Reset all state
      this.#validator = null;
      this.#runner = null;

      this.removeAllListeners();
    }
  }
}
