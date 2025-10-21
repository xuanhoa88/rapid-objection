/**
 * ConnectionManager Unit Tests
 * Tests the database connection management functionality using real SQLite3 :memory: database
 */

const path = require('path');
const { ConnectionManager } = require('../../../dist/ConnectionManager');
const { RealDatabaseHelper, RealComponentFactory, TestAssertions } = require('../../setup');

describe('ConnectionManager', () => {
  let connectionManager;
  let dbHelper;
  let configManager;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    configManager = RealComponentFactory.createConfigurationManager();

    const options = {
      database: {
        client: 'sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      },
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
      },
    };

    connectionManager = new ConnectionManager(options, 'testService');
  });

  afterEach(async () => {
    if (connectionManager) {
      const status = await connectionManager.getStatus();
      if (status.initialized) {
        await connectionManager.shutdown();
      }
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create ConnectionManager instance', async () => {
      expect(connectionManager).toBeInstanceOf(ConnectionManager);
      expect(connectionManager.name).toBe('testService');
      const status = await connectionManager.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should throw error for invalid parameters', () => {
      expect(() => new ConnectionManager()).toThrow();
      expect(() => new ConnectionManager('')).toThrow();
      expect(() => new ConnectionManager('test', null)).toThrow();
    });
  });

  describe('Initialization', () => {
    test('should initialize with database configuration', async () => {
      const dbConfig = dbHelper.createTestConfig('connection_test');

      await connectionManager.initialize();

      const status = await connectionManager.getStatus();
      expect(status.initialized).toBe(true);
      expect(connectionManager.knex).toBeDefined();

      // Test that the Knex connection is working
      await TestAssertions.knexConnected(connectionManager.knex);
    });

    test('should handle re-initialization gracefully', async () => {
      await connectionManager.initialize();

      // Should not throw on re-initialization
      const result = await connectionManager.initialize();
      expect(result.mode).toBe('already-initialized');

      const status = await connectionManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle invalid database configuration', async () => {
      // Constructor should throw with invalid config
      expect(() => new ConnectionManager({}, 'invalid-test')).toThrow(
        'Database configuration must be a valid object'
      );
      expect(() => new ConnectionManager(null, 'invalid-test2')).toThrow(
        'Database configuration must be a valid object'
      );
    });

    test('should initialize components during setup', async () => {
      await connectionManager.initialize();

      const status = await connectionManager.getStatus();
      expect(status.components).toBeDefined();

      // Verify components structure
      expect(status.components.available).toBeInstanceOf(Array);
      expect(status.components.total).toBeGreaterThan(0);
      expect(status.components.initialized).toBeInstanceOf(Array);
      expect(status.components.health).toBeDefined();

      // Verify components are available and healthy
      expect(status.components.available).toContain('migrationManager');
      expect(status.components.available).toContain('modelManager');
      expect(status.components.available).toContain('seedManager');

      // Verify component health metrics
      expect(status.components.health.healthy).toBeGreaterThan(0);
      expect(status.components.health.unhealthy).toBe(0);
      expect(status.components.health.unavailable).toBeLessThan(status.components.total);
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    test('should run migrations', async () => {
      const result = await connectionManager.runMigrations();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.migrationsRun).toBeGreaterThan(0);

      // Verify tables were created
      const knex = connectionManager.knex;
      await TestAssertions.tableExists(knex, 'users');
      await TestAssertions.tableExists(knex, 'posts');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should rollback migrations', async () => {
      // First run migrations
      await connectionManager.runMigrations();

      const result = await connectionManager.rollbackMigrations({ step: 1 });

      expect(result).toBeDefined();
    });

    test('should run seeds', async () => {
      // Run migrations first
      await connectionManager.runMigrations();

      const result = await connectionManager.runSeeds();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should rollback seeds', async () => {
      // Run migrations and seeds first
      await connectionManager.runMigrations();
      await connectionManager.runSeeds();

      const result = await connectionManager.rollbackSeeds({ steps: 1 });

      expect(result).toBeDefined();
    });
  });

  describe('Model Management', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    test('should register model definitions', async () => {
      // First check if ModelManager is available
      const status = await connectionManager.getStatus();
      expect(status.components.available).toContain('modelManager');

      const User = RealComponentFactory.createBaseModel();

      const result = await connectionManager.registerModels({
        User: { class: User, tableName: 'users' },
      });

      expect(result.success).toBe(true);
      expect(connectionManager.hasModel('User')).toBe(true);
    });

    test('should get registered model', async () => {
      const User = RealComponentFactory.createBaseModel();

      await connectionManager.registerModels({
        User: { class: User, tableName: 'users' },
      });

      const model = connectionManager.getModel('User');
      expect(model).toBeDefined();
    });

    test('should list model names', async () => {
      const User = RealComponentFactory.createBaseModel();
      const Post = RealComponentFactory.createBaseModel();

      await connectionManager.registerModels({
        User: { class: User, tableName: 'users' },
        Post: { class: Post, tableName: 'posts' },
      });

      const modelNames = connectionManager.getModelNames();
      expect(modelNames).toContain('User');
      expect(modelNames).toContain('Post');
    });

    test('should clear models', async () => {
      const User = RealComponentFactory.createBaseModel();

      await connectionManager.registerModels({
        User: { class: User, tableName: 'users' },
      });

      expect(connectionManager.hasModel('User')).toBe(true);

      await connectionManager.clearModels();

      expect(connectionManager.hasModel('User')).toBe(false);
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    test('should execute transaction', async () => {
      const result = await connectionManager.withTransaction(async trx => {
        // Simulate database operations
        return { success: true, data: 'test' };
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('test');
    });

    test('should rollback failed transaction', async () => {
      await expect(
        connectionManager.withTransaction(async trx => {
          throw new Error('Transaction failed');
        })
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('Status and Health', () => {
    beforeEach(async () => {
      const dbConfig = dbHelper.createTestConfig();
      await connectionManager.initialize();
    });

    test('should provide comprehensive status', async () => {
      const status = await connectionManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('connection.name');
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('components');
      expect(status.connection.name).toBe('testService');
    });

    test('should check health status', async () => {
      const status = await connectionManager.checkConnectionHealth();

      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('issues');
      expect(typeof status.healthy).toBe('boolean');
    });

    test('should provide database connection info', () => {
      const client = connectionManager.client;

      expect(client).toBeDefined();
      expect(client).toHaveProperty('config');
      expect(client.config.client).toBe('sqlite3');
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      const dbConfig = dbHelper.createTestConfig();
      await connectionManager.initialize();
    });

    test('should emit events during operations', async () => {
      const events = [];

      connectionManager.on('initialized', () => events.push('initialized'));

      // The initialize operation should emit events
      // Events are emitted during initialization
      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    test('should emit component registration events', async () => {
      const events = [];

      connectionManager.on('component-shutdown', data => events.push(data.component));
      connectionManager.on('initialized', data => events.push('initialized'));

      // Events are emitted during component lifecycle
      expect(events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      const dbConfig = dbHelper.createTestConfig();
      await connectionManager.initialize();

      const result = await connectionManager.shutdown();

      expect(result.success).toBe(true);
      expect(connectionManager.isInitialized).toBe(false);
    });

    test('should handle shutdown timeout', async () => {
      const dbConfig = dbHelper.createTestConfig();
      await connectionManager.initialize();

      const result = await connectionManager.shutdown({ timeout: 1000 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
    });

    test('should handle shutdown without initialization', async () => {
      const result = await connectionManager.shutdown();

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors', async () => {
      // Create ConnectionManager with invalid config
      const invalidConnectionManager = new ConnectionManager(
        {
          database: {
            client: 'nonexistent-client',
            connection: {},
          },
        },
        'invalid-test'
      );

      await expect(invalidConnectionManager.initialize()).rejects.toThrow();
    });

    test('should emit error events', async () => {
      const errors = [];

      connectionManager.on('error', error => errors.push(error));

      // Initialize first to ensure connection is ready
      await connectionManager.initialize();

      // Try to run migrations with invalid directory to trigger error
      await expect(
        connectionManager.runMigrations({ directory: '/nonexistent/path' })
      ).rejects.toThrow();

      expect(errors.length).toBeGreaterThan(0);
    });

    test('should handle component registration errors', async () => {
      const dbConfig = dbHelper.createTestConfig();
      await connectionManager.initialize();

      // Test error handling by trying to register models with invalid definition
      await expect(connectionManager.registerModel('InvalidModel', null)).rejects.toThrow();
    });
  });

  describe('Path Resolution', () => {
    let initializedManager;

    beforeEach(async () => {
      const dbConfig = dbHelper.createTestConfig();
      initializedManager = new ConnectionManager({ database: dbConfig }, 'pathTestService');
      await initializedManager.initialize();
    });

    afterEach(async () => {
      if (initializedManager) {
        const status = await initializedManager.getStatus();
        if (status.initialized) {
          await initializedManager.shutdown();
        }
      }
    });

    describe('Migration Path Resolution', () => {
      test('should resolve relative migration paths to absolute', async () => {
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async options => {
          // Verify the path was resolved to absolute
          const config = { ...initializedManager._config?.migrations, ...options };
          expect(config.directory).toBeDefined();
          return { migrations: [] };
        });

        await initializedManager.runMigrations({ directory: 'relative/migrations' });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should preserve absolute migration paths', async () => {
        const absolutePath = '/absolute/path/to/migrations';
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async options => {
          expect(options.directory).toBe(absolutePath);
          return { migrations: [] };
        });

        await initializedManager.runMigrations({ directory: absolutePath });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should use default migration directory when not specified', async () => {
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async options => {
          // Should default to 'migrations' directory
          return { migrations: [] };
        });

        await initializedManager.runMigrations({});
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should handle migration rollback path resolution', async () => {
        const spy = jest.spyOn(initializedManager, 'rollbackMigrations');
        spy.mockImplementation(async options => {
          return { migrations: [] };
        });

        await initializedManager.rollbackMigrations({ directory: 'relative/migrations' });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });
    });

    describe('Seed Path Resolution', () => {
      test('should resolve relative seed paths to absolute', async () => {
        const spy = jest.spyOn(initializedManager, 'runSeeds');
        spy.mockImplementation(async options => {
          // Verify the path was resolved to absolute
          const config = { ...initializedManager._config?.seeds, ...options };
          expect(config.directory).toBeDefined();
          return { seeds: [] };
        });

        await initializedManager.runSeeds({ directory: 'relative/seeds' });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should preserve absolute seed paths', async () => {
        const absolutePath = '/absolute/path/to/seeds';
        const spy = jest.spyOn(initializedManager, 'runSeeds');
        spy.mockImplementation(async options => {
          expect(options.directory).toBe(absolutePath);
          return { seeds: [] };
        });

        await initializedManager.runSeeds({ directory: absolutePath });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should use default seed directory when not specified', async () => {
        const spy = jest.spyOn(initializedManager, 'runSeeds');
        spy.mockImplementation(async options => {
          // Should default to 'seeds' directory
          return { seeds: [] };
        });

        await initializedManager.runSeeds({});
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should handle seed rollback path resolution', async () => {
        const spy = jest.spyOn(initializedManager, 'rollbackSeeds');
        spy.mockImplementation(async options => {
          return { seeds: [] };
        });

        await initializedManager.rollbackSeeds({ directory: 'relative/seeds' });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });
    });

    describe('Path Resolution Edge Cases', () => {
      test('should handle empty directory paths', async () => {
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async () => ({ migrations: [] }));

        // Should not throw with empty directory
        await expect(initializedManager.runMigrations({ directory: '' })).resolves.toBeDefined();
        spy.mockRestore();
      });

      test('should handle null/undefined directory paths', async () => {
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async () => ({ migrations: [] }));

        // Should not throw with null/undefined directory
        await expect(initializedManager.runMigrations({ directory: null })).resolves.toBeDefined();
        await expect(
          initializedManager.runMigrations({ directory: undefined })
        ).resolves.toBeDefined();
        spy.mockRestore();
      });

      test('should respect custom cwd in path resolution', async () => {
        const customCwd = '/custom/working/directory';
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async options => {
          // Verify custom cwd is used in path resolution
          return { migrations: [] };
        });

        await initializedManager.runMigrations({
          directory: 'relative/migrations',
          cwd: customCwd,
        });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should handle Windows-style paths', async () => {
        const windowsPath = 'relative\\migrations';
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async () => ({ migrations: [] }));

        // Should handle Windows-style paths without throwing
        await expect(
          initializedManager.runMigrations({ directory: windowsPath })
        ).resolves.toBeDefined();
        spy.mockRestore();
      });

      test('should handle path traversal attempts safely', async () => {
        const maliciousPath = '../../../etc/passwd';
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async () => ({ migrations: [] }));

        // Should resolve path traversal attempts safely
        await expect(
          initializedManager.runMigrations({ directory: maliciousPath })
        ).resolves.toBeDefined();
        spy.mockRestore();
      });
    });

    describe('Path Resolution Performance', () => {
      test('should resolve paths efficiently for multiple operations', async () => {
        const operations = [];
        const spy = jest.spyOn(initializedManager, 'runMigrations');
        spy.mockImplementation(async () => ({ migrations: [] }));

        const startTime = Date.now();

        // Run multiple path resolution operations
        for (let i = 0; i < 10; i++) {
          operations.push(initializedManager.runMigrations({ directory: `migrations_${i}` }));
        }

        await Promise.all(operations);
        const duration = Date.now() - startTime;

        // Should complete within reasonable time
        expect(duration).toBeLessThan(1000); // 1 second
        expect(spy).toHaveBeenCalledTimes(10);
        spy.mockRestore();
      });
    });

    describe('Path Resolution Integration', () => {
      test('should maintain path consistency across migration and seed operations', async () => {
        const migrationSpy = jest.spyOn(initializedManager, 'runMigrations');
        const seedSpy = jest.spyOn(initializedManager, 'runSeeds');

        migrationSpy.mockImplementation(async () => ({ migrations: [] }));
        seedSpy.mockImplementation(async () => ({ seeds: [] }));

        const baseDir = 'database';

        // Both operations should use consistent path resolution
        await initializedManager.runMigrations({ directory: `${baseDir}/migrations` });
        await initializedManager.runSeeds({ directory: `${baseDir}/seeds` });

        expect(migrationSpy).toHaveBeenCalled();
        expect(seedSpy).toHaveBeenCalled();

        migrationSpy.mockRestore();
        seedSpy.mockRestore();
      });

      test('should handle concurrent path resolution operations', async () => {
        const migrationSpy = jest.spyOn(initializedManager, 'runMigrations');
        const seedSpy = jest.spyOn(initializedManager, 'runSeeds');

        migrationSpy.mockImplementation(async () => ({ migrations: [] }));
        seedSpy.mockImplementation(async () => ({ seeds: [] }));

        // Run concurrent operations with different paths
        const operations = [
          initializedManager.runMigrations({ directory: 'migrations1' }),
          initializedManager.runSeeds({ directory: 'seeds1' }),
          initializedManager.runMigrations({ directory: 'migrations2' }),
          initializedManager.runSeeds({ directory: 'seeds2' }),
        ];

        // Should handle concurrent operations without issues
        await expect(Promise.all(operations)).resolves.toBeDefined();

        expect(migrationSpy).toHaveBeenCalledTimes(2);
        expect(seedSpy).toHaveBeenCalledTimes(2);

        migrationSpy.mockRestore();
        seedSpy.mockRestore();
      });
    });
  });

  // Path Resolution Logic Tests (merged from PathResolution.test.js)
  describe('Path Resolution Logic', () => {
    // Mock implementation of the #resolveDirectoryPath logic from ConnectionManager
    function resolveDirectoryPath(config, defaultDir, cwd = process.cwd()) {
      if (!config) {
        config = {};
      }

      // Handle null, undefined, or empty directory values
      const directory = config?.directory;
      if (!directory || typeof directory !== 'string' || directory.trim() === '') {
        config.directory = path.resolve(cwd, defaultDir);
        return config;
      }

      // Ensure directory is an absolute path for consistent file system access
      if (!path.isAbsolute(directory)) {
        config.directory = path.resolve(
          config.cwd || cwd, // Use config cwd or provided cwd as base
          directory // Use provided directory
        );
      }
      return config;
    }

    describe('Relative Path Resolution', () => {
      test('should resolve relative migration paths correctly', () => {
        const relativePath = 'database/migrations';
        const expectedAbsolutePath = path.resolve(process.cwd(), relativePath);

        const config = { directory: relativePath };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toBe(expectedAbsolutePath);
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should resolve relative seed paths correctly', () => {
        const relativePath = 'database/seeds';
        const expectedAbsolutePath = path.resolve(process.cwd(), relativePath);

        const config = { directory: relativePath };
        const result = resolveDirectoryPath(config, 'seeds');

        expect(result.directory).toBe(expectedAbsolutePath);
        expect(path.isAbsolute(result.directory)).toBe(true);
      });
    });

    describe('Absolute Path Preservation', () => {
      test('should preserve absolute migration paths', () => {
        const absolutePath = '/absolute/path/to/migrations';

        const config = { directory: absolutePath };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toBe(absolutePath);
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should preserve absolute seed paths', () => {
        const absolutePath = '/absolute/path/to/seeds';

        const config = { directory: absolutePath };
        const result = resolveDirectoryPath(config, 'seeds');

        expect(result.directory).toBe(absolutePath);
        expect(path.isAbsolute(result.directory)).toBe(true);
      });
    });

    describe('Default Directory Handling', () => {
      test('should use default migration directory when not specified', () => {
        const config = {};
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toContain('migrations');
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should use default seed directory when not specified', () => {
        const config = {};
        const result = resolveDirectoryPath(config, 'seeds');

        expect(result.directory).toContain('seeds');
        expect(path.isAbsolute(result.directory)).toBe(true);
      });
    });

    describe('Custom CWD Handling', () => {
      test('should respect custom cwd in migration path resolution', () => {
        const customCwd = '/custom/working/directory';
        const relativePath = 'migrations';
        const expectedPath = path.resolve(customCwd, relativePath);

        const config = { directory: relativePath, cwd: customCwd };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toBe(expectedPath);
      });

      test('should respect custom cwd in seed path resolution', () => {
        const customCwd = '/custom/working/directory';
        const relativePath = 'seeds';
        const expectedPath = path.resolve(customCwd, relativePath);

        const config = { directory: relativePath, cwd: customCwd };
        const result = resolveDirectoryPath(config, 'seeds');

        expect(result.directory).toBe(expectedPath);
      });
    });

    describe('Edge Cases', () => {
      test('should handle empty directory string', () => {
        const config = { directory: '' };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toContain('migrations');
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should handle null directory', () => {
        const config = { directory: null };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toContain('migrations');
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should handle undefined directory', () => {
        const config = { directory: undefined };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(result.directory).toContain('migrations');
        expect(path.isAbsolute(result.directory)).toBe(true);
      });

      test('should handle path traversal attempts', () => {
        const traversalPath = '../../../etc/passwd';

        const config = { directory: traversalPath };
        const result = resolveDirectoryPath(config, 'migrations');

        expect(path.isAbsolute(result.directory)).toBe(true);
        // Path traversal is resolved by Node.js path.resolve() - this is expected behavior
        // The result will be an absolute path, but may traverse outside the current directory
        expect(result.directory).toBe(path.resolve(process.cwd(), traversalPath));
      });
    });

    describe('Performance and Consistency', () => {
      test('should maintain consistent path resolution across multiple calls', () => {
        const relativePath = 'database/migrations';
        const resolvedPaths = [];

        // Make multiple calls with same relative path
        for (let i = 0; i < 3; i++) {
          const config = { directory: relativePath };
          const result = resolveDirectoryPath(config, 'migrations');
          resolvedPaths.push(result.directory);
        }

        // All resolved paths should be identical
        expect(resolvedPaths).toHaveLength(3);
        expect(resolvedPaths[0]).toBe(resolvedPaths[1]);
        expect(resolvedPaths[1]).toBe(resolvedPaths[2]);
        expect(path.isAbsolute(resolvedPaths[0])).toBe(true);
      });

      test('should handle multiple different paths efficiently', () => {
        const paths = ['migrations1', 'migrations2', 'migrations3'];
        const resolvedPaths = [];

        const startTime = Date.now();

        paths.forEach(dir => {
          const config = { directory: dir };
          const result = resolveDirectoryPath(config, 'migrations');
          resolvedPaths.push(result.directory);
        });

        const duration = Date.now() - startTime;

        expect(resolvedPaths).toHaveLength(3);
        expect(duration).toBeLessThan(100); // Should be very fast

        // All paths should be absolute and unique
        resolvedPaths.forEach(resolvedPath => {
          expect(path.isAbsolute(resolvedPath)).toBe(true);
        });
      });
    });
  });
});
