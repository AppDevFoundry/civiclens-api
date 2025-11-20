/**
 * Congress Sync Orchestrator Unit Tests
 *
 * Tests for the sync orchestrator that coordinates all sync operations.
 */

// @ts-nocheck - Disable TypeScript for Prisma mock circular type issues

import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create mock before jest.mock is called
const mockPrisma = mockDeep<PrismaClient>();

// Mock Prisma
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    __esModule: true,
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  };
});

// Mock sync services
const mockBillSyncService = {
  syncBills: jest.fn(),
  syncStale: jest.fn(),
};

const mockMemberSyncService = {
  syncMembers: jest.fn(),
  syncAllCurrentMembers: jest.fn(),
};

const mockHearingSyncService = {
  syncUpcoming: jest.fn(),
  syncRecent: jest.fn(),
  syncHearings: jest.fn(),
};

const mockQueueService = {
  enqueue: jest.fn(),
  getQueueStats: jest.fn(),
};

jest.mock('../../../app/services/sync/bill-sync.service', () => ({
  getBillSyncService: jest.fn(() => mockBillSyncService),
}));

jest.mock('../../../app/services/sync/member-sync.service', () => ({
  getMemberSyncService: jest.fn(() => mockMemberSyncService),
}));

jest.mock('../../../app/services/sync/hearing-sync.service', () => ({
  getHearingSyncService: jest.fn(() => mockHearingSyncService),
}));

jest.mock('../../../app/services/sync/queue.service', () => ({
  getQueueService: jest.fn(() => mockQueueService),
  JobType: {
    SYNC_BILLS: 'sync_bills',
    SYNC_MEMBER: 'sync_member',
    SYNC_HEARING: 'sync_hearing',
  },
}));

import {
  CongressSyncOrchestrator,
  SyncStrategy,
  ResourceType,
  getOrchestrator,
} from '../../../app/services/sync/orchestrator.service';

describe('CongressSyncOrchestrator', () => {
  let orchestrator: CongressSyncOrchestrator;

  const mockSyncResult = {
    recordsFetched: 100,
    recordsCreated: 10,
    recordsUpdated: 20,
    recordsUnchanged: 70,
    errors: [],
    duration: 5000,
  };

  beforeEach(() => {
    mockReset(mockPrisma);
    jest.clearAllMocks();
    // Use getOrchestrator to get singleton instance consistently
    orchestrator = getOrchestrator();

    // Setup default mocks
    mockBillSyncService.syncBills.mockResolvedValue(mockSyncResult);
    mockBillSyncService.syncStale.mockResolvedValue(mockSyncResult);
    mockMemberSyncService.syncMembers.mockResolvedValue(mockSyncResult);
    mockMemberSyncService.syncAllCurrentMembers.mockResolvedValue(mockSyncResult);
    mockHearingSyncService.syncUpcoming.mockResolvedValue(mockSyncResult);
    mockHearingSyncService.syncRecent.mockResolvedValue(mockSyncResult);
    mockHearingSyncService.syncHearings.mockResolvedValue(mockSyncResult);

    // Mock syncRun creation
    mockPrisma.syncRun.create.mockResolvedValue({ id: 1 });
    mockPrisma.syncRun.update.mockResolvedValue({});
  });

  describe('SyncStrategy enum', () => {
    it('should have correct strategy values', () => {
      expect(SyncStrategy.INCREMENTAL).toBe('incremental');
      expect(SyncStrategy.FULL).toBe('full');
      expect(SyncStrategy.STALE).toBe('stale');
      expect(SyncStrategy.PRIORITY).toBe('priority');
    });
  });

  describe('ResourceType enum', () => {
    it('should have correct resource type values', () => {
      expect(ResourceType.BILLS).toBe('bills');
      expect(ResourceType.MEMBERS).toBe('members');
      expect(ResourceType.HEARINGS).toBe('hearings');
      expect(ResourceType.COMMITTEES).toBe('committees');
      expect(ResourceType.NOMINATIONS).toBe('nominations');
    });
  });

  describe('sync', () => {
    it('should run incremental sync by default', async () => {
      const result = await orchestrator.sync();

      expect(result.strategy).toBe(SyncStrategy.INCREMENTAL);
      expect(result.resources).toContain(ResourceType.BILLS);
      expect(result.resources).toContain(ResourceType.MEMBERS);
      expect(result.resources).toContain(ResourceType.HEARINGS);
      expect(mockBillSyncService.syncBills).toHaveBeenCalled();
      expect(mockMemberSyncService.syncMembers).toHaveBeenCalled();
      expect(mockHearingSyncService.syncUpcoming).toHaveBeenCalled();
    });

    it('should run sync with specific strategy', async () => {
      const result = await orchestrator.sync({
        strategy: SyncStrategy.FULL,
        resources: [ResourceType.BILLS],
      });

      expect(result.strategy).toBe(SyncStrategy.FULL);
      expect(result.resources).toEqual([ResourceType.BILLS]);
      expect(mockBillSyncService.syncBills).toHaveBeenCalledWith(
        expect.objectContaining({
          congress: 118,
          priority: 'all',
        })
      );
    });

    it('should run stale sync', async () => {
      const result = await orchestrator.sync({
        strategy: SyncStrategy.STALE,
        resources: [ResourceType.BILLS],
      });

      expect(result.strategy).toBe(SyncStrategy.STALE);
      expect(mockBillSyncService.syncStale).toHaveBeenCalled();
    });

    it('should run priority sync', async () => {
      const result = await orchestrator.sync({
        strategy: SyncStrategy.PRIORITY,
        resources: [ResourceType.BILLS],
      });

      expect(result.strategy).toBe(SyncStrategy.PRIORITY);
      expect(mockBillSyncService.syncBills).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'active',
        })
      );
    });

    it('should calculate totals correctly', async () => {
      const result = await orchestrator.sync({
        resources: [ResourceType.BILLS],
      });

      expect(result.totalRecords.fetched).toBe(100);
      expect(result.totalRecords.created).toBe(10);
      expect(result.totalRecords.updated).toBe(20);
      expect(result.totalRecords.unchanged).toBe(70);
      expect(result.totalErrors).toBe(0);
    });

    it('should record sync duration', async () => {
      const result = await orchestrator.sync({
        resources: [ResourceType.BILLS],
      });

      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should enqueue jobs for async sync', async () => {
      const result = await orchestrator.sync({
        async: true,
        resources: [ResourceType.BILLS, ResourceType.MEMBERS],
      });

      expect(mockQueueService.enqueue).toHaveBeenCalledTimes(2);
      expect(mockBillSyncService.syncBills).not.toHaveBeenCalled();
    });

    it('should record sync start', async () => {
      await orchestrator.sync({
        resources: [ResourceType.BILLS],
      });

      expect(mockPrisma.syncRun.create).toHaveBeenCalledWith({
        data: {
          resourceType: ResourceType.BILLS,
          status: 'running',
        },
      });
    });

    it('should record sync completion', async () => {
      await orchestrator.sync({
        resources: [ResourceType.BILLS],
      });

      expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'completed',
          recordsFetched: 100,
          recordsCreated: 10,
        }),
      });
    });

    it('should record partial status when errors exist', async () => {
      mockBillSyncService.syncBills.mockResolvedValue({
        ...mockSyncResult,
        errors: ['Error 1', 'Error 2'],
      });

      await orchestrator.sync({
        resources: [ResourceType.BILLS],
      });

      expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'partial',
        }),
      });
    });

    it('should record sync error on failure', async () => {
      mockBillSyncService.syncBills.mockRejectedValue(new Error('Sync failed'));

      await expect(
        orchestrator.sync({
          resources: [ResourceType.BILLS],
        })
      ).rejects.toThrow('Sync failed');

      expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'failed',
        }),
      });
    });
  });

  describe('incremental sync', () => {
    it('should sync bills with recent priority', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.INCREMENTAL,
        resources: [ResourceType.BILLS],
      });

      expect(mockBillSyncService.syncBills).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'recent',
          limit: 200,
        })
      );
    });

    it('should sync members with current member filter', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.INCREMENTAL,
        resources: [ResourceType.MEMBERS],
      });

      expect(mockMemberSyncService.syncMembers).toHaveBeenCalledWith(
        expect.objectContaining({
          currentMember: true,
          limit: 100,
        })
      );
    });

    it('should sync upcoming hearings', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.INCREMENTAL,
        resources: [ResourceType.HEARINGS],
      });

      expect(mockHearingSyncService.syncUpcoming).toHaveBeenCalled();
    });
  });

  describe('stale sync', () => {
    it('should sync stale bills', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.STALE,
        resources: [ResourceType.BILLS],
      });

      expect(mockBillSyncService.syncStale).toHaveBeenCalledWith(48, 100);
    });

    it('should sync recent hearings', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.STALE,
        resources: [ResourceType.HEARINGS],
      });

      expect(mockHearingSyncService.syncRecent).toHaveBeenCalled();
    });
  });

  describe('priority sync', () => {
    it('should sync bills with active priority', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.PRIORITY,
        resources: [ResourceType.BILLS],
      });

      expect(mockBillSyncService.syncBills).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'active',
          limit: 250,
        })
      );
    });

    it('should sync all current members', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.PRIORITY,
        resources: [ResourceType.MEMBERS],
      });

      expect(mockMemberSyncService.syncAllCurrentMembers).toHaveBeenCalled();
    });
  });

  describe('full sync', () => {
    it('should sync bills for current congress', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.FULL,
        resources: [ResourceType.BILLS],
      });

      expect(mockBillSyncService.syncBills).toHaveBeenCalledWith(
        expect.objectContaining({
          congress: 118,
          priority: 'all',
          limit: 500,
        })
      );
    });

    it('should sync hearings for current congress', async () => {
      await orchestrator.sync({
        strategy: SyncStrategy.FULL,
        resources: [ResourceType.HEARINGS],
      });

      expect(mockHearingSyncService.syncHearings).toHaveBeenCalledWith(
        expect.objectContaining({
          congress: 118,
          limit: 500,
        })
      );
    });
  });

  describe('getSyncStats', () => {
    it('should return sync statistics', async () => {
      mockPrisma.syncRun.findMany.mockResolvedValue([
        {
          id: 1,
          resourceType: 'bills',
          status: 'completed',
          startedAt: new Date(),
          metadata: { duration: 5000 },
        },
        {
          id: 2,
          resourceType: 'bills',
          status: 'completed',
          startedAt: new Date(),
          metadata: { duration: 3000 },
        },
        {
          id: 3,
          resourceType: 'members',
          status: 'failed',
          startedAt: new Date(),
          metadata: { duration: 1000 },
        },
      ]);

      const stats = await orchestrator.getSyncStats(24);

      expect(stats.recentSyncs).toBe(3);
      expect(stats.successRate).toBeCloseTo(0.67, 1);
      expect(stats.byResource.bills.syncs).toBe(2);
      expect(stats.byResource.members.errors).toBe(1);
    });

    it('should handle no syncs', async () => {
      mockPrisma.syncRun.findMany.mockResolvedValue([]);

      const stats = await orchestrator.getSyncStats(24);

      expect(stats.recentSyncs).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });

    it('should use default hours', async () => {
      mockPrisma.syncRun.findMany.mockResolvedValue([]);

      await orchestrator.getSyncStats();

      expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith({
        where: {
          startedAt: { gte: expect.any(Date) },
        },
      });
    });
  });

  describe('getOrchestrator', () => {
    it('should return singleton instance', () => {
      const instance1 = getOrchestrator();
      const instance2 = getOrchestrator();

      expect(instance1).toBe(instance2);
    });
  });
});
