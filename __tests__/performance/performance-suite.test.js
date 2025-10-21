/**
 * Comprehensive Performance Test Suite
 * Consolidated performance tests for the rapid-objection system
 * Tests system performance, scalability, and resource utilization
 */

const { AppRegistry } = require('../../dist/AppRegistry');
const { RealDatabaseHelper } = require('../setup');
const { TestDataGenerators } = require('../utils/test-patterns');

describe('Performance Test Suite', () => {
  let appRegistry;
  let dbHelper;

  beforeEach(() => {
    dbHelper = new RealDatabaseHelper();
    appRegistry = new AppRegistry();
  });

  afterEach(async () => {
    if (appRegistry && (await appRegistry.getStatus().initialized)) {
      await appRegistry.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('App Registration Performance', () => {
    test('should register apps within performance threshold', async () => {
      await appRegistry.initialize();

      const startTime = Date.now();

      const dbConfig = dbHelper.createTestConfig('perfApp');

      await appRegistry.registerApp('perfApp', {
        database: dbConfig,
        migrations: {
          run: true,
          directory: '__tests__/fixtures/migrations',
        },
        seeds: {
          enabled: false,
        },
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(appRegistry.hasApp('perfApp')).toBe(true);
    });

    test('should handle concurrent app registrations efficiently', async () => {
      await appRegistry.initialize();

      const appCount = 5;
      const registrations = [];

      const startTime = Date.now();

      for (let i = 0; i < appCount; i++) {
        const dbConfig = dbHelper.createTestConfig(`concurrentApp${i}`);

        registrations.push(
          appRegistry.registerApp(`concurrentApp${i}`, {
            database: dbConfig,
            migrations: { enabled: false },
            seeds: { enabled: false },
          })
        );
      }

      await Promise.all(registrations);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // All apps should be registered
      for (let i = 0; i < appCount; i++) {
        expect(appRegistry.hasApp(`concurrentApp${i}`)).toBe(true);
      }
    });

    test('should scale registration performance linearly', async () => {
      await appRegistry.initialize();

      const testSizes = [1, 3, 5];
      const results = [];

      for (const size of testSizes) {
        const startTime = Date.now();
        const registrations = [];

        for (let i = 0; i < size; i++) {
          const dbConfig = dbHelper.createTestConfig(`scaleApp${size}_${i}`);
          registrations.push(
            appRegistry.registerApp(`scaleApp${size}_${i}`, {
              database: dbConfig,
              migrations: { enabled: false },
              seeds: { enabled: false },
            })
          );
        }

        await Promise.all(registrations);
        const duration = Date.now() - startTime;
        results.push({ size, duration });

        // Cleanup for next iteration
        for (let i = 0; i < size; i++) {
          await appRegistry.unregisterApp(`scaleApp${size}_${i}`);
        }
      }

      // Check that performance doesn't degrade exponentially
      const firstResult = results[0];
      const lastResult = results[results.length - 1];
      const scalingFactor = lastResult.duration / Math.max(firstResult.duration, 1);
      const sizeRatio = lastResult.size / firstResult.size;

      // Should not have exponential scaling (O(n²) or worse)
      expect(scalingFactor).toBeLessThan(Math.pow(sizeRatio, 2));
    });
  });

  describe('Health Check Performance', () => {
    test('should perform health checks within time limits', async () => {
      await appRegistry.initialize();

      // Register multiple apps
      const appCount = 10;
      for (let i = 0; i < appCount; i++) {
        const dbConfig = dbHelper.createTestConfig(`healthApp${i}`);
        await appRegistry.registerApp(`healthApp${i}`, {
          database: dbConfig,
          migrations: { enabled: false },
          seeds: { enabled: false },
        });
      }

      const startTime = Date.now();
      const status = await appRegistry.getStatus();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(status.health.connections.healthy).toBe(appCount);
      expect(status.health.metrics.healthPercentage).toBe(100);
    });

    test('should maintain health check performance over time', async () => {
      await appRegistry.initialize();

      const dbConfig = dbHelper.createTestConfig('sustainedApp');
      await appRegistry.registerApp('sustainedApp', {
        database: dbConfig,
        migrations: { enabled: false },
        seeds: { enabled: false },
      });

      const iterations = 5;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await appRegistry.getStatus();
        const duration = Date.now() - startTime;
        durations.push(duration);

        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // All checks should be fast
      durations.forEach(duration => {
        expect(duration).toBeLessThan(1000);
      });

      // Performance should not degrade significantly
      const firstDuration = durations[0];
      const lastDuration = durations[durations.length - 1];
      const degradation = firstDuration > 0 ? (lastDuration - firstDuration) / firstDuration : 0;

      expect(degradation).toBeLessThan(2.0); // Less than 200% degradation
    });
  });

  describe('Memory Performance', () => {
    test('should not leak memory during app lifecycle', async () => {
      await appRegistry.initialize();

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform multiple app registration/unregistration cycles
      const cycles = 5;
      for (let cycle = 0; cycle < cycles; cycle++) {
        const dbConfig = dbHelper.createTestConfig(`memoryApp${cycle}`);

        await appRegistry.registerApp(`memoryApp${cycle}`, {
          database: dbConfig,
          migrations: { enabled: false },
          seeds: { enabled: false },
          models: {
            register: true,
            definitions: TestDataGenerators.createModelDefinitions(),
          },
        });

        // Perform some operations
        const connection = appRegistry.getApp(`memoryApp${cycle}`);
        await connection.getStatus();

        // Unregister app
        await appRegistry.unregisterApp(`memoryApp${cycle}`);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should use memory efficiently for multiple apps', async () => {
      await appRegistry.initialize();

      const beforeRegistration = process.memoryUsage();

      const appCount = 5;
      for (let i = 0; i < appCount; i++) {
        const dbConfig = dbHelper.createTestConfig(`memEffApp${i}`);
        await appRegistry.registerApp(`memEffApp${i}`, {
          database: dbConfig,
          migrations: { enabled: false },
          seeds: { enabled: false },
          models: {
            register: true,
            definitions: {
              User: { tableName: 'users', schema: { timestamps: true } },
            },
          },
        });
      }

      const afterRegistration = process.memoryUsage();
      const memoryPerApp = (afterRegistration.heapUsed - beforeRegistration.heapUsed) / appCount;

      // Each app should use reasonable memory (less than 10MB per app)
      expect(memoryPerApp).toBeLessThan(10 * 1024 * 1024);

      // Cleanup
      for (let i = 0; i < appCount; i++) {
        await appRegistry.unregisterApp(`memEffApp${i}`);
      }
    });
  });

  describe('Throughput Performance', () => {
    test('should handle high-frequency operations', async () => {
      await appRegistry.initialize();

      const dbConfig = dbHelper.createTestConfig('throughputApp');
      await appRegistry.registerApp('throughputApp', {
        database: dbConfig,
        migrations: { enabled: false },
        seeds: { enabled: false },
      });

      const operationCount = 100;
      const operations = [];

      const startTime = Date.now();

      // Perform multiple status checks concurrently
      for (let i = 0; i < operationCount; i++) {
        operations.push(appRegistry.getStatus());
      }

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      const throughput = operationCount / (duration / 1000); // Operations per second

      expect(results).toHaveLength(operationCount);
      expect(throughput).toBeGreaterThan(50); // At least 50 ops/sec
    });

    test('should maintain throughput under load', async () => {
      await appRegistry.initialize();

      // Register multiple apps to create load
      const appCount = 3;
      for (let i = 0; i < appCount; i++) {
        const dbConfig = dbHelper.createTestConfig(`loadApp${i}`);
        await appRegistry.registerApp(`loadApp${i}`, {
          database: dbConfig,
          migrations: { enabled: false },
          seeds: { enabled: false },
          models: {
            register: true,
            definitions: {
              User: { tableName: 'users', schema: { timestamps: true } },
            },
          },
        });
      }

      // Test throughput with multiple apps
      const operationCount = 50;
      const operations = [];

      const startTime = Date.now();

      for (let i = 0; i < operationCount; i++) {
        operations.push(appRegistry.getStatus());
      }

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      const throughput = operationCount / (duration / 1000);

      expect(results).toHaveLength(operationCount);
      expect(throughput).toBeGreaterThan(25); // At least 25 ops/sec under load

      // Cleanup
      for (let i = 0; i < appCount; i++) {
        await appRegistry.unregisterApp(`loadApp${i}`);
      }
    });
  });

  describe('Stress Testing', () => {
    test('should handle rapid app registration/unregistration', async () => {
      await appRegistry.initialize();

      const cycles = 3;
      const appsPerCycle = 2;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const startTime = Date.now();

        // Register apps
        for (let i = 0; i < appsPerCycle; i++) {
          const dbConfig = dbHelper.createTestConfig(`stressApp${cycle}_${i}`);
          await appRegistry.registerApp(`stressApp${cycle}_${i}`, {
            database: dbConfig,
            migrations: { enabled: false },
            seeds: { enabled: false },
          });
        }

        // Verify all registered
        for (let i = 0; i < appsPerCycle; i++) {
          expect(appRegistry.hasApp(`stressApp${cycle}_${i}`)).toBe(true);
        }

        // Unregister apps
        for (let i = 0; i < appsPerCycle; i++) {
          await appRegistry.unregisterApp(`stressApp${cycle}_${i}`);
        }

        // Verify all unregistered
        for (let i = 0; i < appsPerCycle; i++) {
          expect(appRegistry.hasApp(`stressApp${cycle}_${i}`)).toBe(false);
        }

        const cycleTime = Date.now() - startTime;
        expect(cycleTime).toBeLessThan(5000); // Each cycle should complete within 5 seconds
      }
    });

    test('should handle concurrent operations under stress', async () => {
      await appRegistry.initialize();

      // Register base apps
      const baseAppCount = 2;
      for (let i = 0; i < baseAppCount; i++) {
        const dbConfig = dbHelper.createTestConfig(`baseApp${i}`);
        await appRegistry.registerApp(`baseApp${i}`, {
          database: dbConfig,
          migrations: { enabled: false },
          seeds: { enabled: false },
        });
      }

      // Perform concurrent operations
      const concurrentOps = [];
      const operationCount = 20;

      const startTime = Date.now();

      for (let i = 0; i < operationCount; i++) {
        // Mix of different operations
        if (i % 3 === 0) {
          concurrentOps.push(appRegistry.getStatus());
        } else if (i % 3 === 1) {
          concurrentOps.push(appRegistry.getApp('baseApp0').getStatus());
        } else {
          concurrentOps.push(appRegistry.getApp('baseApp1').getStatus());
        }
      }

      const results = await Promise.all(concurrentOps);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(operationCount);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Cleanup
      for (let i = 0; i < baseAppCount; i++) {
        await appRegistry.unregisterApp(`baseApp${i}`);
      }
    });
  });

  describe('Resource Utilization', () => {
    test('should use resources efficiently', async () => {
      await appRegistry.initialize();

      const dbConfig = dbHelper.createTestConfig('resourceApp');

      const beforeRegistration = process.memoryUsage();

      await appRegistry.registerApp('resourceApp', {
        database: dbConfig,
        migrations: {
          enabled: true,
          directory: '__tests__/fixtures/migrations',
        },
        seeds: {
          enabled: false,
        },
        models: {
          register: true,
          definitions: TestDataGenerators.createModelDefinitions(),
        },
      });

      const afterRegistration = process.memoryUsage();

      const memoryUsed = afterRegistration.heapUsed - beforeRegistration.heapUsed;

      // Memory usage should be reasonable (less than 20MB for one app)
      expect(memoryUsed).toBeLessThan(20 * 1024 * 1024);

      // Should have reasonable number of handles
      const status = await appRegistry.getStatus();
      expect(status.connections.totalConnections).toBe(1);
    });

    test('should optimize resource usage for shared connections', async () => {
      await appRegistry.initialize();

      const sharedDbConfig = dbHelper.createTestConfig('sharedResource');
      sharedDbConfig.shared = true;

      const beforeShared = process.memoryUsage();

      // Register multiple apps sharing the same connection
      await appRegistry.registerApp('sharedApp1', {
        database: sharedDbConfig,
        migrations: { enabled: false },
        seeds: { enabled: false },
      });

      await appRegistry.registerApp('sharedApp2', {
        useConnection: 'sharedApp1',
        seeds: { enabled: false },
      });

      await appRegistry.registerApp('sharedApp3', {
        useConnection: 'sharedApp1',
        seeds: { enabled: false },
      });

      const afterShared = process.memoryUsage();
      const sharedMemory = afterShared.heapUsed - beforeShared.heapUsed;

      // Shared connections should use less memory per app
      const memoryPerSharedApp = sharedMemory / 3;
      expect(memoryPerSharedApp).toBeLessThan(5 * 1024 * 1024); // Less than 5MB per shared app

      // Should only have one actual database connection
      const status = await appRegistry.getStatus();
      expect(status.connections.totalConnections).toBe(3); // 3 registered connections
      expect(status.connections.registeredConnections).toHaveLength(3);

      // Cleanup
      await appRegistry.unregisterApp('sharedApp1');
      await appRegistry.unregisterApp('sharedApp2');
      await appRegistry.unregisterApp('sharedApp3');
    });
  });
});
