/**
 * Centralized timeout management utility
 * Provides robust timeout handling with proper cleanup and error context
 *
 * @example Basic Usage
 * ```javascript
 * // Async operation with timeout
 * try {
 *   const result = await TimeoutManager.withTimeout(
 *     async () => {
 *       const response = await fetch('/api/data');
 *       return response.json();
 *     },
 *     5000,
 *     { operation: 'fetch user data', component: 'UserService' }
 *   );
 *   console.log('Data received:', result);
 * } catch (error) {
 *   if (error.code === 'TIMEOUT') {
 *     console.log('Operation timed out:', error.message);
 *   }
 * }
 * ```
 *
 * @example Database Operations
 * ```javascript
 * // Database query with timeout and cleanup
 * const result = await TimeoutManager.withTimeout(
 *   async () => {
 *     const knex = getKnexInstance();
 *     return knex('users').select('*').where('active', true);
 *   },
 *   10000,
 *   {
 *     operation: 'fetch active users',
 *     component: 'DatabaseManager',
 *     cleanup: () => {
 *       console.log('Database query cleanup triggered');
 *     }
 *   }
 * );
 * ```
 *
 * @example Synchronous Operations
 * ```javascript
 * // Synchronous operation (also supported)
 * const result = await TimeoutManager.withTimeout(
 *   () => {
 *     // Heavy computation or file operations
 *     return processLargeDataSet(data);
 *   },
 *   30000,
 *   { operation: 'data processing', component: 'DataProcessor' }
 * );
 * ```
 *
 * @example AbortController Usage
 * ```javascript
 * // For operations that support AbortController
 * try {
 *   const result = await TimeoutManager.withAbortTimeout(
 *     async (signal) => {
 *       // Fetch with abort support
 *       const response = await fetch('/api/large-file', { signal });
 *       return response.blob();
 *     },
 *     15000,
 *     { operation: 'download large file', component: 'FileService' }
 *   );
 * } catch (error) {
 *   if (error.code === 'TIMEOUT') {
 *     console.log('Download was aborted due to timeout');
 *   }
 * }
 * ```
 *
 * @example Component Shutdown
 * ```javascript
 * // Shutdown operations with timeout protection
 * class MyComponent {
 *   async shutdown(options = {}) {
 *     const { timeout = 30000 } = options;
 *
 *     try {
 *       await TimeoutManager.withTimeout(
 *         async () => {
 *           await this.closeConnections();
 *           await this.flushBuffers();
 *           this.clearCaches();
 *         },
 *         timeout,
 *         {
 *           operation: 'component shutdown',
 *           component: this.constructor.name,
 *           cleanup: () => this.forceCleanup()
 *         }
 *       );
 *     } catch (error) {
 *       console.error('Shutdown failed:', error.message);
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
export class TimeoutManager {
  /**
   * Execute operation with timeout protection
   *
   * Supports all types of operations:
   * - Async functions (async () => {})
   * - Promise-returning functions (() => Promise.resolve())
   * - Synchronous functions (() => 'result')
   *
   * @param {Function} operation - Operation to execute (sync, async, or Promise-returning)
   * @param {number} timeout - Timeout in milliseconds
   * @param {Object} context - Context for error reporting and cleanup
   * @param {string} context.operation - Operation name for error messages
   * @param {string} context.component - Component name for error context
   * @param {Function} context.cleanup - Optional cleanup function called on timeout
   * @returns {Promise} Operation result
   *
   * @example Async Database Query
   * ```javascript
   * const users = await TimeoutManager.withTimeout(
   *   async () => {
   *     const knex = this.getKnexInstance();
   *     return knex('users').select('*').limit(100);
   *   },
   *   5000,
   *   { operation: 'fetch users', component: 'UserRepository' }
   * );
   * ```
   *
   * @example Synchronous File Processing
   * ```javascript
   * const processed = await TimeoutManager.withTimeout(
   *   () => {
   *     // Heavy synchronous operation
   *     return JSON.parse(largeJsonString);
   *   },
   *   10000,
   *   { operation: 'parse JSON', component: 'FileProcessor' }
   * );
   * ```
   *
   * @example With Cleanup Function
   * ```javascript
   * const result = await TimeoutManager.withTimeout(
   *   async () => {
   *     const connection = await createConnection();
   *     return connection.query('SELECT * FROM data');
   *   },
   *   30000,
   *   {
   *     operation: 'database query',
   *     component: 'DatabaseService',
   *     cleanup: () => {
   *       console.log('Cleaning up database connection');
   *       connection?.close();
   *     }
   *   }
   * );
   * ```
   */
  static async withTimeout(operation, timeout, context = {}) {
    if (typeof operation !== 'function') {
      throw new Error('Operation must be a function');
    }

    if (!Number.isInteger(timeout) || timeout <= 0) {
      throw new Error('Timeout must be a positive integer');
    }

    return new Promise((resolve, reject) => {
      let operationCompleted = false;

      // Set up timeout with cleanup
      const timeoutId = setTimeout(() => {
        if (!operationCompleted) {
          operationCompleted = true;

          // Call cleanup function if provided
          if (typeof context?.cleanup === 'function') {
            try {
              context.cleanup();
            } catch (cleanupError) {
              console.warn('Timeout cleanup failed:', cleanupError.message);
            }
          }

          const errorMessage = `Timeout (${timeout}ms): ${context.operation || 'Unknown operation'}`;
          const error = new Error(errorMessage);
          error.code = 'TIMEOUT';
          error.timeout = timeout;
          error.context = context;

          reject(error);
        }
      }, timeout);

      // Enhanced operation execution with robust handling
      try {
        // Execute the operation
        const result = operation();

        // Handle different return types
        if (result && typeof result?.then === 'function') {
          // Operation returned a Promise (async function or Promise-returning function)
          result
            .then(resolvedResult => {
              if (!operationCompleted) {
                operationCompleted = true;
                clearTimeout(timeoutId);
                resolve(resolvedResult);
              }
            })
            .catch(error => {
              if (!operationCompleted) {
                operationCompleted = true;
                clearTimeout(timeoutId);
                reject(error);
              }
            });
        } else {
          // Operation returned a synchronous result
          if (!operationCompleted) {
            operationCompleted = true;
            clearTimeout(timeoutId);
            resolve(result);
          }
        }
      } catch (error) {
        // Operation threw synchronously
        if (!operationCompleted) {
          operationCompleted = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      }
    });
  }

  /**
   * Create AbortController-based timeout for operations that support it
   *
   * NOTE: This method only works with operations that properly handle AbortSignal.
   * If the operation ignores the signal, it will continue running until completion.
   * For operations that don't support AbortSignal, use withTimeout() instead.
   *
   * @param {Function} operation - Operation that accepts AbortSignal as first parameter
   * @param {number} timeout - Timeout in milliseconds
   * @param {Object} context - Context for error reporting and cleanup
   * @param {string} context.operation - Operation name for error messages
   * @param {string} context.component - Component name for error context
   * @param {Function} context.cleanup - Optional cleanup function called on timeout
   * @returns {Promise} Operation result
   *
   * @example Fetch API with AbortController
   * ```javascript
   * // ✅ Proper usage - Fetch API supports AbortSignal
   * const response = await TimeoutManager.withAbortTimeout(
   *   async (signal) => {
   *     const response = await fetch('/api/users', { signal });
   *     return response.json();
   *   },
   *   5000,
   *   { operation: 'fetch users', component: 'UserService' }
   * );
   * ```
   *
   * @example Custom Operation with AbortSignal
   * ```javascript
   * // ✅ Custom operation that properly handles abort
   * const result = await TimeoutManager.withAbortTimeout(
   *   async (signal) => {
   *     return new Promise((resolve, reject) => {
   *       const timer = setTimeout(() => resolve('completed'), 5000);
   *
   *       // Proper abort handling
   *       signal.addEventListener('abort', () => {
   *         clearTimeout(timer);
   *         const abortError = new Error('Operation was aborted');
   *         abortError.name = 'AbortError';
   *         reject(abortError);
   *       });
   *     });
   *   },
   *   3000,
   *   { operation: 'custom async task', component: 'TaskRunner' }
   * );
   * ```
   *
   * @example What NOT to do
   * ```javascript
   * // ❌ Won't work - operation ignores AbortSignal
   * await TimeoutManager.withAbortTimeout(
   *   async (signal) => {
   *     // This setTimeout cannot be aborted
   *     await new Promise(resolve => setTimeout(resolve, 10000));
   *     return 'completed';
   *   },
   *   5000
   * );
   * // This will complete after 10 seconds, not abort after 5 seconds
   * ```
   */
  static async withAbortTimeout(operation, timeout, context = {}) {
    if (typeof operation !== 'function') {
      throw new Error('Operation must be a function');
    }

    if (!Number.isInteger(timeout) || timeout <= 0) {
      throw new Error('Timeout must be a positive integer');
    }

    const controller = new AbortController();
    const { signal } = controller;
    let timeoutId = null;
    let operationCompleted = false;

    try {
      // Set up timeout with cleanup support
      timeoutId = setTimeout(() => {
        if (!operationCompleted) {
          // Call cleanup function if provided
          if (typeof context?.cleanup === 'function') {
            try {
              context.cleanup();
            } catch (cleanupError) {
              console.warn('Abort timeout cleanup failed:', cleanupError.message);
            }
          }

          controller.abort();
        }
      }, timeout);

      const result = await operation(signal);
      operationCompleted = true;
      return result;
    } catch (error) {
      operationCompleted = true;

      if (error.name === 'AbortError' || signal.aborted) {
        // Create consistent timeout error format
        const errorMessage = `Timeout (${timeout}ms): ${context.operation || 'Unknown operation'}`;
        const timeoutError = new Error(errorMessage);
        timeoutError.code = 'TIMEOUT';
        timeoutError.timeout = timeout;
        timeoutError.context = context;
        timeoutError.aborted = true;
        throw timeoutError;
      }

      // Re-throw other errors with context preservation
      if (context.operation && !error.context) {
        error.context = context;
      }
      throw error;
    } finally {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    }
  }
}
