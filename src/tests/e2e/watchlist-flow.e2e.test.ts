/**
 * Watchlist Workflow E2E Tests
 *
 * Tests complete user flows for watchlist management.
 * These tests simulate real user interactions across multiple API calls,
 * using the real database to validate end-to-end behavior.
 */

import request from 'supertest';
import prisma from '../../prisma/prisma-client';
import { mockAuthHeaders } from '../fixtures';

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

describe('Watchlist Workflow E2E Tests', () => {
  // Setup test data before all tests
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `e2e-test-${timestamp}@example.com`,
        username: `e2euser${timestamp}`,
        password: 'test-hash',
      },
    });
    (global as any).testUserId = user.id;

    // Create secondary user for auth tests
    const secondaryUser = await prisma.user.create({
      data: {
        email: `e2e-test2-${timestamp}@example.com`,
        username: `e2euser2${timestamp}`,
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
        title: 'E2E Test Bill for Workflow Tests',
        originChamber: 'House',
        originChamberCode: 'H',
        updateDate: new Date(),
      },
    });
    (global as any).testBillId = bill.id;

    // Create second test bill for multi-item tests
    const bill2 = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 's',
        billNumber: Math.floor(Math.random() * 90000) + 10000,
        title: 'E2E Test Bill 2 for Workflow Tests',
        originChamber: 'Senate',
        originChamberCode: 'S',
        updateDate: new Date(),
      },
    });
    (global as any).testBillId2 = bill2.id;

    // Create test member
    const member = await prisma.member.create({
      data: {
        bioguideId: `E2E${Date.now()}`,
        fullName: 'E2E Test Member',
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
    const testBillId2 = (global as any).testBillId2;
    const testMemberId = (global as any).testMemberId;

    // Delete test data in correct order (respect foreign keys)
    await prisma.userWatchlist.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, secondaryUserId] } },
    });

    await prisma.bill.deleteMany({
      where: { id: { in: [testBillId, testBillId2] } },
    }).catch(() => {});

    await prisma.member.delete({
      where: { id: testMemberId },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  // Clean up watchlist items between test suites
  afterEach(async () => {
    const testUserId = (global as any).testUserId;
    const secondaryUserId = (global as any).secondaryUserId;

    await prisma.userWatchlist.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    });
  });

  describe('Complete Watchlist Lifecycle', () => {
    it('should allow user to add, view, update, and remove bill from watchlist', async () => {
      const testBillId = (global as any).testBillId;

      // Step 1: Check empty watchlist
      let response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(0);

      // Step 2: Add bill to watchlist
      response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          notifyOnStatus: true,
          notifyOnActions: true,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      const watchlistId = response.body.watchlist.id;

      // Step 3: View watchlist with the added bill
      response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(1);
      expect(response.body.watchlist[0].bill.id).toBe(testBillId);

      // Step 4: Update notification preferences
      response = await request(app)
        .patch(`/api/watchlist/${watchlistId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          notifyOnCosponsors: true,
          digestMode: true,
        })
        .expect(200);

      expect(response.body.watchlist.notifyOnCosponsors).toBe(true);
      expect(response.body.watchlist.digestMode).toBe(true);

      // Step 5: Remove from watchlist
      response = await request(app)
        .delete(`/api/watchlist/${watchlistId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Removed from watchlist');

      // Step 6: Verify empty watchlist
      response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(0);
    });
  });

  describe('Multi-type Watchlist', () => {
    it('should manage bills, members, and topics in watchlist', async () => {
      const testBillId = (global as any).testBillId;
      const testMemberId = (global as any).testMemberId;

      // Add bill
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(201);

      // Add member
      await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(201);

      // Add topic
      await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ keyword: 'healthcare' })
        .expect(201);

      // Verify all items in watchlist
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(3);

      // Verify types
      const types = response.body.watchlist.map((item: any) => item.type);
      expect(types).toContain('bill');
      expect(types).toContain('member');
      expect(types).toContain('topic');
    });
  });

  describe('Error Recovery', () => {
    it('should handle duplicate add attempts gracefully', async () => {
      const testBillId = (global as any).testBillId;

      // First add succeeds
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(201);

      // Second add returns 409
      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(409);

      expect(response.body.error).toBe('Bill already in watchlist');
    });

    it('should prevent unauthorized access to other user watchlist', async () => {
      const testBillId = (global as any).testBillId;
      const secondaryUserId = (global as any).secondaryUserId;

      // Create watchlist item for secondary user
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: secondaryUserId,
          billId: testBillId,
        },
      });

      // Try to delete other user's watchlist item as test user
      const response = await request(app)
        .delete(`/api/watchlist/${watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(403);

      expect(response.body.error).toBe('Unauthorized');

      // Verify item still exists
      const item = await prisma.userWatchlist.findUnique({
        where: { id: watchlist.id },
      });
      expect(item).not.toBeNull();
    });

    it('should handle non-existent bill gracefully', async () => {
      const response = await request(app)
        .post('/api/watchlist/bill/999999')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(404);

      expect(response.body.error).toBe('Bill not found');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple items being added and removed', async () => {
      const testBillId = (global as any).testBillId;
      const testBillId2 = (global as any).testBillId2;
      const testMemberId = (global as any).testMemberId;

      // Add multiple items
      const [bill1Response, bill2Response, memberResponse] = await Promise.all([
        request(app)
          .post(`/api/watchlist/bill/${testBillId}`)
          .set('Authorization', mockAuthHeaders.testUser)
          .send({}),
        request(app)
          .post(`/api/watchlist/bill/${testBillId2}`)
          .set('Authorization', mockAuthHeaders.testUser)
          .send({}),
        request(app)
          .post(`/api/watchlist/member/${testMemberId}`)
          .set('Authorization', mockAuthHeaders.testUser)
          .send({}),
      ]);

      expect(bill1Response.status).toBe(201);
      expect(bill2Response.status).toBe(201);
      expect(memberResponse.status).toBe(201);

      // Verify all added
      let response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(3);

      // Remove one item
      await request(app)
        .delete(`/api/watchlist/${bill1Response.body.watchlist.id}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      // Verify count decreased
      response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(2);
    });
  });

  describe('User Isolation', () => {
    it('should keep watchlists separate between users', async () => {
      const testBillId = (global as any).testBillId;
      const testBillId2 = (global as any).testBillId2;

      // User 1 adds bill 1
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', mockAuthHeaders.testUser)
        .send({})
        .expect(201);

      // User 2 adds bill 2
      await request(app)
        .post(`/api/watchlist/bill/${testBillId2}`)
        .set('Authorization', mockAuthHeaders.secondaryUser)
        .send({})
        .expect(201);

      // User 1 sees only their item
      let response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.totalItems).toBe(1);
      expect(response.body.watchlist[0].bill.id).toBe(testBillId);

      // User 2 sees only their item
      response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', mockAuthHeaders.secondaryUser)
        .expect(200);

      expect(response.body.totalItems).toBe(1);
      expect(response.body.watchlist[0].bill.id).toBe(testBillId2);
    });
  });
});
