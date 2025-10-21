import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';

/**
 * SeedValidator - Validates seed files for a single connection.
 * Simplified design for the one-way flow architecture.
 *
 * @extends EventEmitter
 */
export class SeedValidator extends EventEmitter {
  /** @type {Object} */
  #config;

  /** @type {string} */
  #connectionName;

  /** @type {boolean} */
  #initialized = false;

  /**
   * Create a new SeedValidator instance for a specific connection
   *
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Connection name
   */
  constructor(config = {}, connectionName = 'default') {
    super();

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
   * Initialize SeedValidator.
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
   * Validate seed files in a directory
   *
   * @param {string} seedsPath - Path to seeds directory
   * @returns {Promise<Object>} Validation results
   */
  async validateSeedsPath(seedsPath) {
    const results = {
      valid: [],
      invalid: [],
      totalFiles: 0,
    };

    try {
      if (!this.#initialized) {
        throw new Error('SeedValidator not initialized');
      }

      if (!seedsPath) {
        throw new Error('Seeds path is required');
      }

      // Resolve path to absolute path if it's relative
      const resolvedSeedsPath = path.isAbsolute(seedsPath)
        ? seedsPath
        : path.resolve(process.cwd(), seedsPath);

      // Check if directory exists
      const stats = await InputValidator.checkPathAccess(resolvedSeedsPath);
      if (!stats.isDirectory) {
        throw new Error(`Seeds path is not a directory: ${resolvedSeedsPath}`);
      }

      // Read directory contents
      const files = await fs.readdir(resolvedSeedsPath);
      const allowedExtensions = this.#config.loadExtensions || ['.js', '.mjs', '.cjs', '.ts'];
      const seedFiles = files.filter(file => allowedExtensions.some(ext => file.endsWith(ext)));
      results.totalFiles = seedFiles.length;

      // Basic validation for each seed file
      for (const file of seedFiles) {
        const filePath = path.join(resolvedSeedsPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf8');

          // Basic validation - check for seed export
          if (!this.#validateContent(content)) {
            results.invalid.push({
              file,
              reason: 'File is empty',
            });
            continue;
          }

          // File is valid
          results.valid.push({
            file,
            path: filePath,
          });
        } catch (error) {
          results.invalid.push({
            file,
            reason: `File validation error: ${error.message}`,
          });
        }
      }
    } catch (error) {
      results.error = error;
    }

    return results;
  }

  /**
   * Basic validation of seed file content
   *
   * @param {string} content - File content
   * @returns {boolean} True if valid seed file
   * @private
   */
  #validateContent(content) {
    // Check for seed export patterns
    const seedPatterns = [
      /exports?\.seed\s*=/,
      /export\s+.*seed\s*[=:]/,
      /function\s+seed\s*\(/,
      /const\s+seed\s*=/,
      /let\s+seed\s*=/,
    ];

    return seedPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get validator status.
   *
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.#initialized,
      connectionName: this.#connectionName,
      configuration: {
        enabled: this.#config.enabled,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Shutdown the seed validator.
   *
   * @returns {Promise<Object>} Shutdown result
   */
  async shutdown() {
    if (!this.#initialized) {
      return { success: false, reason: 'already-shutdown' };
    }

    this.#initialized = false;
    this.removeAllListeners();

    return {
      success: true,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    };
  }
}
