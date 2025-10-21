/**
 * Shared Test Patterns and Utilities
 * Common test patterns used across the test suite to reduce duplication
 */

/**
 * Common test assertions
 */
class TestAssertions {
  /**
   * Assert that an object has the expected structure
   * @param {Object} obj - Object to test
   * @param {Array} expectedProperties - Expected properties
   */
  static hasExpectedStructure(obj, expectedProperties) {
    expect(obj).toBeDefined();
    expectedProperties.forEach(prop => {
      expect(obj).toHaveProperty(prop);
    });
  }

  /**
   * Assert that a component status has expected structure
   * @param {Object} status - Status object
   */
  static hasValidComponentStatus(status) {
    this.hasExpectedStructure(status, ['initialized', 'components', 'database']);

    if (status.components) {
      this.hasExpectedStructure(status.components, ['available', 'total', 'initialized', 'health']);
    }
  }

  /**
   * Assert that a database connection is working
   * @param {Object} knex - Knex instance
   */
  static async knexConnected(knex) {
    expect(knex).toBeDefined();

    // Test basic query
    const result = await knex.raw('SELECT 1 as test');
    expect(result).toBeDefined();
  }

  /**
   * Assert that an operation completed within time limit
   * @param {Function} operation - Operation to test
   * @param {number} timeLimit - Time limit in milliseconds
   */
  static async completesWithinTime(operation, timeLimit = 5000) {
    const startTime = Date.now();
    await operation();
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(timeLimit);
  }
}

/**
 * Test data generators
 */
class TestDataGenerators {
  /**
   * Generate test database configuration
   * @param {string} name - Database name
   * @param {Object} overrides - Configuration overrides
   */
  static createDbConfig(name = 'test', overrides = {}) {
    return {
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
      migrations: {
        directory: '__tests__/fixtures/migrations',
        tableName: `${name}_migrations`,
      },
      seeds: {
        directory: '__tests__/fixtures/seeds',
      },
      ...overrides,
    };
  }

  /**
   * Generate test app configuration
   * @param {string} name - App name
   * @param {Object} overrides - Configuration overrides
   */
  static createAppConfig(name = 'testApp', overrides = {}) {
    return {
      database: this.createDbConfig(name),
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
      ...overrides,
    };
  }

  /**
   * Generate test model definitions
   */
  static createModelDefinitions() {
    return {
      User: {
        tableName: 'users',
        schema: {
          timestamps: true,
          validationRules: {
            required: ['name', 'email'],
            types: { name: 'string', email: 'string' },
          },
        },
      },
      Post: {
        tableName: 'posts',
        schema: {
          timestamps: true,
          validationRules: {
            required: ['title', 'user_id'],
            types: { title: 'string', user_id: 'number' },
          },
        },
      },
    };
  }
}

module.exports = {
  TestAssertions,
  TestDataGenerators,
};
