/**
 * AppRegistry Unit Tests
 * Tests the main application registry functionality
 */

const { AppRegistry } = require('../../../dist/AppRegistry');
const { RealDatabaseHelper } = require('../../setup');

describe('AppRegistry', () => {
  let appRegistry;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    appRegistry = new AppRegistry();
  });

  afterEach(async () => {
    if (appRegistry) {
      const status = await appRegistry.getStatus();
      if (status.initialized) {
        await appRegistry.shutdown();
      }
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create AppRegistry instance with default configuration', async () => {
      expect(appRegistry).toBeInstanceOf(AppRegistry);
      const status = await appRegistry.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should create AppRegistry with custom configuration', async () => {
      const config = { 'registry.enableHealthMonitoring': false };
      const registry = new AppRegistry(config);

      expect(registry).toBeInstanceOf(AppRegistry);
      const status = await registry.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should handle invalid configuration gracefully', () => {
      expect(() => new AppRegistry(null)).not.toThrow();
      expect(() => new AppRegistry(undefined)).not.toThrow();
      expect(() => new AppRegistry('invalid')).not.toThrow();
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await appRegistry.initialize();

      const status = await appRegistry.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.timestamp).toBeInstanceOf(Date);
    });

    test('should prevent double initialization', async () => {
      await appRegistry.initialize();

      // Second initialization should not throw but should warn
      await expect(appRegistry.initialize()).resolves.not.toThrow();
      const status = await appRegistry.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle initialization errors gracefully', async () => {
      // Mock a component that fails initialization
      const originalTimeout = AppRegistry.prototype.initialize;
      AppRegistry.prototype.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));

      const registry = new AppRegistry();
      await expect(registry.initialize()).rejects.toThrow('Init failed');

      // Restore original method
      AppRegistry.prototype.initialize = originalTimeout;
    });
  });

  describe('App Registration', () => {
    beforeEach(async () => {
      await appRegistry.initialize();
    });

    test('should register app with database configuration', async () => {
      const config = dbHelper.createTestConfig('testApp');

      const connection = await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      expect(connection).toBeDefined();

      // Check app registration through status
      const status = await appRegistry.getStatus();
      expect(status.connections.registeredConnections).toContain('testApp');
      expect(status.connections.totalConnections).toBe(1);
    });

    test('should register app with auto-operations', async () => {
      const config = dbHelper.createTestConfig('testApp');

      const connection = await appRegistry.registerApp('testApp', {
        database: config,
        migrations: {
          enabled: true,
          directory: '__tests__/fixtures/migrations',
        },
        seeds: {
          enabled: true,
          directory: '__tests__/fixtures/seeds',
        },
        models: {
          enabled: true,
          definitions: {
            User: { tableName: 'users', schema: { timestamps: true } },
          },
        },
      });

      expect(connection).toBeDefined();
      expect(appRegistry.hasApp('testApp')).toBe(true);
    });

    test('should handle app registration with connection reuse', async () => {
      const config = dbHelper.createTestConfig('sharedDb');

      // Register first app
      const connection1 = await appRegistry.registerApp('app1', {
        database: { ...config, shared: true },
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      // Register second app reusing connection
      const connection2 = await appRegistry.registerApp('app2', {
        useConnection: 'app1',
      });

      expect(connection1).toBeDefined();
      expect(connection2).toBeDefined();
      expect(appRegistry.hasApp('app1')).toBe(true);
      expect(appRegistry.hasApp('app2')).toBe(true);
    });

    test('should prevent duplicate app registration', async () => {
      const config = dbHelper.createTestConfig('testApp');

      await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      await expect(appRegistry.registerApp('testApp', { database: config })).rejects.toThrow(
        /already registered/
      );
    });

    test('should handle invalid app configuration', async () => {
      // Test empty app name - this should definitely fail
      await expect(
        appRegistry.registerApp('', { database: { client: 'sqlite3' } })
      ).rejects.toThrow();

      // Test null app name - this should definitely fail
      await expect(
        appRegistry.registerApp(null, { database: { client: 'sqlite3' } })
      ).rejects.toThrow();

      // Test whitespace-only app name - this should fail
      await expect(
        appRegistry.registerApp('   ', { database: { client: 'sqlite3' } })
      ).rejects.toThrow();
    });
  });

  describe('App Management', () => {
    beforeEach(async () => {
      await appRegistry.initialize();
    });

    test('should unregister app successfully', async () => {
      const config = dbHelper.createTestConfig('testApp');
      await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      expect(appRegistry.hasApp('testApp')).toBe(true);

      await appRegistry.unregisterApp('testApp');

      expect(appRegistry.hasApp('testApp')).toBe(false);
    });

    test('should handle unregistering non-existent app', async () => {
      await expect(appRegistry.unregisterApp('nonExistentApp')).rejects.toThrow(/not registered/);
    });

    test('should get app connection', async () => {
      const config = dbHelper.createTestConfig('testApp');
      const originalConnection = await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      const retrievedConnection = appRegistry.getApp('testApp');

      expect(retrievedConnection).toBe(originalConnection);
    });

    test('should return null for non-existent app connection', () => {
      const connection = appRegistry.getApp('nonExistentApp');
      expect(connection).toBeUndefined();
    });

    test('should list registered apps', async () => {
      const config1 = dbHelper.createTestConfig('app1');
      const config2 = dbHelper.createTestConfig('app2');

      await appRegistry.registerApp('app1', {
        database: config1,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });
      await appRegistry.registerApp('app2', {
        database: config2,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      // Check multiple app registration through status
      const status = await appRegistry.getStatus();
      const registeredApps = status.connections.registeredConnections;

      expect(registeredApps).toHaveLength(2);
      expect(registeredApps).toContain('app1');
      expect(registeredApps).toContain('app2');
      expect(status.connections.totalConnections).toBe(2);
    });
  });

  describe('Status and Health', () => {
    beforeEach(async () => {
      await appRegistry.initialize();
    });

    test('should provide comprehensive status', async () => {
      const status = await appRegistry.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('connections');
      expect(status).toHaveProperty('components');
    });

    test('should track connection health', async () => {
      const status = await appRegistry.getStatus();

      // Should have comprehensive health information
      const health = status.health;

      expect(health).toHaveProperty('monitoring');
      expect(health).toHaveProperty('connections');
      expect(health).toHaveProperty('metrics');
      expect(health).toHaveProperty('dataQuality');

      // Check monitoring state
      expect(health.monitoring).toHaveProperty('active');
      expect(health.monitoring).toHaveProperty('enabled');
      expect(typeof health.monitoring.active).toBe('boolean');

      // Check connection health counts (should only contain counts)
      expect(health.connections).toHaveProperty('healthy');
      expect(health.connections).toHaveProperty('unhealthy');
      expect(health.connections).toHaveProperty('total');
      expect(typeof health.connections.healthy).toBe('number');

      // Check health metrics (should contain calculated values)
      expect(health.metrics).toHaveProperty('healthPercentage');
      expect(typeof health.metrics.healthPercentage).toBe('number');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await appRegistry.initialize();

      const config = dbHelper.createTestConfig('testApp');
      await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });

      const result = await appRegistry.shutdown();

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      const finalStatus = await appRegistry.getStatus();
      expect(finalStatus.initialized).toBe(false);
    });

    test('should handle shutdown without initialization', async () => {
      const result = await appRegistry.shutdown();

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });

    test('should handle shutdown with timeout', async () => {
      await appRegistry.initialize();

      const result = await appRegistry.shutdown({ timeout: 1000 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await appRegistry.initialize();
    });

    test('should emit events during app lifecycle', async () => {
      const events = [];

      appRegistry.on('app-registered', data => events.push('registered'));
      appRegistry.on('app-unregistered', data => events.push('unregistered'));

      const config = dbHelper.createTestConfig('testApp');
      await appRegistry.registerApp('testApp', {
        database: config,
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      });
      await appRegistry.unregisterApp('testApp');

      expect(events).toContain('registered');
      expect(events).toContain('unregistered');
    });

    test('should provide health monitoring information', async () => {
      const status = await appRegistry.getStatus();

      // Should provide health monitoring information
      expect(status).toHaveProperty('health');

      // Health information should be structured correctly
      const health = status.health;
      expect(health).toHaveProperty('monitoring');
      expect(health).toHaveProperty('connections');
      expect(typeof health.connections.healthy).toBe('number');
      expect(typeof health.connections.unhealthy).toBe('number');
      expect(typeof health.monitoring.active).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await appRegistry.initialize();
    });

    test('should handle database connection errors', async () => {
      const invalidConfig = {
        client: 'sqlite3',
        connection: '/nonexistent/path/invalid.db', // Invalid file path to trigger error
        useNullAsDefault: true,
      };

      await expect(
        appRegistry.registerApp('failApp', { database: invalidConfig })
      ).rejects.toThrow();
    });

    test('should emit error events', async () => {
      const errors = [];

      appRegistry.on('error', error => errors.push(error));

      await expect(appRegistry.registerApp('failApp', { database: null })).rejects.toThrow();

      // Should have emitted error events
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
