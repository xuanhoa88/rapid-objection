/**
 * Standardized Test Configuration
 * Central configuration for all test suites to ensure consistency
 */

const path = require('path');

/**
 * Test environment configuration
 */
const TEST_CONFIG = {
  // Test timeouts (in milliseconds)
  timeouts: {
    unit: 10000, // 10 seconds for unit tests
    integration: 30000, // 30 seconds for integration tests
    performance: 60000, // 60 seconds for performance tests
    e2e: 120000, // 2 minutes for end-to-end tests
  },

  // Performance thresholds
  performance: {
    appRegistration: 5000, // App registration should complete within 5s
    healthCheck: 2000, // Health checks should complete within 2s
    concurrentRegistration: 10000, // Concurrent registrations within 10s
    memoryPerApp: 20 * 1024 * 1024, // Max 20MB per app
    throughputMinimum: 50, // Minimum 50 operations per second
  },

  // Database configuration
  database: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    pool: {
      min: 0,
      max: 10,
    },
  },

  // Test directories
  directories: {
    fixtures: path.resolve(__dirname, '../fixtures'),
    migrations: path.resolve(__dirname, '../fixtures/migrations'),
    seeds: path.resolve(__dirname, '../fixtures/seeds'),
    utils: path.resolve(__dirname, '../utils'),
  },

  // Default test configurations
  defaults: {
    app: {
      migrations: {
        enabled: false,
        directory: path.resolve(__dirname, '../fixtures/migrations'),
      },
      seeds: {
        enabled: false,
        directory: path.resolve(__dirname, '../fixtures/seeds'),
      },
      models: {
        enabled: true,
      },
    },

    component: {
      timeout: 5000,
      retries: 3,
      strict: true,
    },
  },

  // Test data templates
  templates: {
    user: {
      name: 'Test User',
      email: 'test@example.com',
    },

    post: {
      title: 'Test Post',
      content: 'Test content',
    },

    modelDefinitions: {
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
    },
  },

  // Environment-specific overrides
  environments: {
    ci: {
      timeouts: {
        unit: 15000,
        integration: 45000,
        performance: 90000,
        e2e: 180000,
      },
      performance: {
        appRegistration: 7500,
        healthCheck: 3000,
        concurrentRegistration: 15000,
        memoryPerApp: 30 * 1024 * 1024,
        throughputMinimum: 25,
      },
    },

    local: {
      // Use default values for local development
    },
  },
};

/**
 * Get configuration for current environment
 */
function getTestConfig() {
  const env = process.env.NODE_ENV || 'local';
  const envConfig = TEST_CONFIG.environments[env] || {};

  // Deep merge environment-specific config
  return {
    ...TEST_CONFIG,
    timeouts: { ...TEST_CONFIG.timeouts, ...envConfig.timeouts },
    performance: { ...TEST_CONFIG.performance, ...envConfig.performance },
  };
}

/**
 * Create a standardized database configuration for tests
 */
function createTestDbConfig(name = 'test', overrides = {}) {
  return {
    ...TEST_CONFIG.database,
    migrations: {
      directory: TEST_CONFIG.directories.migrations,
      tableName: `${name}_migrations`,
    },
    seeds: {
      directory: TEST_CONFIG.directories.seeds,
    },
    ...overrides,
  };
}

/**
 * Create a standardized app configuration for tests
 */
function createTestAppConfig(name = 'testApp', overrides = {}) {
  return {
    database: createTestDbConfig(name),
    ...TEST_CONFIG.defaults.app,
    ...overrides,
  };
}

/**
 * Get performance threshold for a specific metric
 */
function getPerformanceThreshold(metric) {
  const config = getTestConfig();
  return config.performance[metric];
}

/**
 * Get timeout for a specific test type
 */
function getTestTimeout(testType) {
  const config = getTestConfig();
  return config.timeouts[testType];
}

/**
 * Validate test environment setup
 */
function validateTestEnvironment() {
  const required = [
    TEST_CONFIG.directories.fixtures,
    TEST_CONFIG.directories.migrations,
    TEST_CONFIG.directories.seeds,
  ];

  const fs = require('fs');

  for (const dir of required) {
    if (!fs.existsSync(dir)) {
      throw new Error(`Required test directory not found: ${dir}`);
    }
  }

  return true;
}

module.exports = {
  TEST_CONFIG,
  getTestConfig,
  createTestDbConfig,
  createTestAppConfig,
  getPerformanceThreshold,
  getTestTimeout,
  validateTestEnvironment,
};
