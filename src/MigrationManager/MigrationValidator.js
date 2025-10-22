import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';

/**
 * Migration file validation for a single connection.
 * Simplified design focused on essential validation for the one-way flow architecture.
 */
export class MigrationValidator extends EventEmitter {
  /** @type {Object} */
  #config;

  /** @type {boolean} */
  #initialized = false;

  /** @type {string} */
  #connectionName;

  /**
   * Create a new MigrationValidator instance for a single connection
   *
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Connection name for this MigrationValidator
   */
  constructor(config = {}, connectionName = 'default') {
    super();

    this.#connectionName = connectionName;
    this.#config = mergeConfig({ enabled: true }, config);
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
   * Initialize MigrationValidator.
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
   * Validate migration files in a directory.
   *
   * @param {string} migrationsPath - Path to migration directory
   * @returns {Promise<Object>} Validation result
   */
  async validateMigrationsPath(migrationsPath) {
    const results = {
      valid: [],
      invalid: [],
      totalFiles: 0,
    };

    try {
      if (!this.#initialized) {
        throw new Error('MigrationValidator not initialized. Call initialize() first.');
      }

      if (!migrationsPath) {
        throw new Error('Migration path is required');
      }

      // Check if directory exists
      const stats = await InputValidator.checkPathAccess(migrationsPath);
      if (!stats.isDirectory) {
        throw new Error(`Migration path is not a directory: ${migrationsPath}`);
      }

      // Read migration files
      const files = await fs.readdir(migrationsPath);
      const allowedExtensions = this.#config.loadExtensions || ['.js', '.mjs', '.cjs', '.ts'];
      const migrationFiles = files.filter(file =>
        allowedExtensions.some(ext => file.endsWith(ext))
      );
      results.totalFiles = migrationFiles.length;

      // Basic validation for each file
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf8');

          // Basic file validation
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
   * Basic validation of migration file content
   *
   * @param {string} content - File content
   * @returns {boolean} True if valid migration file
   * @private
   */
  #validateContent(content) {
    // Check for migration export patterns
    const migrationPatterns = [
      /exports?\.up\s*=/,
      /export\s+.*up\s*[=:]/,
      /function\s+up\s*\(/,
      /const\s+up\s*=/,
      /let\s+up\s*=/,
    ];

    return migrationPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get migration validator status.
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
   * Shutdown the migration validator.
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
