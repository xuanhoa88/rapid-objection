/**
 * Test Setup and Utilities
 * Provides common setup functions and utilities for testing rapid-objection
 * Uses real SQLite3 :memory: databases instead of mocks for realistic testing
 */

const path = require('path');
const knex = require('knex');

/**
 * Real Database Helper
 * Creates and manages real SQLite3 :memory: databases for testing
 */
class RealDatabaseHelper {
  constructor() {
    this.activeConnections = new Map();
    this.cleanupFunctions = [];
  }

  /**
   * Create a real Knex instance with SQLite3 :memory:
   */
  async createKnexInstance(name = 'test', overrides = {}) {
    const config = {
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
      migrations: {
        directory: path.join(__dirname, 'fixtures', 'migrations'),
        tableName: `${name}_migrations`,
      },
      seeds: {
        directory: path.join(__dirname, 'fixtures', 'seeds'),
      },
      ...overrides,
    };

    const knexInstance = knex(config);

    // Ensure the knex instance has the expected structure for InputValidator
    // The InputValidator expects knex.client.config to exist
    if (knexInstance.client && !knexInstance.client.config) {
      knexInstance.client.config = config;
    }

    // Test the connection to ensure it's working
    try {
      await knexInstance.raw('SELECT 1 as test');
    } catch (error) {
      console.warn(`Failed to test Knex connection for ${name}:`, error.message);
    }

    this.activeConnections.set(name, knexInstance);

    // Add to cleanup
    this.cleanupFunctions.push(async () => {
      if (knexInstance && !knexInstance.isDestroyed) {
        await knexInstance.destroy();
      }
    });

    return knexInstance;
  }

  /**
   * Create a test database configuration
   */
  createTestConfig(name = 'test', overrides = {}) {
    const config = {
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
      migrations: {
        directory: path.join(__dirname, 'fixtures', 'migrations'),
        tableName: `${name}_migrations`,
      },
      seeds: {
        directory: path.join(__dirname, 'fixtures', 'seeds'),
      },
      ...overrides,
    };

    return config;
  }

  /**
   * Clean up all test databases and connections
   */
  async cleanup() {
    // Close all active connections
    for (const [name, connection] of this.activeConnections) {
      try {
        if (connection && !connection.isDestroyed) {
          await connection.destroy();
        }
      } catch (error) {
        console.warn(`Failed to close connection ${name}:`, error.message);
      }
    }

    // Run additional cleanup functions
    for (const cleanupFn of this.cleanupFunctions) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn('Cleanup function failed:', error.message);
      }
    }

    this.activeConnections.clear();
    this.cleanupFunctions = [];
  }
}

/**
 * Real Component Factory
 * Creates real component instances for testing with SQLite3 :memory: databases
 */
class RealComponentFactory {
  /**
   * Create a real ConfigurationManager instance
   */
  static createConfigurationManager(initialConfig = {}) {
    const { ConfigurationManager } = require('../dist/ConfigurationManager');
    const config = new ConfigurationManager({
      'database.client': 'sqlite3',
      'database.connection': ':memory:',
      'database.useNullAsDefault': true,
      'migrations.enabled': true,
      'seeds.enabled': true,
      'models.enabled': true,
      ...initialConfig,
    });
    return config;
  }

  /**
   * Create a real BaseModel class for testing
   */
  static createBaseModel() {
    try {
      const ModelManager = require('../dist/ModelManager');
      const BaseModel = ModelManager.BaseModel || ModelManager.default?.BaseModel;

      if (!BaseModel) {
        throw new Error('BaseModel not found in ModelManager export');
      }

      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_models';
        }
        static get schema() {
          return {
            timestamps: true,
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          };
        }
      }

      return TestModel;
    } catch (error) {
      console.warn('Failed to create BaseModel:', error.message);
      // Return a simple mock class as fallback
      return class TestModel {
        static get tableName() {
          return 'test_models';
        }
        static get schema() {
          return { timestamps: true };
        }
      };
    }
  }
}

/**
 * Test Assertion Helpers
 */
class TestAssertions {
  /**
   * Assert that an object has expected properties
   */
  static hasProperties(obj, properties) {
    properties.forEach(prop => {
      expect(obj).toHaveProperty(prop);
    });
  }

  /**
   * Assert database table exists
   */
  static async tableExists(knex, tableName) {
    const exists = await knex.schema.hasTable(tableName);
    expect(exists).toBe(true);
  }

  /**
   * Assert database table has expected columns
   */
  static async tableHasColumns(knex, tableName, columns) {
    const columnInfo = await knex(tableName).columnInfo();
    columns.forEach(column => {
      expect(columnInfo).toHaveProperty(column);
    });
  }

  /**
   * Assert database table has expected data
   */
  static async tableHasData(knex, tableName, expectedCount = null) {
    const count = await knex(tableName).count('* as count').first();
    const actualCount = parseInt(count.count);

    if (expectedCount != null) {
      expect(actualCount).toBe(expectedCount);
    } else {
      expect(actualCount).toBeGreaterThan(0);
    }

    return actualCount;
  }

  /**
   * Assert that a Knex instance is valid and connected
   */
  static async knexConnected(knex) {
    expect(knex).toBeDefined();
    expect(knex.raw).toBeDefined();

    // Test connection with a simple query
    const result = await knex.raw('SELECT 1 as test');
    expect(result).toBeDefined();
  }
}

module.exports = {
  RealDatabaseHelper,
  RealComponentFactory,
  TestAssertions,
};
