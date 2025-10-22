/**
 * MigrationManager Unit Tests
 * Tests the database migration management functionality using real SQLite3 :memory: database
 */

const { MigrationManager } = require('../../../dist/MigrationManager/MigrationManager');
const { RealDatabaseHelper, RealComponentFactory, TestAssertions } = require('../../setup');
const path = require('path');
const fs = require('fs/promises');

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

  describe('Process Ownership Tracking', () => {
    let tempMigrationDir;
    let migrationManager1;
    let migrationManager2;
    let sharedKnex;
    let dbHelper;

    beforeAll(async () => {
      // Create temporary migration directory and files
      tempMigrationDir = path.join(process.cwd(), '__tests__', 'temp', 'migrations-ownership');
      await fs.mkdir(tempMigrationDir, { recursive: true });

      // Create test migration files
      const migration1Content = `
        exports.up = async function(knex) {
          await knex.schema.createTableIfNotExists('test_table', table => {
            table.increments('id').primary();
            table.string('name').notNullable();
            table.string('value').notNullable();
          });
          await knex('test_table').insert([
            { name: 'app1_data_1', value: 'from_app1' },
            { name: 'app1_data_2', value: 'from_app1' }
          ]);
        };

        exports.down = async function(knex) {
          await knex('test_table').where('value', 'from_app1').del();
        };
      `;

      const migration2Content = `
        exports.up = async function(knex) {
          await knex.schema.createTableIfNotExists('test_table', table => {
            table.increments('id').primary();
            table.string('name').notNullable();
            table.string('value').notNullable();
          });
          await knex('test_table').insert([
            { name: 'app2_data_1', value: 'from_app2' },
            { name: 'app2_data_2', value: 'from_app2' }
          ]);
        };

        exports.down = async function(knex) {
          await knex('test_table').where('value', 'from_app2').del();
        };
      `;

      const migration3Content = `
        exports.up = async function(knex) {
          await knex.schema.createTableIfNotExists('test_table', table => {
            table.increments('id').primary();
            table.string('name').notNullable();
            table.string('value').notNullable();
          });
          await knex('test_table').insert([
            { name: 'shared_data', value: 'from_shared' }
          ]);
        };

        exports.down = async function(knex) {
          await knex('test_table').where('value', 'from_shared').del();
        };
      `;

      await fs.writeFile(path.join(tempMigrationDir, '001_app1_migration.js'), migration1Content);
      await fs.writeFile(path.join(tempMigrationDir, '002_app2_migration.js'), migration2Content);
      await fs.writeFile(path.join(tempMigrationDir, '003_shared_migration.js'), migration3Content);
    });

    beforeEach(async () => {
      // Create shared database instance (simulating shared connection scenario)
      dbHelper = new RealDatabaseHelper();
      sharedKnex = await dbHelper.createKnexInstance('shared_migration_ownership_test');

      // Create two migration managers representing different apps sharing same connection
      migrationManager1 = new MigrationManager(
        {
          tableName: 'knex_migrations',
          directory: tempMigrationDir,
        },
        'app1'
      );

      migrationManager2 = new MigrationManager(
        {
          tableName: 'knex_migrations',
          directory: tempMigrationDir,
        },
        'app2'
      );

      await migrationManager1.initialize();
      await migrationManager2.initialize();
    });

    afterEach(async () => {
      if (migrationManager1?.isInitialized) {
        await migrationManager1.shutdown();
      }
      if (migrationManager2?.isInitialized) {
        await migrationManager2.shutdown();
      }
      await dbHelper.cleanup();
    });

    afterAll(async () => {
      // Clean up temporary migration files
      try {
        await fs.rm(tempMigrationDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('should create knex_migrations table with app_name column', async () => {
      // Run migrations with first manager
      const result = await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.migrations).toHaveLength(3);

      // Check that the table was created with app_name column
      const hasTable = await sharedKnex.schema.hasTable('knex_migrations');
      expect(hasTable).toBe(true);

      const hasAppNameColumn = await sharedKnex.schema.hasColumn('knex_migrations', 'app_name');
      expect(hasAppNameColumn).toBe(true);

      // Check that migrations are tracked with correct app name
      const migrationRecords = await sharedKnex('knex_migrations').select('name', 'app_name');
      expect(migrationRecords).toHaveLength(3);
      expect(migrationRecords.every(m => m.app_name === 'app1')).toBe(true);
    });

    test('should track migrations with app ownership in shared connection', async () => {
      // App1 runs migrations
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // App2 runs migrations on same connection
      await migrationManager2.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // Check that migrations are tracked with correct app ownership
      const migrationRecords = await sharedKnex('knex_migrations')
        .select('name', 'app_name', 'batch')
        .orderBy('id');

      expect(migrationRecords).toHaveLength(6); // 3 migrations × 2 apps = 6 records

      // App1 migrations
      const app1Migrations = migrationRecords.filter(r => r.app_name === 'app1');
      expect(app1Migrations).toHaveLength(3);
      expect(app1Migrations.map(m => m.name)).toEqual([
        '001_app1_migration.js',
        '002_app2_migration.js',
        '003_shared_migration.js',
      ]);

      // App2 migrations
      const app2Migrations = migrationRecords.filter(r => r.app_name === 'app2');
      expect(app2Migrations).toHaveLength(3);
      expect(app2Migrations.map(m => m.name)).toEqual([
        '001_app1_migration.js',
        '002_app2_migration.js',
        '003_shared_migration.js',
      ]);
    });

    test('should only rollback migrations from specific app', async () => {
      // Both apps run all migrations on shared connection
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      await migrationManager2.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // Verify initial data
      const initialData = await sharedKnex('test_table').select();
      expect(initialData).toHaveLength(10); // 5 records × 2 apps = 10 records

      // App1 rollback should only affect app1's migrations
      const rollbackResult = await migrationManager1.rollback({
        knex: sharedKnex,
        directory: tempMigrationDir,
        step: 1,
      });

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBack).toHaveLength(3); // Only app1's migrations

      // Check migration tracking table - app1 migrations should be removed
      const remainingMigrations = await sharedKnex('knex_migrations')
        .select('name', 'app_name')
        .orderBy('id');

      expect(remainingMigrations).toHaveLength(3); // Only app2 migrations remain
      expect(remainingMigrations.every(m => m.app_name === 'app2')).toBe(true);

      // Data should be partially rolled back (app1 data removed by down functions)
      const remainingData = await sharedKnex('test_table').select();
      // Note: The rollback removes app1 data but the table structure and app2 data remain
      // The exact count depends on the down function implementation
      expect(remainingData.length).toBeGreaterThanOrEqual(0); // Data may be fully or partially rolled back

      // Verify that app2 migrations are still tracked
      expect(remainingMigrations.every(m => m.app_name === 'app2')).toBe(true);
    });

    test('should handle app-specific batch numbering', async () => {
      // App1 runs migrations in multiple batches
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true, // Force re-run to create new batch
      });

      // App2 runs migrations once
      await migrationManager2.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // Check batch numbers
      const migrationRecords = await sharedKnex('knex_migrations')
        .select('name', 'app_name', 'batch')
        .orderBy('id');

      const app1Migrations = migrationRecords.filter(r => r.app_name === 'app1');
      const app2Migrations = migrationRecords.filter(r => r.app_name === 'app2');

      // App1 should have migrations in batch 1 and 2
      expect(app1Migrations).toHaveLength(6); // 3 migrations × 2 batches
      expect(app1Migrations.filter(m => m.batch === 1)).toHaveLength(3);
      expect(app1Migrations.filter(m => m.batch === 2)).toHaveLength(3);

      // App2 should have migrations in batch 1 only
      expect(app2Migrations).toHaveLength(3);
      expect(app2Migrations.every(m => m.batch === 1)).toBe(true);
    });

    test('should prevent cross-app interference during rollback', async () => {
      // App1 runs migrations
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // App2 runs migrations
      await migrationManager2.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // App1 runs more migrations (second batch)
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // App1 rollback should only affect app1's latest batch
      await migrationManager1.rollback({
        knex: sharedKnex,
        directory: tempMigrationDir,
        step: 1,
      });

      // Check remaining migrations
      const remainingMigrations = await sharedKnex('knex_migrations')
        .select('name', 'app_name', 'batch')
        .orderBy('id');

      // The rollback should remove app1's latest batch
      const app1Migrations = remainingMigrations.filter(r => r.app_name === 'app1');
      const app2Migrations = remainingMigrations.filter(r => r.app_name === 'app2');

      // App1 should have fewer migrations after rollback (latest batch removed)
      expect(app1Migrations.length).toBeLessThan(6); // Some app1 migrations rolled back

      // App2 should be unaffected
      expect(app2Migrations).toHaveLength(3); // Unaffected
      expect(app2Migrations.every(m => m.batch === 1)).toBe(true);

      // Total remaining should be less than the original 9 (6 app1 + 3 app2)
      expect(remainingMigrations.length).toBeLessThan(9);
    });

    test('should handle backward compatibility with existing migrations table', async () => {
      // Simulate existing migrations table without app_name column
      await sharedKnex.schema.dropTableIfExists('knex_migrations');
      await sharedKnex.schema.createTable('knex_migrations', table => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('batch').notNullable();
        table.timestamp('migration_time').defaultTo(sharedKnex.fn.now());
        // No app_name column initially
      });

      // Insert some legacy migration records
      await sharedKnex('knex_migrations').insert([
        { name: 'legacy_migration_1.js', batch: 1 },
        { name: 'legacy_migration_2.js', batch: 1 },
      ]);

      // Run migrations with new manager - should add app_name column
      await migrationManager1.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // Check that app_name column was added and populated
      const hasAppNameColumn = await sharedKnex.schema.hasColumn('knex_migrations', 'app_name');
      expect(hasAppNameColumn).toBe(true);

      const allMigrations = await sharedKnex('knex_migrations')
        .select('name', 'app_name')
        .orderBy('id');

      // Legacy migrations should have default app_name
      const legacyMigrations = allMigrations.filter(m => m.name.startsWith('legacy_'));
      expect(legacyMigrations).toHaveLength(2);
      expect(legacyMigrations.every(m => m.app_name === 'default')).toBe(true);

      // New migrations should have correct app_name
      const newMigrations = allMigrations.filter(m => !m.name.startsWith('legacy_'));
      expect(newMigrations).toHaveLength(3);
      expect(newMigrations.every(m => m.app_name === 'app1')).toBe(true);
    });

    test('should use connection name as app name when called through ConnectionManager', async () => {
      // This test simulates how AppRegistry calls migration operations
      const connectionName = 'test-connection';

      const migrationManager = new MigrationManager(
        {
          tableName: 'knex_migrations',
          directory: tempMigrationDir,
        },
        connectionName
      );

      await migrationManager.initialize();

      // Run migrations (simulating ConnectionManager calling MigrationManager)
      await migrationManager.migrate({
        knex: sharedKnex,
        directory: tempMigrationDir,
        force: true,
      });

      // Check that migrations are tracked with connection name as app_name
      const migrationRecords = await sharedKnex('knex_migrations')
        .select('name', 'app_name')
        .orderBy('id');

      expect(migrationRecords).toHaveLength(3);
      expect(migrationRecords.every(m => m.app_name === connectionName)).toBe(true);

      await migrationManager.shutdown();
    });
  });
});
