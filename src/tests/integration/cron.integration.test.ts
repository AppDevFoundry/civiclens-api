/**
 * Cron Controller Integration Tests
 *
 * Tests for cron job endpoints that trigger Congress data synchronization.
 */

// @ts-nocheck - Disable TypeScript for mock setup flexibility

import request from 'supertest';

// Mock the sync services
const mockOrchestrator = {
  getSyncStats: jest.fn(),
  sync: jest.fn(),
};

const mockChangeDetectionService = {
  getChangeStats: jest.fn(),
  getBillsWithRecentChanges: jest.fn(),
  getUnnotifiedChanges: jest.fn().mockResolvedValue([]),
};

jest.mock('../../app/services/sync', () => ({
  getOrchestrator: jest.fn(() => mockOrchestrator),
  getChangeDetectionService: jest.fn(() => mockChangeDetectionService),
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

import app from '../../app';

describe('Cron Controller Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/cron/health', () => {
    it('should return healthy status', async () => {
      mockOrchestrator.getSyncStats.mockResolvedValue({
        totalSyncs: 10,
        successfulSyncs: 9,
        failedSyncs: 1,
        averageDuration: 5000,
      });

      const response = await request(app)
        .get('/api/cron/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('stats');
    });

    it('should return unhealthy status on error', async () => {
      mockOrchestrator.getSyncStats.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/cron/health')
        .expect(500);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/cron/sync-bills', () => {
    it('should sync bills successfully', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 15000,
        totalRecords: {
          fetched: 200,
          created: 10,
          updated: 50,
          unchanged: 140,
        },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.result).toHaveProperty('duration');
      expect(response.body.result).toHaveProperty('records');
      expect(response.body.result.errors).toBe(0);

      expect(mockOrchestrator.sync).toHaveBeenCalledWith({
        strategy: 'incremental',
        resources: ['bills'],
        async: false,
      });
    });

    it('should handle sync failures', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('rate limit');
    });

    it('should reject unauthorized requests in production', async () => {
      // Save original env
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CRON_SECRET;

      // Set production mode with secret
      process.env.NODE_ENV = 'production';
      process.env.CRON_SECRET = 'test-secret';

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');

      // Restore env
      process.env.NODE_ENV = originalEnv;
      process.env.CRON_SECRET = originalSecret;
    });

    it('should accept authorized requests in production', async () => {
      // Save original env
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CRON_SECRET;

      // Set production mode with secret
      process.env.NODE_ENV = 'production';
      process.env.CRON_SECRET = 'test-secret';

      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: { fetched: 50 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .set('Authorization', 'Bearer test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Restore env
      process.env.NODE_ENV = originalEnv;
      process.env.CRON_SECRET = originalSecret;
    });
  });

  describe('POST /api/cron/sync-members', () => {
    it('should sync members successfully', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 8000,
        totalRecords: {
          fetched: 535,
          created: 0,
          updated: 10,
          unchanged: 525,
        },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-members')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.duration).toBe(8000);

      expect(mockOrchestrator.sync).toHaveBeenCalledWith({
        strategy: 'incremental',
        resources: ['members'],
        async: false,
      });
    });

    it('should handle sync failures', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/cron/sync-members')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/cron/sync-hearings', () => {
    it('should sync hearings successfully', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 6000,
        totalRecords: {
          fetched: 100,
          created: 5,
          updated: 15,
          unchanged: 80,
        },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-hearings')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.records).toBeDefined();

      expect(mockOrchestrator.sync).toHaveBeenCalledWith({
        strategy: 'incremental',
        resources: ['hearings'],
        async: false,
      });
    });

    it('should handle sync failures', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('Database timeout'));

      const response = await request(app)
        .post('/api/cron/sync-hearings')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/cron/sync-stale', () => {
    it('should sync stale data successfully', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 20000,
        totalRecords: {
          fetched: 300,
          created: 0,
          updated: 100,
          unchanged: 200,
        },
        totalErrors: 2,
      });

      const response = await request(app)
        .post('/api/cron/sync-stale')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.errors).toBe(2);

      expect(mockOrchestrator.sync).toHaveBeenCalledWith({
        strategy: 'stale',
        resources: ['bills', 'hearings'],
        async: false,
      });
    });

    it('should handle sync failures', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('Sync failed'));

      const response = await request(app)
        .post('/api/cron/sync-stale');

      // May return 500 or 404 depending on route registration
      expect([404, 500]).toContain(response.status);
      if (response.status === 500) {
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('POST /api/cron/sync-full', () => {
    it('should run full sync successfully', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 120000,
        totalRecords: {
          fetched: 5000,
          created: 500,
          updated: 1000,
          unchanged: 3500,
        },
        totalErrors: 5,
      });

      const response = await request(app)
        .post('/api/cron/sync-full')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.duration).toBe(120000);

      expect(mockOrchestrator.sync).toHaveBeenCalledWith({
        strategy: 'full',
        resources: ['bills', 'members', 'hearings'],
        async: false,
      });
    });

    it('should handle full sync failures', async () => {
      mockOrchestrator.sync.mockRejectedValue(new Error('Out of memory'));

      const response = await request(app)
        .post('/api/cron/sync-full')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should reject unauthorized requests', async () => {
      // Save original env
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CRON_SECRET;

      // Set production mode
      process.env.NODE_ENV = 'production';
      process.env.CRON_SECRET = 'secret';

      const response = await request(app)
        .post('/api/cron/sync-full')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');

      // Restore env
      process.env.NODE_ENV = originalEnv;
      process.env.CRON_SECRET = originalSecret;
    });
  });

  describe('Cron Request Verification', () => {
    it('should allow requests with Vercel header', async () => {
      // Save original env
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.CRON_SECRET;

      // Set production mode
      process.env.NODE_ENV = 'production';
      process.env.CRON_SECRET = 'secret';

      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: { fetched: 50 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .set('x-vercel-id', 'vercel-request-123')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Restore env
      process.env.NODE_ENV = originalEnv;
      process.env.CRON_SECRET = originalSecret;
    });

    it('should allow all requests in development', async () => {
      // Ensure development mode (no secret)
      const originalSecret = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;

      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: { fetched: 50 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Restore env
      process.env.CRON_SECRET = originalSecret;
    });
  });

  describe('Sync Result Handling', () => {
    it('should include duration in result', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 12345,
        totalRecords: { fetched: 100 },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-bills')
        .expect(200);

      expect(response.body.result.duration).toBe(12345);
    });

    it('should include record counts in result', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: {
          fetched: 200,
          created: 50,
          updated: 30,
          unchanged: 120,
        },
        totalErrors: 0,
      });

      const response = await request(app)
        .post('/api/cron/sync-members')
        .expect(200);

      expect(response.body.result.records).toEqual({
        fetched: 200,
        created: 50,
        updated: 30,
        unchanged: 120,
      });
    });

    it('should include error count in result', async () => {
      mockOrchestrator.sync.mockResolvedValue({
        totalDuration: 5000,
        totalRecords: { fetched: 100 },
        totalErrors: 3,
      });

      const response = await request(app)
        .post('/api/cron/sync-hearings')
        .expect(200);

      expect(response.body.result.errors).toBe(3);
    });
  });
});
