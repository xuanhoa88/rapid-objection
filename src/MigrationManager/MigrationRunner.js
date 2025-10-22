import { EventEmitter } from 'events';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';
import path from 'path';

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

  /** @type {boolean} */
  #tableEnsured = false;

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
    this.#config = mergeConfig(
      {
        enabled: true,
        tableName: 'knex_migrations',
      },
      config
    );
    this.#connectionName = connectionName;
    this.#initialized = true;
  }

  /**
   * Ensure manager is initialized
   *
   * @private
   * @throws {Error} If not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('MigrationRunner not initialized. Call initialize() first.');
    }
  }

  /**
   * Ensure knex_migrations table exists for tracking migration execution with process ownership
   * Uses caching to avoid repeated schema checks
   *
   * @param {Object} knex - Knex instance
   * @returns {Promise<void>}
   * @private
   */
  async #ensureTable(knex) {
    // Return early if table already ensured
    if (this.#tableEnsured) {
      return;
    }

    const exists = await knex.schema.hasTable(this.#config.tableName);
    if (!exists) {
      await knex.schema.createTable(this.#config.tableName, table => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('batch').notNullable();
        table.timestamp('migration_time').defaultTo(knex.fn.now());
        table.string('app_name').notNullable().defaultTo('default');
      });
    } else {
      // Check if app_name column exists, add it if missing (for backward compatibility)
      const hasAppNameColumn = await knex.schema.hasColumn(this.#config.tableName, 'app_name');
      if (!hasAppNameColumn) {
        await knex.schema.alterTable(this.#config.tableName, table => {
          table.string('app_name').notNullable().defaultTo('default');
        });
      }
    }

    // Mark table as ensured to avoid future checks
    this.#tableEnsured = true;
  }

  /**
   * Get the next batch number for migrations for a specific app
   *
   * @param {Object} knex - Knex instance
   * @param {string} [appName] - App name for process-specific batching
   * @returns {Promise<number>}
   * @private
   */
  async #getNextBatch(knex, appName = null) {
    const query = knex(this.#config.tableName);

    // If appName is provided, get app-specific batch number
    if (appName) {
      query.where('app_name', appName);
    }

    const result = await query.max('batch as maxBatch').first();
    return (result?.maxBatch || 0) + 1;
  }

  /**
   * Get migrations that have already been run, optionally filtered by app
   *
   * @param {Object} knex - Knex instance
   * @param {string} [appName] - App name to filter by
   * @returns {Promise<Array<string>>}
   * @private
   */
  async #getExecutedMigrations(knex, appName = null) {
    const query = knex(this.#config.tableName).select('name');

    // If appName is provided, filter by app ownership
    if (appName) {
      query.where('app_name', appName);
    }

    const result = await query;
    return result.map(row => row.name);
  }

  /**
   * Record migration execution in the database with process ownership
   *
   * @param {Object} knex - Knex instance
   * @param {Array<string>} migrationNames - Names of executed migrations
   * @param {number} batch - Batch number
   * @param {string} [appName] - App name for process ownership tracking
   * @returns {Promise<void>}
   * @private
   */
  async #recordMigrationExecution(knex, migrationNames, batch, appName = null) {
    if (migrationNames.length === 0) return;

    const records = migrationNames.map(name => ({
      name,
      batch,
      migration_time: new Date(),
      app_name: appName || this.#connectionName || 'default', // Track process ownership
    }));
    await knex(this.#config.tableName).insert(records);
  }

  /**
   * Get migrations from the last batch for rollback, filtered by app ownership
   *
   * @param {Object} knex - Knex instance
   * @param {number} [steps=1] - Number of batches to rollback
   * @param {string} [appName] - App name to filter rollback by process ownership
   * @returns {Promise<Array<string>>}
   * @private
   */
  async #getMigrationsToRollback(knex, steps = 1, appName = null) {
    let query = knex(this.#config.tableName);

    // Filter by app ownership if provided
    if (appName) {
      query.where('app_name', appName);
    }

    const maxBatch = await query.max('batch as maxBatch').first();
    if (!maxBatch?.maxBatch) {
      return [];
    }

    const targetBatch = maxBatch.maxBatch - steps + 1;

    // Reset query and apply filters again
    query = knex(this.#config.tableName).select('name').where('batch', '>=', targetBatch);

    // Apply app filter again if provided
    if (appName) {
      query.where('app_name', appName);
    }

    const result = await query.orderBy('batch', 'desc');
    return result.map(row => row.name);
  }

  /**
   * Remove migration records from tracking table with app-specific filtering
   *
   * @param {Object} knex - Knex instance
   * @param {Array<string>} migrationNames - Names of migrations to remove
   * @param {string} [appName] - App name to filter by for process ownership
   * @returns {Promise<number>} Number of records removed
   * @private
   */
  async #removeMigrationRecords(knex, migrationNames, appName = null) {
    if (migrationNames.length === 0) return 0;

    const query = knex(this.#config.tableName).whereIn('name', migrationNames);

    // Filter by app ownership if provided
    if (appName) {
      query.where('app_name', appName);
    }

    return await query.del();
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
   * Run migrations for this connection with process ownership tracking.
   * Uses custom migration tracking with app-specific ownership.
   *
   * @param {MigrationOptions} options - Migration options
   * @param {string} [options.appName] - App name for process ownership tracking
   * @returns {Promise<MigrationResult>} Migration result
   */
  async migrate(options = {}) {
    this.#ensureInitialized();

    if (this.#isRunning) {
      throw new Error('Migration already running');
    }

    const { knex, dryRun = false, directory, force = false, appName } = options;

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get migration directory from options, Knex config, or default
    const migrationsPath = directory || knex.client.config.migrations?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate migration directory before execution
    const validation = await this.#validator.validateMigrationsPath(migrationsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Migration directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0 && !force) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      throw new Error(`Invalid migration files found: ${invalidFiles}`);
    }

    if (validation.valid.length === 0) {
      return {
        success: true,
        duration: Date.now() - startTime,
        migrations: [],
        timestamp: new Date(),
        message: 'No migration files found to execute',
      };
    }

    this.#isRunning = true;

    try {
      // Ensure knex_migrations table exists
      await this.#ensureTable(knex);

      // Get already executed migrations (filtered by app if appName provided)
      const executedMigrations = await this.#getExecutedMigrations(knex, appName);

      // Filter migrations
      let migrationsToRun = validation.valid;

      // Filter out already executed migrations (unless force is true)
      if (!force) {
        migrationsToRun = migrationsToRun.filter(m => !executedMigrations.includes(m.file));
      }

      if (dryRun) {
        // For dry run, return what would be executed
        return {
          success: true,
          duration: Date.now() - startTime,
          migrations: migrationsToRun.map(m => m.file),
          timestamp: new Date(),
        };
      }

      if (migrationsToRun.length === 0) {
        return {
          success: true,
          duration: Date.now() - startTime,
          migrations: [],
          timestamp: new Date(),
        };
      }

      // Get next batch number (app-specific if appName provided)
      const batchNo = await this.#getNextBatch(knex, appName);

      // Execute migrations one by one and track them
      const executedMigrationNames = [];

      for (const migrationInfo of migrationsToRun) {
        try {
          // Load and execute the migration file using absolute path
          // Clear require cache to ensure fresh load
          const absolutePath = path.resolve(migrationInfo.path);
          delete require.cache[absolutePath];
          const migrationModule = require(absolutePath);

          if (typeof migrationModule?.up === 'function') {
            await migrationModule.up(knex);
            executedMigrationNames.push(migrationInfo.file);
          } else {
            throw new Error(`Migration file ${migrationInfo.file} does not export an up function`);
          }
        } catch (error) {
          // If a migration fails, record what was successful and throw
          if (executedMigrationNames.length > 0) {
            await this.#recordMigrationExecution(knex, executedMigrationNames, batchNo, appName);
          }
          throw new Error(`Migration ${migrationInfo.file} failed: ${error.message}`);
        }
      }

      // Record all successful migration executions with process ownership
      await this.#recordMigrationExecution(knex, executedMigrationNames, batchNo, appName);

      return {
        success: true,
        batchNo,
        duration: Date.now() - startTime,
        migrations: executedMigrationNames,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Rollback migrations for this connection with app-specific filtering.
   * Uses custom migration tracking with app-specific ownership.
   *
   * @param {RollbackOptions} options - Rollback options
   * @param {string} [options.appName] - App name for app-specific rollback filtering
   * @returns {Promise<RollbackResult>} Rollback result
   */
  async rollback(options = {}) {
    this.#ensureInitialized();

    if (this.#isRunning) {
      throw new Error('Operation already running');
    }

    const { knex, step = 1, dryRun = false, directory, force = false, appName } = options;

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get migration directory from options, Knex config, or default
    const migrationsPath = directory || knex.client.config.migrations?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate migration directory before rollback
    const validation = await this.#validator.validateMigrationsPath(migrationsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Migration directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0 && !force) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      throw new Error(`Invalid migration files found: ${invalidFiles}`);
    }

    if (validation.valid.length === 0) {
      return {
        success: true,
        duration: Date.now() - startTime,
        rolledBack: [],
        timestamp: new Date(),
        message: 'No migration files found to rollback',
      };
    }

    this.#isRunning = true;

    try {
      // Ensure knex_migrations table exists
      await this.#ensureTable(knex);

      // Get migrations to rollback from tracking table (filtered by app if appName provided)
      const migrationsToRollback = await this.#getMigrationsToRollback(knex, step, appName);

      if (dryRun) {
        // For dry run, return what would be rolled back
        return {
          success: true,
          duration: Date.now() - startTime,
          rolledBack: migrationsToRollback,
          timestamp: new Date(),
        };
      }

      if (migrationsToRollback.length === 0) {
        return {
          success: true,
          duration: Date.now() - startTime,
          rolledBack: [],
          timestamp: new Date(),
          note: 'No migration history found in tracking table',
        };
      }

      // Execute rollback for each migration (custom implementation required)
      const rolledBackMigrations = [];
      const missingMigrations = [];

      for (const migrationName of migrationsToRollback) {
        try {
          // Check if migration file still exists in directory
          const migrationPath = validation.valid.find(m => m.file === migrationName)?.path;

          if (!migrationPath) {
            // File doesn't exist, but we can still remove from tracking
            missingMigrations.push(migrationName);
            rolledBackMigrations.push(migrationName);
            console.warn(
              `Migration file ${migrationName} not found in directory, removing from tracking only`
            );
            continue;
          }

          // Load and execute the migration rollback
          const absolutePath = path.resolve(migrationPath);
          delete require.cache[absolutePath];
          const migrationModule = require(absolutePath);

          if (typeof migrationModule?.down === 'function') {
            await migrationModule.down(knex);
            rolledBackMigrations.push(migrationName);
          } else {
            // If no down function, just remove from tracking
            rolledBackMigrations.push(migrationName);
            console.warn(
              `Migration ${migrationName} has no down function, removing from tracking only`
            );
          }
        } catch (error) {
          // Continue with other migrations, but log the error
          console.warn(`Failed to rollback migration ${migrationName}: ${error.message}`);
        }
      }

      // Remove rolled back migrations from tracking table (filtered by app if appName provided)
      await this.#removeMigrationRecords(knex, rolledBackMigrations, appName);

      return {
        success: true,
        duration: Date.now() - startTime,
        rolledBack: rolledBackMigrations,
        timestamp: new Date(),
        note:
          missingMigrations.length > 0
            ? `Migration rollback completed. ${missingMigrations.length} migration files were missing from directory.`
            : 'Migration rollback completed',
        missingFiles: missingMigrations,
      };
    } catch (error) {
      throw new Error(`Migration rollback failed: ${error.message}`);
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
