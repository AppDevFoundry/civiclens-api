/**
 * Parallel Executor Tests
 *
 * Tests for parallel execution utility with concurrency control.
 */

import { ParallelExecutor } from '../../../app/utils/parallel-executor';

describe('ParallelExecutor', () => {
  describe('execute', () => {
    test('should execute operations in parallel', async () => {
      // Arrange: Create test operations that track execution order
      const executionOrder: number[] = [];
      const operations = [
        async () => {
          executionOrder.push(1);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'result-1';
        },
        async () => {
          executionOrder.push(2);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'result-2';
        },
        async () => {
          executionOrder.push(3);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'result-3';
        },
      ];

      // Act: Execute with concurrency=3
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
        delayBetweenMs: 0,
      });

      // Assert: All operations should start in parallel
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(result.completed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toEqual(['result-1', 'result-2', 'result-3']);
    });

    test('should respect concurrency limit', async () => {
      // Arrange: Create 5 operations with concurrency=2
      let activeOperations = 0;
      let maxConcurrent = 0;

      const operations = Array(5)
        .fill(null)
        .map((_, i) => async () => {
          activeOperations++;
          maxConcurrent = Math.max(maxConcurrent, activeOperations);

          await new Promise(resolve => setTimeout(resolve, 50));

          activeOperations--;
          return `result-${i}`;
        });

      // Act: Execute with concurrency=2
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 2,
        delayBetweenMs: 0,
      });

      // Assert: Maximum 2 concurrent operations
      expect(maxConcurrent).toBe(2);
      expect(result.completed).toBe(5);
      expect(result.failed).toBe(0);
    });

    test('should delay between starting operations', async () => {
      // Arrange: Track start times
      const startTimes: number[] = [];
      const operations = Array(3)
        .fill(null)
        .map(() => async () => {
          startTimes.push(Date.now());
          return 'done';
        });

      // Act: Execute with 100ms delay
      const startTime = Date.now();
      await ParallelExecutor.execute(operations, {
        concurrency: 3,
        delayBetweenMs: 100,
      });

      // Assert: Each operation should start ~100ms apart
      expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(90); // Allow 10ms tolerance
      expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(90);
    });

    test('should handle operation failures', async () => {
      // Arrange: Mix of successful and failing operations
      const operations = [
        async () => 'success-1',
        async () => {
          throw new Error('Operation failed');
        },
        async () => 'success-2',
        async () => {
          throw new Error('Another failure');
        },
        async () => 'success-3',
      ];

      // Act: Execute operations
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
        delayBetweenMs: 0,
        retry: false,
      });

      // Assert: Should complete all operations
      expect(result.completed).toBe(3); // 3 successful
      expect(result.failed).toBe(2); // 2 failed
      expect(result.errors).toHaveLength(2);
      expect(String(result.errors[0].error)).toContain('Operation failed');
      expect(result.results).toEqual(['success-1', undefined, 'success-2', undefined, 'success-3']);
    });

    test('should retry failed operations when retry enabled', async () => {
      // Arrange: Operation that fails twice then succeeds
      let attempts = 0;
      const operations = [
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success';
        },
      ];

      // Act: Execute with retry enabled
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 1,
        delayBetweenMs: 0,
        retry: true,
        maxRetries: 3,
      });

      // Assert: Should eventually succeed
      expect(attempts).toBe(3);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0]).toBe('success');
    });

    test('should give up after max retries', async () => {
      // Arrange: Operation that always fails
      let attempts = 0;
      const operations = [
        async () => {
          attempts++;
          throw new Error('Always fails');
        },
      ];

      // Act: Execute with limited retries
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 1,
        delayBetweenMs: 0,
        retry: true,
        maxRetries: 2,
      });

      // Assert: Should fail after max retries
      expect(attempts).toBe(3); // Initial + 2 retries
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(1);
      expect(String(result.errors[0].error)).toContain('Always fails');
    });

    test('should call progress callback', async () => {
      // Arrange: Track progress updates
      const progressUpdates: Array<{ completed: number; total: number }> = [];
      const operations = Array(5)
        .fill(null)
        .map((_, i) => async () => `result-${i}`);

      // Act: Execute with progress callback
      await ParallelExecutor.execute(operations, {
        concurrency: 2,
        delayBetweenMs: 0,
        onProgress: (completed, total) => {
          progressUpdates.push({ completed, total });
        },
      });

      // Assert: Should receive progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toEqual({
        completed: 5,
        total: 5,
      });
    });

    test('should calculate duration correctly', async () => {
      // Arrange: Operations that take known time
      const operations = Array(3)
        .fill(null)
        .map(() => async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'done';
        });

      // Act: Execute operations
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
        delayBetweenMs: 0,
      });

      // Assert: Duration should be ~100ms (all run in parallel)
      expect(result.duration).toBeGreaterThanOrEqual(100);
      expect(result.duration).toBeLessThan(200); // Some tolerance for overhead
    });

    test('should handle empty operation list', async () => {
      // Arrange: No operations
      const operations: Array<() => Promise<any>> = [];

      // Act: Execute empty list
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
      });

      // Assert: Should complete immediately
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    test('should handle single operation', async () => {
      // Arrange: Single operation
      const operations = [async () => 'single-result'];

      // Act: Execute
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 5,
      });

      // Assert: Should work correctly
      expect(result.completed).toBe(1);
      expect(result.results).toEqual(['single-result']);
    });

    test('should use default options when not provided', async () => {
      // Arrange: Simple operations
      const operations = [
        async () => 'result-1',
        async () => 'result-2',
      ];

      // Act: Execute with defaults
      const result = await ParallelExecutor.execute(operations);

      // Assert: Should work with defaults
      expect(result.completed).toBe(2);
      expect(result.results).toEqual(['result-1', 'result-2']);
    });

    test('should preserve result order', async () => {
      // Arrange: Operations that complete in reverse order
      const operations = [
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'slow';
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'medium';
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'fast';
        },
      ];

      // Act: Execute in parallel
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
        delayBetweenMs: 0,
      });

      // Assert: Results should be in original order, not completion order
      expect(result.results).toEqual(['slow', 'medium', 'fast']);
    });

    test('should handle operations returning different types', async () => {
      // Arrange: Operations returning different types
      const operations = [
        async () => 'string',
        async () => 42,
        async () => ({ key: 'value' }),
        async () => null,
        async () => undefined,
      ];

      // Act: Execute
      const result = await ParallelExecutor.execute(operations, {
        concurrency: 3,
      });

      // Assert: Should preserve all types
      expect(result.results).toEqual([
        'string',
        42,
        { key: 'value' },
        null,
        undefined,
      ]);
    });

    test('should respect maxRequestsPerSecond limit', async () => {
      // Arrange: Track request times
      const requestTimes: number[] = [];
      const operations = Array(10)
        .fill(null)
        .map(() => async () => {
          requestTimes.push(Date.now());
          return 'done';
        });

      // Act: Execute with rate limit (5 req/sec = 200ms per request)
      const startTime = Date.now();
      await ParallelExecutor.execute(operations, {
        concurrency: 10, // High concurrency
        delayBetweenMs: 200, // But rate limit with delay
      });

      const totalDuration = Date.now() - startTime;

      // Assert: Should take at least 2 seconds for 10 requests at 5/sec
      expect(totalDuration).toBeGreaterThanOrEqual(1800); // 10 * 200ms = 2000ms (with 10% tolerance)
    });

    test('should include error index in error objects', async () => {
      // Arrange: Operations with specific failures
      const operations = [
        async () => 'success',
        async () => {
          throw new Error('Error at index 1');
        },
        async () => 'success',
        async () => {
          throw new Error('Error at index 3');
        },
      ];

      // Act: Execute
      const result = await ParallelExecutor.execute(operations, {
        retry: false,
      });

      // Assert: Errors should have correct indexes
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].index).toBe(1);
      expect(result.errors[1].index).toBe(3);
    });
  });
});
