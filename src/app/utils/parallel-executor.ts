/**
 * Parallel Execution Utility
 *
 * Executes async operations in parallel with:
 * - Concurrency limit (to respect API rate limits)
 * - Automatic retry on failure
 * - Progress tracking
 * - Error collection
 */

export interface ParallelExecutorOptions {
  /**
   * Maximum number of concurrent operations
   * Default: 5
   */
  concurrency?: number;

  /**
   * Delay between starting each operation (ms)
   * Helps with rate limiting
   * Default: 100ms (allows ~10/sec, well under Congress.gov limit)
   */
  delayBetweenMs?: number;

  /**
   * Retry failed operations
   * Default: false
   */
  retry?: boolean;

  /**
   * Maximum retry attempts
   * Default: 2
   */
  maxRetries?: number;

  /**
   * Callback for progress updates
   */
  onProgress?: (completed: number, total: number) => void;
}

export interface ParallelExecutorResult<T> {
  results: T[];
  errors: Array<{ index: number; error: any }>;
  duration: number;
  completed: number;
  failed: number;
}

/**
 * Execute an array of async operations in parallel with concurrency control
 */
export class ParallelExecutor {
  /**
   * Execute operations in parallel
   */
  static async execute<T>(
    operations: Array<() => Promise<T>>,
    options: ParallelExecutorOptions = {}
  ): Promise<ParallelExecutorResult<T>> {
    const {
      concurrency = 5,
      delayBetweenMs = 100,
      retry = false,
      maxRetries = 2,
      onProgress,
    } = options;

    const startTime = Date.now();
    const results: T[] = new Array(operations.length);
    const errors: Array<{ index: number; error: any }> = [];
    let completed = 0;
    let failed = 0;

    // Create a queue of operations with their indexes
    const queue = operations.map((op, index) => ({ op, index, attempts: 0 }));
    const inProgress = new Set<number>();

    /**
     * Process a single operation with retry logic
     */
    const processOperation = async (item: { op: () => Promise<T>; index: number; attempts: number }) => {
      const { op, index, attempts } = item;

      try {
        inProgress.add(index);
        const result = await op();
        results[index] = result;
        completed++;

        if (onProgress) {
          onProgress(completed, operations.length);
        }
      } catch (error) {
        if (retry && attempts < maxRetries) {
          // Retry
          item.attempts++;
          queue.push(item);
        } else {
          // Failed permanently
          errors.push({ index, error });
          failed++;
        }
      } finally {
        inProgress.delete(index);
      }
    };

    /**
     * Worker that processes queue items
     */
    const worker = async () => {
      while (queue.length > 0 || inProgress.size > 0) {
        // Wait if at concurrency limit
        if (inProgress.size >= concurrency) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        // Get next item from queue
        const item = queue.shift();
        if (!item) {
          // Queue empty but operations still in progress
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        // Start operation
        processOperation(item);

        // Delay before starting next operation
        if (delayBetweenMs > 0 && queue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
        }
      }
    };

    // Start workers
    await worker();

    const duration = Date.now() - startTime;

    return {
      results,
      errors,
      duration,
      completed,
      failed,
    };
  }

  /**
   * Execute a batch of operations with a transformation function
   */
  static async executeBatch<TInput, TOutput>(
    items: TInput[],
    transform: (item: TInput, index: number) => Promise<TOutput>,
    options: ParallelExecutorOptions = {}
  ): Promise<ParallelExecutorResult<TOutput>> {
    const operations = items.map((item, index) => () => transform(item, index));
    return this.execute(operations, options);
  }

  /**
   * Execute operations in chunks (useful for very large datasets)
   */
  static async executeInChunks<T>(
    operations: Array<() => Promise<T>>,
    chunkSize: number,
    options: ParallelExecutorOptions = {}
  ): Promise<ParallelExecutorResult<T>> {
    const allResults: T[] = [];
    const allErrors: Array<{ index: number; error: any }> = [];
    let totalCompleted = 0;
    let totalFailed = 0;
    const startTime = Date.now();

    // Process in chunks
    for (let i = 0; i < operations.length; i += chunkSize) {
      const chunk = operations.slice(i, Math.min(i + chunkSize, operations.length));
      const chunkResult = await this.execute(chunk, {
        ...options,
        onProgress: options.onProgress
          ? (completed, total) => {
              options.onProgress!(totalCompleted + completed, operations.length);
            }
          : undefined,
      });

      allResults.push(...chunkResult.results);
      allErrors.push(
        ...chunkResult.errors.map((e) => ({
          ...e,
          index: e.index + i,
        }))
      );
      totalCompleted += chunkResult.completed;
      totalFailed += chunkResult.failed;

      // Optional delay between chunks
      if (i + chunkSize < operations.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;

    return {
      results: allResults,
      errors: allErrors,
      duration,
      completed: totalCompleted,
      failed: totalFailed,
    };
  }
}
