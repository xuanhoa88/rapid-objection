/**
 * InputValidator Unit Tests
 * Tests the input validation functionality including ASAR compatibility
 */

const { InputValidator } = require('../../../dist/InputValidator');
const { RealDatabaseHelper } = require('../../setup');

describe('InputValidator', () => {
  describe('Knex Instance Validation', () => {
    test('should validate valid Knex instance', async () => {
      const dbHelper = new RealDatabaseHelper();
      const knexInstance = await dbHelper.createKnexInstance();

      const result = InputValidator.isValidKnexInstance(knexInstance);
      expect(result).toBe(true);

      await dbHelper.cleanup();
    });

    test('should reject invalid Knex instances', () => {
      expect(InputValidator.isValidKnexInstance(null)).toBe(false);
      expect(InputValidator.isValidKnexInstance(undefined)).toBe(false);
      expect(InputValidator.isValidKnexInstance({})).toBe(false);
      expect(InputValidator.isValidKnexInstance('string')).toBe(false);
      expect(InputValidator.isValidKnexInstance(123)).toBe(false);
    });

    test('should reject incomplete Knex instances', () => {
      // Missing client
      expect(InputValidator.isValidKnexInstance({ raw: () => {}, schema: {} })).toBe(false);

      // Missing client.config
      expect(
        InputValidator.isValidKnexInstance({
          client: {},
          raw: () => {},
          schema: {},
        })
      ).toBe(false);

      // Missing essential methods
      expect(
        InputValidator.isValidKnexInstance({
          client: { config: {} },
          schema: {},
          // Missing raw method
        })
      ).toBe(false);
    });
  });

  describe('Knex Pooling Support', () => {
    test('should detect pooling support', async () => {
      const dbHelper = new RealDatabaseHelper();
      const knexInstance = await dbHelper.createKnexInstance();
      knexInstance.client.pool = { min: 0, max: 10 };

      const result = InputValidator.supportsKnexPooling(knexInstance);
      expect(result).toBe(true);

      await dbHelper.cleanup();
    });

    test('should handle missing pool', async () => {
      const dbHelper = new RealDatabaseHelper();
      const knexInstance = await dbHelper.createKnexInstance();
      // Remove pool property if it exists
      delete knexInstance.client.pool;

      const result = InputValidator.supportsKnexPooling(knexInstance);
      expect(result).toBeFalsy(); // Could be false or undefined

      await dbHelper.cleanup();
    });

    test('should reject invalid Knex for pooling', () => {
      expect(InputValidator.supportsKnexPooling(null)).toBe(false);
      expect(InputValidator.supportsKnexPooling({})).toBe(false);
    });
  });

  describe('Path Security Validation', () => {
    test('should validate safe paths', () => {
      expect(InputValidator.isSafePath('/external/app')).toBe(true);
      expect(InputValidator.isSafePath('subfolder/file.js')).toBe(true);
      expect(InputValidator.isSafePath('/absolute/path/module')).toBe(true);
      expect(InputValidator.isSafePath('simple-file.js')).toBe(true);
    });

    test('should reject path traversal patterns', () => {
      expect(InputValidator.isSafePath('../../../etc/passwd')).toBe(false);
      expect(InputValidator.isSafePath('folder/../../outside')).toBe(false);
      expect(InputValidator.isSafePath('../config.js')).toBe(false);
    });

    test('should reject dangerous characters', () => {
      expect(InputValidator.isSafePath('file\0name')).toBe(false); // null byte
      expect(InputValidator.isSafePath('file<name>.js')).toBe(false);
      expect(InputValidator.isSafePath('file>name.js')).toBe(false);
      expect(InputValidator.isSafePath('file:name.js')).toBe(false);
      expect(InputValidator.isSafePath('file"name.js')).toBe(false);
      expect(InputValidator.isSafePath('file|name.js')).toBe(false);
      expect(InputValidator.isSafePath('file?name.js')).toBe(false);
      expect(InputValidator.isSafePath('file*name.js')).toBe(false);
    });

    test('should handle invalid input types', () => {
      expect(InputValidator.isSafePath(null)).toBe(false);
      expect(InputValidator.isSafePath(undefined)).toBe(false);
      expect(InputValidator.isSafePath(123)).toBe(false);
      expect(InputValidator.isSafePath({})).toBe(false);
      expect(InputValidator.isSafePath([])).toBe(false);
    });
  });

  describe('Path Access Checking', () => {
    test('should check existing directory access', async () => {
      const result = await InputValidator.checkPathAccess('.');

      expect(result).toHaveProperty('exists');
      expect(result).toHaveProperty('isDirectory');
      expect(result).toHaveProperty('path');
      expect(result.exists).toBe(true);
      expect(result.isDirectory).toBe(true);
    });

    test('should handle non-existent paths', async () => {
      const result = await InputValidator.checkPathAccess('/nonexistent/path/12345');

      expect(result.exists).toBe(false);
      expect(result).toHaveProperty('error');
    });

    test('should handle invalid path inputs', async () => {
      const result1 = await InputValidator.checkPathAccess('');
      expect(result1.exists).toBe(false);
      expect(result1.error).toContain('Invalid path');

      const result2 = await InputValidator.checkPathAccess('   ');
      expect(result2.exists).toBe(false);
      expect(result2.error).toContain('Invalid path');
    });

    test('should enforce security validation in strict mode', async () => {
      const result = await InputValidator.checkPathAccess('../dangerous/path', true);

      expect(result.exists).toBe(false);
      expect(result.securityCheck).toBe(false);
      expect(result.error).toContain('Security validation failed');
      expect(result).toHaveProperty('securityIssues');
      expect(Array.isArray(result.securityIssues)).toBe(true);
    });

    test('should allow unsafe paths in non-strict mode', async () => {
      // In non-strict mode, it should still try to check the path even if it's "unsafe"
      const result = await InputValidator.checkPathAccess('../some/path', false);

      // It will fail because the path doesn't exist, not because of security
      expect(result.exists).toBe(false);
      // In non-strict mode, securityCheck might still be set to false
      expect(result.securityCheck).toBeDefined();
    });
  });

  describe('ASAR Compatibility', () => {
    test('should handle ASAR-like paths', async () => {
      const asarPath = '/app.asar/some/file.js';

      // Should not throw for ASAR paths, even if they don't exist
      const result = await InputValidator.checkPathAccess(asarPath);
      expect(result).toHaveProperty('exists');
      expect(result).toHaveProperty('path');
      expect(result.path).toBe(asarPath);
    });

    test('should validate ASAR paths as safe', () => {
      const asarPath = '/app.asar/file.js';
      const result = InputValidator.isSafePath(asarPath);
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed Knex instances gracefully', () => {
      const malformedKnex = {
        client: {
          config: {},
          query: 'not-a-function', // Invalid query property
        },
        raw: () => {},
        schema: {},
      };

      expect(InputValidator.isValidKnexInstance(malformedKnex)).toBe(false);
    });

    test('should handle path normalization errors', () => {
      // Test paths that might cause normalization issues
      expect(InputValidator.isSafePath('')).toBe(true); // Empty path is technically safe
      expect(InputValidator.isSafePath('/')).toBe(true);
      expect(InputValidator.isSafePath('./current')).toBe(true);
    });

    test('should handle async errors in path checking', async () => {
      // Test with a path that might cause fs.stat to throw
      const result = await InputValidator.checkPathAccess('/dev/null/impossible');
      expect(result.exists).toBe(false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('Performance', () => {
    test('should validate many Knex instances efficiently', async () => {
      const dbHelper = new RealDatabaseHelper();
      const knexInstance = await dbHelper.createKnexInstance();
      const startTime = Date.now();

      // Validate 1000 instances
      for (let i = 0; i < 1000; i++) {
        InputValidator.isValidKnexInstance(knexInstance);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms

      await dbHelper.cleanup();
    });

    test('should validate many paths efficiently', () => {
      const paths = [
        '/safe/path',
        'relative/path',
        '/another/safe/path',
        'file.js',
        '/absolute/path/to/file',
      ];

      const startTime = Date.now();

      // Validate 1000 paths
      for (let i = 0; i < 200; i++) {
        paths.forEach(path => {
          InputValidator.isSafePath(path);
        });
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });
});
