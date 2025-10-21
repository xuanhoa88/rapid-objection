/**
 * Full Stack Integration Tests
 * Tests the complete system integration across all components
 */

const { AppRegistry } = require('../../dist/AppRegistry');
const { ConnectionManager } = require('../../dist/ConnectionManager');
const { ModelManager } = require('../../dist/ModelManager/ModelManager');
const { MigrationManager } = require('../../dist/MigrationManager/MigrationManager');
const { SeedManager } = require('../../dist/SeedManager/SeedManager');
const { SecurityManager } = require('../../dist/SecurityManager');
const { TransactionManager } = require('../../dist/TransactionManager');

describe('Full Stack Integration Tests', () => {
  let appRegistry;
  let testConfig;

  beforeEach(async () => {
    // Clean up any existing instances
    if (appRegistry) {
      await appRegistry.shutdown();
    }

    // Test configuration for SQLite in-memory database
    const dbConfig = {
      client: 'sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    };

    testConfig = {
      database: dbConfig,
      migrations: { enabled: false },
      seeds: { enabled: false },
      models: { enabled: false },
    };

    appRegistry = new AppRegistry();
    await appRegistry.initialize();
  });

  afterEach(async () => {
    if (appRegistry) {
      await appRegistry.shutdown();
      appRegistry = null;
    }
  });

  describe('App Lifecycle Integration', () => {
    test('should handle complete app registration and lifecycle', async () => {
      // Register multiple apps
      const app1Config = {
        database: {
          client: 'sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      };
      const app2Config = {
        database: {
          client: 'sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      };
      const app3Config = {
        database: {
          client: 'sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      };

      await appRegistry.registerApp('test-app-1', app1Config);
      await appRegistry.registerApp('test-app-2', app2Config);
      await appRegistry.registerApp('test-app-3', app3Config);

      // Verify all apps are registered
      const status = await appRegistry.getStatus();
      const registeredApps = status.connections.registeredConnections;
      expect(registeredApps).toHaveLength(3);
      expect(registeredApps).toContain('test-app-1');
      expect(registeredApps).toContain('test-app-2');
      expect(registeredApps).toContain('test-app-3');

      // Verify connections are established
      const connectionManager1 = appRegistry.getApp('test-app-1');
      const connectionManager2 = appRegistry.getApp('test-app-2');
      const connectionManager3 = appRegistry.getApp('test-app-3');

      expect(connectionManager1).toBeDefined();
      expect(connectionManager2).toBeDefined();
      expect(connectionManager3).toBeDefined();

      // Get actual database connections
      const connection1 = connectionManager1.knex;
      const connection2 = connectionManager2.knex;
      const connection3 = connectionManager3.knex;

      expect(connection1).toBeDefined();
      expect(connection2).toBeDefined();
      expect(connection3).toBeDefined();

      // Test basic database operations
      await connection1.raw('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
      await connection1.raw('INSERT INTO test_table (name) VALUES (?)', ['test-data']);

      const result = await connection1.raw('SELECT * FROM test_table');
      expect(result).toBeDefined();
    });

    test('should handle app unregistration gracefully', async () => {
      // Register apps
      await appRegistry.registerApp('temp-app-1', testConfig);
      await appRegistry.registerApp('temp-app-2', testConfig);

      let status = await appRegistry.getStatus();
      expect(status.connections.registeredConnections).toHaveLength(2);

      // Unregister one app
      await appRegistry.unregisterApp('temp-app-1');

      status = await appRegistry.getStatus();
      expect(status.connections.registeredConnections).toHaveLength(1);
      expect(status.connections.registeredConnections).toContain('temp-app-2');
      expect(appRegistry.getApp('temp-app-1')).toBeUndefined();
    });
  });

  describe('Health Monitoring Integration', () => {
    test('should provide comprehensive health monitoring across all apps', async () => {
      // Register multiple apps with different configurations
      await appRegistry.registerApp('healthy-app-1', testConfig);
      await appRegistry.registerApp('healthy-app-2', testConfig);
      await appRegistry.registerApp('healthy-app-3', testConfig);

      // Get comprehensive status
      const status = await appRegistry.getStatus();

      // Verify new health structure
      expect(status.health).toBeDefined();
      expect(status.health.monitoring).toBeDefined();
      expect(status.health.connections).toBeDefined();
      expect(status.health.metrics).toBeDefined();
      expect(status.health.dataQuality).toBeDefined();

      // Verify monitoring configuration
      expect(status.health.monitoring.active).toBe(false); // Not started by default
      expect(status.health.monitoring.enabled).toBe(false); // Disabled by default
      expect(typeof status.health.monitoring.interval).toBe('number');
      expect(typeof status.health.monitoring.performanceThreshold).toBe('number');

      // Verify connection counts
      expect(status.health.connections.total).toBe(3);
      expect(status.health.connections.healthy).toBeGreaterThanOrEqual(0);
      expect(status.health.connections.degraded).toBeGreaterThanOrEqual(0);
      expect(status.health.connections.unhealthy).toBeGreaterThanOrEqual(0);
      expect(status.health.connections.timeout).toBeGreaterThanOrEqual(0);
      expect(status.health.connections.unknown).toBeGreaterThanOrEqual(0);

      // Verify calculated metrics
      expect(typeof status.health.metrics.averageHealthScore).toBe('number');
      expect(typeof status.health.metrics.healthPercentage).toBe('number');
      expect(status.health.metrics.performance).toBeDefined();
      expect(status.health.metrics.performance.totalConnections).toBe(3);

      // Verify data quality indicators
      expect(status.health.dataQuality.isRealTime).toBe(false); // On-demand by default
      expect(status.health.dataQuality.lastUpdated).toBeInstanceOf(Date);
      expect(status.health.dataQuality.source).toBe('on-demand-check');
    });

    test('should track health changes over time', async () => {
      // Register initial apps
      await appRegistry.registerApp('monitor-app-1', testConfig);
      await appRegistry.registerApp('monitor-app-2', testConfig);

      // Get initial health status
      const initialStatus = await appRegistry.getStatus();
      const initialHealthy = initialStatus.health.connections.healthy;
      const initialTotal = initialStatus.health.connections.total;

      // Add more apps
      await appRegistry.registerApp('monitor-app-3', testConfig);
      await appRegistry.registerApp('monitor-app-4', testConfig);

      // Get updated health status
      const updatedStatus = await appRegistry.getStatus();
      const updatedTotal = updatedStatus.health.connections.total;

      // Verify health tracking reflects changes
      expect(updatedTotal).toBe(initialTotal + 2);
      expect(updatedStatus.health.connections.total).toBe(4);

      // Verify metrics are recalculated
      expect(updatedStatus.health.metrics.performance.totalConnections).toBe(4);
      expect(updatedStatus.health.dataQuality.lastUpdated.getTime()).toBeGreaterThanOrEqual(
        initialStatus.health.dataQuality.lastUpdated.getTime()
      );
    });
  });

  describe('Cross-Component Integration', () => {
    test('should integrate ConnectionManager, ModelManager, and other components', async () => {
      // Register app with full configuration
      const fullConfig = {
        ...testConfig,
        models: {
          directory: './models',
          baseModel: 'BaseModel',
        },
        security: {
          enabled: true,
          encryption: false,
        },
      };

      await appRegistry.registerApp('integrated-app', fullConfig);

      // Get the connection manager and verify it works with all managers
      const connectionManager = appRegistry.getApp('integrated-app');
      expect(connectionManager).toBeDefined();

      // Get the actual database connection
      const connection = connectionManager.knex;
      expect(connection).toBeDefined();

      // Verify connection has all expected properties
      expect(connection.client).toBeDefined();
      expect(typeof connection.raw).toBe('function');
      expect(typeof connection.schema).toBe('object');

      // Test basic schema operations
      const hasTable = await connection.schema.hasTable('test_integration');
      expect(typeof hasTable).toBe('boolean');
    });

    test('should handle component failures gracefully', async () => {
      // Register app
      await appRegistry.registerApp('failure-test-app', testConfig);

      // Simulate component interaction
      const connectionManager = appRegistry.getApp('failure-test-app');
      expect(connectionManager).toBeDefined();

      const connection = connectionManager.knex;
      expect(connection).toBeDefined();

      // Test error handling in database operations
      await expect(connection.raw('INVALID SQL STATEMENT')).rejects.toThrow();

      // App should still be functional after error
      const status = await appRegistry.getStatus();
      expect(status.health.connections.total).toBeGreaterThan(0);
    });
  });

  describe('Performance Integration', () => {
    test('should maintain performance with multiple concurrent operations', async () => {
      const startTime = Date.now();

      // Register multiple apps concurrently
      const registrationPromises = [];
      for (let i = 0; i < 5; i++) {
        const config = {
          database: {
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
          },
          migrations: { enabled: false },
          seeds: { enabled: false },
          models: { enabled: false },
        };
        registrationPromises.push(appRegistry.registerApp(`perf-app-${i}`, config));
      }
      await Promise.all(registrationPromises);
      const registrationTime = Date.now() - startTime;

      // Verify all apps are registered
      const perfStatus = await appRegistry.getStatus();
      expect(perfStatus.connections.registeredConnections).toHaveLength(5);

      // Performance should be reasonable (less than 5 seconds for 5 apps)
      expect(registrationTime).toBeLessThan(5000);

      // Get health status and verify performance metrics
      const healthStartTime = Date.now();
      const status = await appRegistry.getStatus();
      const healthTime = Date.now() - healthStartTime;

      expect(status.health.connections.total).toBe(5);
      expect(status.health.metrics.performance.totalConnections).toBe(5);

      // Health check should be fast (less than 1 second)
      expect(healthTime).toBeLessThan(1000);
    });

    test('should handle rapid app registration and unregistration', async () => {
      const operations = [];

      // Rapid registration and unregistration
      for (let i = 0; i < 3; i++) {
        const appName = `rapid-app-${i}`;
        const config = {
          database: {
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
          },
          migrations: { enabled: false },
          seeds: { enabled: false },
          models: { enabled: false },
        };

        operations.push(
          appRegistry.registerApp(appName, config).then(() => appRegistry.unregisterApp(appName))
        );
      }

      await Promise.all(operations);

      // Verify system is stable after rapid operations
      const status = await appRegistry.getStatus();
      expect(status.health.connections.total).toBe(0);
      expect(status.initialized).toBe(true);
    });
  });

  describe('Error Recovery Integration', () => {
    test('should recover from connection errors gracefully', async () => {
      // Register a valid app first
      await appRegistry.registerApp('valid-app', testConfig);

      // Attempt to register app with invalid config
      const invalidConfig = {
        client: 'invalid-client',
        connection: {},
      };

      // Attempt to register app with invalid config should fail
      await expect(appRegistry.registerApp('invalid-app', invalidConfig)).rejects.toThrow();

      // Verify the valid app is still functional
      const validConnectionManager = appRegistry.getApp('valid-app');
      expect(validConnectionManager).toBeDefined();

      const validConnection = validConnectionManager.knex;
      expect(validConnection).toBeDefined();

      const status = await appRegistry.getStatus();
      expect(status.health.connections.total).toBe(1);
      expect(status.initialized).toBe(true);
    });

    test('should maintain system integrity during shutdown', async () => {
      // Register multiple apps
      await appRegistry.registerApp('shutdown-app-1', testConfig);
      await appRegistry.registerApp('shutdown-app-2', testConfig);
      await appRegistry.registerApp('shutdown-app-3', testConfig);

      // Verify apps are registered
      let shutdownStatus = await appRegistry.getStatus();
      expect(shutdownStatus.connections.registeredConnections).toHaveLength(3);

      // Shutdown gracefully
      await appRegistry.shutdown();

      // Verify clean shutdown
      shutdownStatus = await appRegistry.getStatus();
      expect(shutdownStatus.connections.registeredConnections).toHaveLength(0);

      // Verify connections are closed
      expect(appRegistry.getApp('shutdown-app-1')).toBeUndefined();
      expect(appRegistry.getApp('shutdown-app-2')).toBeUndefined();
      expect(appRegistry.getApp('shutdown-app-3')).toBeUndefined();
    });
  });
});
