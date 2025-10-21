import { EventEmitter } from 'events';
import path from 'path';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';

/**
 * @typedef {Object} SeedOptions
 * @property {Object} knex - Knex instance
 * @property {boolean} [dryRun=false] - Whether to perform dry run
 */

/**
 * @typedef {Object} SeedResult
 * @property {boolean} success - Whether seeding succeeded
 * @property {number} duration - Seeding duration in milliseconds
 * @property {Array<string>} seeds - List of seed files
 * @property {Date} timestamp - Seeding timestamp
 */

/**
 * @typedef {Object} SeedRollbackOptions
 * @property {Object} knex - Knex instance
 * @property {boolean} [dryRun=false] - Whether to perform dry run
 */

/**
 * @typedef {Object} SeedRollbackResult
 * @property {boolean} success - Whether rollback succeeded
 * @property {number} duration - Rollback duration in milliseconds
 * @property {Array<string>} rolledBack - List of rolled back seeds
 * @property {number} rollbackCount - Number of seeds rolled back
 * @property {string} directory - Directory path where rollback was executed
 * @property {Date} timestamp - Rollback timestamp
 * @property {string} note - Rollback completion note
 * @property {Array<string>} missingFiles - List of seed files that were missing from directory
 */

/**
 * SeedRunner - Handles database seeding for a single connection.
 * Simplified design for the one-way flow architecture.
 *
 * @extends EventEmitter
 */
export class SeedRunner extends EventEmitter {
  /** @type {SeedValidator} */
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
   * Create a new SeedRunner instance for a specific connection
   *
   * @param {SeedValidator} validator - Validator for seed files
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Connection name
   */
  constructor(validator, config = {}, connectionName = 'default') {
    super();

    if (!validator) {
      throw new Error('SeedValidator is required');
    }

    this.#validator = validator;
    this.#config = mergeConfig(
      {
        enabled: true,
        tableName: 'knex_seeds',
      },
      config
    );
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
   * Initialize SeedRunner.
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
   * Ensure knex_seeds table exists for tracking seed execution
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
      });
    }

    // Mark table as ensured to avoid future checks
    this.#tableEnsured = true;
  }

  /**
   * Get the next batch number for seeds
   *
   * @param {Object} knex - Knex instance
   * @returns {Promise<number>}
   * @private
   */
  async #getNextBatch(knex) {
    const result = await knex(this.#config.tableName).max('batch as maxBatch').first();
    return (result?.maxBatch || 0) + 1;
  }

  /**
   * Get seeds that have already been run
   *
   * @param {Object} knex - Knex instance
   * @returns {Promise<Array<string>>}
   * @private
   */
  async #getExecutedSeeds(knex) {
    const executed = await knex(this.#config.tableName).select('name').orderBy('id');
    return executed.map(row => row.name);
  }

  /**
   * Record seed execution in the tracking table
   *
   * @param {Object} knex - Knex instance
   * @param {Array<string>} seedNames - Names of executed seeds
   * @param {number} batch - Batch number
   * @returns {Promise<void>}
   * @private
   */
  async #recordSeedExecution(knex, seedNames, batch) {
    if (seedNames.length === 0) return;

    const records = seedNames.map(name => ({
      name,
      batch,
      migration_time: new Date(),
    }));
    await knex(this.#config.tableName).insert(records);
  }

  /**
   * Get seeds from the last batch for rollback
   *
   * @param {Object} knex - Knex instance
   * @param {number} [steps=1] - Number of batches to rollback
   * @returns {Promise<Array<string>>}
   * @private
   */
  async #getSeedsToRollback(knex, steps = 1) {
    const maxBatch = await knex(this.#config.tableName).max('batch as maxBatch').first();
    if (!maxBatch?.maxBatch) {
      return [];
    }

    const targetBatch = Math.max(1, maxBatch.maxBatch - steps + 1);
    const seeds = await knex(this.#config.tableName)
      .select('name')
      .where('batch', '>=', targetBatch)
      .orderBy('batch', 'desc')
      .orderBy('id', 'desc');

    return seeds.map(row => row.name);
  }

  /**
   * Remove seed records from tracking table
   *
   * @param {Object} knex - Knex instance
   * @param {Array<string>} seedNames - Names of seeds to remove
   * @returns {Promise<number>} Number of records removed
   * @private
   */
  async #removeSeedRecords(knex, seedNames) {
    if (seedNames.length === 0) return 0;
    return await knex(this.#config.tableName).whereIn('name', seedNames).del();
  }

  /**
   * Check if seed file exists in the seeds directory
   *
   * @param {string} seedsPath - Path to seeds directory
   * @param {string} seedName - Name of seed file
   * @returns {Promise<boolean>} True if file exists
   * @private
   */
  async #seedFileExists(seedsPath, seedName) {
    try {
      const seedPath = path.join(seedsPath, seedName);
      const stats = await InputValidator.checkPathAccess(seedPath);
      return stats.isFile;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run seeds for this connection.
   *
   * @param {SeedOptions} options - Seed options
   * @returns {Promise<SeedResult>} Seed result
   */
  async seed(options = {}) {
    if (!this.#initialized) {
      throw new Error('SeedRunner not initialized');
    }

    if (this.#isRunning) {
      throw new Error('Seed operation already running');
    }

    const { knex, dryRun = false, directory, force = false } = options;

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get seed directory from options, Knex config, or default
    const seedsPath = directory || knex.client.config.seeds?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate seed directory before execution
    const validation = await this.#validator.validateSeedsPath(seedsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Seed directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0 && !force) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      const reasons = validation.invalid.map(f => `${f.file}: ${f.reason}`).join('; ');
      throw new Error(`Invalid seed files found: ${invalidFiles}. Reasons: ${reasons}`);
    }

    // Handle case where no valid seed files are found
    if (validation.valid.length === 0) {
      return {
        success: true,
        duration: Date.now() - startTime,
        seeds: [],
        timestamp: new Date(),
        message: 'No seed files found to execute',
      };
    }

    this.#isRunning = true;

    try {
      // Ensure knex_seeds table exists
      await this.#ensureTable(knex);

      // Get already executed seeds
      const executedSeeds = await this.#getExecutedSeeds(knex);

      // Filter seeds
      let seedsToRun = validation.valid;

      // Filter out already executed seeds (unless force is true)
      if (!force) {
        seedsToRun = seedsToRun.filter(s => !executedSeeds.includes(s.file));
      }

      if (dryRun) {
        // For dry run, return what would be executed
        return {
          success: true,
          duration: Date.now() - startTime,
          seeds: seedsToRun.map(s => s.file),
          timestamp: new Date(),
        };
      }

      if (seedsToRun.length === 0) {
        return {
          success: true,
          duration: Date.now() - startTime,
          seeds: [],
          timestamp: new Date(),
        };
      }

      // Get next batch number
      const batchNo = await this.#getNextBatch(knex);

      // Execute seeds one by one and track them
      const executedSeedNames = [];

      for (const seedInfo of seedsToRun) {
        try {
          // Load and execute the seed file using absolute path
          // Clear require cache to ensure fresh load
          delete require.cache[require.resolve(seedInfo.path)];
          const seedModule = require(seedInfo.path);
          if (typeof seedModule?.seed === 'function') {
            await seedModule.seed(knex);
            executedSeedNames.push(seedInfo.file);
          } else {
            throw new Error(`Seed file ${seedInfo.file} does not export a seed function`);
          }
        } catch (error) {
          // If a seed fails, record what was successful and throw
          if (executedSeedNames.length > 0) {
            await this.#recordSeedExecution(knex, executedSeedNames, batchNo);
          }
          throw new Error(`Seed ${seedInfo.file} failed: ${error.message}`);
        }
      }

      // Record all successful seed executions
      await this.#recordSeedExecution(knex, executedSeedNames, batchNo);

      return {
        success: true,
        batchNo,
        duration: Date.now() - startTime,
        seeds: executedSeedNames,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Seeding failed: ${error.message}`);
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Rollback seeds for this connection.
   *
   * @param {SeedRollbackOptions} options - Rollback options
   * @returns {Promise<SeedRollbackResult>} Rollback result
   */
  async rollback(options = {}) {
    if (!this.#initialized) {
      throw new Error('SeedRunner not initialized');
    }

    if (this.#isRunning) {
      throw new Error('Operation already running');
    }

    const { knex, dryRun = false, directory, force = false, steps = 1 } = options;

    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error('Valid Knex instance is required');
    }

    // Get seed directory from options, Knex config, or default
    const seedsPath = directory || knex.client.config.seeds?.directory;

    // Initialize timing before any early returns
    const startTime = Date.now();

    // Validate seed directory before rollback
    const validation = await this.#validator.validateSeedsPath(seedsPath);

    // Handle validation errors from the validator
    if (validation.error) {
      throw new Error(`Seed directory validation failed: ${validation.error.message}`);
    }

    if (validation.invalid.length > 0 && !force) {
      const invalidFiles = validation.invalid.map(f => f.file).join(', ');
      const reasons = validation.invalid.map(f => `${f.file}: ${f.reason}`).join('; ');
      throw new Error(`Invalid seed files found: ${invalidFiles}. Reasons: ${reasons}`);
    }

    // Handle case where no valid seed files are found
    if (validation.valid.length === 0) {
      return {
        success: true,
        duration: Date.now() - startTime,
        seeds: [],
        timestamp: new Date(),
        message: 'No seed files found to execute',
      };
    }

    this.#isRunning = true;

    try {
      // Ensure knex_seeds table exists
      await this.#ensureTable(knex);

      // Get seeds to rollback from tracking table
      const seedsToRollback = await this.#getSeedsToRollback(knex, steps);

      if (dryRun) {
        // For dry run, return what would be rolled back
        return {
          success: true,
          duration: Date.now() - startTime,
          rolledBack: seedsToRollback,
          timestamp: new Date(),
          note: 'Schema-based seed rollback with tracking table',
        };
      }

      if (seedsToRollback.length === 0) {
        return {
          success: true,
          duration: Date.now() - startTime,
          rolledBack: [],
          timestamp: new Date(),
          note: 'No seed history found in tracking table',
        };
      }

      // Execute rollback for each seed (custom implementation required)
      const rolledBackSeeds = [];
      const missingSeeds = [];

      for (const seedName of seedsToRollback) {
        try {
          // Check if seed file still exists in directory
          const fileExists = await this.#seedFileExists(seedsPath, seedName);

          if (!fileExists) {
            // File doesn't exist, but we can still remove from tracking
            missingSeeds.push(seedName);
            rolledBackSeeds.push(seedName);
            console.warn(
              `Seed file ${seedName} not found in ${seedsPath}, removing from tracking only`
            );
            continue;
          }

          // Load seed file and check for rollback function
          const seedPath = path.join(seedsPath, seedName);

          // Load and execute the seed file using absolute path
          // Clear require cache to ensure fresh load
          delete require.cache[require.resolve(seedPath)];
          const seedModule = require(seedPath);

          if (typeof seedModule?.unseed === 'function') {
            await seedModule.unseed(knex);
            rolledBackSeeds.push(seedName);
          } else if (typeof seedModule?.rollback === 'function') {
            await seedModule.rollback(knex);
            rolledBackSeeds.push(seedName);
          } else {
            // If no rollback function, just remove from tracking
            rolledBackSeeds.push(seedName);
            console.warn(`Seed ${seedName} has no rollback function, removing from tracking only`);
          }
        } catch (error) {
          // Continue with other seeds, but log the error
          console.warn(`Failed to rollback seed ${seedName}: ${error.message}`);
        }
      }

      // Remove rolled back seeds from tracking table
      await this.#removeSeedRecords(knex, rolledBackSeeds);

      return {
        success: true,
        duration: Date.now() - startTime,
        rolledBack: rolledBackSeeds,
        timestamp: new Date(),
        note:
          missingSeeds.length > 0
            ? `Schema-based seed rollback completed. ${missingSeeds.length} seed files were missing from directory.`
            : 'Schema-based seed rollback completed',
        missingFiles: missingSeeds,
      };
    } catch (error) {
      throw new Error(`Seed rollback failed: ${error.message}`);
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Get seed runner status.
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
   * Shutdown the seed runner.
   *
   * @returns {Promise<Object>} Shutdown result
   */
  async shutdown() {
    if (!this.#initialized) {
      return { success: false, reason: 'already-shutdown' };
    }

    this.#initialized = false;
    this.#isRunning = false;
    this.#tableEnsured = false; // Reset table cache on shutdown

    return {
      success: true,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    };
  }
}
