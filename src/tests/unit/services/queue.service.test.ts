/**
 * Queue Service Unit Tests
 *
 * Tests for the simplified queue service that manages sync jobs.
 */

// @ts-nocheck - Disable TypeScript for this file due to Prisma mock typing issues
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Create mock before importing services
const prismaMock = mockDeep<PrismaClient>();

// Mock the PrismaClient constructor
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock),
}));

import {
  QueueService,
  getQueueService,
  initializeQueue,
  JobType,
  SyncBillsJobPayload,
  SyncMemberJobPayload,
  GenerateSummaryJobPayload,
} from '../../../app/services/sync/queue.service';

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    mockReset(prismaMock);
    jest.clearAllMocks();
    service = new QueueService();
  });

  describe('start/stop', () => {
    it('should start the service', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[QueueService] Started')
      );

      consoleSpy.mockRestore();
    });

    it('should stop the service', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.start();
      await service.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[QueueService] Stopped')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('enqueue', () => {
    it('should enqueue a sync bills job', async () => {
      const payload: SyncBillsJobPayload = {
        congress: 118,
        billType: 'hr',
        limit: 100,
      };

      prismaMock.syncJob.create.mockResolvedValue({
        id: 1,
        jobType: JobType.SYNC_BILLS,
        payload,
        status: 'pending',
        priority: 5,
        maxAttempts: 3,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: new Date(),
        startedAt: null,
        completedAt: null,
        error: null,
      } as any);

      const jobId = await service.enqueue(JobType.SYNC_BILLS, payload);

      expect(jobId).toBe('1');
      expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobType: JobType.SYNC_BILLS,
          payload,
          priority: 5,
          maxAttempts: 3,
          status: 'pending',
        }),
      });
    });

    it('should enqueue a sync member job', async () => {
      const payload: SyncMemberJobPayload = {
        currentMember: true,
        state: 'CA',
        limit: 50,
      };

      prismaMock.syncJob.create.mockResolvedValue({
        id: 2,
        jobType: JobType.SYNC_MEMBER,
        payload,
        status: 'pending',
        priority: 5,
        maxAttempts: 3,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: new Date(),
        startedAt: null,
        completedAt: null,
        error: null,
      } as any);

      const jobId = await service.enqueue(JobType.SYNC_MEMBER, payload);

      expect(jobId).toBe('2');
    });

    it('should enqueue a generate summary job', async () => {
      const payload: GenerateSummaryJobPayload = {
        billId: 123,
        force: true,
      };

      prismaMock.syncJob.create.mockResolvedValue({
        id: 3,
        jobType: JobType.GENERATE_SUMMARY,
        payload,
        status: 'pending',
        priority: 5,
        maxAttempts: 3,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: new Date(),
        startedAt: null,
        completedAt: null,
        error: null,
      } as any);

      const jobId = await service.enqueue(JobType.GENERATE_SUMMARY, payload);

      expect(jobId).toBe('3');
    });

    it('should use custom job options', async () => {
      const payload: SyncBillsJobPayload = { limit: 10 };
      const options = {
        priority: 10,
        retryLimit: 5,
        startAfter: new Date('2024-01-01T00:00:00Z'),
      };

      prismaMock.syncJob.create.mockResolvedValue({
        id: 4,
        jobType: JobType.SYNC_BILLS,
        payload,
        status: 'pending',
        priority: 10,
        maxAttempts: 5,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: options.startAfter,
        startedAt: null,
        completedAt: null,
        error: null,
      } as any);

      await service.enqueue(JobType.SYNC_BILLS, payload, options);

      expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 10,
          maxAttempts: 5,
          scheduledFor: options.startAfter,
        }),
      });
    });

    it('should handle enqueue errors', async () => {
      prismaMock.syncJob.create.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.enqueue(JobType.SYNC_BILLS, { limit: 10 })
      ).rejects.toThrow('Database error');
    });
  });

  describe('registerHandler', () => {
    it('should register a handler', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const handler = jest.fn();

      await service.registerHandler(JobType.SYNC_BILLS, handler);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Registered handler for: ${JobType.SYNC_BILLS}`)
      );

      consoleSpy.mockRestore();
    });

    it('should register handler with options', async () => {
      const handler = jest.fn();
      const options = {
        teamSize: 5,
        teamConcurrency: 2,
      };

      // Should not throw
      await expect(
        service.registerHandler(JobType.SYNC_MEMBER, handler, options)
      ).resolves.not.toThrow();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      prismaMock.syncJob.groupBy.mockResolvedValue([
        { status: 'pending', _count: 10 },
        { status: 'processing', _count: 5 },
        { status: 'completed', _count: 100 },
        { status: 'failed', _count: 3 },
      ] as any);

      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        created: 10,
        retry: 0,
        active: 5,
        completed: 100,
        expired: 0,
        cancelled: 0,
        failed: 3,
      });
    });

    it('should handle empty stats', async () => {
      prismaMock.syncJob.groupBy.mockResolvedValue([]);

      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        created: 0,
        retry: 0,
        active: 0,
        completed: 0,
        expired: 0,
        cancelled: 0,
        failed: 0,
      });
    });

    it('should handle unknown statuses', async () => {
      prismaMock.syncJob.groupBy.mockResolvedValue([
        { status: 'unknown', _count: 5 },
      ] as any);

      const stats = await service.getQueueStats();

      // Unknown status should not appear in any known field
      expect(stats.created).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('getRecentJobs', () => {
    it('should return recent jobs with default limit', async () => {
      const mockJobs = [
        {
          id: 1,
          jobType: JobType.SYNC_BILLS,
          status: 'completed',
          createdAt: new Date(),
        },
        {
          id: 2,
          jobType: JobType.SYNC_MEMBER,
          status: 'pending',
          createdAt: new Date(),
        },
      ];

      prismaMock.syncJob.findMany.mockResolvedValue(mockJobs as any);

      const jobs = await service.getRecentJobs();

      expect(jobs).toEqual(mockJobs);
      expect(prismaMock.syncJob.findMany).toHaveBeenCalledWith({
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should respect custom limit', async () => {
      prismaMock.syncJob.findMany.mockResolvedValue([]);

      await service.getRecentJobs(10);

      expect(prismaMock.syncJob.findMany).toHaveBeenCalledWith({
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle empty results', async () => {
      prismaMock.syncJob.findMany.mockResolvedValue([]);

      const jobs = await service.getRecentJobs();

      expect(jobs).toEqual([]);
    });
  });

  describe('clearAll', () => {
    it('should clear all jobs', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      prismaMock.syncJob.deleteMany.mockResolvedValue({ count: 100 });

      await service.clearAll();

      expect(prismaMock.syncJob.deleteMany).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[QueueService] Cleared all jobs')
      );

      consoleSpy.mockRestore();
    });

    it('should handle delete errors', async () => {
      prismaMock.syncJob.deleteMany.mockRejectedValue(
        new Error('Delete failed')
      );

      await expect(service.clearAll()).rejects.toThrow('Delete failed');
    });
  });

  describe('getQueueService', () => {
    it('should return singleton instance', () => {
      const service1 = getQueueService();
      const service2 = getQueueService();

      expect(service1).toBe(service2);
      expect(service1).toBeInstanceOf(QueueService);
    });
  });

  describe('initializeQueue', () => {
    it('should initialize and start the queue service', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const queueService = await initializeQueue();

      expect(queueService).toBeInstanceOf(QueueService);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[QueueService] Started')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('JobType enum', () => {
    it('should have correct job type values', () => {
      expect(JobType.SYNC_BILLS).toBe('sync_bills');
      expect(JobType.SYNC_MEMBER).toBe('sync_member');
      expect(JobType.SYNC_HEARING).toBe('sync_hearing');
      expect(JobType.SYNC_COMMITTEE).toBe('sync_committee');
      expect(JobType.SYNC_NOMINATION).toBe('sync_nomination');
      expect(JobType.GENERATE_SUMMARY).toBe('generate_summary');
    });
  });

  describe('Integration scenarios', () => {
    it('should enqueue multiple jobs', async () => {
      let jobCounter = 0;
      prismaMock.syncJob.create.mockImplementation(() => {
        jobCounter++;
        return Promise.resolve({
          id: jobCounter,
          jobType: JobType.SYNC_BILLS,
          status: 'pending',
          priority: 5,
          maxAttempts: 3,
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduledFor: new Date(),
        } as any);
      });

      const jobId1 = await service.enqueue(JobType.SYNC_BILLS, { limit: 10 });
      const jobId2 = await service.enqueue(JobType.SYNC_MEMBER, { currentMember: true });
      const jobId3 = await service.enqueue(JobType.SYNC_HEARING, { congress: 118 });

      expect(jobId1).toBe('1');
      expect(jobId2).toBe('2');
      expect(jobId3).toBe('3');
      expect(prismaMock.syncJob.create).toHaveBeenCalledTimes(3);
    });

    it('should track job lifecycle', async () => {
      // Create job
      prismaMock.syncJob.create.mockResolvedValue({
        id: 1,
        jobType: JobType.SYNC_BILLS,
        status: 'pending',
        priority: 5,
        maxAttempts: 3,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: new Date(),
      } as any);

      await service.enqueue(JobType.SYNC_BILLS, { limit: 10 });

      // Check stats
      prismaMock.syncJob.groupBy.mockResolvedValue([
        { status: 'pending', _count: 1 },
      ] as any);

      const stats = await service.getQueueStats();
      expect(stats.created).toBe(1);

      // Get recent jobs
      prismaMock.syncJob.findMany.mockResolvedValue([
        {
          id: 1,
          jobType: JobType.SYNC_BILLS,
          status: 'pending',
        },
      ] as any);

      const jobs = await service.getRecentJobs();
      expect(jobs).toHaveLength(1);
    });
  });
});
