/**
 * MigrationManager Unit Tests
 * Tests the database migration management functionality using real SQLite3 :memory: database
 */

const { MigrationManager } = require('../../../dist/MigrationManager/MigrationManager');
const { RealDatabaseHelper, RealComponentFactory, TestAssertions } = require('../../setup');

describe('MigrationManager', () => {
  let migrationManager;
  let knexInstance;
  let configManager;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('migration_test');
    configManager = RealComponentFactory.createConfigurationManager();

    // MigrationManager constructor takes (config, connectionName)
    const migrationConfig = {
      knex: knexInstance,
      directory: '__tests__/fixtures/migrations',
      tableName: 'test_migrations',
    };

    migrationManager = new MigrationManager(migrationConfig, 'test');
  });

  afterEach(async () => {
    if (migrationManager && (await migrationManager.getStatus()).initialized) {
      await migrationManager.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create MigrationManager instance', async () => {
      expect(migrationManager).toBeInstanceOf(MigrationManager);
      expect((await migrationManager.getStatus()).initialized).toBe(false);
    });

    test('should handle invalid parameters gracefully', () => {
      // MigrationManager constructor doesn't throw - it uses defaults
      // Test that it creates instance but may fail during initialization
      const manager1 = new MigrationManager();
      expect(manager1).toBeInstanceOf(MigrationManager);

      const manager2 = new MigrationManager(null);
      expect(manager2).toBeInstanceOf(MigrationManager);

      const manager3 = new MigrationManager({}, 'test');
      expect(manager3).toBeInstanceOf(MigrationManager);
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      const status = migrationManager.getStatus();
      expect(status.initialized).toBe(true);

      // Verify the status includes connection information
      expect(status.connection).toBeDefined();
      expect(status.connection.name).toBe('test');
      expect(status.components).toBeDefined();
      expect(status.components.validator.available).toBe(true);
      expect(status.components.runner.available).toBe(true);
    });

    test('should initialize with default configuration', async () => {
      await migrationManager.initialize();

      const status = migrationManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle re-initialization gracefully', async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      // Should not throw on re-initialization
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      const status = migrationManager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Status and Information', () => {
    test('should provide status information', () => {
      const status = migrationManager.getStatus();

      TestAssertions.hasProperties(status, [
        'initialized',
        'connection',
        'components',
        'timestamp',
      ]);
      expect(status.connection.name).toBe('test');
    });

    test('should provide migration configuration', async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      const status = migrationManager.getStatus();

      expect(status.configuration).toBeDefined();
      expect(status.components.runner.available).toBe(true);
      expect(status.components.validator.available).toBe(true);
    });

    test('should handle database connection validation', async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      // Test that the Knex connection is working
      await TestAssertions.knexConnected(knexInstance);
    });
  });

  describe('Migration Execution', () => {
    beforeEach(async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });
    });

    test('should run migrations to latest', async () => {
      // Verify that the MigrationManager is initialized
      const status = migrationManager.getStatus();
      expect(status.initialized).toBe(true);

      // Test that our Knex instance is valid
      await TestAssertions.knexConnected(knexInstance);

      const result = await migrationManager.migrate({
        knex: knexInstance,
        directory: '__tests__/fixtures/migrations',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify tables were created by migrations
      await TestAssertions.tableExists(knexInstance, 'users');
      await TestAssertions.tableExists(knexInstance, 'posts');

      // Verify table structure
      await TestAssertions.tableHasColumns(knexInstance, 'users', ['id', 'name', 'email']);
      await TestAssertions.tableHasColumns(knexInstance, 'posts', ['id', 'title', 'content']);
    });

    test('should rollback migrations', async () => {
      // First run migrations
      await migrationManager.migrate({
        knex: knexInstance,
        directory: '__tests__/fixtures/migrations',
      });

      // Verify tables exist
      await TestAssertions.tableExists(knexInstance, 'users');

      // Then rollback
      const result = await migrationManager.rollback({
        knex: knexInstance,
        step: 1,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should handle migration status correctly', async () => {
      // Get status before migrations
      const statusBefore = migrationManager.getStatus();
      expect(statusBefore.initialized).toBe(true);
      expect(statusBefore.migrationsRunning).toBe(false);

      // Run migrations
      await migrationManager.migrate({
        knex: knexInstance,
        directory: '__tests__/fixtures/migrations',
      });

      // Get status after migrations
      const statusAfter = migrationManager.getStatus();
      expect(statusAfter.initialized).toBe(true);
      expect(statusAfter.migrationsRunning).toBe(false);
    });
  });

  describe('Migration Status and Listing', () => {
    beforeEach(async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });
    });

    test('should get migration status', async () => {
      const status = migrationManager.getStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('connection');
      expect(status).toHaveProperty('components');
      expect(status.connection.name).toBe('test');
      expect(status.components.runner.available).toBe(true);
    });

    test('should provide component status information', async () => {
      const status = migrationManager.getStatus();

      expect(status.components).toBeDefined();
      expect(status.components.validator).toBeDefined();
      expect(status.components.runner).toBeDefined();
      expect(status.components.validator.available).toBe(true);
      expect(status.components.runner.available).toBe(true);

      // Should have component status details
      expect(status.components.runner.status).toBeDefined();
      expect(status.components.validator.status).toBeDefined();
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await migrationManager.initialize({
        directory: '__tests__/fixtures/migrations',
        tableName: 'test_migrations',
      });

      const result = await migrationManager.shutdown();

      expect(result.success).toBe(true);

      const status = migrationManager.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should handle shutdown when not initialized', async () => {
      // Create a new manager that's not initialized
      const uninitializedManager = new MigrationManager({}, 'test-uninit');

      const result = await uninitializedManager.shutdown();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already-shutdown');
    });
  });
});
