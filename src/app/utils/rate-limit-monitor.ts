/**
 * Rate Limit Monitor
 *
 * Monitors API rate limit usage and provides warnings/throttling
 * when approaching limits.
 *
 * Congress.gov API Limits:
 * - 5,000 requests per hour
 * - Unknown burst/concurrent limits
 */

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  retryAfter?: number; // Seconds to wait
}

export interface RateLimitStats {
  totalRequests: number;
  requestsLastHour: number;
  requestsLastMinute: number;
  averageRequestsPerSecond: number;
  estimatedHourlyRate: number;
  warningLevel: 'safe' | 'warning' | 'critical';
}

/**
 * Rate Limit Monitor
 * Tracks API requests and provides throttling recommendations
 */
export class RateLimitMonitor {
  private requestTimestamps: number[] = [];
  private lastRateLimitInfo: RateLimitInfo | null = null;
  private rateLimitHit = false;

  /**
   * Record an API request
   */
  recordRequest(rateLimitHeaders?: any) {
    const now = Date.now();
    this.requestTimestamps.push(now);

    // Parse rate limit headers if provided
    if (rateLimitHeaders) {
      this.lastRateLimitInfo = this.parseRateLimitHeaders(rateLimitHeaders);
    }

    // Clean up old timestamps (keep last hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > oneHourAgo);
  }

  /**
   * Parse rate limit headers from API response
   */
  private parseRateLimitHeaders(headers: any): RateLimitInfo | null {
    // Common header formats:
    // X-RateLimit-Limit: 5000
    // X-RateLimit-Remaining: 4999
    // X-RateLimit-Reset: 1234567890
    // Retry-After: 60

    const limit = parseInt(headers['x-ratelimit-limit'] || headers['ratelimit-limit'], 10);
    const remaining = parseInt(
      headers['x-ratelimit-remaining'] || headers['ratelimit-remaining'],
      10
    );
    const reset = parseInt(headers['x-ratelimit-reset'] || headers['ratelimit-reset'], 10);
    const retryAfter = parseInt(headers['retry-after'], 10);

    if (!limit && !remaining) {
      return null; // No rate limit headers found
    }

    return {
      limit: limit || 5000, // Default to known limit
      remaining: remaining || 0,
      reset: reset || Date.now() + 3600000, // Default to 1 hour from now
      retryAfter: retryAfter || undefined,
    };
  }

  /**
   * Get current rate limit statistics
   */
  getStats(): RateLimitStats {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneMinuteAgo = now - 60 * 1000;

    const requestsLastHour = this.requestTimestamps.filter((ts) => ts > oneHourAgo).length;
    const requestsLastMinute = this.requestTimestamps.filter((ts) => ts > oneMinuteAgo).length;

    const averageRequestsPerSecond = requestsLastMinute / 60;
    const estimatedHourlyRate = averageRequestsPerSecond * 3600;

    let warningLevel: 'safe' | 'warning' | 'critical' = 'safe';

    if (this.lastRateLimitInfo) {
      const percentRemaining = (this.lastRateLimitInfo.remaining / this.lastRateLimitInfo.limit) * 100;
      if (percentRemaining < 10) {
        warningLevel = 'critical';
      } else if (percentRemaining < 25) {
        warningLevel = 'warning';
      }
    } else {
      // Estimate based on request rate
      if (estimatedHourlyRate > 4500) {
        warningLevel = 'critical';
      } else if (estimatedHourlyRate > 4000) {
        warningLevel = 'warning';
      }
    }

    return {
      totalRequests: this.requestTimestamps.length,
      requestsLastHour,
      requestsLastMinute,
      averageRequestsPerSecond: Math.round(averageRequestsPerSecond * 100) / 100,
      estimatedHourlyRate: Math.round(estimatedHourlyRate),
      warningLevel,
    };
  }

  /**
   * Check if we should throttle requests
   */
  shouldThrottle(): { throttle: boolean; waitMs?: number; reason?: string } {
    const stats = this.getStats();

    // Critical: Approaching rate limit
    if (stats.warningLevel === 'critical') {
      return {
        throttle: true,
        waitMs: 5000, // Wait 5 seconds
        reason: 'Approaching rate limit',
      };
    }

    // Warning: High request rate
    if (stats.warningLevel === 'warning') {
      return {
        throttle: true,
        waitMs: 2000, // Wait 2 seconds
        reason: 'High request rate detected',
      };
    }

    // Check if we've hit rate limit recently
    if (this.rateLimitHit) {
      const timeSinceReset =
        this.lastRateLimitInfo && this.lastRateLimitInfo.reset
          ? this.lastRateLimitInfo.reset * 1000 - Date.now()
          : 0;

      if (timeSinceReset > 0) {
        return {
          throttle: true,
          waitMs: timeSinceReset,
          reason: 'Rate limit hit, waiting for reset',
        };
      } else {
        this.rateLimitHit = false; // Reset flag
      }
    }

    return { throttle: false };
  }

  /**
   * Mark that rate limit was hit
   */
  markRateLimitHit(retryAfter?: number) {
    this.rateLimitHit = true;
    if (retryAfter) {
      this.lastRateLimitInfo = {
        ...(this.lastRateLimitInfo || { limit: 5000, remaining: 0, reset: 0 }),
        retryAfter,
      };
    }
  }

  /**
   * Get last known rate limit info from API
   */
  getLastRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  /**
   * Log current status
   */
  logStatus(prefix = '[RateLimitMonitor]') {
    const stats = this.getStats();

    console.log(`${prefix} Status:`);
    console.log(`  Requests (last hour): ${stats.requestsLastHour}`);
    console.log(`  Requests (last minute): ${stats.requestsLastMinute}`);
    console.log(`  Average rate: ${stats.averageRequestsPerSecond} req/sec`);
    console.log(`  Estimated hourly: ${stats.estimatedHourlyRate}`);
    console.log(`  Warning level: ${stats.warningLevel}`);

    if (this.lastRateLimitInfo) {
      console.log(`  API remaining: ${this.lastRateLimitInfo.remaining}/${this.lastRateLimitInfo.limit}`);
    }

    const throttle = this.shouldThrottle();
    if (throttle.throttle) {
      console.log(`  ⚠️  Throttling: ${throttle.reason} (wait ${throttle.waitMs}ms)`);
    }
  }

  /**
   * Reset monitor (for testing)
   */
  reset() {
    this.requestTimestamps = [];
    this.lastRateLimitInfo = null;
    this.rateLimitHit = false;
  }
}

// Singleton instance
let rateLimitMonitorInstance: RateLimitMonitor | null = null;

/**
 * Get the global rate limit monitor instance
 */
export function getRateLimitMonitor(): RateLimitMonitor {
  if (!rateLimitMonitorInstance) {
    rateLimitMonitorInstance = new RateLimitMonitor();
  }
  return rateLimitMonitorInstance;
}
