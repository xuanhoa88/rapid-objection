/**
 * This configuration provides comprehensive testing setup for the multi-app database management system
 * with support for unit, integration, end-to-end, and performance testing.
 */

const { readFileSync } = require('fs');
const { join } = require('path');

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

module.exports = {
  // Use Node.js environment for testing
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/*.test.js',
    '**/*.spec.js',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/docs/',
    '/__tests__/fixtures/',
    '/__tests__/helpers/',
    '/__tests__/temp/',
    '/__tests__/mocks/',
  ],

  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  collectCoverageFrom: [
    'dist/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/docs/**',
    '!**/__tests__/**',
    '!**/benchmarks/**',
    '!**/examples/**',
    '!jest.config.js',
    '!jsdoc.config.json',
    '!package.json',
  ],

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json', 'clover'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/jest-setup.js', '<rootDir>/__tests__/setup.js'],

  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1',
  },

  // Transform configuration for ES modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // Test timeout (30 seconds for database operations)
  testTimeout: 30000,

  // Performance settings
  maxWorkers: '50%',
  maxConcurrency: 5,

  // Verbose output
  verbose: true,

  // Detect open handles (important for database connections)
  detectOpenHandles: true,
  forceExit: true,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Timer mocks for handling setInterval/setTimeout in components
  fakeTimers: {
    enableGlobally: true,
    doNotFake: ['nextTick', 'setImmediate', 'performance'],
    advanceTimers: true,
  },

  // Error handling
  errorOnDeprecated: true,

  // Test result processor - temporarily disabled for ES module compatibility
  // testResultsProcessor: '<rootDir>/__tests__/processors/test-results-processor.js',

  // Notification settings - disabled due to missing node-notifier dependency
  notify: false,
  // notifyMode: 'failure-change',

  // Bail settings
  bail: 0, // Don't bail on first failure

  // Cache settings
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',

  // Reporters
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/html-report',
        filename: 'report.html',
        expand: true,
        pageTitle: 'Rapid Objection Multi-App Test Report',
        logoImgPath: undefined,
        hideIcon: false,
        includeFailureMsg: true,
        includeSuiteFailure: true,
      },
    ],
    [
      'jest-junit',
      {
        outputDirectory: './coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
        addFileAttribute: true,
        suiteNameTemplate: '{filepath}',
        includeShortConsoleOutput: true,
      },
    ],
  ],

  // Global test configuration
  globals: {
    'ts-jest': {
      useESM: true,
    },
    __TEST_ENV__: 'jest',
    __DATABASE_URL__: 'sqlite::memory:',
    __REDIS_URL__: 'redis://localhost:6379/15', // Use test database
    __MONGODB_URL__: 'mongodb://localhost:27017/test_rapid_objection',
    __VERSION__: packageJson.version,
    __BUILD_TIME__: new Date().toISOString(),
  },

  // Setup Node.js built-in modules for Jest
  setupFiles: ['<rootDir>/__tests__/jest-setup.js'],

  // Test environment options
  testEnvironmentOptions: {
    // Node.js specific options
    node: {
      // Increase memory limit for large test suites
      max_old_space_size: 4096,
    },
  },

  // Watch mode configuration
  watchman: true,
  watchPathIgnorePatterns: ['/node_modules/', '/coverage/', '/dist/', '/docs/', '/temp/'],
};
