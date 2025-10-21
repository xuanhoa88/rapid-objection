/**
 * TimeoutManager Unit Tests
 * Tests the timeout management and operation control functionality
 */

const { TimeoutManager } = require('../../../dist/TimeoutManager');

describe('TimeoutManager', () => {
  describe('Static Methods', () => {
    test('should have withTimeout static method', () => {
      expect(typeof TimeoutManager.withTimeout).toBe('function');
    });

    test('should have withAbortTimeout static method', () => {
      expect(typeof TimeoutManager.withAbortTimeout).toBe('function');
    });

    test('should be a static utility class', () => {
      // TimeoutManager should be used as static class
      // Note: JavaScript classes can be instantiated, but TimeoutManager is designed for static use
      expect(typeof TimeoutManager).toBe('function');
      expect(typeof TimeoutManager.withTimeout).toBe('function');
      expect(typeof TimeoutManager.withAbortTimeout).toBe('function');
    });
  });

  describe('Basic Timeout Operations', () => {
    test('should execute operation within timeout', async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      const result = await TimeoutManager.withTimeout(operation, 1000);
      expect(result).toBe('success');
    });

    test('should timeout long-running operation', async () => {
      const longOperation = () =>
        new Promise(resolve => setTimeout(() => resolve('too-late'), 2000));

      await expect(TimeoutManager.withTimeout(longOperation, 500)).rejects.toThrow(/Timeout/);
    });

    test('should handle operation errors', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(TimeoutManager.withTimeout(failingOperation, 1000)).rejects.toThrow(
        'Operation failed'
      );

      expect(failingOperation).toHaveBeenCalled();
    });

    test('should require timeout parameter', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      // TimeoutManager.withTimeout requires a timeout parameter
      await expect(TimeoutManager.withTimeout(operation)).rejects.toThrow();
    });

    test('should handle multiple concurrent operations', async () => {
      const operation1 = () => new Promise(resolve => setTimeout(() => resolve('result1'), 100));
      const operation2 = () => new Promise(resolve => setTimeout(() => resolve('result2'), 200));
      const operation3 = () => new Promise(resolve => setTimeout(() => resolve('result3'), 150));

      const promises = [
        TimeoutManager.withTimeout(operation1, 1000),
        TimeoutManager.withTimeout(operation2, 1000),
        TimeoutManager.withTimeout(operation3, 1000),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['result1', 'result2', 'result3']);
    });
  });

  describe('Timeout Validation', () => {
    test('should validate operation parameter', async () => {
      await expect(TimeoutManager.withTimeout(null, 1000)).rejects.toThrow(
        'Operation must be a function'
      );
      await expect(TimeoutManager.withTimeout('not-a-function', 1000)).rejects.toThrow(
        'Operation must be a function'
      );
      await expect(TimeoutManager.withTimeout(123, 1000)).rejects.toThrow(
        'Operation must be a function'
      );
    });

    test('should validate timeout parameter', async () => {
      const operation = () => 'success';

      await expect(TimeoutManager.withTimeout(operation, -1)).rejects.toThrow(
        'Timeout must be a positive integer'
      );
      await expect(TimeoutManager.withTimeout(operation, 0)).rejects.toThrow(
        'Timeout must be a positive integer'
      );
      await expect(TimeoutManager.withTimeout(operation, 'invalid')).rejects.toThrow(
        'Timeout must be a positive integer'
      );
      await expect(TimeoutManager.withTimeout(operation, null)).rejects.toThrow(
        'Timeout must be a positive integer'
      );
      await expect(TimeoutManager.withTimeout(operation, 1.5)).rejects.toThrow(
        'Timeout must be a positive integer'
      );
    });

    test('should handle synchronous operations', async () => {
      const operation = () => 'sync-result';
      const result = await TimeoutManager.withTimeout(operation, 1000);
      expect(result).toBe('sync-result');
    });

    test('should handle async operations', async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'async-result';
      };
      const result = await TimeoutManager.withTimeout(operation, 1000);
      expect(result).toBe('async-result');
    });

    test('should handle promise-returning operations', async () => {
      const operation = () => Promise.resolve('promise-result');
      const result = await TimeoutManager.withTimeout(operation, 1000);
      expect(result).toBe('promise-result');
    });
  });

  describe('Timeout Error Handling', () => {
    test('should timeout long operations', async () => {
      const longOperation = () =>
        new Promise(resolve => setTimeout(() => resolve('too-late'), 2000));

      await expect(TimeoutManager.withTimeout(longOperation, 500)).rejects.toMatchObject({
        code: 'TIMEOUT',
        timeout: 500,
      });
    });

    test('should propagate operation errors', async () => {
      const failingOperation = () => {
        throw new Error('Operation failed');
      };

      await expect(TimeoutManager.withTimeout(failingOperation, 1000)).rejects.toThrow(
        'Operation failed'
      );
    });

    test('should propagate async operation errors', async () => {
      const failingAsyncOperation = async () => {
        throw new Error('Async operation failed');
      };

      await expect(TimeoutManager.withTimeout(failingAsyncOperation, 1000)).rejects.toThrow(
        'Async operation failed'
      );
    });
  });

  describe('Context and Cleanup', () => {
    test('should include context in timeout errors', async () => {
      const longOperation = () => new Promise(resolve => setTimeout(resolve, 2000));
      const context = { operation: 'test operation', component: 'TestComponent' };

      await expect(TimeoutManager.withTimeout(longOperation, 500, context)).rejects.toMatchObject({
        code: 'TIMEOUT',
        context: context,
        message: expect.stringContaining('test operation'),
      });
    });

    test('should call cleanup function on timeout', async () => {
      const cleanup = jest.fn();
      const longOperation = () => new Promise(resolve => setTimeout(resolve, 2000));

      await expect(
        TimeoutManager.withTimeout(longOperation, 100, { cleanup })
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
      });

      expect(cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup function errors gracefully', async () => {
      const cleanup = jest.fn(() => {
        throw new Error('Cleanup failed');
      });
      const longOperation = () => new Promise(resolve => setTimeout(resolve, 2000));

      // Should still throw timeout error even if cleanup fails
      await expect(
        TimeoutManager.withTimeout(longOperation, 100, { cleanup })
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
      });

      expect(cleanup).toHaveBeenCalled();
    });
  });

  describe('AbortTimeout Method', () => {
    test('should have withAbortTimeout method', () => {
      expect(typeof TimeoutManager.withAbortTimeout).toBe('function');
    });

    test('should execute operation with abort timeout', async () => {
      const operation = async signal => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'abort-success';
      };

      const result = await TimeoutManager.withAbortTimeout(operation, 1000);
      expect(result).toBe('abort-success');
    });

    test('should timeout with abort controller', async () => {
      const longOperation = signal => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve('too-late'), 2000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('AbortError'));
          });
        });
      };

      await expect(TimeoutManager.withAbortTimeout(longOperation, 500)).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });
  });
});
