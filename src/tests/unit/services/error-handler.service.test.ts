/**
 * Error Handler Service Tests
 *
 * Tests for error classification, retry logic, and error handling strategies.
 */

import {
  ErrorHandlerService,
  ErrorType,
  ErrorSeverity,
  ClassifiedError,
} from '../../../app/services/sync/error-handler.service';

describe('ErrorHandlerService', () => {
  let service: ErrorHandlerService;

  beforeEach(() => {
    service = new ErrorHandlerService();
    // Mock sleep to avoid actual delays in tests
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);
  });

  describe('Error Classification', () => {
    describe('Rate Limit Errors', () => {
      test('should classify rate limit error (429)', () => {
        const error = new Error('Rate limit exceeded - 429');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
        expect(classified.shouldRetry).toBe(true);
        expect(classified.retryAfterMs).toBe(60000); // 1 minute
        expect(classified.message).toContain('rate limit');
      });

      test('should classify rate limit error (text)', () => {
        const error = new Error('API rate limit exceeded');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.shouldRetry).toBe(true);
        expect(classified.retryAfterMs).toBe(60000);
      });
    });

    describe('Network Errors', () => {
      test('should classify ECONNREFUSED as transient', () => {
        const error = new Error('ECONNREFUSED: Connection refused');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.TRANSIENT);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
        expect(classified.shouldRetry).toBe(true);
        expect(classified.retryAfterMs).toBe(5000); // 5 seconds
      });

      test('should classify ETIMEDOUT as transient', () => {
        const error = new Error('ETIMEDOUT: Connection timed out');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.TRANSIENT);
        expect(classified.shouldRetry).toBe(true);
      });

      test('should classify ENOTFOUND as transient', () => {
        const error = new Error('ENOTFOUND: DNS lookup failed');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.TRANSIENT);
        expect(classified.shouldRetry).toBe(true);
      });

      test('should classify generic network error', () => {
        const error = new Error('Network error occurred');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.TRANSIENT);
        expect(classified.message).toContain('Network connectivity');
      });
    });

    describe('Bad Request Errors', () => {
      test('should classify 400 error as fatal', () => {
        const error = new Error('400 Bad Request');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.severity).toBe(ErrorSeverity.LOW);
        expect(classified.shouldRetry).toBe(false);
        expect(classified.message).toContain('Invalid request');
      });

      test('should classify bad request text', () => {
        const error = new Error('bad request: invalid parameters');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.shouldRetry).toBe(false);
      });
    });

    describe('Not Found Errors', () => {
      test('should classify 404 error as fatal', () => {
        const error = new Error('404 Not Found');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.severity).toBe(ErrorSeverity.LOW);
        expect(classified.shouldRetry).toBe(false);
        expect(classified.message).toContain('not found');
      });

      test('should classify not found text', () => {
        const error = new Error('Resource not found');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.shouldRetry).toBe(false);
      });
    });

    describe('Authentication Errors', () => {
      test('should classify 401 unauthorized as configuration error', () => {
        const error = new Error('401 Unauthorized');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.CONFIGURATION);
        expect(classified.severity).toBe(ErrorSeverity.CRITICAL);
        expect(classified.shouldRetry).toBe(false);
        expect(classified.message).toContain('Authentication');
      });

      test('should classify 403 forbidden as configuration error', () => {
        const error = new Error('403 Forbidden');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.CONFIGURATION);
        expect(classified.severity).toBe(ErrorSeverity.CRITICAL);
        expect(classified.shouldRetry).toBe(false);
      });

      test('should classify unauthorized text', () => {
        const error = new Error('unauthorized access');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.CONFIGURATION);
        expect(classified.message).toContain('API key');
      });

      test('should classify forbidden text', () => {
        const error = new Error('forbidden resource');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.CONFIGURATION);
        expect(classified.severity).toBe(ErrorSeverity.CRITICAL);
      });
    });

    describe('Server Errors', () => {
      test('should classify 500 error as retryable', () => {
        const error = new Error('500 Internal Server Error');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
        expect(classified.shouldRetry).toBe(true);
        expect(classified.retryAfterMs).toBe(30000); // 30 seconds
      });

      test('should classify 502 bad gateway', () => {
        const error = new Error('502 Bad Gateway');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.shouldRetry).toBe(true);
      });

      test('should classify 503 service unavailable', () => {
        const error = new Error('503 Service Unavailable');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.message).toContain('Server error');
      });
    });

    describe('Database Errors', () => {
      test('should classify Prisma error as fatal', () => {
        const error = new Error('Prisma error: connection failed');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.severity).toBe(ErrorSeverity.HIGH);
        expect(classified.shouldRetry).toBe(false);
      });

      test('should classify database error', () => {
        const error = new Error('Database connection failed');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.message).toContain('Database error');
      });

      test('should classify unique constraint violation', () => {
        const error = new Error('unique constraint violation');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.shouldRetry).toBe(false);
      });
    });

    describe('Validation Errors', () => {
      test('should classify validation error as fatal', () => {
        const error = new Error('Validation failed');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.severity).toBe(ErrorSeverity.LOW);
        expect(classified.shouldRetry).toBe(false);
      });

      test('should classify invalid data error', () => {
        const error = new Error('Invalid data format');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.message).toContain('validation');
      });
    });

    describe('Unknown Errors', () => {
      test('should classify unknown error conservatively', () => {
        const error = new Error('Something unexpected happened');
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.UNKNOWN);
        expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
        expect(classified.shouldRetry).toBe(false); // Conservative
      });

      test('should handle non-Error objects', () => {
        const error = 'string error';
        const classified = service.classifyError(error);

        expect(classified.type).toBe(ErrorType.UNKNOWN);
        expect(classified.originalError).toBeInstanceOf(Error);
      });
    });

    describe('Context Preservation', () => {
      test('should preserve context in classified error', () => {
        const error = new Error('Test error');
        const context = { billId: 123, operation: 'sync' };
        const classified = service.classifyError(error, context);

        expect(classified.context).toEqual(context);
      });

      test('should work without context', () => {
        const error = new Error('Test error');
        const classified = service.classifyError(error);

        expect(classified.context).toBeUndefined();
      });
    });
  });

  describe('Retry Logic', () => {
    test('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await service.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry on retryable error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('success');

      const result = await service.withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should not retry fatal errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('404 Not Found'));

      await expect(service.withRetry(operation)).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1); // No retry
    });

    test('should respect max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        service.withRetry(operation, {
          maxAttempts: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should use exponential backoff', async () => {
      const delays: number[] = [];
      (service as any).sleep = jest.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      // Mock classifyError to return a retryable error without suggested delay
      const originalClassifyError = service.classifyError.bind(service);
      service.classifyError = jest.fn().mockReturnValue({
        type: ErrorType.RETRYABLE,
        severity: ErrorSeverity.MEDIUM,
        message: 'Retryable error',
        shouldRetry: true,
        originalError: new Error('Test error'),
      });

      const operation = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(
        service.withRetry(operation, {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          jitterMs: 0,
        })
      ).rejects.toThrow();

      // First retry: 100ms, Second retry: 200ms (exponential backoff)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);

      service.classifyError = originalClassifyError;
    });

    test('should cap at max delay', async () => {
      const delays: number[] = [];
      (service as any).sleep = jest.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      // Mock classifyError to return a retryable error without suggested delay
      const originalClassifyError = service.classifyError.bind(service);
      service.classifyError = jest.fn().mockReturnValue({
        type: ErrorType.RETRYABLE,
        severity: ErrorSeverity.MEDIUM,
        message: 'Retryable error',
        shouldRetry: true,
        originalError: new Error('Test error'),
      });

      const operation = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(
        service.withRetry(operation, {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 2000,
          backoffMultiplier: 2,
          jitterMs: 0,
        })
      ).rejects.toThrow();

      // All delays should be capped at 2000ms
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(2000);
      });

      service.classifyError = originalClassifyError;
    });

    test('should add jitter to avoid thundering herd', async () => {
      const delays: number[] = [];
      (service as any).sleep = jest.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      // Mock classifyError to return a retryable error without suggested delay
      const originalClassifyError = service.classifyError.bind(service);
      service.classifyError = jest.fn().mockReturnValue({
        type: ErrorType.RETRYABLE,
        severity: ErrorSeverity.MEDIUM,
        message: 'Retryable error',
        shouldRetry: true,
        originalError: new Error('Test error'),
      });

      const operation = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(
        service.withRetry(operation, {
          maxAttempts: 2,
          initialDelayMs: 1000,
          backoffMultiplier: 1,
          jitterMs: 100,
        })
      ).rejects.toThrow();

      // Delay should be between 1000 and 1100 (base + jitter)
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[0]).toBeLessThanOrEqual(1100);

      service.classifyError = originalClassifyError;
    });

    test('should use suggested delay from error', async () => {
      const delays: number[] = [];
      (service as any).sleep = jest.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      const operation = jest.fn().mockRejectedValue(new Error('Rate limit exceeded - 429'));

      await expect(
        service.withRetry(operation, {
          maxAttempts: 2,
          initialDelayMs: 1000,
        })
      ).rejects.toThrow();

      // Should use rate limit's suggested 60000ms
      expect(delays[0]).toBe(60000);
    });
  });

  describe('Error Metrics', () => {
    test('should track total errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await service.withRetry(operation, { maxAttempts: 1 });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.totalErrors).toBeGreaterThan(0);
    });

    test('should track errors by type', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('404 Not Found'));

      try {
        await service.withRetry(operation, { maxAttempts: 1 });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.errorsByType[ErrorType.FATAL]).toBeGreaterThan(0);
    });

    test('should track errors by severity', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));

      try {
        await service.withRetry(operation, { maxAttempts: 1 });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.errorsBySeverity[ErrorSeverity.CRITICAL]).toBeGreaterThan(0);
    });

    test('should track retry attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      try {
        await service.withRetry(operation, {
          maxAttempts: 3,
          initialDelayMs: 10,
        });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.retriesAttempted).toBeGreaterThan(0);
    });

    test('should track successful retries', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('success');

      await service.withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      const metrics = service.getMetrics();
      expect(metrics.retriesSucceeded).toBe(1);
    });

    test('should track failed retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      try {
        await service.withRetry(operation, {
          maxAttempts: 2,
          initialDelayMs: 10,
        });
      } catch (e) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.retriesFailed).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test'));

      // Generate some metrics
      try {
        service.classifyError(new Error('Test'));
      } catch (e) {
        // Expected
      }

      service.resetMetrics();
      const metrics = service.getMetrics();

      expect(metrics.totalErrors).toBe(0);
      expect(Object.keys(metrics.errorsByType).length).toBe(0);
      expect(Object.keys(metrics.errorsBySeverity).length).toBe(0);
    });
  });

  describe('Error Severity Levels', () => {
    test('should have correct severity levels', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });

    test('should assign low severity to validation errors', () => {
      const error = new Error('Validation failed');
      const classified = service.classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
    });

    test('should assign medium severity to rate limits', () => {
      const error = new Error('Rate limit exceeded');
      const classified = service.classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
    });

    test('should assign high severity to server errors', () => {
      const error = new Error('500 Internal Server Error');
      const classified = service.classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
    });

    test('should assign critical severity to auth errors', () => {
      const error = new Error('401 Unauthorized');
      const classified = service.classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('Error Types', () => {
    test('should have correct error types', () => {
      expect(ErrorType.RETRYABLE).toBe('retryable');
      expect(ErrorType.FATAL).toBe('fatal');
      expect(ErrorType.TRANSIENT).toBe('transient');
      expect(ErrorType.CONFIGURATION).toBe('configuration');
      expect(ErrorType.UNKNOWN).toBe('unknown');
    });

    test('should classify retryable errors correctly', () => {
      const errors = [
        new Error('Rate limit exceeded'),
        new Error('500 Server Error'),
        new Error('503 Service Unavailable'),
      ];

      errors.forEach(error => {
        const classified = service.classifyError(error);
        expect(classified.type).toBe(ErrorType.RETRYABLE);
        expect(classified.shouldRetry).toBe(true);
      });
    });

    test('should classify fatal errors correctly', () => {
      const errors = [
        new Error('404 Not Found'),
        new Error('400 Bad Request'),
        new Error('Database error'),
      ];

      errors.forEach(error => {
        const classified = service.classifyError(error);
        expect(classified.type).toBe(ErrorType.FATAL);
        expect(classified.shouldRetry).toBe(false);
      });
    });

    test('should classify transient errors correctly', () => {
      const errors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('ENOTFOUND'),
      ];

      errors.forEach(error => {
        const classified = service.classifyError(error);
        expect(classified.type).toBe(ErrorType.TRANSIENT);
        expect(classified.shouldRetry).toBe(true);
      });
    });
  });
});
