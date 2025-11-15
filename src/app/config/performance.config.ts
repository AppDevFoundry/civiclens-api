/**
 * Performance Configuration
 *
 * Centralized configuration for performance optimizations
 * including parallel execution, rate limiting, and caching.
 *
 * All values can be overridden via environment variables.
 */

export interface ParallelExecutionConfig {
  /**
   * Maximum number of concurrent API requests
   * Default: 3 (conservative)
   * Recommended range: 2-8
   * Production: Start with 2-3, gradually increase
   */
  concurrency: number;

  /**
   * Delay between starting each request (ms)
   * Default: 150ms (allows ~6.7 req/sec)
   * Congress.gov limit: 5000/hour = ~1.39 req/sec sustained
   * With concurrency=3 and delay=150ms: ~20 req/sec burst, ~4 req/sec sustained
   */
  delayBetweenMs: number;

  /**
   * Enable automatic retry on transient failures
   * Default: true
   */
  retryEnabled: boolean;

  /**
   * Maximum retry attempts
   * Default: 2
   */
  maxRetries: number;

  /**
   * Maximum requests per second (hard limit)
   * Default: 10 (well under API limit for safety)
   * This is enforced via adaptive throttling
   */
  maxRequestsPerSecond: number;
}

export interface DatabaseConfig {
  /**
   * Enable batch operations (createMany, updateMany)
   * Default: true
   */
  batchOperationsEnabled: boolean;

  /**
   * Batch size for bulk operations
   * Default: 100
   */
  batchSize: number;

  /**
   * Connection pool size
   * Default: 10
   * Vercel serverless: Keep low (5-10)
   */
  connectionPoolSize: number;

  /**
   * Connection timeout (seconds)
   * Default: 60
   */
  connectionTimeout: number;
}

export interface RateLimitConfig {
  /**
   * Enable rate limit monitoring
   * Default: true
   */
  monitoringEnabled: boolean;

  /**
   * Pause sync if rate limit hit
   * Default: true
   */
  pauseOnRateLimit: boolean;

  /**
   * Wait time when rate limited (ms)
   * Default: 60000 (1 minute)
   */
  rateLimitWaitMs: number;

  /**
   * Log rate limit usage
   * Default: true in production
   */
  logUsage: boolean;
}

export interface PerformanceConfig {
  parallel: ParallelExecutionConfig;
  database: DatabaseConfig;
  rateLimit: RateLimitConfig;
}

/**
 * Get performance configuration from environment variables
 */
function getConfig(): PerformanceConfig {
  return {
    parallel: {
      // PARALLEL_CONCURRENCY: Number of concurrent requests
      // Start low (2-3) and gradually increase based on monitoring
      concurrency: parseInt(process.env.PARALLEL_CONCURRENCY || '3', 10),

      // PARALLEL_DELAY_MS: Delay between starting requests
      // 150ms = ~6.7 req/sec per concurrent stream
      // With 3 concurrent: ~20 bursts, ~4-5 sustained
      delayBetweenMs: parseInt(process.env.PARALLEL_DELAY_MS || '150', 10),

      // PARALLEL_RETRY: Enable retry on failures
      retryEnabled: process.env.PARALLEL_RETRY !== 'false',

      // PARALLEL_MAX_RETRIES: Max retry attempts
      maxRetries: parseInt(process.env.PARALLEL_MAX_RETRIES || '2', 10),

      // PARALLEL_MAX_RPS: Hard limit on requests per second
      maxRequestsPerSecond: parseInt(process.env.PARALLEL_MAX_RPS || '10', 10),
    },

    database: {
      // DB_BATCH_ENABLED: Enable batch operations
      batchOperationsEnabled: process.env.DB_BATCH_ENABLED !== 'false',

      // DB_BATCH_SIZE: Number of records per batch
      batchSize: parseInt(process.env.DB_BATCH_SIZE || '100', 10),

      // DB_POOL_SIZE: Connection pool size
      connectionPoolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),

      // DB_TIMEOUT: Connection timeout in seconds
      connectionTimeout: parseInt(process.env.DB_TIMEOUT || '60', 10),
    },

    rateLimit: {
      // RATE_LIMIT_MONITORING: Enable rate limit monitoring
      monitoringEnabled: process.env.RATE_LIMIT_MONITORING !== 'false',

      // RATE_LIMIT_PAUSE: Pause on rate limit
      pauseOnRateLimit: process.env.RATE_LIMIT_PAUSE !== 'false',

      // RATE_LIMIT_WAIT_MS: Wait time when rate limited
      rateLimitWaitMs: parseInt(process.env.RATE_LIMIT_WAIT_MS || '60000', 10),

      // RATE_LIMIT_LOG: Log rate limit usage
      logUsage: process.env.RATE_LIMIT_LOG === 'true' || process.env.NODE_ENV === 'production',
    },
  };
}

/**
 * Performance configuration singleton
 */
export const performanceConfig = getConfig();

/**
 * Print current configuration (for debugging)
 */
export function printPerformanceConfig() {
  console.log('\n⚙️  Performance Configuration:\n');
  console.log('Parallel Execution:');
  console.log(`  Concurrency: ${performanceConfig.parallel.concurrency}`);
  console.log(`  Delay between requests: ${performanceConfig.parallel.delayBetweenMs}ms`);
  console.log(`  Max requests/sec: ${performanceConfig.parallel.maxRequestsPerSecond}`);
  console.log(`  Retry enabled: ${performanceConfig.parallel.retryEnabled}`);
  console.log(`  Max retries: ${performanceConfig.parallel.maxRetries}`);
  console.log('\nDatabase:');
  console.log(`  Batch operations: ${performanceConfig.database.batchOperationsEnabled}`);
  console.log(`  Batch size: ${performanceConfig.database.batchSize}`);
  console.log(`  Pool size: ${performanceConfig.database.connectionPoolSize}`);
  console.log('\nRate Limiting:');
  console.log(`  Monitoring: ${performanceConfig.rateLimit.monitoringEnabled}`);
  console.log(`  Pause on limit: ${performanceConfig.rateLimit.pauseOnRateLimit}`);
  console.log(`  Wait time: ${performanceConfig.rateLimit.rateLimitWaitMs}ms`);
  console.log('');
}

/**
 * Calculate effective request rate
 */
export function calculateRequestRate(config: ParallelExecutionConfig): {
  burstRate: number;
  sustainedRate: number;
  hourlyEstimate: number;
} {
  // Burst rate: All concurrent requests starting simultaneously
  const burstRate = config.concurrency / (config.delayBetweenMs / 1000);

  // Sustained rate: Accounting for delays
  const sustainedRate = config.concurrency / (config.delayBetweenMs / 1000);

  // Hourly estimate (conservative)
  const hourlyEstimate = sustainedRate * 3600;

  return {
    burstRate: Math.round(burstRate * 10) / 10,
    sustainedRate: Math.round(sustainedRate * 10) / 10,
    hourlyEstimate: Math.round(hourlyEstimate),
  };
}

/**
 * Validate configuration is safe
 */
export function validateConfig(config: PerformanceConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  const rates = calculateRequestRate(config.parallel);

  // Check rate limits
  if (rates.hourlyEstimate > 4500) {
    warnings.push(
      `Estimated hourly requests (${rates.hourlyEstimate}) approaches API limit (5000/hour)`
    );
  }

  if (rates.sustainedRate > 1.5) {
    warnings.push(
      `Sustained rate (${rates.sustainedRate} req/sec) exceeds safe limit (1.39 req/sec)`
    );
  }

  if (config.parallel.concurrency > 10) {
    warnings.push(`High concurrency (${config.parallel.concurrency}) may cause connection issues`);
  }

  if (config.parallel.delayBetweenMs < 100) {
    errors.push(`Delay too low (${config.parallel.delayBetweenMs}ms). Minimum: 100ms`);
  }

  if (config.database.batchSize > 500) {
    warnings.push(`Large batch size (${config.database.batchSize}) may cause memory issues`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Get recommended safe configuration
 */
export function getSafeConfig(): PerformanceConfig {
  return {
    parallel: {
      concurrency: 2, // Very conservative
      delayBetweenMs: 200, // 5 req/sec
      retryEnabled: true,
      maxRetries: 2,
      maxRequestsPerSecond: 5, // Conservative limit
    },
    database: {
      batchOperationsEnabled: true,
      batchSize: 100,
      connectionPoolSize: 5,
      connectionTimeout: 60,
    },
    rateLimit: {
      monitoringEnabled: true,
      pauseOnRateLimit: true,
      rateLimitWaitMs: 60000,
      logUsage: true,
    },
  };
}

/**
 * Get aggressive configuration (for testing/development)
 */
export function getAggressiveConfig(): PerformanceConfig {
  return {
    parallel: {
      concurrency: 8,
      delayBetweenMs: 100,
      retryEnabled: true,
      maxRetries: 3,
      maxRequestsPerSecond: 20,
    },
    database: {
      batchOperationsEnabled: true,
      batchSize: 200,
      connectionPoolSize: 20,
      connectionTimeout: 60,
    },
    rateLimit: {
      monitoringEnabled: true,
      pauseOnRateLimit: true,
      rateLimitWaitMs: 30000,
      logUsage: true,
    },
  };
}
