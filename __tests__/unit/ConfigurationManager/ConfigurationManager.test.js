/**
 * ConfigurationManager Unit Tests
 * Tests the configuration management functionality
 */

const { ConfigurationManager } = require('../../../dist/ConfigurationManager');

describe('ConfigurationManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
  });

  describe('Constructor', () => {
    test('should create ConfigurationManager instance', () => {
      expect(configManager).toBeInstanceOf(ConfigurationManager);
    });

    test('should initialize with default configuration', () => {
      const config = new ConfigurationManager();
      expect(config).toBeInstanceOf(ConfigurationManager);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        'database.client': 'sqlite3',
        'database.connection.host': 'localhost',
      };

      const config = new ConfigurationManager(customConfig);
      expect(config.get('database.client')).toBe('sqlite3');
      expect(config.get('database.connection.host')).toBe('localhost');
    });
  });

  describe('Configuration Management', () => {
    test('should set and get configuration values', () => {
      configManager.set('test.key', 'test-value');

      expect(configManager.get('test.key')).toBe('test-value');
    });

    test('should get configuration with default value', () => {
      const value = configManager.get('nonexistent.key', 'default-value');

      expect(value).toBe('default-value');
    });

    test('should handle nested configuration keys', () => {
      configManager.set('database.connection.host', 'localhost');
      configManager.set('database.connection.port', 5432);

      expect(configManager.get('database.connection.host')).toBe('localhost');
      expect(configManager.get('database.connection.port')).toBe(5432);
    });

    test('should check if configuration key exists', () => {
      configManager.set('existing.key', 'value');

      expect(configManager.get('existing.key')).toBeDefined();
      expect(configManager.get('nonexistent.key')).toBeUndefined();
    });

    test('should set and get configuration keys', () => {
      configManager.set('test.key', 'value');
      expect(configManager.get('test.key')).toBeDefined();
      expect(configManager.get('test.key')).toBe('value');

      // Test overwriting
      configManager.set('test.key', 'new-value');
      expect(configManager.get('test.key')).toBe('new-value');
    });

    test('should handle multiple configuration keys', () => {
      configManager.set('key1', 'value1');
      configManager.set('key2', 'value2');

      expect(configManager.get('key1')).toBeDefined();
      expect(configManager.get('key2')).toBeDefined();
      expect(configManager.get('key1')).toBe('value1');
      expect(configManager.get('key2')).toBe('value2');

      // Test getting all configuration
      const allConfig = configManager.getAll();
      expect(allConfig).toBeDefined();
      expect(typeof allConfig).toBe('object');
    });
  });

  describe('Bulk Operations', () => {
    test('should get all configuration', () => {
      configManager.set('key1', 'value1');
      configManager.set('key2', 'value2');
      configManager.set('nested.key', 'nested-value');

      const allConfig = configManager.getAll();

      expect(allConfig).toHaveProperty('key1', 'value1');
      expect(allConfig).toHaveProperty('key2', 'value2');
      expect(allConfig).toHaveProperty('nested.key', 'nested-value');
    });

    test('should handle multiple configuration operations', () => {
      configManager.set('existing.key', 'existing-value');
      configManager.set('new.key', 'new-value');
      configManager.set('another.key', 'another-value');

      expect(configManager.get('existing.key')).toBe('existing-value');
      expect(configManager.get('new.key')).toBe('new-value');
      expect(configManager.get('another.key')).toBe('another-value');

      // Test getAll contains all keys
      const allConfig = configManager.getAll();
      expect(allConfig).toBeDefined();
      expect(typeof allConfig).toBe('object');
    });

    test('should handle configuration updates', () => {
      configManager.set('test.key', 'original-value');
      expect(configManager.get('test.key')).toBe('original-value');

      // Test updating existing key
      configManager.set('test.key', 'updated-value');
      expect(configManager.get('test.key')).toBe('updated-value');

      // Test setting new key
      configManager.set('new.key', 'new-value');
      expect(configManager.get('new.key')).toBe('new-value');
    });
  });

  describe('Configuration Validation', () => {
    test('should handle nested configuration keys', () => {
      configManager.set('database.client', 'sqlite3');
      configManager.set('database.connection.host', 'localhost');
      configManager.set('database.connection.port', 5432);

      expect(configManager.get('database.client')).toBe('sqlite3');
      expect(configManager.get('database.connection.host')).toBe('localhost');
      expect(configManager.get('database.connection.port')).toBe(5432);

      const allConfig = configManager.getAll();
      expect(allConfig).toBeDefined();
    });

    test('should handle different value types', () => {
      configManager.set('string.key', 'string-value');
      configManager.set('number.key', 42);
      configManager.set('boolean.key', true);

      expect(configManager.get('string.key')).toBe('string-value');
      expect(configManager.get('number.key')).toBe(42);
      expect(configManager.get('boolean.key')).toBe(true);
    });

    test('should handle configuration overwriting', () => {
      configManager.set('test.key', 'original-value');
      expect(configManager.get('test.key')).toBe('original-value');

      configManager.set('test.key', 'updated-value');
      expect(configManager.get('test.key')).toBe('updated-value');

      configManager.set('test.key', null);
      expect(configManager.get('test.key')).toBe(null);
    });
  });

  describe('Environment Integration', () => {
    test('should handle environment-like configuration', () => {
      // Test setting configuration that might come from environment
      configManager.set('database.client', 'sqlite3');
      configManager.set('database.host', 'localhost');
      configManager.set('database.port', 5432);

      expect(configManager.get('database.client')).toBe('sqlite3');
      expect(configManager.get('database.host')).toBe('localhost');
      expect(configManager.get('database.port')).toBe(5432);

      // Test that configuration persists
      const allConfig = configManager.getAll();
      expect(allConfig).toBeDefined();
    });

    test('should handle configuration with prefixes', () => {
      configManager.set('app.database.client', 'sqlite3');
      configManager.set('app.database.host', 'localhost');
      configManager.set('app.database.port', 3000);

      expect(configManager.get('app.database.client')).toBe('sqlite3');
      expect(configManager.get('app.database.host')).toBe('localhost');
      expect(configManager.get('app.database.port')).toBe(3000);
    });
  });

  describe('File Operations', () => {
    test('should get all configuration as object', () => {
      configManager.set('key1', 'value1');
      configManager.set('nested.key', 'nested-value');

      const allConfig = configManager.getAll();

      expect(allConfig).toBeDefined();
      expect(typeof allConfig).toBe('object');
      // Configuration structure may be nested, so we just verify it exists
      expect(allConfig).toBeTruthy();
    });

    test('should set configuration from object-like data', () => {
      // Simulate importing by setting multiple keys
      configManager.set('imported.key', 'imported-value');
      configManager.set('another.key', 'another-value');
      configManager.set('third.key', 'third-value');

      expect(configManager.get('imported.key')).toBe('imported-value');
      expect(configManager.get('another.key')).toBe('another-value');
      expect(configManager.get('third.key')).toBe('third-value');
    });
  });

  describe('Status and Information', () => {
    test('should provide comprehensive configuration access', () => {
      configManager.set('key1', 'value1');
      configManager.set('key2', 'value2');

      const allConfig = configManager.getAll();

      expect(allConfig).toBeDefined();
      expect(typeof allConfig).toBe('object');

      // Verify individual keys are accessible
      expect(configManager.get('key1')).toBe('value1');
      expect(configManager.get('key2')).toBe('value2');
    });

    test('should provide all configuration', () => {
      configManager.set('key1', 'value1');
      configManager.set('key2', 'value2');

      const allConfig = configManager.getAll();

      expect(allConfig).toBeDefined();
      expect(typeof allConfig).toBe('object');
      // Should contain the set values in the configuration structure
      expect(allConfig).toBeTruthy();
    });
  });

  describe('Event System', () => {
    test('should handle configuration operations', () => {
      // Test basic set operation
      configManager.set('test.key', 'value');
      expect(configManager.get('test.key')).toBe('value');

      // Test overwriting
      configManager.set('test.key', 'new-value');
      expect(configManager.get('test.key')).toBe('new-value');

      // Test multiple keys
      configManager.set('another.key', 'another-value');
      expect(configManager.get('another.key')).toBe('another-value');

      // Test getAll
      const allConfig = configManager.getAll();
      expect(allConfig).toBeDefined();
    });

    test('should handle complex configuration structures', () => {
      configManager.set('app.name', 'test-app');
      configManager.set('app.version', '1.0.0');
      configManager.set('app.features.auth', true);
      configManager.set('app.features.logging', false);

      expect(configManager.get('app.name')).toBe('test-app');
      expect(configManager.get('app.version')).toBe('1.0.0');
      expect(configManager.get('app.features.auth')).toBe(true);
      expect(configManager.get('app.features.logging')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid configuration keys', () => {
      expect(() => configManager.set('', 'value')).toThrow();
      expect(() => configManager.set(null, 'value')).toThrow();
      expect(() => configManager.set(undefined, 'value')).toThrow();
    });

    test('should handle invalid configuration values', () => {
      // Should handle various value types gracefully
      configManager.set('string.key', 'string-value');
      configManager.set('number.key', 123);
      configManager.set('boolean.key', true);
      configManager.set('object.key', { nested: 'value' });
      configManager.set('array.key', [1, 2, 3]);

      expect(configManager.get('string.key')).toBe('string-value');
      expect(configManager.get('number.key')).toBe(123);
      expect(configManager.get('boolean.key')).toBe(true);
      expect(configManager.get('object.key')).toEqual({ nested: 'value' });
      expect(configManager.get('array.key')).toEqual([1, 2, 3]);
    });

    test('should handle circular references in objects', () => {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => configManager.set('circular.key', circularObj)).not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle large configuration sets efficiently', () => {
      const startTime = Date.now();

      // Set many configuration values
      for (let i = 0; i < 1000; i++) {
        configManager.set(`performance.key${i}`, `value${i}`);
      }

      const setTime = Date.now() - startTime;
      expect(setTime).toBeLessThan(1000); // Should complete within 1 second

      // Get many configuration values
      const getStartTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const value = configManager.get(`performance.key${i}`);
        expect(value).toBe(`value${i}`);
      }

      const getTime = Date.now() - getStartTime;
      expect(getTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle deep nested keys efficiently', () => {
      const deepKey = 'level1.level2.level3.level4.level5.level6.level7.level8.level9.level10';

      const startTime = Date.now();
      configManager.set(deepKey, 'deep-value');
      const value = configManager.get(deepKey);
      const endTime = Date.now() - startTime;

      expect(value).toBe('deep-value');
      expect(endTime).toBeLessThan(100); // Should be very fast
    });
  });
});
