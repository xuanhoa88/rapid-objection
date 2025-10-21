import crypto from 'crypto';
import { EventEmitter } from 'events';
import { mergeConfig } from './ConfigurationManager';
import { InputValidator } from './InputValidator';
import { TimeoutManager } from './TimeoutManager';

/**
 * Transaction manager for a single database connection.
 */
export class TransactionManager extends EventEmitter {
  /** @type {boolean} */
  #initialized = false;

  /** @type {Object} */
  #config;

  /** @type {Map<string, Object>} */
  #activeTransactions = new Map();

  /** @type {Array<Object>} */
  #transactionHistory = [];

  /** @type {NodeJS.Timeout|null} */
  #cleanupInterval = null;

  /** @type {string} */
  #connectionName;

  /** @type {Object} */
  #metrics = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    totalDuration: 0,
    longestTransaction: 0,
  };

  /**
   * Create a new TransactionManager instance for a specific connection
   *
   * @param {Object} [config={}] - Configuration options
   * @param {string} [connectionName='default'] - Name of the connection this TransactionManager serves
   */
  constructor(config = {}, connectionName = 'default') {
    super();

    this.#connectionName = connectionName;
    this.#config = mergeConfig({ enableMetrics: true, warnLongTransactions: true }, config);
  }

  /**
   * Ensure this connection is properly initialized.
   * Throws error if connection not initialized, preventing invalid operations.
   *
   * @private
   * @throws {Error} When connection not initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('TransactionManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if TransactionManager is initialized
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Initialize the transaction manager and its components.
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

      // Start cleanup interval
      this.#startCleanup();

      const result = {
        success: true,
        connectionName: this.#connectionName,
        configuration: {
          maxTransactionTime: this.#config.maxTransactionTime,
          cleanupInterval: this.#config.cleanupInterval,
          maxHistorySize: this.#config.maxHistorySize,
          maxConcurrentTransactions: this.#config.maxConcurrentTransactions,
          enableMetrics: this.#config.enableMetrics,
          warnLongTransactions: this.#config.warnLongTransactions,
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
   * Start cleanup interval with robust error handling and validation
   */
  #startCleanup() {
    // Check if cleanup is already running
    if (this.#cleanupInterval) {
      return;
    }

    // Validate cleanup interval configuration
    const cleanupInterval = this.#config.cleanupInterval;
    if (!cleanupInterval || !Number.isInteger(cleanupInterval) || cleanupInterval <= 0) {
      this.#emitWarning(
        'cleanup-start',
        {},
        `Invalid cleanup interval: ${cleanupInterval}. Using default 60000ms`
      );
      // Use default cleanup interval
      this.#config.cleanupInterval = 60000;
    }

    try {
      this.#cleanupInterval = setInterval(async () => {
        try {
          await this.#cleanupOldTransactions();
        } catch (error) {
          // Handle cleanup errors gracefully without crashing the interval
          this.#emitError('cleanup-execution', {}, error);
        }
      }, this.#config.cleanupInterval);

      // Emit cleanup started event for monitoring
      this.emit('cleanup-started', {
        interval: this.#config.cleanupInterval,
        timestamp: new Date(),
      });
    } catch (error) {
      this.#emitError('cleanup-start', {}, error);
      throw error;
    }
  }

  /**
   * Execute callback within a transaction
   *
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @param {Object} options.knex - Knex instance for the transaction
   * @param {string} [options.connectionName] - Connection name for tracking
   * @param {string} [options.isolationLevel] - Transaction isolation level
   * @param {number} [options.timeout] - Transaction timeout override
   * @returns {Promise<any>} Transaction result
   * @throws {Error} When TransactionManager is not initialized
   * @throws {Error} When callback is not a function
   * @throws {Error} When Knex instance is invalid
   * @throws {Error} When concurrent transaction limit is reached
   * @throws {Error} When transaction fails after all retries
   */
  async withTransaction(callback, options = {}) {
    this.#ensureInitialized();

    // Validate callback function
    if (typeof callback !== 'function') {
      throw new Error('Transaction callback must be a function');
    }

    // Validate and get configuration with defaults
    const maxConcurrentTransactions = this.#config.maxConcurrentTransactions || 50;
    const maxTransactionTime = this.#config.maxTransactionTime || 300000;
    const retryAttempts = this.#config.retryAttempts || 3;
    const retryDelay = this.#config.retryDelay || 1000;
    const longTransactionThreshold = this.#config.longTransactionThreshold || 30000;
    const warnLongTransactions = this.#config.warnLongTransactions !== false;

    // Check concurrent transaction limit
    if (this.#activeTransactions.size >= maxConcurrentTransactions) {
      throw new Error(
        `Maximum concurrent transactions limit reached (${maxConcurrentTransactions})`
      );
    }

    const {
      knex = null,
      connectionName = 'unknown',
      isolationLevel,
      timeout,
    } = mergeConfig({}, options);

    // Validate Knex instance
    if (!InputValidator.isValidKnexInstance(knex)) {
      throw new Error(`Invalid Knex instance provided for connection '${connectionName}'`);
    }

    const transactionId = crypto.randomUUID();
    const transaction = this.#createTransactionRecord(transactionId, connectionName, options);
    let result;
    let attempt = 0;

    // Set transaction timeout with validation
    const transactionTimeout = timeout && timeout > 0 ? timeout : maxTransactionTime;

    while (attempt <= retryAttempts) {
      try {
        // Execute transaction with timeout
        result = await TimeoutManager.withTimeout(
          () =>
            knex.transaction(async trx => {
              // Store transaction reference
              transaction.knex = trx;

              // Set isolation level if specified
              if (isolationLevel) {
                await this.#setIsolationLevel(trx, isolationLevel);
              }

              // Execute callback with transaction
              const callbackResult = await callback(trx);

              // Check for long-running transaction warning
              const duration = Date.now() - transaction.startTime.getTime();
              if (duration > longTransactionThreshold && warnLongTransactions) {
                this.emit('long-transaction', {
                  transactionId,
                  connectionName,
                  duration,
                  threshold: longTransactionThreshold,
                  timestamp: new Date(),
                });
              }

              return callbackResult;
            }),
          transactionTimeout,
          {
            operation: `Transaction for connection '${connectionName}'`,
            component: 'TransactionManager',
            connectionName,
            cleanup: () => {
              // Emit timeout warning for monitoring
              this.emit('transaction-timeout', {
                operation: `Transaction for connection '${connectionName}'`,
                connectionName,
                timeout: transactionTimeout,
                timestamp: new Date(),
              });
            },
          }
        );

        // Transaction successful
        this.#recordTransactionCompletion(transaction, 'committed');
        break;
      } catch (error) {
        attempt++;

        if (attempt <= retryAttempts && this.#shouldRetry(error)) {
          // Wait before retry with exponential backoff
          await this.#delay(retryDelay * attempt);

          this.emit('transaction-failed', {
            transactionId,
            connectionName,
            attempt,
            maxAttempts: retryAttempts,
            error: error.message,
            timestamp: new Date(),
          });

          continue;
        }

        // Transaction failed after all retries
        this.#recordTransactionCompletion(transaction, 'failed', error);

        // Enhance error with context
        const enhancedError = new Error(
          `Transaction failed for connection '${connectionName}' after ${attempt} attempts: ${error.message}`
        );
        enhancedError.originalError = error;
        enhancedError.transactionId = transactionId;
        enhancedError.connectionName = connectionName;
        enhancedError.attempts = attempt;

        throw enhancedError;
      }
    }

    return result;
  }

  /**
   * Set transaction isolation level
   * @param {Object} trx - Knex transaction object
   * @param {string} isolationLevel - Isolation level to set
   * @returns {Promise<void>}
   */
  async #setIsolationLevel(trx, isolationLevel) {
    const validLevels = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];

    const normalizedLevel = isolationLevel.toUpperCase();

    if (!validLevels.includes(normalizedLevel)) {
      throw new Error(
        `Invalid isolation level: ${isolationLevel}. Valid levels: ${validLevels.join(', ')}`
      );
    }

    try {
      await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${normalizedLevel}`);
    } catch (error) {
      // Some databases might not support this syntax
      this.#emitWarning(
        'set-isolation-level',
        { isolationLevel },
        `Failed to set isolation level ${isolationLevel}: ${error.message}`
      );
    }
  }

  /**
   * Create transaction record
   */
  #createTransactionRecord(transactionId, connectionName, _options) {
    const record = {
      id: transactionId,
      connectionName,
      startTime: new Date(),
      endTime: null,
      duration: null,
      status: 'active',
      knex: null,
      error: null,
    };

    this.#activeTransactions.set(transactionId, record);

    this.emit('transaction-started', {
      transactionId: record.id,
      connectionName: record.connectionName,
      startTime: record.startTime,
      timestamp: new Date(),
    });

    return record;
  }

  /**
   * Record transaction completion
   */
  #recordTransactionCompletion(transaction, status, error = null) {
    const endTime = new Date();
    const duration = endTime.getTime() - transaction.startTime.getTime();

    // Update transaction record
    transaction.endTime = endTime;
    transaction.duration = duration;
    transaction.status = status;
    transaction.error = error;

    // Remove from active transactions
    this.#activeTransactions.delete(transaction.id);

    // Add to history (with size limit)
    transaction.completedAt = endTime;
    this.#transactionHistory.push({ ...transaction });

    if (this.#transactionHistory.length > this.#config.maxHistorySize) {
      this.#transactionHistory = this.#transactionHistory.slice(-this.#config.maxHistorySize);
    }

    // Update metrics
    if (this.#config.enableMetrics) {
      this.#updateMetrics(transaction, status);
    }

    // Emit completion event
    this.emit('transaction-completed', {
      transactionId: transaction.id,
      connectionName: transaction.connectionName,
      status,
      duration,
      error: error?.message || null,
      timestamp: endTime,
    });
  }

  /**
   * Update metrics
   */
  #updateMetrics(transaction, status) {
    this.#metrics.totalTransactions++;
    this.#metrics.totalDuration += transaction.duration;

    if (transaction.duration > this.#metrics.longestTransaction) {
      this.#metrics.longestTransaction = transaction.duration;
    }

    if (status === 'committed') {
      this.#metrics.successfulTransactions++;
    } else if (status === 'failed') {
      this.#metrics.failedTransactions++;
    }
  }

  /**
   * Check if error should trigger a retry
   * @param {Error} error - Error to check
   * @returns {boolean} Whether to retry
   */
  #shouldRetry(error) {
    // Comprehensive list of retryable errors across different databases
    const retryableErrors = [
      // SQLite errors
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
      'SQLITE_PROTOCOL',

      // Connection errors (all databases)
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'CONNECTION_TERMINATED',
      'CONNECTION_LOST',
      'PROTOCOL_CONNECTION_LOST',

      // Transaction/locking errors
      'DEADLOCK',
      'LOCK_WAIT_TIMEOUT',
      'LOCK TIMEOUT',
      'SERIALIZATION_FAILURE',
      'SERIALIZATION FAILURE',

      // MySQL specific
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_LOCK_DEADLOCK',

      // PostgreSQL specific
      'SERIALIZATION_FAILURE',
      'DEADLOCK_DETECTED',
    ];

    const errorMessage = error.message?.toUpperCase() || '';
    const errorCode = error.code?.toUpperCase() || '';

    return retryableErrors.some(
      retryableError =>
        errorMessage.includes(retryableError.toUpperCase()) ||
        errorCode.includes(retryableError.toUpperCase())
    );
  }

  /**
   * Delay helper for retries
   */
  async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup old transactions
   */
  async #cleanupOldTransactions() {
    const now = Date.now();

    // Cleanup stale active transactions
    await this.#cleanupStaleTransactions(now);

    // Cleanup old history
    this.#cleanupTransactionHistory(now);
  }

  /**
   * Cleanup stale active transactions
   */
  async #cleanupStaleTransactions(now) {
    const staleTransactions = [];

    for (const [id, transaction] of this.#activeTransactions.entries()) {
      const age = now - transaction.startTime.getTime();

      if (age > this.#config.maxTransactionTime) {
        staleTransactions.push({ id, transaction, age });
      }
    }

    // Process stale transactions in batches to avoid system overload
    const batchSize = 5;

    for (let i = 0; i < staleTransactions.length; i += batchSize) {
      const batch = staleTransactions.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(({ id, transaction, age }) => this.#cleanupStaleTransaction(id, transaction, age))
      );
    }
  }

  /**
   * Cleanup individual stale transaction
   */
  async #cleanupStaleTransaction(id, transaction, age) {
    try {
      // Update transaction record before rollback
      transaction.status = 'timed-out';
      transaction.endTime = new Date();
      transaction.duration = age;
      transaction.error = 'Transaction cleanup timeout';

      // Attempt to rollback if transaction is still active
      if (transaction.knex && typeof transaction.knex.rollback === 'function') {
        await transaction.knex.rollback(new Error('Transaction cleanup timeout'));
      }

      // Record the completion
      this.#recordTransactionCompletion(
        transaction,
        'timed-out',
        new Error('Transaction cleanup timeout')
      );

      this.emit('transaction-cleaned-up', {
        transactionId: id,
        connectionName: transaction.connectionName,
        age,
        timestamp: new Date(),
      });
    } catch (error) {
      // Still emit event for monitoring
      this.#emitError(
        'transaction-cleanup',
        {
          transactionId: id,
          connectionName: transaction.connectionName,
          age,
        },
        error
      );
    } finally {
      // Always remove from active transactions
      this.#activeTransactions.delete(id);
    }
  }

  /**
   * Cleanup old transaction history
   */
  #cleanupTransactionHistory(now) {
    const { maxHistoryAge } = this.#config;
    const initialCount = this.#transactionHistory.length;

    this.#transactionHistory = this.#transactionHistory.filter(
      record => now - record.completedAt.getTime() < maxHistoryAge
    );

    const cleanedCount = initialCount - this.#transactionHistory.length;

    if (cleanedCount > 0) {
      this.emit('history-cleanup', {
        cleanedRecords: cleanedCount,
        remainingRecords: this.#transactionHistory.length,
        maxAge: maxHistoryAge,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get transaction metrics
   */
  getMetrics() {
    if (!this.#config.enableMetrics) {
      return null;
    }

    const { totalTransactions } = this.#metrics;
    const avgDuration =
      totalTransactions > 0 ? Math.round(this.#metrics.totalDuration / totalTransactions) : 0;

    const successRate =
      totalTransactions > 0
        ? `${((this.#metrics.successfulTransactions / totalTransactions) * 100).toFixed(2)}%`
        : 'N/A';

    return {
      totalTransactions,
      successfulTransactions: this.#metrics.successfulTransactions,
      failedTransactions: this.#metrics.failedTransactions,
      successRate,
      averageDuration: avgDuration,
      longestTransaction: this.#metrics.longestTransaction,
      activeTransactions: this.#activeTransactions.size,
      historySize: this.#transactionHistory.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Get transaction status
   */
  getStatus() {
    return {
      // Core state
      initialized: this.#initialized,

      // Operational state
      cleanupActive: !!this.#cleanupInterval,
      hasActiveTransactions: this.#activeTransactions.size > 0,

      // Connection information
      connection: {
        name: this.#connectionName,
      },

      // Transaction metrics
      activeTransactions: this.#activeTransactions.size,
      maxConcurrentTransactions: this.#config.maxConcurrentTransactions,
      historySize: this.#transactionHistory.length,
      maxHistorySize: this.#config.maxHistorySize,

      // Configuration summary
      metricsEnabled: this.#config.enableMetrics,

      // Timestamp
      timestamp: new Date(),

      // Full config (for debugging)
      config: this.#config,
    };
  }

  /**
   * Abort a specific transaction by force
   * Forcefully terminates an active transaction and cleans up its resources.
   *
   * @param {string} transactionId - ID of the transaction to abort
   * @returns {Promise<boolean>} True if transaction was successfully aborted
   * @throws {Error} When transaction is not found or abort fails
   */
  async abortTransaction(transactionId) {
    const transaction = this.#activeTransactions.get(transactionId);

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const age = Date.now() - transaction.startTime.getTime();
    await this.#cleanupStaleTransaction(transactionId, transaction, age);

    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const oldConfig = mergeConfig({}, this.#config);
    this.#config = mergeConfig(oldConfig, newConfig);

    // Restart cleanup if interval changed
    if (newConfig.cleanupInterval && newConfig.cleanupInterval !== oldConfig.cleanupInterval) {
      if (this.#cleanupInterval) {
        clearInterval(this.#cleanupInterval);
        this.#cleanupInterval = null;
        this.#startCleanup();
      }
    }

    this.emit('config-updated', {
      oldConfig,
      newConfig: this.#config,
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
   * Shutdown transaction manager
   */
  async shutdown() {
    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'TransactionManager already shut down');
      return { success: false, reason: 'already-shutdown' };
    }

    // Reset initialization state
    this.#initialized = false;

    // Stop cleanup
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;

      // Emit cleanup stopped event for monitoring
      this.emit('cleanup-stopped', {
        timestamp: new Date(),
      });
    }

    // Cleanup all active transactions with timeout protection
    const activeTransactionIds = Array.from(this.#activeTransactions.keys());
    const cleanupTimeout = this.#config.shutdownTimeout || 10000; // 10 seconds default

    for (const transactionId of activeTransactionIds) {
      try {
        await TimeoutManager.withTimeout(
          () => this.abortTransaction(transactionId),
          cleanupTimeout,
          {
            operation: `Transaction ${transactionId} cleanup`,
            component: 'TransactionManager',
          }
        );
      } catch (error) {
        this.#emitWarning(
          'transaction-cleanup-timeout',
          { transactionId, timeout: cleanupTimeout },
          `Failed to cleanup transaction ${transactionId} during shutdown: ${error.message}`
        );
      }
    }

    // Clear data
    this.#activeTransactions.clear();
    this.#transactionHistory = [];

    this.emit('shutdown-completed', { timestamp: new Date() });
    this.removeAllListeners();
  }
}
