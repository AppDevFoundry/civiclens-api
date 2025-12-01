/**
 * Admin Controller Integration Tests
 *
 * Tests for admin dashboard and sync management endpoints.
 */

// @ts-nocheck - Disable TypeScript for mock setup flexibility

import request from 'supertest';

// Mock the sync services
const mockOrchestrator = {
  getSyncStats: jest.fn(),
  sync: jest.fn(),
};

const mockQueueService = {
  getQueueStats: jest.fn(),
  getRecentJobs: jest.fn(),
};

const mockChangeDetectionService = {
  getChangeStats: jest.fn(),
  getBillsWithRecentChanges: jest.fn(),
};

const mockErrorHandler = {
  getErrorStats: jest.fn(),
  getRecentErrors: jest.fn(),
  getMetrics: jest.fn(),
  shouldAlert: jest.fn(),
};

jest.mock('../../app/services/sync', () => ({
  getOrchestrator: jest.fn(() => mockOrchestrator),
  getQueueService: jest.fn(() => mockQueueService),
  getChangeDetectionService: jest.fn(() => mockChangeDetectionService),
  getErrorHandler: jest.fn(() => mockErrorHandler),
  SyncStrategy: {
    INCREMENTAL: 'incremental',
    STALE: 'stale',
    PRIORITY: 'priority',
    FULL: 'full',
  },
  ResourceType: {
    BILLS: 'bills',
    MEMBERS: 'members',
    HEARINGS: 'hearings',
  },
}));

// Mock Prisma
const mockPrisma = {
  bill: { count: jest.fn() },
  member: { count: jest.fn() },
  hearing: { count: jest.fn() },
  syncRun: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  syncJob: { findMany: jest.fn() },
  syncError: { update: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import app from '../../app';

describe('Admin Controller Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/dashboard', () => {
    it('should return dashboard data', async () => {
      // Setup mocks
      mockOrchestrator.getSyncStats.mockResolvedValue({
        totalSyncs: 10,
        successfulSyncs: 9,
        failedSyncs: 1,
      });
      mockQueueService.getQueueStats.mockResolvedValue({
        pending: 5,
        processing: 2,
        completed: 100,
      });
      mockChangeDetectionService.getChangeStats.mockResolvedValue({
        totalChanges: 50,
        byType: { title: 10, action: 30, law: 10 },
      });
      mockPrisma.bill.count.mockResolvedValue(1000);
      mockPrisma.member.count.mockResolvedValue(535);
      mockPrisma.hearing.count.mockResolvedValue(200);
      mockPrisma.syncRun.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/admin/dashboard')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('sync');
      expect(response.body).toHaveProperty('queue');
      expect(response.body).toHaveProperty('changes');
      expect(response.body).toHaveProperty('coverage');
    });

    it('should handle errors gracefully', async () => {
      mockOrchestrator.getSyncStats.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/admin/dashboard')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/admin/sync-status', () => {
    it('should return sync status', async () => {
      mockOrchestrator.getSyncStats.mockResolvedValue({
        totalSyncs: 5,
        averageDuration: 1000,
      });
      mockPrisma.syncRun.groupBy.mockResolvedValue([
        { resourceType: 'bills', _max: { startedAt: new Date() } },
      ]);

      const response = await request(app)
        .get('/api/admin/sync-status')
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('latestSyncs');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respect hours query parameter', async () => {
      mockOrchestrator.getSyncStats.mockResolvedValue({});
      mockPrisma.syncRun.groupBy.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/sync-status?hours=48')
        .expect(200);

      expect(mockOrchestrator.getSyncStats).toHaveBeenCalledWith(48);
    });
  });

  describe('GET /api/admin/coverage', () => {
    it('should return coverage metrics', async () => {
      mockPrisma.bill.count.mockResolvedValue(500);
      mockPrisma.member.count.mockResolvedValue(100);
      mockPrisma.hearing.count.mockResolvedValue(50);
      mockPrisma.$queryRaw.mockResolvedValue([
        { month: '2024-01', count: BigInt(100) },
      ]);

      // Mock groupBy for bills
      const mockGroupBy = jest.fn()
        .mockResolvedValueOnce([{ congress: 118, _count: 300 }]) // billsByCongress
        .mockResolvedValueOnce([{ billType: 'hr', _count: 200 }]) // billsByType
        .mockResolvedValueOnce([{ chamber: 'House', party: 'D', _count: 50 }]); // membersByParty

      // Mock findFirst for date range
      const mockFindFirst = jest.fn()
        .mockResolvedValueOnce({ introducedDate: new Date('2023-01-01') }) // oldest
        .mockResolvedValueOnce({ introducedDate: new Date('2024-01-01') }); // newest

      mockPrisma.bill.groupBy = mockGroupBy;
      mockPrisma.bill.findFirst = mockFindFirst;
      mockPrisma.member.groupBy = mockGroupBy;

      const response = await request(app)
        .get('/api/admin/coverage')
        .expect(200);

      expect(response.body).toHaveProperty('bills');
      expect(response.body).toHaveProperty('members');
      expect(response.body).toHaveProperty('hearings');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/admin/errors', () => {
    it('should return error logs', async () => {
      // The first /admin/errors route returns failedSyncs and failedJobs
      mockPrisma.syncRun.findMany.mockResolvedValue([
        { id: 1, status: 'failed', startedAt: new Date() },
      ]);
      mockPrisma.syncJob.findMany.mockResolvedValue([
        { id: 1, status: 'failed', createdAt: new Date() },
      ]);

      const response = await request(app)
        .get('/api/admin/errors')
        .expect(200);

      expect(response.body).toHaveProperty('failedSyncs');
      expect(response.body).toHaveProperty('failedJobs');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respect limit query parameter', async () => {
      mockPrisma.syncRun.findMany.mockResolvedValue([]);
      mockPrisma.syncJob.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/errors?limit=25')
        .expect(200);

      expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        })
      );
    });
  });

  describe('POST /api/admin/trigger-sync', () => {
    it('should trigger sync with default strategy', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: { fetched: 100, created: 10, updated: 20 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/admin/trigger-sync')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('result');
      expect(mockOrchestrator.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'incremental',
        })
      );
    });

    it('should trigger sync with specific strategy', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 10000,
        totalRecords: { fetched: 500 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/admin/trigger-sync')
        .send({ strategy: 'full' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockOrchestrator.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'full',
        })
      );
    });

    it('should reject invalid strategy', async () => {
      const response = await request(app)
        .post('/api/admin/trigger-sync')
        .send({ strategy: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('Invalid strategy');
    });

    it('should handle sync errors', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('Sync failed'));

      const response = await request(app)
        .post('/api/admin/trigger-sync')
        .send({})
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/admin/queue', () => {
    it('should return queue status', async () => {
      mockQueueService.getQueueStats.mockResolvedValue({
        pending: 10,
        processing: 2,
        completed: 500,
        failed: 5,
      });
      mockQueueService.getRecentJobs.mockResolvedValue([
        { id: 1, status: 'completed', type: 'bills' },
      ]);

      const response = await request(app)
        .get('/api/admin/queue')
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('recentJobs');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/admin/changes', () => {
    it('should return changes overview', async () => {
      mockChangeDetectionService.getChangeStats.mockResolvedValue({
        totalChanges: 100,
        byType: { title: 20, action: 60, law: 20 },
        unnotified: 15,
      });
      mockChangeDetectionService.getBillsWithRecentChanges.mockResolvedValue([
        { bill: { id: 1, title: 'Test Bill' }, changeCount: 3 },
      ]);

      const response = await request(app)
        .get('/api/admin/changes')
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('recentChanges');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respect hours query parameter', async () => {
      mockChangeDetectionService.getChangeStats.mockResolvedValue({});
      mockChangeDetectionService.getBillsWithRecentChanges.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/changes?hours=12')
        .expect(200);

      expect(mockChangeDetectionService.getBillsWithRecentChanges).toHaveBeenCalledWith(12, 50);
    });
  });

  describe('GET /api/admin/errors/alerts', () => {
    it('should check alert status', async () => {
      mockErrorHandler.shouldAlert.mockResolvedValue(false);
      mockErrorHandler.getErrorStats.mockResolvedValue({
        total: 2,
        critical: 0,
      });

      const response = await request(app)
        .get('/api/admin/errors/alerts')
        .expect(200);

      expect(response.body).toHaveProperty('shouldAlert');
      expect(response.body).toHaveProperty('stats');
      expect(response.body.shouldAlert).toBe(false);
    });

    it('should indicate when alert is needed', async () => {
      mockErrorHandler.shouldAlert.mockResolvedValue(true);
      mockErrorHandler.getErrorStats.mockResolvedValue({
        total: 50,
        critical: 5,
      });

      const response = await request(app)
        .get('/api/admin/errors/alerts')
        .expect(200);

      expect(response.body.shouldAlert).toBe(true);
    });
  });

  describe('POST /api/admin/errors/:id/resolve', () => {
    it('should resolve an error', async () => {
      mockPrisma.syncError.update.mockResolvedValue({
        id: 1,
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: 'admin',
        notes: 'Fixed the issue',
      });

      const response = await request(app)
        .post('/api/admin/errors/1/resolve')
        .send({ notes: 'Fixed the issue', resolvedBy: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.error.resolved).toBe(true);
    });

    it('should handle resolve errors', async () => {
      mockPrisma.syncError.update.mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .post('/api/admin/errors/999/resolve')
        .send({})
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});
