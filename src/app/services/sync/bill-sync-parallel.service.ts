/**
 * Parallel Bill Sync Service
 *
 * Enhanced version of BillSyncService with parallel execution support.
 * Uses ParallelExecutor for concurrent API requests and batch database operations.
 */

import { PrismaClient } from '@prisma/client';
import { CongressApi } from '../congress';
import { getChangeDetectionService } from './change-detection.service';
import { getErrorHandler } from './error-handler.service';
import { ParallelExecutor } from '../../utils/parallel-executor';
import { getRateLimitMonitor } from '../../utils/rate-limit-monitor';
import { performanceConfig } from '../../config/performance.config';
import { BillSyncOptions, BillSyncResult } from './bill-sync.service';

const prisma = new PrismaClient();

/**
 * Enhanced Bill Sync Service with parallel execution
 */
export class ParallelBillSyncService {
  private changeDetection = getChangeDetectionService();
  private errorHandler = getErrorHandler();
  private rateLimitMonitor = getRateLimitMonitor();

  /**
   * Sync bills with parallel processing for stale bills
   * This is useful when you have many individual bills to update
   */
  async syncStaleBillsParallel(limit = 50): Promise<BillSyncResult> {
    const startTime = Date.now();
    console.log(`[ParallelBillSync] Starting parallel stale sync (limit: ${limit})...`);

    // Print current configuration
    console.log(`[ParallelBillSync] Config: concurrency=${performanceConfig.parallel.concurrency}, delay=${performanceConfig.parallel.delayBetweenMs}ms`);

    const result: BillSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      changesDetected: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Get stale bills that need updating
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const staleBills = await prisma.bill.findMany({
        where: {
          OR: [
            { lastSyncedAt: { lt: cutoffDate } },
            { lastSyncedAt: null },
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { lastSyncedAt: 'asc' },
        ],
        take: limit,
      });

      console.log(`[ParallelBillSync] Found ${staleBills.length} stale bills`);

      if (staleBills.length === 0) {
        result.duration = Date.now() - startTime;
        return result;
      }

      // Create operations for parallel execution
      const syncOperations = staleBills.map((bill) => async () => {
        // Record API request for rate limiting
        this.rateLimitMonitor.recordRequest();

        // Fetch full bill details
        const apiBill = await CongressApi.bills.getBillById({
          congress: bill.congress,
          billType: bill.billType,
          billNumber: bill.billNumber,
        });

        return {
          bill,
          apiBill,
        };
      });

      // Execute in parallel with configuration
      const parallelResult = await ParallelExecutor.execute(syncOperations, {
        concurrency: performanceConfig.parallel.concurrency,
        delayBetweenMs: performanceConfig.parallel.delayBetweenMs,
        retry: performanceConfig.parallel.retryEnabled,
        maxRetries: performanceConfig.parallel.maxRetries,
        onProgress: (completed, total) => {
          if (completed % 10 === 0 || completed === total) {
            console.log(`[ParallelBillSync] Progress: ${completed}/${total} bills`);

            // Log rate limit status every 10 bills
            if (performanceConfig.rateLimit.logUsage) {
              this.rateLimitMonitor.logStatus('[ParallelBillSync]');
            }
          }
        },
      });

      result.recordsFetched = parallelResult.completed;

      console.log(`[ParallelBillSync] Fetched ${parallelResult.completed} bills in ${parallelResult.duration}ms`);
      console.log(`[ParallelBillSync] Failed: ${parallelResult.failed}, Errors: ${parallelResult.errors.length}`);

      // Process results and update database (can also be batched)
      for (let i = 0; i < parallelResult.results.length; i++) {
        const item = parallelResult.results[i];
        if (!item) continue; // Skip failed requests

        try {
          const { bill, apiBill } = item;

          // Check for changes
          const changes = await this.changeDetection.detectBillChanges(bill, apiBill);

          // Update bill in database
          const updated = await prisma.bill.update({
            where: { id: bill.id },
            data: {
              title: apiBill.title || bill.title,
              updateDate: apiBill.updateDate ? new Date(apiBill.updateDate) : bill.updateDate,
              latestActionDate: apiBill.latestAction?.actionDate
                ? new Date(apiBill.latestAction.actionDate)
                : bill.latestActionDate,
              latestActionText: apiBill.latestAction?.text || bill.latestActionText,
              lastSyncedAt: new Date(),
            },
          });

          if (changes.length > 0) {
            await this.changeDetection.logChanges(bill.id, changes);
            result.recordsUpdated++;
            result.changesDetected += changes.length;
          } else {
            result.recordsUnchanged++;
          }
        } catch (error) {
          console.error(`[ParallelBillSync] Error processing result ${i}:`, error);
          result.errors.push({
            billId: `index-${i}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Add errors from parallel execution
      parallelResult.errors.forEach((err) => {
        result.errors.push({
          billId: `index-${err.index}`,
          error: String(err.error),
        });
      });

      result.duration = Date.now() - startTime;

      console.log('[ParallelBillSync] Sync completed:', result);

      // Log final rate limit status
      if (performanceConfig.rateLimit.monitoringEnabled) {
        this.rateLimitMonitor.logStatus('[ParallelBillSync]');
      }

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[ParallelBillSync] Sync failed:', error);
      result.errors.push({
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Sync multiple bill lists in parallel (useful for syncing multiple congresses/types)
   */
  async syncMultipleListsParallel(
    queries: Array<{ congress: number; billType?: string }>
  ): Promise<BillSyncResult> {
    const startTime = Date.now();
    console.log(`[ParallelBillSync] Syncing ${queries.length} bill lists in parallel...`);

    const result: BillSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      changesDetected: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Create operations for each query
      const listOperations = queries.map((query) => async () => {
        this.rateLimitMonitor.recordRequest();

        const response = await CongressApi.bills.listBills({
          congress: query.congress,
          billType: query.billType,
          limit: 100,
          sort: 'updateDate desc',
        });

        return response.bills || [];
      });

      // Execute in parallel
      const parallelResult = await ParallelExecutor.execute(listOperations, {
        concurrency: Math.min(performanceConfig.parallel.concurrency, queries.length),
        delayBetweenMs: performanceConfig.parallel.delayBetweenMs,
        retry: true,
        maxRetries: 2,
      });

      // Flatten all bills
      const allBills = parallelResult.results.flat().filter(Boolean);
      result.recordsFetched = allBills.length;

      console.log(`[ParallelBillSync] Fetched ${allBills.length} bills from ${queries.length} lists`);

      // Process bills (this part could also be optimized with batch operations)
      // For now, processing sequentially to avoid complexity
      for (const apiBill of allBills) {
        try {
          // Simplified processing - in production, use the full processBill logic
          const billKey = {
            congress: apiBill.congress,
            billType: apiBill.type,
            billNumber: parseInt(String(apiBill.number), 10),
          };

          const existing = await prisma.bill.findUnique({
            where: { congress_billType_billNumber: billKey },
          });

          if (existing) {
            result.recordsUnchanged++;
          } else {
            result.recordsCreated++;
          }
        } catch (error) {
          result.errors.push({
            billId: `${apiBill.congress}-${apiBill.type}-${apiBill.number}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.duration = Date.now() - startTime;
      console.log('[ParallelBillSync] Multi-list sync completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[ParallelBillSync] Multi-list sync failed:', error);
      result.errors.push({
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }
}

// Singleton instance
let parallelBillSyncInstance: ParallelBillSyncService | null = null;

export function getParallelBillSyncService(): ParallelBillSyncService {
  if (!parallelBillSyncInstance) {
    parallelBillSyncInstance = new ParallelBillSyncService();
  }
  return parallelBillSyncInstance;
}
