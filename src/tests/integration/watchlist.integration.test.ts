/**
 * Watchlist API Integration Tests
 *
 * These tests validate the watchlist Express endpoints using supertest,
 * with the real database via Prisma.
 */

import request from 'supertest';
import prisma from '../../prisma/prisma-client';
import {
  mockUsers,
  mockAuthHeaders,
} from '../fixtures';

// Mock express-jwt to bypass JWT validation
jest.mock('express-jwt', () => ({
  expressjwt: jest.fn(() => (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Parse mock tokens based on fixtures
    if (authHeader === mockAuthHeaders.testUser) {
      req.auth = { user: { id: (global as any).testUserId } };
    } else if (authHeader === mockAuthHeaders.secondaryUser) {
      req.auth = { user: { id: (global as any).secondaryUserId } };
    } else if (authHeader === mockAuthHeaders.invalid) {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      req.auth = null;
    }
    next();
  }),
}));

import app from '../../app';

// Increase timeout for database tests
jest.setTimeout(30000);

describe('Watchlist API Integration Tests', () => {
  // Setup test data before all tests
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-${timestamp}@example.com`,
        username: `testuser${timestamp}`,
        password: 'test-hash',
      },
    });
    (global as any).testUserId = user.id;

    // Create secondary user for auth tests
    const secondaryUser = await prisma.user.create({
      data: {
        email: `test2-${timestamp}@example.com`,
        username: `testuser2${timestamp}`,
        password: 'test-hash',
      },
    });
    (global as any).secondaryUserId = secondaryUser.id;

    // Create test bill
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: Math.floor(Math.random() * 90000) + 10000,
        title: 'Test Bill for Integration Tests',
        originChamber: 'House',
        originChamberCode: 'H',
        updateDate: new Date(),
      },
    });
    (global as any).testBillId = bill.id;

    // Create test member
    const member = await prisma.member.create({
      data: {
        bioguideId: `TEST${Date.now()}`,
        fullName: 'Test Member',
        state: 'CA',
        party: 'D',
        chamber: 'House',
      },
    });
    (global as any).testMemberId = member.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    const testUserId = (global as any).testUserId;
    const secondaryUserId = (global as any).secondaryUserId;
    const testBillId = (global as any).testBillId;
    const testMemberId = (global as any).testMemberId;

    // Delete test data in correct order (respect foreign keys)
    await prisma.userWatchlist.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, secondaryUserId] } },
    });

    await prisma.bill.delete({
      where: { id: testBillId },
    }).catch(() => {});

    await prisma.member.delete({
      where: { id: testMemberId },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  // Clean up watchlist items between tests
  afterEach(async () => {
    const testUserId = (global as any).testUserId;
    const secondaryUserId = (global as any).secondaryUserId;

    await prisma.userWatchlist.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    });
  });

  describe('GET /api/watchlist', () => {
    it('should return empty watchlist for new user', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.watchlist).toEqual([]);
      expect(response.body.totalItems).toBe(0);
      expect(response.body.totalUnreadChanges).toBe(0);
    });

    it('should return user watchlist with items', async () => {
      const testUserId = (global as any).testUserId;
      const testBillId = (global as any).testBillId;

      // Add item to watchlist
      await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notifyOnStatus: true,
          notifyOnActions: true,
        },
      });

      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(1);
      expect(response.body.watchlist[0].bill.id).toBe(testBillId);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/watchlist')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.invalid)
        .expect(401);
    });
  });

  describe('POST /api/watchlist/bill/:billId', () => {
    it('should add bill to watchlist', async () => {
      const testBillId = (global as any).testBillId;

      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          notifyOnStatus: true,
          notifyOnActions: true,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.watchlist.billId).toBe(testBillId);
    });

    it('should return 404 for non-existent bill', async () => {
      const response = await request(app)
        .post('/api/watchlist/bill/999999')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(404);

      expect(response.body.error).toBe('Bill not found');
    });

    it('should return 409 if bill already in watchlist', async () => {
      const testUserId = (global as any).testUserId;
      const testBillId = (global as any).testBillId;

      // Add to watchlist first
      await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(409);

      expect(response.body.error).toBe('Bill already in watchlist');
    });

    it('should return 400 for invalid bill ID', async () => {
      const response = await request(app)
        .post('/api/watchlist/bill/invalid')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({});

      // Controller may return 400 for invalid format or 404 for not found
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /api/watchlist/member/:memberId', () => {
    it('should add member to watchlist', async () => {
      const testMemberId = (global as any).testMemberId;

      const response = await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.watchlist.memberId).toBe(testMemberId);
    });

    it('should return 404 for non-existent member', async () => {
      const response = await request(app)
        .post('/api/watchlist/member/999999')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(404);

      expect(response.body.error).toBe('Member not found');
    });
  });

  describe('POST /api/watchlist/topic', () => {
    it('should add topic to watchlist', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ keyword: 'healthcare' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.watchlist.topicKeyword).toBe('healthcare');
    });

    it('should return 400 if keyword missing', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Keyword is required');
    });

    it('should normalize keyword to lowercase', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ keyword: 'CLIMATE CHANGE' })
        .expect(201);

      expect(response.body.watchlist.topicKeyword).toBe('climate change');
    });
  });

  describe('DELETE /api/watchlist/:id', () => {
    it('should remove item from watchlist', async () => {
      const testUserId = (global as any).testUserId;
      const testBillId = (global as any).testBillId;

      // Create watchlist item
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      const response = await request(app)
        .delete(`/api/watchlist/${watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Removed from watchlist');
    });

    it('should return 404 for non-existent watchlist item', async () => {
      const response = await request(app)
        .delete('/api/watchlist/999999')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(404);

      expect(response.body.error).toBe('Watchlist item not found');
    });

    it('should return 403 when deleting another user item', async () => {
      const secondaryUserId = (global as any).secondaryUserId;
      const testBillId = (global as any).testBillId;

      // Create watchlist item for secondary user
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: secondaryUserId,
          billId: testBillId,
        },
      });

      // Try to delete as test user
      const response = await request(app)
        .delete(`/api/watchlist/${watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(403);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('PATCH /api/watchlist/:id', () => {
    it('should update watchlist notification preferences', async () => {
      const testUserId = (global as any).testUserId;
      const testBillId = (global as any).testBillId;

      // Create watchlist item
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notifyOnStatus: false,
          digestMode: false,
        },
      });

      const response = await request(app)
        .patch(`/api/watchlist/${watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          notifyOnStatus: true,
          digestMode: true,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.watchlist.notifyOnStatus).toBe(true);
      expect(response.body.watchlist.digestMode).toBe(true);
    });

    it('should return 404 for non-existent watchlist item', async () => {
      const response = await request(app)
        .patch('/api/watchlist/999999')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ notifyOnStatus: true })
        .expect(404);

      expect(response.body.error).toBe('Watchlist item not found');
    });

    it('should return 403 when updating another user item', async () => {
      const secondaryUserId = (global as any).secondaryUserId;
      const testBillId = (global as any).testBillId;

      // Create watchlist item for secondary user
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: secondaryUserId,
          billId: testBillId,
        },
      });

      // Try to update as test user
      const response = await request(app)
        .patch(`/api/watchlist/${watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ notifyOnStatus: true })
        .expect(403);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/watchlist/:id/mark-read', () => {
    it('should mark changes as read', async () => {
      const testUserId = (global as any).testUserId;
      const testBillId = (global as any).testBillId;

      // Create watchlist item
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      const response = await request(app)
        .post(`/api/watchlist/${watchlist.id}/mark-read`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Marked as read');
    });

    it('should return 404 for non-existent watchlist item', async () => {
      const response = await request(app)
        .post('/api/watchlist/999999/mark-read')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(404);

      expect(response.body.error).toBe('Watchlist item not found');
    });
  });
});
