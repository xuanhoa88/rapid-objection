/**
 * Jest Setup Configuration
 * Configures Jest environment for rapid-objection testing
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  // Create mock database config
  createMockDbConfig: () => ({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: './test-migrations',
    },
    seeds: {
      directory: './test-seeds',
    },
  }),

  // Create mock app config
  createMockAppConfig: (overrides = {}) => ({
    database: global.testUtils.createMockDbConfig(),
    migrations: { enabled: true },
    seeds: { enabled: true },
    models: { enabled: true },
    ...overrides,
  }),
};

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  // Use original console for error reporting in tests
  originalConsole.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
