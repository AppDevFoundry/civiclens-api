/**
 * Error Handler Service
 *
 * Provides intelligent error handling, classification, and retry logic
 * for Congress data synchronization operations.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Error classification types
 */
export enum ErrorType {
  RETRYABLE = 'retryable', // Temporary issues (rate limits, network)
  FATAL = 'fatal', // Permanent failures (bad data, invalid requests)
  TRANSIENT = 'transient', // Brief issues that auto-resolve
  CONFIGURATION = 'configuration', // Setup/config problems
  UNKNOWN = 'unknown', // Unclassified errors
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low', // Minor issues, doesn't affect core functionality
  MEDIUM = 'medium', // Noticeable issues, some features affected
  HIGH = 'high', // Major issues, core functionality impaired
  CRITICAL = 'critical', // System-breaking issues, immediate attention needed
}

/**
 * Classified error information
 */
export interface ClassifiedError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  shouldRetry: boolean;
  retryAfterMs?: number;
  originalError: Error;
  context?: Record<string, any>;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs?: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 1 minute
  backoffMultiplier: 2,
  jitterMs: 100,
};

/**
 * Error tracking metrics
 */
interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  retriesAttempted: number;
  retriesSucceeded: number;
  retriesFailed: number;
}

/**
 * Enhanced Error Handler Service
 */
export class ErrorHandlerService {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {} as Record<ErrorType, number>,
    errorsBySeverity: {} as Record<ErrorSeverity, number>,
    retriesAttempted: 0,
    retriesSucceeded: 0,
    retriesFailed: 0,
  };

  /**
   * Classify an error to determine handling strategy
   */
  classifyError(error: any, context?: Record<string, any>): ClassifiedError {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorMessage = errorObj.message.toLowerCase();

    // Rate limiting (429)
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return {
        type: ErrorType.RETRYABLE,
        severity: ErrorSeverity.MEDIUM,
        message: 'API rate limit exceeded',
        shouldRetry: true,
        retryAfterMs: 60000, // Wait 1 minute
        originalError: errorObj,
        context,
      };
    }

    // Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
    if (
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('network')
    ) {
      return {
        type: ErrorType.TRANSIENT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network connectivity issue',
        shouldRetry: true,
        retryAfterMs: 5000, // Wait 5 seconds
        originalError: errorObj,
        context,
      };
    }

    // Bad requests (400, 404)
    if (errorMessage.includes('400') || errorMessage.includes('bad request')) {
      return {
        type: ErrorType.FATAL,
        severity: ErrorSeverity.LOW,
        message: 'Invalid request data',
        shouldRetry: false,
        originalError: errorObj,
        context,
      };
    }

    // Not found (404)
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return {
        type: ErrorType.FATAL,
        severity: ErrorSeverity.LOW,
        message: 'Resource not found',
        shouldRetry: false,
        originalError: errorObj,
        context,
      };
    }

    // Authentication/Authorization (401, 403)
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden')
    ) {
      return {
        type: ErrorType.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        message: 'Authentication/authorization failed - check API key',
        shouldRetry: false,
        originalError: errorObj,
        context,
      };
    }

    // Server errors (500+)
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return {
        type: ErrorType.RETRYABLE,
        severity: ErrorSeverity.HIGH,
        message: 'Server error - service may be down',
        shouldRetry: true,
        retryAfterMs: 30000, // Wait 30 seconds
        originalError: errorObj,
        context,
      };
    }

    // Database errors
    if (
      errorMessage.includes('prisma') ||
      errorMessage.includes('database') ||
      errorMessage.includes('unique constraint')
    ) {
      return {
        type: ErrorType.FATAL,
        severity: ErrorSeverity.HIGH,
        message: 'Database error',
        shouldRetry: false,
        originalError: errorObj,
        context,
      };
    }

    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return {
        type: ErrorType.FATAL,
        severity: ErrorSeverity.LOW,
        message: 'Data validation error',
        shouldRetry: false,
        originalError: errorObj,
        context,
      };
    }

    // Unknown errors - be conservative and don't retry
    return {
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      message: errorMessage || 'Unknown error occurred',
      shouldRetry: false,
      originalError: errorObj,
      context,
    };
  }

  /**
   * Execute an operation with automatic retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: Record<string, any>
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: ClassifiedError | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await operation();

        // Success! Track if this was a retry
        if (attempt > 1) {
          this.metrics.retriesSucceeded++;
          console.log(`[ErrorHandler] Operation succeeded after ${attempt} attempts`);
        }

        return result;
      } catch (error) {
        lastError = this.classifyError(error, context);
        this.trackError(lastError);

        // If this is the last attempt or error shouldn't be retried, give up
        if (attempt >= retryConfig.maxAttempts || !lastError.shouldRetry) {
          this.metrics.retriesFailed++;

          // Log critical errors
          if (lastError.severity === ErrorSeverity.CRITICAL) {
            await this.logCriticalError(lastError);
          }

          throw error;
        }

        // Calculate retry delay with exponential backoff
        const delay = this.calculateRetryDelay(
          attempt,
          lastError.retryAfterMs,
          retryConfig
        );

        this.metrics.retriesAttempted++;
        console.warn(
          `[ErrorHandler] Attempt ${attempt}/${retryConfig.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError?.originalError || new Error('Max retries exceeded');
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(
    attempt: number,
    suggestedDelayMs: number | undefined,
    config: RetryConfig
  ): number {
    // Use suggested delay if provided (e.g., from rate limit headers)
    if (suggestedDelayMs) {
      return suggestedDelayMs;
    }

    // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

    // Add jitter to avoid thundering herd
    const jitter = config.jitterMs ? Math.random() * config.jitterMs : 0;

    return cappedDelay + jitter;
  }

  /**
   * Track error in metrics
   */
  private trackError(error: ClassifiedError): void {
    this.metrics.totalErrors++;

    // Track by type
    this.metrics.errorsByType[error.type] = (this.metrics.errorsByType[error.type] || 0) + 1;

    // Track by severity
    this.metrics.errorsBySeverity[error.severity] =
      (this.metrics.errorsBySeverity[error.severity] || 0) + 1;
  }

  /**
   * Log critical errors to database for admin review
   */
  private async logCriticalError(error: ClassifiedError): Promise<void> {
    try {
      await prisma.syncError.create({
        data: {
          errorType: error.type,
          severity: error.severity,
          message: error.message,
          stackTrace: error.originalError.stack,
          context: error.context || {},
          shouldAlert: true,
        },
      });

      console.error('[ErrorHandler] CRITICAL ERROR logged:', {
        type: error.type,
        severity: error.severity,
        message: error.message,
        context: error.context,
      });
    } catch (logError) {
      // If we can't log to database, at least log to console
      console.error('[ErrorHandler] Failed to log critical error to database:', logError);
    }
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent errors from database
   */
  async getRecentErrors(limit = 50, onlyCritical = false) {
    const where = onlyCritical
      ? {
          OR: [
            { severity: ErrorSeverity.CRITICAL },
            { severity: ErrorSeverity.HIGH },
          ],
        }
      : {};

    return prisma.syncError.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get error statistics for a time period
   */
  async getErrorStats(hoursBack = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const errors = await prisma.syncError.findMany({
      where: {
        createdAt: { gte: since },
      },
    });

    return {
      totalErrors: errors.length,
      errorsByType: this.groupBy(errors, 'errorType'),
      errorsBySeverity: this.groupBy(errors, 'severity'),
      criticalErrors: errors.filter((e) => e.severity === ErrorSeverity.CRITICAL).length,
      recentErrors: errors.slice(0, 10),
    };
  }

  /**
   * Check if error rate is unusually high (alert condition)
   */
  async shouldAlert(): Promise<boolean> {
    const stats = await this.getErrorStats(1); // Last hour

    // Alert if more than 10 errors in the last hour
    if (stats.totalErrors > 10) {
      return true;
    }

    // Alert if any critical errors
    if (stats.criticalErrors > 0) {
      return true;
    }

    return false;
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      retriesAttempted: 0,
      retriesSucceeded: 0,
      retriesFailed: 0,
    };
  }

  /**
   * Helper: Group array of objects by a key
   */
  private groupBy(arr: any[], key: string): Record<string, number> {
    return arr.reduce((acc, item) => {
      const val = item[key];
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let errorHandlerService: ErrorHandlerService | null = null;

/**
 * Get the ErrorHandlerService singleton instance
 */
export function getErrorHandler(): ErrorHandlerService {
  if (!errorHandlerService) {
    errorHandlerService = new ErrorHandlerService();
  }
  return errorHandlerService;
}

export default ErrorHandlerService;
