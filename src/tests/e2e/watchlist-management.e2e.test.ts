/**
 * E2E Test: Watchlist Management Workflow
 *
 * Tests the complete watchlist management user journey:
 * 1. User creates watchlists for bills and members
 * 2. User updates watchlist preferences
 * 3. User views their watchlists
 * 4. User removes items from watchlist
 * 5. Watchlist triggers notifications on changes
 */

import request from 'supertest';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import devAuth from '../../app/utils/dev-auth';

describe('E2E: Watchlist Management', () => {
  let testUserId: number;
  let authToken: string;
  let testBillId: number;
  let testMemberId: number;

  beforeAll(async () => {
    // Create test user
    const user = await devAuth.getOrCreateTestUser();
    testUserId = user.id;
    authToken = `Token ${user.token}`;

    // Create test bill
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: 8888,
        title: 'Watchlist Test Bill',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {}
      }
    });
    testBillId = bill.id;

    // Create test member
    const member = await prisma.member.create({
      data: {
        bioguideId: 'T000001',
        firstName: 'Test',
        lastName: 'Member',
        fullName: 'Test Member',
        state: 'CA',
        party: 'D',
        chamber: 'House',
        isCurrent: true
      }
    });
    testMemberId = member.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.userWatchlist.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.bill.delete({ where: { id: testBillId } }).catch(() => {});
    await prisma.member.delete({ where: { id: testMemberId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up watchlist items after each test
    await prisma.userWatchlist.deleteMany({
      where: { userId: testUserId }
    });
  });

  describe('Creating Watchlists', () => {
    it('should allow user to add a bill to watchlist', async () => {
      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: true,
          notifyOnActions: true,
          notifyOnCosponsors: false
        })
        .expect(201);

      expect(response.body.watchlist).toMatchObject({
        userId: testUserId,
        billId: testBillId,
        notifyOnStatus: true,
        notifyOnActions: true,
        notifyOnCosponsors: false
      });
      expect(response.body.watchlist).toHaveProperty('id');
      expect(response.body.watchlist).toHaveProperty('createdAt');
    });

    it('should allow user to add a member to watchlist', async () => {
      const response = await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: true
        })
        .expect(201);

      expect(response.body.watchlist).toMatchObject({
        userId: testUserId,
        memberId: testMemberId,
        notifyOnStatus: true
      });
    });

    it('should allow user to add a topic keyword to watchlist', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', authToken)
        .send({
          keyword: 'climate change',
          notifyOnStatus: true,
          notifyOnActions: true
        })
        .expect(201);

      expect(response.body.watchlist).toMatchObject({
        userId: testUserId,
        topicKeyword: 'climate change',
        notifyOnStatus: true
      });
    });

    it('should prevent duplicate watchlist entries', async () => {
      // First addition should succeed
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: true
        })
        .expect(201);

      // Second addition of same bill should fail
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: true
        })
        .expect(409);
    });

    it('should require authentication', async () => {
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .send({
          notifyOnStatus: true
        })
        .expect(401);
    });
  });

  describe('Viewing Watchlists', () => {
    beforeEach(async () => {
      // Clean up any existing watchlist items first
      await prisma.userWatchlist.deleteMany({
        where: { userId: testUserId }
      });

      // Create some watchlist items
      await prisma.userWatchlist.createMany({
        data: [
          {
            userId: testUserId,
            billId: testBillId,
            notifyOnStatus: true,
            notifyOnActions: true
          },
          {
            userId: testUserId,
            memberId: testMemberId,
            notifyOnStatus: true
          },
          {
            userId: testUserId,
            topicKeyword: 'healthcare',
            notifyOnStatus: true
          }
        ]
      });
    });

    it('should list all watchlist items for user', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.watchlist).toBeDefined();
      expect(response.body.watchlist.length).toBe(3);
    });

    it('should filter watchlist by type (bills)', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .query({ type: 'bill' })
        .expect(200);

      expect(response.body.watchlist.length).toBe(1);
      expect(response.body.watchlist[0].billId).toBe(testBillId);
    });

    it('should filter watchlist by type (members)', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .query({ type: 'member' })
        .expect(200);

      expect(response.body.watchlist.length).toBe(1);
      expect(response.body.watchlist[0].memberId).toBe(testMemberId);
    });

    it('should include related bill/member data', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .expect(200);

      const billWatchlist = response.body.watchlist.find((w: any) => w.billId);
      expect(billWatchlist.bill).toBeDefined();
      expect(billWatchlist.bill.title).toBe('Watchlist Test Bill');

      const memberWatchlist = response.body.watchlist.find((w: any) => w.memberId);
      expect(memberWatchlist.member).toBeDefined();
      expect(memberWatchlist.member.fullName).toBe('Test Member');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .query({ limit: 2, offset: 0 })
        .expect(200);

      expect(response.body.watchlist.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(3);
    });
  });

  describe('Updating Watchlists', () => {
    let watchlistId: number;

    beforeEach(async () => {
      // Create a watchlist item
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notifyOnStatus: true,
          notifyOnActions: false,
          notifyOnCosponsors: false
        }
      });
      watchlistId = watchlist.id;
    });

    it('should allow updating notification preferences', async () => {
      const response = await request(app)
        .put(`/api/watchlist/${watchlistId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: false,
          notifyOnActions: true,
          notifyOnCosponsors: true
        })
        .expect(200);

      expect(response.body.watchlist).toMatchObject({
        id: watchlistId,
        notifyOnStatus: false,
        notifyOnActions: true,
        notifyOnCosponsors: true
      });
    });

    it('should allow toggling digest mode', async () => {
      const response = await request(app)
        .put(`/api/watchlist/${watchlistId}`)
        .set('Authorization', authToken)
        .send({
          digestMode: true
        })
        .expect(200);

      expect(response.body.watchlist.digestMode).toBe(true);
    });

    it('should prevent updating another user\'s watchlist', async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          username: `otheruser_${Date.now()}`,
          email: `other_${Date.now()}@example.com`,
          password: 'password'
        }
      });

      // Create watchlist for other user
      const otherWatchlist = await prisma.userWatchlist.create({
        data: {
          userId: otherUser.id,
          billId: testBillId,
          notifyOnStatus: true
        }
      });

      // Try to update with first user's token
      await request(app)
        .put(`/api/watchlist/${otherWatchlist.id}`)
        .set('Authorization', authToken)
        .send({ notifyOnStatus: false })
        .expect(403); // Should be forbidden (unauthorized)

      // Cleanup
      await prisma.userWatchlist.delete({ where: { id: otherWatchlist.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('Removing from Watchlist', () => {
    let watchlistId: number;

    beforeEach(async () => {
      const watchlist = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notifyOnStatus: true
        }
      });
      watchlistId = watchlist.id;
    });

    it('should allow removing item from watchlist', async () => {
      await request(app)
        .delete(`/api/watchlist/${watchlistId}`)
        .set('Authorization', authToken)
        .expect(200);

      // Verify it's deleted
      const deleted = await prisma.userWatchlist.findUnique({
        where: { id: watchlistId }
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent watchlist', async () => {
      await request(app)
        .delete('/api/watchlist/999999')
        .set('Authorization', authToken)
        .expect(404);
    });
  });

  describe('Watchlist Statistics', () => {
    beforeEach(async () => {
      // Create multiple watchlist items
      await prisma.userWatchlist.createMany({
        data: [
          { userId: testUserId, billId: testBillId, notifyOnStatus: true },
          { userId: testUserId, memberId: testMemberId, notifyOnStatus: true },
          { userId: testUserId, topicKeyword: 'education', notifyOnStatus: true },
          { userId: testUserId, topicKeyword: 'defense', notifyOnStatus: true }
        ]
      });
    });

    it('should return watchlist statistics', async () => {
      const response = await request(app)
        .get('/api/watchlist/stats')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.totalWatchlistItems).toBe(4);
      expect(response.body.stats.billsWatched).toBe(1);
      expect(response.body.stats.membersWatched).toBe(1);
      expect(response.body.stats.topicsWatched).toBe(2);
    });
  });

  describe('Bulk Operations', () => {
    it('should allow bulk adding multiple bills to watchlist', async () => {
      // Create additional bills with unique numbers
      const timestamp = Date.now();
      const bill2 = await prisma.bill.create({
        data: {
          congress: 118,
          billType: 'hr',
          billNumber: 80000 + (timestamp % 1000),
          title: 'Second Test Bill',
          latestActionDate: new Date(),
          latestActionText: 'Introduced',
          apiResponseData: {}
        }
      });

      const bill3 = await prisma.bill.create({
        data: {
          congress: 118,
          billType: 's',
          billNumber: 80000 + (timestamp % 1000) + 1,
          title: 'Third Test Bill',
          latestActionDate: new Date(),
          latestActionText: 'Introduced',
          apiResponseData: {}
        }
      });

      const response = await request(app)
        .post('/api/watchlist/bulk')
        .set('Authorization', authToken)
        .send({
          billIds: [testBillId, bill2.id, bill3.id],
          notifyOnStatus: true
        })
        .expect(201);

      expect(response.body.added).toBe(3);
      expect(response.body.watchlists.length).toBe(3);

      // Cleanup
      await prisma.bill.delete({ where: { id: bill2.id } });
      await prisma.bill.delete({ where: { id: bill3.id } });
    });

    it('should allow bulk removing watchlist items', async () => {
      // Create watchlist items
      const w1 = await prisma.userWatchlist.create({
        data: { userId: testUserId, billId: testBillId, notifyOnStatus: true }
      });

      const w2 = await prisma.userWatchlist.create({
        data: { userId: testUserId, memberId: testMemberId, notifyOnStatus: true }
      });

      const response = await request(app)
        .post('/api/watchlist/bulk-delete')
        .set('Authorization', authToken)
        .send({
          watchlistIds: [w1.id, w2.id]
        })
        .expect(200);

      expect(response.body.deleted).toBe(2);

      // Verify deletion
      const remaining = await prisma.userWatchlist.count({
        where: { userId: testUserId }
      });
      expect(remaining).toBe(0);
    });
  });
});
