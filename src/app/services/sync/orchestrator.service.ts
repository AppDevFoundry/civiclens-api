/**
 * Congress Sync Orchestrator
 *
 * Master coordinator for all Congress data synchronization.
 * Manages sync strategy, rate limiting, prioritization, and observability.
 */

import { PrismaClient } from '@prisma/client';
import { getBillSyncService, BillSyncService, BillSyncResult } from './bill-sync.service';
import { getMemberSyncService, MemberSyncService, MemberSyncResult } from './member-sync.service';
import {
  getHearingSyncService,
  HearingSyncService,
  HearingSyncResult,
} from './hearing-sync.service';
import { getQueueService, QueueService, JobType } from './queue.service';

const prisma = new PrismaClient();

/**
 * Sync strategy types
 */
export enum SyncStrategy {
  INCREMENTAL = 'incremental', // Sync recent updates only
  FULL = 'full', // Full refresh of all data
  STALE = 'stale', // Sync items that haven't been updated recently
  PRIORITY = 'priority', // Sync high-priority items first
}

/**
 * Resource types that can be synced
 */
export enum ResourceType {
  BILLS = 'bills',
  MEMBERS = 'members',
  HEARINGS = 'hearings',
  COMMITTEES = 'committees',
  NOMINATIONS = 'nominations',
}

/**
 * Orchestrator options
 */
export interface OrchestratorOptions {
  strategy?: SyncStrategy;
  resources?: ResourceType[]; // Which resources to sync
  rateLimit?: number; // Max requests per hour
  async?: boolean; // Run syncs async via queue
}

/**
 * Overall sync result
 */
export interface OrchestratorResult {
  strategy: SyncStrategy;
  resources: ResourceType[];
  results: {
    bills?: BillSyncResult;
    members?: MemberSyncResult;
    hearings?: HearingSyncResult;
  };
  totalDuration: number;
  totalRecords: {
    fetched: number;
    created: number;
    updated: number;
    unchanged: number;
  };
  totalErrors: number;
}

/**
 * CongressSyncOrchestrator - Coordinates all sync operations
 */
export class CongressSyncOrchestrator {
  private billSync: BillSyncService;
  private memberSync: MemberSyncService;
  private hearingSync: HearingSyncService;
  private queueService: QueueService;

  constructor() {
    this.billSync = getBillSyncService();
    this.memberSync = getMemberSyncService();
    this.hearingSync = getHearingSyncService();
    this.queueService = getQueueService();
  }

  /**
   * Run synchronization based on strategy
   */
  async sync(options: OrchestratorOptions = {}): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const strategy = options.strategy || SyncStrategy.INCREMENTAL;
    const resources = options.resources || [
      ResourceType.BILLS,
      ResourceType.MEMBERS,
      ResourceType.HEARINGS,
    ];

    console.log(`[Orchestrator] Starting sync: strategy=${strategy}, resources=${resources.join(',')}`);

    const result: OrchestratorResult = {
      strategy,
      resources,
      results: {},
      totalDuration: 0,
      totalRecords: {
        fetched: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
      },
      totalErrors: 0,
    };

    // If async, enqueue jobs instead of running directly
    if (options.async) {
      await this.enqueueSync(strategy, resources);
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Run syncs based on strategy
    switch (strategy) {
      case SyncStrategy.INCREMENTAL:
        await this.runIncrementalSync(resources, result);
        break;
      case SyncStrategy.STALE:
        await this.runStaleSync(resources, result);
        break;
      case SyncStrategy.PRIORITY:
        await this.runPrioritySync(resources, result);
        break;
      case SyncStrategy.FULL:
        await this.runFullSync(resources, result);
        break;
    }

    result.totalDuration = Date.now() - startTime;

    // Calculate totals
    this.calculateTotals(result);

    console.log('[Orchestrator] Sync completed:', {
      duration: result.totalDuration,
      records: result.totalRecords,
      errors: result.totalErrors,
    });

    return result;
  }

  /**
   * Incremental sync - recent updates only (last 30 days)
   */
  private async runIncrementalSync(
    resources: ResourceType[],
    result: OrchestratorResult
  ): Promise<void> {
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const resource of resources) {
      const syncRun = await this.recordSyncStart(resource);

      try {
        if (resource === ResourceType.BILLS) {
          result.results.bills = await this.billSync.syncBills({
            dateFrom,
            priority: 'recent',
            limit: 200,
          });
          await this.recordSyncComplete(syncRun.id, result.results.bills);
        } else if (resource === ResourceType.MEMBERS) {
          result.results.members = await this.memberSync.syncMembers({
            currentMember: true,
            limit: 100,
          });
          await this.recordSyncComplete(syncRun.id, result.results.members);
        } else if (resource === ResourceType.HEARINGS) {
          result.results.hearings = await this.hearingSync.syncUpcoming();
          await this.recordSyncComplete(syncRun.id, result.results.hearings);
        }
      } catch (error) {
        await this.recordSyncError(syncRun.id, error);
        throw error;
      }
    }
  }

  /**
   * Stale sync - update items that haven't been synced recently
   */
  private async runStaleSync(
    resources: ResourceType[],
    result: OrchestratorResult
  ): Promise<void> {
    for (const resource of resources) {
      const syncRun = await this.recordSyncStart(resource);

      try {
        if (resource === ResourceType.BILLS) {
          result.results.bills = await this.billSync.syncStale(48, 100); // 48 hours, 100 bills
          await this.recordSyncComplete(syncRun.id, result.results.bills);
        } else if (resource === ResourceType.MEMBERS) {
          // Members change infrequently, so we don't have a stale sync
          result.results.members = { recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsUnchanged: 0, errors: [], duration: 0 };
          await this.recordSyncComplete(syncRun.id, result.results.members);
        } else if (resource === ResourceType.HEARINGS) {
          // Sync hearings from last week that might have been updated
          result.results.hearings = await this.hearingSync.syncRecent();
          await this.recordSyncComplete(syncRun.id, result.results.hearings);
        }
      } catch (error) {
        await this.recordSyncError(syncRun.id, error);
        throw error;
      }
    }
  }

  /**
   * Priority sync - focus on high-priority/active items
   */
  private async runPrioritySync(
    resources: ResourceType[],
    result: OrchestratorResult
  ): Promise<void> {
    for (const resource of resources) {
      const syncRun = await this.recordSyncStart(resource);

      try {
        if (resource === ResourceType.BILLS) {
          // Sync bills from last 90 days (active session)
          result.results.bills = await this.billSync.syncBills({
            dateFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            priority: 'active',
            limit: 250,
          });
          await this.recordSyncComplete(syncRun.id, result.results.bills);
        } else if (resource === ResourceType.MEMBERS) {
          result.results.members = await this.memberSync.syncAllCurrentMembers();
          await this.recordSyncComplete(syncRun.id, result.results.members);
        } else if (resource === ResourceType.HEARINGS) {
          result.results.hearings = await this.hearingSync.syncUpcoming();
          await this.recordSyncComplete(syncRun.id, result.results.hearings);
        }
      } catch (error) {
        await this.recordSyncError(syncRun.id, error);
        throw error;
      }
    }
  }

  /**
   * Full sync - comprehensive refresh of all data
   */
  private async runFullSync(
    resources: ResourceType[],
    result: OrchestratorResult
  ): Promise<void> {
    for (const resource of resources) {
      const syncRun = await this.recordSyncStart(resource);

      try {
        if (resource === ResourceType.BILLS) {
          // Full sync of current congress
          result.results.bills = await this.billSync.syncBills({
            congress: 118,
            priority: 'all',
            limit: 500,
          });
          await this.recordSyncComplete(syncRun.id, result.results.bills);
        } else if (resource === ResourceType.MEMBERS) {
          result.results.members = await this.memberSync.syncAllCurrentMembers();
          await this.recordSyncComplete(syncRun.id, result.results.members);
        } else if (resource === ResourceType.HEARINGS) {
          // Sync hearings for the whole congress
          result.results.hearings = await this.hearingSync.syncHearings({
            congress: 118,
            limit: 500,
          });
          await this.recordSyncComplete(syncRun.id, result.results.hearings);
        }
      } catch (error) {
        await this.recordSyncError(syncRun.id, error);
        throw error;
      }
    }
  }

  /**
   * Enqueue sync jobs for async processing
   */
  private async enqueueSync(strategy: SyncStrategy, resources: ResourceType[]): Promise<void> {
    console.log('[Orchestrator] Enqueueing sync jobs');

    for (const resource of resources) {
      if (resource === ResourceType.BILLS) {
        await this.queueService.enqueue(
          JobType.SYNC_BILLS,
          {
            dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            limit: 200,
          },
          { priority: 8 }
        );
      } else if (resource === ResourceType.MEMBERS) {
        await this.queueService.enqueue(
          JobType.SYNC_MEMBER,
          { currentMember: true, limit: 100 },
          { priority: 5 }
        );
      } else if (resource === ResourceType.HEARINGS) {
        await this.queueService.enqueue(
          JobType.SYNC_HEARING,
          {
            dateFrom: new Date().toISOString(),
            dateTo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            limit: 200,
          },
          { priority: 6 }
        );
      }
    }
  }

  /**
   * Record sync run start
   */
  private async recordSyncStart(resourceType: ResourceType) {
    return prisma.syncRun.create({
      data: {
        resourceType,
        status: 'running',
      },
    });
  }

  /**
   * Record sync run completion
   */
  private async recordSyncComplete(
    syncRunId: number,
    result: BillSyncResult | MemberSyncResult | HearingSyncResult
  ) {
    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: {
        status: result.errors.length > 0 ? 'partial' : 'completed',
        completedAt: new Date(),
        recordsFetched: result.recordsFetched,
        recordsCreated: result.recordsCreated,
        recordsUpdated: result.recordsUpdated,
        recordsUnchanged: result.recordsUnchanged,
        errorsEncountered: result.errors.length > 0 ? result.errors : null,
        metadata: {
          duration: result.duration,
        },
      },
    });
  }

  /**
   * Record sync run error
   */
  private async recordSyncError(syncRunId: number, error: any) {
    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorsEncountered: [
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        ],
      },
    });
  }

  /**
   * Calculate total statistics
   */
  private calculateTotals(result: OrchestratorResult): void {
    const allResults = Object.values(result.results);

    result.totalRecords = {
      fetched: allResults.reduce((sum, r) => sum + r.recordsFetched, 0),
      created: allResults.reduce((sum, r) => sum + r.recordsCreated, 0),
      updated: allResults.reduce((sum, r) => sum + r.recordsUpdated, 0),
      unchanged: allResults.reduce((sum, r) => sum + r.recordsUnchanged, 0),
    };

    result.totalErrors = allResults.reduce((sum, r) => sum + r.errors.length, 0);
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(hours = 24): Promise<{
    recentSyncs: number;
    successRate: number;
    avgDuration: number;
    byResource: Record<string, { syncs: number; errors: number }>;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const syncs = await prisma.syncRun.findMany({
      where: {
        startedAt: { gte: since },
      },
    });

    const successCount = syncs.filter((s) => s.status === 'completed').length;
    const avgDuration = syncs.length > 0
      ? syncs.reduce((sum, s) => {
          const duration = s.metadata && typeof s.metadata === 'object' && 'duration' in s.metadata
            ? (s.metadata as any).duration
            : 0;
          return sum + duration;
        }, 0) / syncs.length
      : 0;

    const byResource: Record<string, { syncs: number; errors: number }> = {};
    syncs.forEach((sync) => {
      if (!byResource[sync.resourceType]) {
        byResource[sync.resourceType] = { syncs: 0, errors: 0 };
      }
      byResource[sync.resourceType].syncs++;
      if (sync.status === 'failed') {
        byResource[sync.resourceType].errors++;
      }
    });

    return {
      recentSyncs: syncs.length,
      successRate: syncs.length > 0 ? successCount / syncs.length : 0,
      avgDuration,
      byResource,
    };
  }
}

// Singleton instance
let orchestrator: CongressSyncOrchestrator | null = null;

/**
 * Get the CongressSyncOrchestrator singleton instance
 */
export function getOrchestrator(): CongressSyncOrchestrator {
  if (!orchestrator) {
    orchestrator = new CongressSyncOrchestrator();
  }
  return orchestrator;
}
