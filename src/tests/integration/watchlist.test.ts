/**
 * Watchlist API Integration Tests
 *
 * These tests validate the watchlist endpoints using supertest with real database operations.
 */

import request from 'supertest';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import devAuth from '../../app/utils/dev-auth';

describe('Watchlist API Integration Tests', () => {
  let testUserId: number;
  let authToken: string;
  let testBillId: number;
  let testMemberId: number;

  // Setup: Create test user and test data
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
        billNumber: 1000,
        title: 'Test Bill for Watchlist',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {},
      },
    });
    testBillId = bill.id;

    // Create test member
    const member = await prisma.member.create({
      data: {
        bioguideId: 'T000001',
        fullName: 'Test Member',
        firstName: 'Test',
        lastName: 'Member',
        state: 'CA',
        party: 'D',
        chamber: 'House',
        apiResponseData: {},
      },
    });
    testMemberId = member.id;
  });

  // Cleanup: Remove test data after each test
  afterEach(async () => {
    await prisma.userWatchlist.deleteMany({
      where: { userId: testUserId },
    });
  });

  // Final cleanup
  afterAll(async () => {
    await prisma.billChangeLog.deleteMany({
      where: { billId: testBillId },
    });
    await prisma.bill.deleteMany({
      where: { id: testBillId },
    });
    await prisma.member.deleteMany({
      where: { id: testMemberId },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/watchlist', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/api/watchlist')
        .expect(401);
    });

    it('should return empty watchlist for new user', async () => {
      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('watchlist');
      expect(response.body).toHaveProperty('totalItems');
      expect(response.body).toHaveProperty('totalUnreadChanges');
      expect(response.body.watchlist).toEqual([]);
      expect(response.body.totalItems).toBe(0);
      expect(response.body.totalUnreadChanges).toBe(0);
    });

    it('should return watchlist items with bills and members', async () => {
      // Add bill to watchlist
      await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      // Add member to watchlist
      await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          memberId: testMemberId,
        },
      });

      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.watchlist).toHaveLength(2);
      expect(response.body.totalItems).toBe(2);

      // Check bill watchlist item structure
      const billItem = response.body.watchlist.find((item: any) => item.type === 'bill');
      expect(billItem).toBeDefined();
      expect(billItem.bill).toBeDefined();
      expect(billItem.bill.id).toBe(testBillId);
      expect(billItem.notificationPreferences).toBeDefined();

      // Check member watchlist item structure
      const memberItem = response.body.watchlist.find((item: any) => item.type === 'member');
      expect(memberItem).toBeDefined();
      expect(memberItem.member).toBeDefined();
      expect(memberItem.member.id).toBe(testMemberId);
    });

    it('should include unread change counts', async () => {
      // Add bill to watchlist
      await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      // Create unread changes
      await prisma.billChangeLog.create({
        data: {
          billId: testBillId,
          changeType: 'status',
          previousValue: 'introduced',
          newValue: 'passed',
          notified: false,
        },
      });

      const response = await request(app)
        .get('/api/watchlist')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.watchlist).toHaveLength(1);
      expect(response.body.watchlist[0].unreadChanges).toBe(1);
      expect(response.body.totalUnreadChanges).toBe(1);
    });
  });

  describe('POST /api/watchlist/bill/:billId', () => {
    it('should require authentication', async () => {
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .expect(401);
    });

    it('should add bill to watchlist successfully', async () => {
      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: true,
          notifyOnActions: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('watchlist');
      expect(response.body.watchlist.billId).toBe(testBillId);
      expect(response.body.watchlist.userId).toBe(testUserId);
      expect(response.body.watchlist.notifyOnStatus).toBe(true);
      expect(response.body.watchlist.notifyOnActions).toBe(true);

      // Verify in database
      const watchlistItem = await prisma.userWatchlist.findUnique({
        where: {
          userId_billId: {
            userId: testUserId,
            billId: testBillId,
          },
        },
      });
      expect(watchlistItem).toBeDefined();
    });

    it('should return 400 for invalid bill ID', async () => {
      await request(app)
        .post('/api/watchlist/bill/invalid')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 404 for non-existent bill', async () => {
      await request(app)
        .post('/api/watchlist/bill/999999')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 409 if bill already in watchlist', async () => {
      // Add bill first time
      await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .expect(201);

      // Try to add again
      const response = await request(app)
        .post(`/api/watchlist/bill/${testBillId}`)
        .set('Authorization', authToken)
        .expect(409);

      expect(response.body.error).toContain('already in watchlist');
    });
  });

  describe('POST /api/watchlist/member/:memberId', () => {
    it('should require authentication', async () => {
      await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .expect(401);
    });

    it('should add member to watchlist successfully', async () => {
      const response = await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', authToken)
        .send({
          notifyOnActions: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('watchlist');
      expect(response.body.watchlist.memberId).toBe(testMemberId);
      expect(response.body.watchlist.userId).toBe(testUserId);

      // Verify in database
      const watchlistItem = await prisma.userWatchlist.findUnique({
        where: {
          userId_memberId: {
            userId: testUserId,
            memberId: testMemberId,
          },
        },
      });
      expect(watchlistItem).toBeDefined();
    });

    it('should return 400 for invalid member ID', async () => {
      await request(app)
        .post('/api/watchlist/member/invalid')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 404 for non-existent member', async () => {
      await request(app)
        .post('/api/watchlist/member/999999')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 409 if member already in watchlist', async () => {
      // Add member first time
      await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', authToken)
        .expect(201);

      // Try to add again
      const response = await request(app)
        .post(`/api/watchlist/member/${testMemberId}`)
        .set('Authorization', authToken)
        .expect(409);

      expect(response.body.error).toContain('already in watchlist');
    });
  });

  describe('POST /api/watchlist/topic', () => {
    it('should require authentication', async () => {
      await request(app)
        .post('/api/watchlist/topic')
        .send({ keyword: 'healthcare' })
        .expect(401);
    });

    it('should add topic keyword to watchlist successfully', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', authToken)
        .send({
          keyword: 'Healthcare',
          notifyOnStatus: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('watchlist');
      expect(response.body.watchlist.topicKeyword).toBe('healthcare'); // lowercase
      expect(response.body.watchlist.userId).toBe(testUserId);

      // Verify in database
      const watchlistItem = await prisma.userWatchlist.findFirst({
        where: {
          userId: testUserId,
          topicKeyword: 'healthcare',
        },
      });
      expect(watchlistItem).toBeDefined();
    });

    it('should return 400 if keyword is missing', async () => {
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', authToken)
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Keyword is required');
    });

    it('should return 409 if topic already in watchlist', async () => {
      const keyword = 'climate';

      // Add topic first time
      await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', authToken)
        .send({ keyword })
        .expect(201);

      // Try to add again
      const response = await request(app)
        .post('/api/watchlist/topic')
        .set('Authorization', authToken)
        .send({ keyword })
        .expect(409);

      expect(response.body.error).toContain('already in watchlist');
    });
  });

  describe('DELETE /api/watchlist/:id', () => {
    it('should require authentication', async () => {
      await request(app)
        .delete('/api/watchlist/1')
        .expect(401);
    });

    it('should delete watchlist item successfully', async () => {
      // Create watchlist item
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      const response = await request(app)
        .delete(`/api/watchlist/${watchlistItem.id}`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('Removed from watchlist');

      // Verify deletion in database
      const deleted = await prisma.userWatchlist.findUnique({
        where: { id: watchlistItem.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return 400 for invalid watchlist ID', async () => {
      await request(app)
        .delete('/api/watchlist/invalid')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 404 for non-existent watchlist item', async () => {
      await request(app)
        .delete('/api/watchlist/999999')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 403 when deleting another user\'s watchlist item', async () => {
      // Create another user with unique email
      const timestamp = Date.now();
      const otherUser = await prisma.user.create({
        data: {
          username: `otheruser_${timestamp}`,
          email: `other_${timestamp}@example.com`,
          password: 'password',
        },
      });

      // Create watchlist item for other user
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: otherUser.id,
          billId: testBillId,
        },
      });

      // Try to delete with test user's token
      await request(app)
        .delete(`/api/watchlist/${watchlistItem.id}`)
        .set('Authorization', authToken)
        .expect(403);

      // Cleanup
      await prisma.userWatchlist.delete({ where: { id: watchlistItem.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('PATCH /api/watchlist/:id', () => {
    it('should require authentication', async () => {
      await request(app)
        .patch('/api/watchlist/1')
        .send({ notifyOnStatus: false })
        .expect(401);
    });

    it('should update watchlist notification preferences successfully', async () => {
      // Create watchlist item with default preferences
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notifyOnStatus: true,
          notifyOnActions: true,
          notifyOnCosponsors: false,
          digestMode: false,
        },
      });

      const response = await request(app)
        .patch(`/api/watchlist/${watchlistItem.id}`)
        .set('Authorization', authToken)
        .send({
          notifyOnStatus: false,
          notifyOnCosponsors: true,
          digestMode: true,
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('watchlist');
      expect(response.body.watchlist.notifyOnStatus).toBe(false);
      expect(response.body.watchlist.notifyOnActions).toBe(true); // unchanged
      expect(response.body.watchlist.notifyOnCosponsors).toBe(true);
      expect(response.body.watchlist.digestMode).toBe(true);

      // Verify in database
      const updated = await prisma.userWatchlist.findUnique({
        where: { id: watchlistItem.id },
      });
      expect(updated?.notifyOnStatus).toBe(false);
      expect(updated?.notifyOnCosponsors).toBe(true);
    });

    it('should return 400 for invalid watchlist ID', async () => {
      await request(app)
        .patch('/api/watchlist/invalid')
        .set('Authorization', authToken)
        .send({ notifyOnStatus: false })
        .expect(400);
    });

    it('should return 404 for non-existent watchlist item', async () => {
      await request(app)
        .patch('/api/watchlist/999999')
        .set('Authorization', authToken)
        .send({ notifyOnStatus: false })
        .expect(404);
    });

    it('should return 403 when updating another user\'s watchlist item', async () => {
      // Create another user with unique email
      const timestamp = Date.now();
      const otherUser = await prisma.user.create({
        data: {
          username: `otheruser2_${timestamp}`,
          email: `other2_${timestamp}@example.com`,
          password: 'password',
        },
      });

      // Create watchlist item for other user
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: otherUser.id,
          billId: testBillId,
        },
      });

      // Try to update with test user's token
      await request(app)
        .patch(`/api/watchlist/${watchlistItem.id}`)
        .set('Authorization', authToken)
        .send({ notifyOnStatus: false })
        .expect(403);

      // Cleanup
      await prisma.userWatchlist.delete({ where: { id: watchlistItem.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('POST /api/watchlist/:id/mark-read', () => {
    it('should require authentication', async () => {
      await request(app)
        .post('/api/watchlist/1/mark-read')
        .expect(401);
    });

    it('should mark all changes as read for a watchlist item', async () => {
      // Create watchlist item
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      // Create unread changes
      const change1 = await prisma.billChangeLog.create({
        data: {
          billId: testBillId,
          changeType: 'status',
          previousValue: 'introduced',
          newValue: 'passed',
          notified: false,
        },
      });

      const change2 = await prisma.billChangeLog.create({
        data: {
          billId: testBillId,
          changeType: 'title',
          previousValue: 'Old Title',
          newValue: 'New Title',
          notified: false,
        },
      });

      const response = await request(app)
        .post(`/api/watchlist/${watchlistItem.id}/mark-read`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('Marked as read');

      // Verify changes are marked as notified
      const updatedChange1 = await prisma.billChangeLog.findUnique({
        where: { id: change1.id },
      });
      const updatedChange2 = await prisma.billChangeLog.findUnique({
        where: { id: change2.id },
      });
      expect(updatedChange1?.notified).toBe(true);
      expect(updatedChange2?.notified).toBe(true);

      // Verify lastNotifiedAt is updated
      const updatedWatchlistItem = await prisma.userWatchlist.findUnique({
        where: { id: watchlistItem.id },
      });
      expect(updatedWatchlistItem?.lastNotifiedAt).not.toBeNull();
    });

    it('should return 400 for invalid watchlist ID', async () => {
      await request(app)
        .post('/api/watchlist/invalid/mark-read')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 404 for non-existent watchlist item', async () => {
      await request(app)
        .post('/api/watchlist/999999/mark-read')
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should return 403 when marking another user\'s watchlist as read', async () => {
      // Create another user with unique email
      const timestamp = Date.now();
      const otherUser = await prisma.user.create({
        data: {
          username: `otheruser3_${timestamp}`,
          email: `other3_${timestamp}@example.com`,
          password: 'password',
        },
      });

      // Create watchlist item for other user
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: otherUser.id,
          billId: testBillId,
        },
      });

      // Try to mark as read with test user's token
      await request(app)
        .post(`/api/watchlist/${watchlistItem.id}/mark-read`)
        .set('Authorization', authToken)
        .expect(403);

      // Cleanup
      await prisma.userWatchlist.delete({ where: { id: watchlistItem.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should work even if there are no unread changes', async () => {
      // Create watchlist item without any changes
      const watchlistItem = await prisma.userWatchlist.create({
        data: {
          userId: testUserId,
          billId: testBillId,
        },
      });

      const response = await request(app)
        .post(`/api/watchlist/${watchlistItem.id}/mark-read`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});
