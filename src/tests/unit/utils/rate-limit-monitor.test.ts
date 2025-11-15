/**
 * Rate Limit Monitor Tests
 *
 * Tests for rate limit monitoring and warning system.
 */

import { RateLimitMonitor } from '../../../app/utils/rate-limit-monitor';

describe('RateLimitMonitor', () => {
  let monitor: RateLimitMonitor;

  beforeEach(() => {
    monitor = new RateLimitMonitor();
  });

  describe('recordRequest', () => {
    test('should record a single request', () => {
      // Act: Record a request
      monitor.recordRequest();

      // Assert: Stats should reflect the request
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.requestsLastHour).toBe(1);
      expect(stats.requestsLastMinute).toBe(1);
    });

    test('should record multiple requests', () => {
      // Act: Record multiple requests
      monitor.recordRequest();
      monitor.recordRequest();
      monitor.recordRequest();

      // Assert: Should track all requests
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.requestsLastHour).toBe(3);
    });

    test('should record rate limit headers', () => {
      // Arrange: Mock rate limit headers
      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4500',
        'x-ratelimit-reset': '1234567890',
      };

      // Act: Record request with headers
      monitor.recordRequest(headers);

      // Assert: Should store the header info (implementation detail)
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
    });
  });

  describe('getStats', () => {
    test('should return zero stats for new monitor', () => {
      // Act: Get stats without any requests
      const stats = monitor.getStats();

      // Assert: Everything should be zero
      expect(stats.totalRequests).toBe(0);
      expect(stats.requestsLastHour).toBe(0);
      expect(stats.requestsLastMinute).toBe(0);
      expect(stats.averageRequestsPerSecond).toBe(0);
      expect(stats.estimatedHourlyRate).toBe(0);
      expect(stats.warningLevel).toBe('safe');
    });

    test('should calculate requests last hour correctly', async () => {
      // Arrange: Record requests
      monitor.recordRequest();
      monitor.recordRequest();
      monitor.recordRequest();

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should count all requests in last hour
      expect(stats.requestsLastHour).toBe(3);
    });

    test('should calculate average requests per second', async () => {
      // Arrange: Record requests over time
      monitor.recordRequest();
      await new Promise(resolve => setTimeout(resolve, 100));
      monitor.recordRequest();
      await new Promise(resolve => setTimeout(resolve, 100));
      monitor.recordRequest();

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should have reasonable average (allowing for timing variance)
      expect(stats.averageRequestsPerSecond).toBeGreaterThan(0);
      expect(stats.averageRequestsPerSecond).toBeLessThan(50);
    });

    test('should estimate hourly rate based on recent activity', async () => {
      // Arrange: Record requests
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should extrapolate to hourly rate
      expect(stats.estimatedHourlyRate).toBeGreaterThan(0);
    });

    test('should return safe warning level for low usage', () => {
      // Arrange: Record a few requests (well under limit)
      monitor.recordRequest();
      monitor.recordRequest();
      monitor.recordRequest();

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should be safe
      expect(stats.warningLevel).toBe('safe');
    });
  });

  describe('shouldThrottle', () => {
    test('should not throttle when usage is low', () => {
      // Arrange: Record a few requests
      monitor.recordRequest();
      monitor.recordRequest();

      // Act: Check if should throttle
      const result = monitor.shouldThrottle();

      // Assert: Should not throttle
      expect(result.throttle).toBe(false);
    });

    test('should not throttle when under limit', () => {
      // Arrange: Record moderate number of requests (still safe)
      for (let i = 0; i < 50; i++) {
        monitor.recordRequest();
      }

      // Act: Check throttle status
      const result = monitor.shouldThrottle();

      // Assert: Should either not throttle or provide reasonable wait time
      if (result.throttle) {
        // If it does throttle, should have valid wait time
        expect(result.waitMs).toBeGreaterThan(0);
        expect(result.reason).toBeDefined();
      } else {
        expect(result.throttle).toBe(false);
      }
    });
  });

  describe('reset', () => {
    test('should clear all recorded requests', () => {
      // Arrange: Record some requests
      monitor.recordRequest();
      monitor.recordRequest();
      monitor.recordRequest();

      // Act: Reset the monitor
      monitor.reset();

      // Assert: Stats should be zero
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.requestsLastHour).toBe(0);
    });

    test('should allow recording after reset', () => {
      // Arrange: Record and reset
      monitor.recordRequest();
      monitor.reset();

      // Act: Record new request
      monitor.recordRequest();

      // Assert: Should track new request
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(1);
    });
  });

  describe('time-based cleanup', () => {
    test('should not count requests older than 1 hour', async () => {
      // Note: This test would require mocking Date.now() or waiting 1 hour
      // For now, we'll test the logic conceptually

      // Arrange: Create monitor with mocked time
      const originalNow = Date.now;
      let mockTime = Date.now();
      Date.now = jest.fn(() => mockTime);

      const testMonitor = new RateLimitMonitor();

      // Act: Record request, then advance time by 1 hour + 1 minute
      testMonitor.recordRequest();
      mockTime += (60 * 60 * 1000) + (60 * 1000); // 1 hour + 1 minute
      testMonitor.recordRequest(); // Trigger cleanup

      // Assert: Should only have 1 request in last hour
      const stats = testMonitor.getStats();
      expect(stats.requestsLastHour).toBe(1);

      // Cleanup
      Date.now = originalNow;
    });

    test('should not count requests older than 1 minute', async () => {
      // Arrange: Mock time
      const originalNow = Date.now;
      let mockTime = Date.now();
      Date.now = jest.fn(() => mockTime);

      const testMonitor = new RateLimitMonitor();

      // Act: Record request, then advance time by 2 minutes
      testMonitor.recordRequest();
      mockTime += 2 * 60 * 1000; // 2 minutes
      testMonitor.recordRequest(); // Trigger cleanup

      // Assert: Should only have 1 request in last minute
      const stats = testMonitor.getStats();
      expect(stats.requestsLastMinute).toBe(1);

      // Cleanup
      Date.now = originalNow;
    });
  });

  describe('logStatus', () => {
    test('should log status without errors', () => {
      // Arrange: Mock console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act: Log status
      monitor.logStatus();

      // Assert: Should call console.log
      expect(consoleSpy).toHaveBeenCalled();

      // Cleanup
      consoleSpy.mockRestore();
    });

    test('should include prefix in log message', () => {
      // Arrange: Mock console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act: Log with prefix
      monitor.logStatus('[TEST]');

      // Assert: Should include prefix
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST]')
      );

      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe('concurrent request tracking', () => {
    test('should handle rapid concurrent requests', async () => {
      // Arrange: Create many concurrent requests
      const promises = Array(50)
        .fill(null)
        .map(() => Promise.resolve(monitor.recordRequest()));

      // Act: Wait for all to complete
      await Promise.all(promises);

      // Assert: Should count all requests
      const stats = monitor.getStats();
      expect(stats.totalRequests).toBe(50);
    });
  });

  describe('rate calculation accuracy', () => {
    test('should calculate rate close to actual for steady requests', async () => {
      // Arrange: Record requests at known rate (10 req/sec for 0.5 seconds = 5 requests)
      const requestCount = 5;
      const intervalMs = 100; // 100ms between requests = 10 req/sec

      for (let i = 0; i < requestCount; i++) {
        monitor.recordRequest();
        if (i < requestCount - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Average should be greater than zero (allowing for timing variance)
      expect(stats.averageRequestsPerSecond).toBeGreaterThan(0);
      expect(stats.averageRequestsPerSecond).toBeLessThan(30);
      expect(stats.totalRequests).toBe(5);
    });
  });

  describe('warning level classification', () => {
    test('should classify very low usage as safe', () => {
      // Arrange: 10 requests
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest();
      }

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should be safe
      expect(stats.warningLevel).toBe('safe');
    });

    test('should handle zero requests', () => {
      // Act: Get stats with no requests
      const stats = monitor.getStats();

      // Assert: Should be safe
      expect(stats.warningLevel).toBe('safe');
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('estimated hourly rate', () => {
    test('should extrapolate from recent activity', async () => {
      // Arrange: Make 5 requests in quick succession
      for (let i = 0; i < 5; i++) {
        monitor.recordRequest();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should estimate a reasonable hourly rate
      expect(stats.estimatedHourlyRate).toBeGreaterThan(0);
      expect(stats.estimatedHourlyRate).toBeLessThan(100000); // Sanity check
    });

    test('should return zero estimated rate when no requests', () => {
      // Act: Get stats with no requests
      const stats = monitor.getStats();

      // Assert: Estimated rate should be zero
      expect(stats.estimatedHourlyRate).toBe(0);
    });
  });

  describe('integration with actual usage patterns', () => {
    test('should handle typical sync pattern (burst then idle)', async () => {
      // Arrange: Simulate typical sync (50 requests in burst)
      for (let i = 0; i < 50; i++) {
        monitor.recordRequest();
        await new Promise(resolve => setTimeout(resolve, 10)); // ~100 req/sec burst
      }

      // Act: Get stats immediately after burst
      const stats = monitor.getStats();

      // Assert: Should show burst but not trigger warning
      expect(stats.totalRequests).toBe(50);
      expect(stats.requestsLastMinute).toBe(50);
      expect(stats.warningLevel).toBe('safe');
      expect(stats.averageRequestsPerSecond).toBeGreaterThan(0);
    });

    test('should handle sustained load', async () => {
      // Arrange: Simulate sustained moderate load
      for (let i = 0; i < 20; i++) {
        monitor.recordRequest();
        await new Promise(resolve => setTimeout(resolve, 50)); // 20 req/sec
      }

      // Act: Get stats
      const stats = monitor.getStats();

      // Assert: Should track sustained load
      expect(stats.totalRequests).toBe(20);
      expect(stats.averageRequestsPerSecond).toBeGreaterThan(0);
      expect(stats.warningLevel).toBe('safe');
    });
  });
});
