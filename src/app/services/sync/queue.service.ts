/**
 * Simple Queue Service (Placeholder)
 *
 * NOTE: This is a simplified placeholder. The full pg-boss integration
 * requires API updates for v12. For now, we'll use direct sync calls.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export enum JobType {
  SYNC_BILLS = 'sync_bills',
  SYNC_MEMBER = 'sync_member',
  SYNC_HEARING = 'sync_hearing',
  SYNC_COMMITTEE = 'sync_committee',
  SYNC_NOMINATION = 'sync_nomination',
  GENERATE_SUMMARY = 'generate_summary',
}

export interface SyncBillsJobPayload {
  congress?: number;
  billType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SyncMemberJobPayload {
  bioguideId?: string;
  currentMember?: boolean;
  state?: string;
  limit?: number;
}

export interface SyncHearingJobPayload {
  congress?: number;
  chamber?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface GenerateSummaryJobPayload {
  billId: number;
  force?: boolean;
}

export type JobPayload =
  | SyncBillsJobPayload
  | SyncMemberJobPayload
  | SyncHearingJobPayload
  | GenerateSummaryJobPayload;

export interface JobOptions {
  priority?: number;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  startAfter?: Date | string;
  expireInSeconds?: number;
  singletonKey?: string;
}

export class QueueService {
  private isStarted = false;

  async start(): Promise<void> {
    this.isStarted = true;
    console.log('[QueueService] Started (simplified mode)');
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    console.log('[QueueService] Stopped');
  }

  async enqueue<T extends JobPayload>(
    jobType: JobType,
    payload: T,
    options?: JobOptions
  ): Promise<string | null> {
    console.log(`[QueueService] Enqueued job: ${jobType} (simplified mode)`);

    // Track in Prisma SyncJob table
    const job = await prisma.syncJob.create({
      data: {
        jobType,
        payload: payload as any,
        priority: options?.priority || 5,
        maxAttempts: options?.retryLimit || 3,
        scheduledFor: options?.startAfter ? new Date(options.startAfter) : new Date(),
        status: 'pending',
      },
    });

    return String(job.id);
  }

  async registerHandler<T extends JobPayload>(
    jobType: JobType,
    handler: (payload: T) => Promise<void>,
    options?: {
      teamSize?: number;
      teamConcurrency?: number;
    }
  ): Promise<void> {
    console.log(`[QueueService] Registered handler for: ${jobType} (simplified mode)`);
  }

  async getQueueStats(): Promise<{
    created: number;
    retry: number;
    active: number;
    completed: number;
    expired: number;
    cancelled: number;
    failed: number;
  }> {
    const stats = await prisma.syncJob.groupBy({
      by: ['status'],
      _count: true,
    });

    const result = {
      created: 0,
      retry: 0,
      active: 0,
      completed: 0,
      expired: 0,
      cancelled: 0,
      failed: 0,
    };

    stats.forEach((stat) => {
      if (stat.status === 'pending') result.created = stat._count;
      else if (stat.status === 'processing') result.active = stat._count;
      else if (stat.status === 'completed') result.completed = stat._count;
      else if (stat.status === 'failed') result.failed = stat._count;
    });

    return result;
  }

  async getRecentJobs(limit = 50) {
    return prisma.syncJob.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async clearAll(): Promise<void> {
    await prisma.syncJob.deleteMany();
    console.log('[QueueService] Cleared all jobs');
  }

  private assertStarted(): void {
    if (!this.isStarted) {
      throw new Error('QueueService is not started. Call start() first.');
    }
  }
}

let queueService: QueueService | null = null;

export function getQueueService(): QueueService {
  if (!queueService) {
    queueService = new QueueService();
  }
  return queueService;
}

export async function initializeQueue(): Promise<QueueService> {
  const service = getQueueService();
  await service.start();
  return service;
}
