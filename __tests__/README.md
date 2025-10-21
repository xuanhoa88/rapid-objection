# Test Suite Documentation

## Overview

The rapid-objection test suite has been consolidated and organized for better
maintainability, reduced duplication, and improved clarity. This document
outlines the new test structure and organization.

## Test Structure

```
__tests__/
├── config/                    # Test configuration
│   └── test-config.js        # Centralized test configuration
├── fixtures/                 # Test fixtures and data
│   ├── migrations/           # Test migration files
│   └── seeds/               # Test seed files
├── integration/              # Integration & E2E tests
│   └── full-stack.test.js   # Complete system integration & E2E tests
├── performance/              # Performance tests
│   └── performance-suite.test.js  # Comprehensive performance tests
├── unit/                     # Unit tests by component
│   ├── AppRegistry/
│   ├── ConfigurationManager/
│   ├── ConnectionManager/
│   ├── InputValidator/
│   ├── MigrationManager/
│   ├── ModelManager/
│   ├── PluginManager/
│   ├── SecurityManager/
│   ├── SeedManager/
│   ├── TimeoutManager/
│   └── TransactionManager/
│   └── overrideComponents.test.js
├── utils/                    # Shared test utilities
│   └── test-patterns.js     # Common test patterns and utilities
├── jest-setup.js            # Jest setup configuration
└── setup.js                 # Test environment setup
```

## Test Categories

### Unit Tests (`/unit/`)

- Test individual components in isolation
- Fast execution (< 10 seconds per suite)
- Mock external dependencies
- Focus on component behavior and edge cases

### Integration Tests (`/integration/`)

- Test complete system integration
- Real database connections (SQLite in-memory)
- End-to-end workflows
- Multi-component interactions
- Full application lifecycle testing

### Performance Tests (`/performance/`)

- System performance and scalability
- Memory usage and leak detection
- Throughput and latency measurements
- Stress testing under load

## Shared Test Utilities

### TestAssertions

Common assertions for consistent validation:

- `hasExpectedStructure()`: Validate object structure
- `hasValidComponentStatus()`: Validate component status
- `knexConnected()`: Validate database connection
- `completesWithinTime()`: Validate operation timing

### TestDataGenerators

Common test data generators:

- `createDbConfig()`: Generate database configurations
- `createAppConfig()`: Generate app configurations
- `createModelDefinitions()`: Generate model definitions

## Configuration

### Test Timeouts

- Unit tests: 10 seconds
- Integration tests: 30 seconds
- Performance tests: 60 seconds
- CI environment: Extended timeouts

### Performance Thresholds

- App registration: < 5 seconds
- Health checks: < 2 seconds
- Memory per app: < 20MB
- Minimum throughput: 50 ops/sec

## Running Tests

### All Tests

```bash
npm test
```

### By Category

```bash
# Unit tests only
npm run test:unit

# Integration tests only (includes E2E scenarios)
npm run test:integration

# Performance tests only
npm run test:performance
```

### Specific Components

```bash
# ConnectionManager tests
npm test -- __tests__/unit/ConnectionManager

# Full stack integration
npm test -- __tests__/integration/full-stack.test.js
```

## Best Practices

### Writing New Tests

1. Use shared utilities from `test-patterns.js`
2. Follow established naming conventions
3. Include proper setup/teardown using standard patterns
4. Add performance assertions for critical paths
5. Use centralized configuration from `test-config.js`

### Test Data

1. Use `TestDataGenerators` for consistent test data
2. Avoid hardcoded values where possible
3. Use meaningful test names and descriptions
4. Clean up resources in afterEach hooks

### Performance Testing

1. Set realistic performance thresholds
2. Test both single and concurrent operations
3. Monitor memory usage and leaks
4. Include stress testing for critical components
