import { EventEmitter } from 'events';
import { SeedRunner } from './SeedRunner';
import { SeedValidator } from './SeedValidator';
import { mergeConfig } from '../ConfigurationManager';
import { TimeoutManager } from '../TimeoutManager';
import { overrideComponents } from '../overrideComponents';

// Default component classes registry for SeedManager
const COMPONENT_CLASSES = {
  SeedRunner,
  SeedValidator,
  TimeoutManager,
};

/**
 * Seed manager for a single database connection.
 */
export class SeedManager extends EventEmitter {
  /** @type {SeedValidator} */
  #validator;

  /** @type {SeedRunner} */
  #runner;

  /** @type {boolean} */
  #initialized = false;

  /** @type {Object} */
  #config;

  /** @type {string} */
  #connectionName;

  /**
   * Create a new SeedManager instance for a specific connection
   *
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Name of the connection this SeedManager serves
   */
  constructor(config = {}, connectionName = 'default') {
    super();

    // Validate parameters
    if (config != null && typeof config !== 'object') {
      throw new Error('Config must be an object or null');
    }
    if (typeof connectionName !== 'string' || connectionName.trim() === '') {
      throw new Error('Connection name must be a non-empty string');
    }

    this.#connectionName = connectionName;
    this.#config = mergeConfig({}, config);

    // Create components with connection context using overridden classes
    this.#validator = new COMPONENT_CLASSES.SeedValidator(
      this.#config.validation,
      this.#connectionName
    );
    this.#runner = new COMPONENT_CLASSES.SeedRunner(
      this.#validator,
      this.#config,
      this.#connectionName
    );
  }

  /**
   * Ensure manager is initialized
   *
   * @private
   * @throws {Error} If not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('SeedManager not initialized. Call initialize() first.');
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
   * Initialize the seed manager and its components.
   * Called by ConnectionManager as part of connection initialization flow.
   *
   * @returns {Promise<Object>} Initialization result with success status and connection name
   * @throws {Error} When initialization fails or already initialized
   */
  async initialize() {
    if (this.#initialized) {
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
   * Get the seed runner's seed method.
   * Provides direct access to seed operations.
   *
   * @returns {Function} The seed method bound to the runner
   * @throws {Error} If SeedManager is not initialized
   */
  get seed() {
    this.#ensureInitialized();
    return this.#runner.seed.bind(this.#runner);
  }

  /**
   * Get the seed runner's rollback method.
   * Provides direct access to rollback operations.
   *
   * @returns {Function} The rollback method bound to the runner
   * @throws {Error} If SeedManager is not initialized
   */
  get rollback() {
    this.#ensureInitialized();
    return this.#runner.rollback.bind(this.#runner);
  }

  /**
   * Get seed manager status
   *
   * @returns {Object} Status information
   */
  getStatus() {
    // Get detailed component statuses
    const validatorStatus = this.#validator?.getStatus() || { initialized: false };
    const runnerStatus = this.#runner?.getStatus() || { initialized: false };

    return {
      // Core state
      initialized: this.#initialized,

      // Operational state
      seedsRunning: runnerStatus.seedsRunning || false,

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

      // Directory information
      directory: this.#config.directory || null,

      // Timestamp
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
   * Override component classes in the SeedManager with enhanced validation
   *
   * Provides a robust way to replace default component implementations with custom ones.
   * Must be called before creating any SeedManager instances. Supports comprehensive
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
      contextName: 'SeedManager',
    });
  }

  /**
   * Shutdown SeedManager with cleanup of components.
   * Simplified shutdown for single connection SeedManager.
   * Part of the ConnectionManager shutdown flow.
   *
   * @param {Object} options - Options object
   * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
   * @returns {Promise<Object>} Shutdown result with success status
   */
  async shutdown({ timeout = 30000 } = {}) {
    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'SeedManager already shut down');
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
        { name: 'SeedRunner', component: this.#runner },
        { name: 'SeedValidator', component: this.#validator },
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
      this.#emitWarning('shutdown', {}, `SeedManager shutdown failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      // Reset all state
      this.#validator = null;
      this.#runner = null;

      this.removeAllListeners();
    }
  }
}
