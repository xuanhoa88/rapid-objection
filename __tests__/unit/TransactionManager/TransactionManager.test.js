/**
 * TransactionManager Unit Tests
 * Tests the transaction management functionality
 */

const { TransactionManager } = require('../../../dist/TransactionManager');
const { RealDatabaseHelper, RealComponentFactory } = require('../../setup');

describe('TransactionManager', () => {
  let transactionManager;
  let knexInstance;
  let configManager;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('transaction_test');
    configManager = RealComponentFactory.createConfigurationManager();
    transactionManager = new TransactionManager({}, 'transaction_test');
  });

  afterEach(async () => {
    if (transactionManager && (await transactionManager.getStatus()).initialized) {
      await transactionManager.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create TransactionManager instance', () => {
      expect(transactionManager).toBeInstanceOf(TransactionManager);
      expect(transactionManager.isInitialized).toBe(false);
    });

    test('should create with default parameters', () => {
      const tm1 = new TransactionManager();
      expect(tm1).toBeInstanceOf(TransactionManager);

      const tm2 = new TransactionManager({}, 'test-connection');
      expect(tm2).toBeInstanceOf(TransactionManager);
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await transactionManager.initialize();

      expect(transactionManager.isInitialized).toBe(true);

      const status = transactionManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle double initialization gracefully', async () => {
      await transactionManager.initialize();

      const result = await transactionManager.initialize();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('already-initialized');
    });
  });

  describe('Transaction Execution', () => {
    beforeEach(async () => {
      await transactionManager.initialize();
    });

    test('should execute transaction successfully', async () => {
      const callback = jest.fn().mockResolvedValue('success');

      const result = await transactionManager.withTransaction(callback, {
        knex: knexInstance,
        connectionName: 'transaction_test',
      });

      expect(result).toBe('success');
      expect(callback).toHaveBeenCalled();
    });

    test('should handle transaction errors', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      await expect(
        transactionManager.withTransaction(callback, {
          knex: knexInstance,
          connectionName: 'transaction_test',
        })
      ).rejects.toThrow('Transaction failed');
    });

    test('should support transaction options', async () => {
      const callback = jest.fn().mockResolvedValue('success');
      const options = {
        knex: knexInstance,
        connectionName: 'transaction_test',
        isolationLevel: 'serializable',
      };

      await transactionManager.withTransaction(callback, options);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Status and Information', () => {
    beforeEach(async () => {
      await transactionManager.initialize();
    });

    test('should provide comprehensive status', () => {
      const status = transactionManager.getStatus();

      expect(status).toBeDefined();
      expect(status.initialized).toBeDefined();
      expect(status).toHaveProperty('activeTransactions');
      expect(status).toHaveProperty('config');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await transactionManager.initialize();

      await transactionManager.shutdown();

      expect(transactionManager.isInitialized).toBe(false);
    });
  });
});
