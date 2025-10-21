/**
 * SeedManager Unit Tests
 * Tests the database seeding functionality using real SQLite3 :memory: database
 */

const { SeedManager } = require('../../../dist/SeedManager/SeedManager');
const { RealDatabaseHelper, RealComponentFactory, TestAssertions } = require('../../setup');

describe('SeedManager', () => {
  let seedManager;
  let knexInstance;
  let configManager;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('seed_test');
    configManager = RealComponentFactory.createConfigurationManager();
    seedManager = new SeedManager({}, 'testSeedManager');
  });

  afterEach(async () => {
    if (seedManager && (await seedManager.getStatus()).initialized) {
      await seedManager.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('Constructor', () => {
    test('should create SeedManager instance', () => {
      expect(seedManager).toBeInstanceOf(SeedManager);
      expect(seedManager.getStatus().initialized).toBe(false);
    });

    test('should throw error for invalid parameters', () => {
      expect(() => new SeedManager('invalid')).toThrow(); // Invalid config type
      expect(() => new SeedManager({}, '')).toThrow(); // Empty connection name
      expect(() => new SeedManager({}, 123)).toThrow(); // Invalid connection name type
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });

      const status = seedManager.getStatus();
      expect(status.initialized).toBe(true);

      // Verify the seed configuration is set
      const configStatus = seedManager.getStatus();
      expect(configStatus).toBeDefined();
      expect(typeof configStatus).toBe('object');
    });

    test('should initialize with default configuration', async () => {
      await seedManager.initialize();

      const status = seedManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle re-initialization gracefully', async () => {
      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });

      // Should not throw on re-initialization
      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });

      const status = seedManager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Seed Execution', () => {
    beforeEach(async () => {
      // First create the tables that seeds depend on
      await knexInstance.schema.createTable('users', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.string('email').unique().notNullable();
        table.string('password');
        table.boolean('active').defaultTo(true);
        table.timestamps(true, true);
      });

      await knexInstance.schema.createTable('posts', function (table) {
        table.increments('id').primary();
        table.string('title').notNullable();
        table.text('content');
        table.integer('user_id').unsigned().references('id').inTable('users');
        table.boolean('published').defaultTo(false);
        table.timestamps(true, true);
      });

      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });
    });

    test('should run all seeds', async () => {
      const result = await seedManager.seed({
        knex: knexInstance,
        directory: '__tests__/fixtures/seeds',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.seeds).toBeDefined();
      expect(result.seeds.length).toBeGreaterThan(0);

      // Verify data was inserted
      await TestAssertions.tableHasData(knexInstance, 'users', 3);
      await TestAssertions.tableHasData(knexInstance, 'posts');
    });

    test('should handle seed rollback', async () => {
      // First run seeds
      await seedManager.seed({
        knex: knexInstance,
        directory: '__tests__/fixtures/seeds',
      });

      // Verify data exists
      await TestAssertions.tableHasData(knexInstance, 'users', 3);

      // Rollback seeds
      const result = await seedManager.rollback({
        knex: knexInstance,
        directory: '__tests__/fixtures/seeds',
        steps: 1,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should provide seed status information', async () => {
      const status = seedManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('initialized');
    });
  });

  describe('Seed Status and Information', () => {
    beforeEach(async () => {
      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });
    });

    test('should get seed status', () => {
      const status = seedManager.getStatus();

      TestAssertions.hasProperties(status, ['initialized', 'directory', 'timestamp']);
      expect(status.initialized).toBe(true);
    });

    test('should provide seed configuration', () => {
      const status = seedManager.getStatus();
      const config = status.configuration;

      expect(config).toBeDefined();
      expect(config.runner).toBeDefined();
    });

    test('should handle database connection validation', async () => {
      // Test that the Knex connection is working
      await TestAssertions.knexConnected(knexInstance);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await seedManager.initialize({
        directory: '__tests__/fixtures/seeds',
      });

      const result = await seedManager.shutdown();

      expect(result.success).toBe(true);

      const status = seedManager.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should handle shutdown when not initialized', async () => {
      const result = await seedManager.shutdown();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('already-shutdown');
    });
  });
});
