import { EventEmitter } from 'events';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';

/**
 * @typedef {Object} MigrationOptions
 * @property {Object} knex - Knex instance
 * @property {boolean} [dryRun=false] - Whether to perform dry run
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} success - Whether migration succeeded
 * @property {number} duration - Migration duration in milliseconds
 * @property {Array<string>} migrations - List of migration files
 * @property {Date} timestamp - Migration timestamp
 */

/**
 * @typedef {Object} RollbackOptions
 * @property {Object} knex - Knex instance
 * @property {number} [step=1] - Number of steps to rollback
 * @property {boolean} [dryRun=false] - Whether to perform dry run
 */

/**
 * @typedef {Object} RollbackResult
 * @property {boolean} success - Whether rollback succeeded
 * @property {number} duration - Rollback duration in milliseconds
 * @property {Array<string>} rolledBack - List of rolled back migrations
 * @property {Date} timestamp - Rollback timestamp
 */

/**
 * MigrationRunner - Handles database migrations for a single connection.
 * Simplified design for the one-way flow architecture.
 *
 * @extends EventEmitter
 */
export class MigrationRunner extends EventEmitter {
  /** @type {MigrationValidator} */
  #validator;

  /** @type {Object} */
  #config;

  /** @type {string} */
  #connectionName;

  /** @type {boolean} */
  #initialized = false;

  /** @type {boolean} */
  #isRunning = false;

  /**
   * Create a new MigrationRunner instance for a single connection
   *
   * @param {MigrationValidator} validator - Validator for migration files
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Connection name
   */
  constructor(validator, config = {}, connectionName = 'default') {
    super();

    if (!validator) {
      throw new Error('MigrationValidator is required');
    }

    this.#validator = validator;
    this.#config = mergeConfig({ enabled: true }, config);
    this.#connectionName = connectionName;
    this.#initialized = true;
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
   * Initialize MigrationRunner.
   *
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    if (this.#initialized) {
      return { success: true, mode: 'already-initialized' };
    }

    this.#initialized = true;
    return {
      success: true,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    };
  }

  /**
   * Run migrations for this connection.
   *
   * @param {MigrationOptions} options - Migration options
   * @returns {Promise<MigrationResult>} Migration result
   */
  async migrate(options = {}) {
    if (!this.#initialized) {
      throw new Error('MigrationRunner not initialized');
    }

    if (this.#isRunning) {
      throw new Error('Migration already running');
    }

    const { knex, dryRun = false, directory, ...config } = mergeConfig({}, options);

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get migration directory from Knex config
    const migrationsPath = directory || knex.client.config.migrations?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate migration directory before execution
    const validation = await this.#validator.validateMigrationsPath(migrationsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Migration directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      const reasons = validation.invalid.map(f => `${f.file}: ${f.reason}`).join('; ');
      throw new Error(`Invalid migration files found: ${invalidFiles}. Reasons: ${reasons}`);
    }

    // Handle case where no valid migration files are found
    if (validation.valid.length === 0) {
      return {
        success: true,
        batchNo: 0,
        duration: Date.now() - startTime,
        migrations: [],
        timestamp: new Date(),
        message: 'No migration files found to execute',
      };
    }

    this.#isRunning = true;

    try {
      if (dryRun) {
        // For dry run, return validated migrations
        return {
          success: true,
          duration: Date.now() - startTime,
          migrations: validation.valid.map(m => m.file),
          timestamp: new Date(),
        };
      }

      // Run actual migrations
      const [batchNo, migrations] = await knex.migrate.latest({
        ...config,
        directory: migrationsPath,
      });

      return {
        success: true,
        batchNo,
        duration: Date.now() - startTime,
        migrations: migrations || [],
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Rollback migrations for this connection.
   *
   * @param {RollbackOptions} options - Rollback options
   * @returns {Promise<RollbackResult>} Rollback result
   */
  async rollback(options = {}) {
    if (!this.#initialized) {
      throw new Error('MigrationRunner not initialized');
    }

    if (this.#isRunning) {
      throw new Error('Operation already running');
    }

    const { knex, step = 1, dryRun = false, directory, ...config } = mergeConfig({}, options);

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get migration directory from Knex config
    const migrationsPath = directory || knex.client.config.migrations?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate migration directory before rollback
    const validation = await this.#validator.validateMigrationsPath(migrationsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Migration directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      const reasons = validation.invalid.map(f => `${f.file}: ${f.reason}`).join('; ');
      throw new Error(`Invalid migration files found: ${invalidFiles}. Reasons: ${reasons}`);
    }

    // Handle case where no valid migration files are found
    if (validation.valid.length === 0) {
      return {
        success: true,
        batchNo: 0,
        duration: Date.now() - startTime,
        rolledBack: [],
        timestamp: new Date(),
        message: 'No migration files found to rollback',
      };
    }

    this.#isRunning = true;

    try {
      if (dryRun) {
        // For dry run, just check what would be rolled back
        const completed = await knex.migrate.list();
        return {
          success: true,
          duration: Date.now() - startTime,
          rolledBack: completed[0]?.slice(-step) || [], // last N completed migrations
          timestamp: new Date(),
        };
      }

      // Perform actual rollback
      const [batchNo, migrations] = await knex.migrate.rollback({
        ...config,
        step,
        directory: migrationsPath,
      });

      return {
        success: true,
        batchNo,
        duration: Date.now() - startTime,
        rolledBack: migrations || [],
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Get migration runner status.
   *
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.#initialized,
      isRunning: this.#isRunning,
      connectionName: this.#connectionName,
      configuration: {
        enabled: this.#config.enabled,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Shutdown the migration runner.
   *
   * @returns {Promise<Object>} Shutdown result
   */
  async shutdown() {
    if (!this.#initialized) {
      return { success: false, reason: 'already-shutdown' };
    }

    this.#initialized = false;
    this.#isRunning = false;

    return {
      success: true,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    };
  }
}
