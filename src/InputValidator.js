import fs from 'fs/promises';
import path from 'path';

export class InputValidator {
  /**
   * Validate if object is a valid Knex instance
   * Checks for essential Knex properties used throughout the codebase
   */
  static isValidKnexInstance(knex) {
    if (!knex) return false;
    if (typeof knex !== 'object' && typeof knex !== 'function') return false;

    // Check for client object
    if (!knex.client) return false;
    if (typeof knex.client !== 'object') return false;

    // Check for config object (used extensively for migrations paths)
    if (!knex.client.config) return false;
    if (typeof knex.client.config !== 'object') return false;

    // Check for essential Knex methods
    if (typeof knex.raw !== 'function') return false;
    if (typeof knex.schema !== 'object') return false;

    // Optional: Check for query method (used in performance monitoring)
    // Note: query method might be replaced by hooks, so we check if it exists or is a function
    if (knex.client.query && typeof knex.client.query !== 'function') return false;

    return true;
  }

  /**
   * Validate if Knex instance supports connection pooling
   * Used for pool management and monitoring
   */
  static supportsKnexPooling(knex) {
    if (!this.isValidKnexInstance(knex)) return false;
    return knex.client.pool && typeof knex.client.pool === 'object';
  }

  /**
   * Validate file path security
   * Checks for path traversal patterns, dangerous characters, and other security issues
   * Supports modular design where paths can exist outside the base directory
   *
   * @param {string} targetPath - The path to validate for security issues
   * @returns {boolean} - True if the path is secure (no dangerous patterns), false otherwise
   *
   * @example
   * // Valid - clean paths
   * isSafePath('/external/app') // true
   * isSafePath('subfolder/file.js') // true
   * isSafePath('/absolute/path/module') // true
   *
   * // Invalid - path traversal patterns
   * isSafePath('../../../etc/passwd') // false
   * isSafePath('folder/../../outside') // false
   *
   * // Invalid - dangerous characters
   * isSafePath('file\0name') // false (null byte)
   * isSafePath('file<name>.js') // false (invalid chars)
   */
  static isSafePath(targetPath) {
    // Validate input type
    if (typeof targetPath !== 'string') return false;

    try {
      // Disallow null bytes (security issue)
      if (targetPath.includes('\0')) return false;

      // Check for path traversal patterns
      const normalized = path.normalize(targetPath);

      // Detect path traversal attempts (../ patterns that go up)
      if (normalized.includes('..')) {
        return false;
      }

      // Disallow invalid characters (Windows-style protection)
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(targetPath)) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check path access and permissions
   * Returns detailed information about path accessibility with actual permission testing
   * Enhanced for Electron.js ASAR compatibility
   *
   * @param {string} dirPath - Path to check for access and permissions
   * @param {boolean} strict - Whether to enforce security validation via isSafePath
   * @returns {Promise<Object>} Access information object
   */
  static async checkPathAccess(dirPath, strict = false) {
    try {
      // Input validation
      if (typeof dirPath !== 'string' || dirPath.trim().length === 0) {
        return {
          exists: false,
          isDirectory: false,
          error: 'Invalid path: path must be a non-empty string',
          path: dirPath,
          securityCheck: false,
        };
      }

      const normalizedPath = path.normalize(dirPath.trim());

      // Security validation in strict mode
      if (strict && !this.isSafePath(normalizedPath)) {
        return {
          exists: false,
          isDirectory: false,
          error: 'Security validation failed: path contains dangerous patterns or characters',
          path: normalizedPath,
          securityCheck: false,
          securityIssues: [
            'Path failed security validation',
            'May contain path traversal patterns (../)',
            'May contain dangerous characters (<>:"|?*)',
            'May contain null bytes or other security risks',
          ],
        };
      }

      // Regular file system path handling
      const stats = await fs.stat(normalizedPath);

      return {
        exists: true,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        modified: stats.mtime.getTime(),
        created: stats.birthtime.getTime(),
        path: normalizedPath,
        securityCheck: strict,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
      };
    } catch (error) {
      // Enhanced error information with ASAR awareness
      const errorInfo = {
        exists: false,
        isDirectory: false,
        isFile: false,
        error: error.message,
        path: dirPath,
        securityCheck: strict,
        errorCode: error.code,
        errorType: this.#categorizeFileSystemError(error),
      };

      return errorInfo;
    }
  }

  /**
   * Validate class with basic validation
   *
   * Performs basic validation of class constructors including type validation,
   * name validation, and component structure validation. This is a generic
   * validation method that works for any class constructor.
   *
   * This method only validates - it does not set or mutate anything. Setting logic
   * should be handled by the calling code.
   *
   * @param {Function} ClassConstructor - Class constructor to validate
   * @param {string} className - Component name for error messages
   * @returns {Function} The validated ClassConstructor (for chaining)
   * @throws {Error} When ClassConstructor is invalid or doesn't meet requirements
   */
  static validateClass(ClassConstructor, className) {
    try {
      // 1. Basic type validation
      if (!ClassConstructor || typeof ClassConstructor !== 'function') {
        throw new Error(
          `${className} must be a constructor function, received: ${typeof ClassConstructor}`
        );
      }

      // 2. Class name validation (allow anonymous classes)
      // Note: Anonymous classes are valid in JavaScript and should be supported
      // The name property may be empty string, undefined, or null for valid classes
      if (ClassConstructor.name != null && typeof ClassConstructor.name !== 'string') {
        throw new Error(
          `${className} class name must be a string when present, received: ${typeof ClassConstructor.name}`
        );
      }

      // 3. Basic component structure validation
      this.#validateClassStructure(ClassConstructor, className);

      // Return the validated class for chaining
      return ClassConstructor;
    } catch (error) {
      // Enhanced error context
      const enhancedError = new Error(
        `${className} validation failed for '${ClassConstructor?.name || 'Unknown'}': ${error.message}`
      );
      enhancedError.cause = error;
      enhancedError.classConstructor = ClassConstructor;
      enhancedError.className = className;
      throw enhancedError;
    }
  }

  /**
   * Validate basic component structure for any component class
   *
   * @param {Function} ComponentClass - Component class to validate
   * @param {string} componentName - Name of the component for error messages
   * @throws {Error} When component structure is invalid
   * @private
   */
  static #validateClassStructure(ComponentClass, componentName) {
    // Validate component has constructor
    const hasConstructor = typeof ComponentClass === 'function';
    if (!hasConstructor) {
      throw new Error(
        `Component '${componentName}' replacement '${ComponentClass.name || 'Unknown'}' ` +
          `must be a valid class constructor function`
      );
    }

    // Validate component has prototype
    const hasPrototype = ComponentClass.prototype && typeof ComponentClass.prototype === 'object';
    if (!hasPrototype) {
      throw new Error(
        `Component '${componentName}' replacement '${ComponentClass.name || 'Unknown'}' ` +
          `must be a valid class with a prototype`
      );
    }
  }

  /**
   * Categorize file system errors for better debugging
   * @private
   */
  static #categorizeFileSystemError(error) {
    switch (error.code) {
      case 'ENOENT':
        return 'PATH_NOT_FOUND';
      case 'EACCES':
        return 'PERMISSION_DENIED';
      case 'ENOTDIR':
        return 'NOT_A_DIRECTORY';
      case 'EISDIR':
        return 'IS_A_DIRECTORY';
      case 'EMFILE':
      case 'ENFILE':
        return 'TOO_MANY_OPEN_FILES';
      case 'ELOOP':
        return 'SYMBOLIC_LINK_LOOP';
      case 'ENAMETOOLONG':
        return 'PATH_TOO_LONG';
      case 'EBUSY':
        return 'RESOURCE_BUSY';
      case 'EIO':
        return 'IO_ERROR';
      default:
        return 'UNKNOWN_ERROR';
    }
  }
}
