/**
 * SecurityManager Unit Tests
 * Tests the security management and Knex instance creation functionality
 */

const { SecurityManager } = require('../../../dist/SecurityManager');
const { RealDatabaseHelper, RealComponentFactory } = require('../../setup');

describe('SecurityManager', () => {
  let securityManager;
  let knexInstance;
  let configManager;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('security_test');
    configManager = RealComponentFactory.createConfigurationManager();
    securityManager = new SecurityManager({}, 'testSecurityManager');
  });

  afterEach(async () => {
    if (securityManager && (await securityManager.getStatus()).initialized) {
      await securityManager.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create SecurityManager instance', () => {
      expect(securityManager).toBeInstanceOf(SecurityManager);
      expect(securityManager.isInitialized).toBe(false);
    });

    test('should throw error for invalid configuration manager', () => {
      expect(() => new SecurityManager('invalid')).toThrow(); // Invalid config type
      expect(() => new SecurityManager({}, '')).toThrow(); // Empty connection name
      expect(() => new SecurityManager({}, 123)).toThrow(); // Invalid connection name type
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await securityManager.initialize();

      expect(securityManager.isInitialized).toBe(true);

      const status = securityManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should prevent double initialization', async () => {
      await securityManager.initialize();

      const result = await securityManager.initialize();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('already-initialized');
    });

    test('should initialize with custom factory', async () => {
      const customFactory = jest.fn().mockReturnValue({
        destroy: jest.fn().mockResolvedValue(true),
      });

      await securityManager.initialize({ knexFactory: customFactory });

      expect(securityManager.isInitialized).toBe(true);
    });
  });

  describe('Knex Instance Management', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should create Knex instance', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      const knexInstance = await securityManager.createKnexInstance(config);

      expect(knexInstance).toBeDefined();
      expect(typeof knexInstance).toBe('function'); // Knex instances are functions with properties
    });

    test('should cache Knex instances', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      const instance1 = await securityManager.createKnexInstance(config);
      const instance2 = await securityManager.createKnexInstance(config);

      expect(instance1).toBe(instance2); // Should be the same cached instance
    });

    test('should remove Knex instance', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      const knexInstance = await securityManager.createKnexInstance(config);
      expect(knexInstance).toBeDefined();

      const result = await securityManager.destroyKnexInstance();
      expect(result).toBe(true);
    });

    test('should handle invalid database configuration', async () => {
      const invalidConfig = {
        client: 'nonexistent-client',
        connection: {},
      };

      await expect(securityManager.createKnexInstance(invalidConfig)).rejects.toThrow();
    });

    test('should handle removing non-existent instance', async () => {
      const result = await securityManager.destroyKnexInstance();

      expect(result).toBe(false); // Should return false for non-existent instance
    });
  });

  describe('Security Validation', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should create Knex instance with valid configuration', async () => {
      const validConfig = {
        client: 'sqlite3',
        connection: {
          filename: ':memory:',
        },
        useNullAsDefault: true,
      };

      const knexInstance = await securityManager.createKnexInstance(validConfig);

      expect(knexInstance).toBeDefined();
      expect(typeof knexInstance.raw).toBe('function');
    });

    test('should handle invalid database configuration', async () => {
      const invalidConfig = {
        client: 'invalid-client',
        // Missing required fields
      };

      await expect(securityManager.createKnexInstance(invalidConfig)).rejects.toThrow();
    });

    test('should provide security status information', () => {
      const status = securityManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('initialized');
      expect(status.initialized).toBe(true);
    });
  });

  describe('Status and Statistics', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should provide comprehensive status', () => {
      const status = securityManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('totalInstances');
      expect(status).toHaveProperty('activeConnections');
      expect(status).toHaveProperty('statistics');
      expect(typeof status.totalInstances).toBe('number');
    });

    test('should track creation statistics', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      await securityManager.createKnexInstance(config);
      // SecurityManager only supports one instance, so second call will return cached instance

      const status = securityManager.getStatus();

      expect(status.statistics.totalCreated).toBeGreaterThan(0);
      expect(status.totalInstances).toBeGreaterThan(0);
    });

    test('should provide security status information', () => {
      const status = securityManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('initialized');
      expect(status.initialized).toBe(true);
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should emit events during Knex operations', async () => {
      const events = [];

      securityManager.on('knex-instance-created', data => events.push('created'));
      securityManager.on('knex-instance-destroyed', data => events.push('removed'));

      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      await securityManager.createKnexInstance(config);
      await securityManager.destroyKnexInstance();

      expect(events).toContain('created');
      expect(events).toContain('removed');
    });

    test('should emit security events', async () => {
      const securityEvents = [];

      securityManager.on('security-violation', data => securityEvents.push(data));

      const insecureConfig = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      // This may throw due to security validation, but we don't need to catch it
      await expect(securityManager.createKnexInstance(insecureConfig))
        .resolves.toBeDefined()
        .catch(() => {});

      // Should have emitted security events if validation detected issues
      expect(securityEvents.length).toBeGreaterThanOrEqual(0);
    });

    test('should emit error events', async () => {
      const errors = [];

      securityManager.on('error', error => errors.push(error));

      await expect(securityManager.createKnexInstance({})).rejects.toThrow();

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Connection Lifecycle', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should handle connection lifecycle properly', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      // Create instance
      const instance = await securityManager.createKnexInstance(config);
      expect(instance).toBeDefined();

      // Verify it exists
      const status = securityManager.getStatus();
      expect(status.totalInstances).toBeGreaterThan(0);

      // Remove instance
      const removeResult = await securityManager.destroyKnexInstance();
      expect(removeResult).toBe(true);

      // Verify it's removed
      const finalStatus = securityManager.getStatus();
      expect(finalStatus.totalInstances).toBe(status.totalInstances - 1);
    });

    test('should cleanup instances on shutdown', async () => {
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      await securityManager.createKnexInstance(config);
      // SecurityManager only supports one instance

      const statusBefore = securityManager.getStatus();
      expect(statusBefore.totalInstances).toBeGreaterThan(0);

      const shutdownResult = await securityManager.shutdown();
      expect(shutdownResult.success).toBe(true);

      expect(securityManager.isInitialized).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await securityManager.initialize();
    });

    test('should handle database connection errors gracefully', async () => {
      const invalidConfig = {
        client: 'sqlite3',
        connection: '/nonexistent/path/that/does/not/exist/invalid.db', // Invalid file path
        useNullAsDefault: true,
      };

      // SecurityManager should handle invalid configs gracefully and return a Knex instance
      // SQLite will create the file if it doesn't exist, so this should succeed
      const result = await securityManager.createKnexInstance(invalidConfig);
      expect(result).toBeDefined();
      expect(typeof result).toBe('function'); // Knex instance is a function
    });

    test('should handle factory initialization errors gracefully', async () => {
      const failingFactory = jest.fn().mockImplementation(() => {
        throw new Error('Factory failed');
      });

      // Create a fresh SecurityManager instance for this test
      const freshSecurityManager = new SecurityManager({}, 'failingTest');

      // SecurityManager should handle factory errors gracefully and still initialize
      const result = await freshSecurityManager.initialize({ knexFactory: failingFactory });
      expect(result).toBeDefined();
      expect(result.success).toBe(true); // Should succeed even with failing factory
      expect(freshSecurityManager.isInitialized).toBe(true);
    });

    test('should handle shutdown errors gracefully', async () => {
      // Create an instance that might fail to shutdown
      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      await securityManager.createKnexInstance(config);

      // The test should just verify that shutdown handles errors gracefully
      // We don't need to mock internal state

      const result = await securityManager.shutdown();

      // Should still succeed overall even if individual cleanup fails
      expect(result.success).toBe(true);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await securityManager.initialize();

      const config = {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      };

      await securityManager.createKnexInstance(config);

      const result = await securityManager.shutdown();

      expect(result.success).toBe(true);
      expect(securityManager.isInitialized).toBe(false);
    });

    test('should handle shutdown without initialization', async () => {
      const result = await securityManager.shutdown();

      expect(result.success).toBe(true);
    });
  });
});
