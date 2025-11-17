/**
 * Notifications API Integration Tests
 *
 * These tests validate the notification endpoints using supertest with real database operations.
 */

import request from 'supertest';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import devAuth from '../../app/utils/dev-auth';
import * as crypto from 'crypto';

describe('Notifications API Integration Tests', () => {
  let testUserId: number;
  let authToken: string;
  let testBillId: number;

  // Setup: Create test user and test data
  beforeAll(async () => {
    // Create test user
    const user = await devAuth.getOrCreateTestUser();
    testUserId = user.id;
    authToken = `Token ${user.token}`;

    // Create test bill for notifications
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: 2000,
        title: 'Test Bill for Notifications',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {},
      },
    });
    testBillId = bill.id;
  });

  // Cleanup after each test
  afterEach(async () => {
    await prisma.notificationHistory.deleteMany({
      where: { userId: testUserId },
    });
    // Also clean up preferences to ensure clean state
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: testUserId },
    });
  });

  // Final cleanup
  afterAll(async () => {
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.bill.deleteMany({
      where: { id: testBillId },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/notifications/preferences', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/api/notifications/preferences')
        .expect(401);
    });

    it('should return user notification preferences (default if not set)', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('preferences');
      const prefs = response.body.preferences;
      expect(prefs).toHaveProperty('emailEnabled');
      expect(prefs).toHaveProperty('digestFrequency');
      expect(prefs).toHaveProperty('timezone');
    });

    it('should return custom preferences if user has set them', async () => {
      // Create custom preferences
      await prisma.userNotificationPreferences.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          emailEnabled: false,
          emailAddress: 'custom@example.com',
          digestFrequency: 'weekly',
          digestTime: '09:00',
          timezone: 'America/Los_Angeles',
        },
        update: {},
      });

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(false);
      expect(response.body.preferences.emailAddress).toBe('custom@example.com');
      expect(response.body.preferences.digestFrequency).toBe('weekly');
      expect(response.body.preferences.timezone).toBe('America/Los_Angeles');
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should require authentication', async () => {
      await request(app)
        .put('/api/notifications/preferences')
        .send({ emailEnabled: false })
        .expect(401);
    });

    it('should update notification preferences successfully', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          emailAddress: 'updated@example.com',
          digestFrequency: 'daily',
          digestTime: '08:00',
          timezone: 'America/New_York',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences.emailEnabled).toBe(true);
      expect(response.body.preferences.emailAddress).toBe('updated@example.com');
      expect(response.body.preferences.digestFrequency).toBe('daily');

      // Verify in database
      const prefs = await prisma.userNotificationPreferences.findUnique({
        where: { userId: testUserId },
      });
      expect(prefs?.emailEnabled).toBe(true);
      expect(prefs?.emailAddress).toBe('updated@example.com');
    });

    it('should filter out invalid fields', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          invalidField: 'should be ignored',
          hackerField: 'malicious',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Invalid fields should not cause error, just ignored
    });

    it('should allow partial updates', async () => {
      // Set initial preferences
      await prisma.userNotificationPreferences.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          emailEnabled: true,
          digestFrequency: 'daily',
          timezone: 'America/New_York',
        },
        update: {},
      });

      // Update only one field
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          digestFrequency: 'weekly',
        })
        .expect(200);

      expect(response.body.preferences.digestFrequency).toBe('weekly');
      // Other fields should remain unchanged
      expect(response.body.preferences.emailEnabled).toBe(true);
      expect(response.body.preferences.timezone).toBe('America/New_York');
    });
  });

  describe('GET /api/notifications/unsubscribe/:token', () => {
    it('should unsubscribe user with valid token', async () => {
      // Create preferences with unsubscribe token
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      await prisma.userNotificationPreferences.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          emailEnabled: true,
          unsubscribeToken,
        },
        update: { unsubscribeToken },
      });

      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${unsubscribeToken}`)
        .expect(200);

      expect(response.text).toContain('unsubscribed');
      expect(response.text).toContain('no longer receive email notifications');

      // Verify email is disabled
      const prefs = await prisma.userNotificationPreferences.findUnique({
        where: { userId: testUserId },
      });
      expect(prefs?.emailEnabled).toBe(false);
    });

    it('should return error page for invalid token', async () => {
      const response = await request(app)
        .get('/api/notifications/unsubscribe/invalid-token-12345')
        .expect(400);

      expect(response.text).toContain('Invalid unsubscribe link');
      expect(response.text).toContain('invalid or has expired');
    });

    it('should return error for non-existent token', async () => {
      const fakeToken = crypto.randomBytes(32).toString('hex');
      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${fakeToken}`)
        .expect(400);

      expect(response.text).toContain('Invalid unsubscribe link');
    });
  });

  describe('GET /api/notifications/:id/track/open', () => {
    it('should track notification open and return 1x1 pixel', async () => {
      // Create notification history
      const notification = await prisma.notificationHistory.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notificationType: 'bill_change',
          deliveryMethod: 'email',
          recipientEmail: 'test@example.com',
          status: 'sent',
          subject: 'Test Notification',
          body: 'Test body',
        },
      });

      const response = await request(app)
        .get(`/api/notifications/${notification.id}/track/open`)
        .expect(200);

      expect(response.headers['content-type']).toContain('image/gif');
      expect(response.body).toBeInstanceOf(Buffer);

      // Verify tracking in database
      const tracked = await prisma.notificationHistory.findUnique({
        where: { id: notification.id },
      });
      expect(tracked?.openedAt).not.toBeNull();
    });

    it('should fail silently for invalid notification ID', async () => {
      // Should still return 200 (fail silently for tracking)
      await request(app)
        .get('/api/notifications/999999/track/open')
        .expect(200);

      // Endpoint fails silently - just returns 200 without throwing error
    });
  });

  describe('GET /api/notifications/:id/track/click', () => {
    it('should track notification click', async () => {
      // Create notification history
      const notification = await prisma.notificationHistory.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notificationType: 'bill_change',
          deliveryMethod: 'email',
          recipientEmail: 'test@example.com',
          status: 'sent',
          subject: 'Test Notification',
          body: 'Test body',
        },
      });

      const response = await request(app)
        .get(`/api/notifications/${notification.id}/track/click`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify tracking in database
      const tracked = await prisma.notificationHistory.findUnique({
        where: { id: notification.id },
      });
      expect(tracked?.clickedAt).not.toBeNull();
    });

    it('should redirect to URL if provided', async () => {
      // Create notification history
      const notification = await prisma.notificationHistory.create({
        data: {
          userId: testUserId,
          billId: testBillId,
          notificationType: 'bill_change',
          deliveryMethod: 'email',
          recipientEmail: 'test@example.com',
          status: 'sent',
          subject: 'Test Notification',
          body: 'Test body',
        },
      });

      const redirectUrl = 'https://example.com/bill/123';
      const response = await request(app)
        .get(`/api/notifications/${notification.id}/track/click`)
        .query({ url: redirectUrl })
        .expect(302);

      expect(response.headers.location).toBe(redirectUrl);
    });

    it('should return 500 for invalid notification ID', async () => {
      await request(app)
        .get('/api/notifications/999999/track/click')
        .expect(500);
    });
  });

  describe('GET /api/notifications/history', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/api/notifications/history')
        .expect(401);
    });

    it('should return notification history for user', async () => {
      // Create notification history records
      await prisma.notificationHistory.createMany({
        data: [
          {
            userId: testUserId,
            billId: testBillId,
            notificationType: 'bill_change',
            deliveryMethod: 'email',
            recipientEmail: 'test@example.com',
            status: 'sent',
            subject: 'Notification 1',
            body: 'Body 1',
          },
          {
            userId: testUserId,
            billId: testBillId,
            notificationType: 'bill_change',
            deliveryMethod: 'email',
            recipientEmail: 'test@example.com',
            status: 'delivered',
            subject: 'Notification 2',
            body: 'Body 2',
          },
        ],
      });

      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(response.body.history).toHaveLength(2);
      expect(response.body.history[0]).toHaveProperty('subject');
      expect(response.body.history[0]).toHaveProperty('status');
      expect(response.body.history[0]).toHaveProperty('deliveryMethod');
      expect(response.body.history[0]).toHaveProperty('bill');
    });

    it('should support limit parameter', async () => {
      // Create 10 notification records
      const notifications = Array.from({ length: 10 }, (_, i) => ({
        userId: testUserId,
        billId: testBillId,
        notificationType: 'bill_change',
        deliveryMethod: 'email' as const,
        recipientEmail: 'test@example.com',
        status: 'sent' as const,
        subject: `Notification ${i + 1}`,
        body: `Body ${i + 1}`,
      }));
      await prisma.notificationHistory.createMany({ data: notifications });

      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.history).toHaveLength(5);
    });

    it('should return empty array for user with no history', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.history).toEqual([]);
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/api/notifications/stats')
        .expect(401);
    });

    it('should return notification statistics', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      // Stats structure depends on implementation
      // Just verify it returns something
    });

    it('should support hours parameter', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', authToken)
        .query({ hours: 48 })
        .expect(200);

      expect(response.body).toHaveProperty('stats');
    });
  });

  describe('POST /api/notifications/admin/process (Admin Endpoints)', () => {
    beforeEach(() => {
      // Set development mode for admin access
      process.env.NODE_ENV = 'development';
      delete process.env.ADMIN_SECRET;
    });

    it('should process pending notifications (dev mode)', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/process')
        .send({ limit: 50 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message.toLowerCase()).toContain('processed');
      expect(response.body).toHaveProperty('stats');
    });

    it('should require admin auth in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_SECRET = 'test-secret';

      // Without auth
      await request(app)
        .post('/api/notifications/admin/process')
        .expect(401);

      // With correct auth
      await request(app)
        .post('/api/notifications/admin/process')
        .set('Authorization', 'Bearer test-secret')
        .expect(200);
    });
  });

  describe('POST /api/notifications/admin/digest', () => {
    beforeEach(() => {
      // Set development mode for admin access
      process.env.NODE_ENV = 'development';
      delete process.env.ADMIN_SECRET;
    });

    it('should send daily digest emails (dev mode)', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'daily' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('daily digest');
    });

    it('should send weekly digest emails (dev mode)', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'weekly' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('weekly digest');
    });

    it('should return 400 for invalid frequency', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'monthly' })
        .expect(400);

      expect(response.body.error).toContain('Invalid frequency');
    });

    it('should default to daily if no frequency specified', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({})
        .expect(200);

      expect(response.body.message).toContain('daily');
    });
  });

  describe('POST /api/notifications/admin/test-email', () => {
    beforeEach(() => {
      // Set development mode for admin access
      process.env.NODE_ENV = 'development';
      delete process.env.ADMIN_SECRET;
    });

    it('should send test email (dev mode)', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/test-email')
        .send({ to: 'test@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      // Success may be true or false depending on email config
      // Just verify it returns properly
    });

    it('should return 400 if email address not provided', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/test-email')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Email address required');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid notification IDs gracefully', async () => {
      await request(app)
        .get('/api/notifications/abc/track/click')
        .expect(500);
    });

    it('should protect user data across accounts', async () => {
      // Create another user with unique email
      const timestamp = Date.now();
      const otherUser = await prisma.user.create({
        data: {
          username: `otheruser_${timestamp}`,
          email: `other_${timestamp}@example.com`,
          password: 'password',
        },
      });

      // Create notification for other user
      await prisma.notificationHistory.create({
        data: {
          userId: otherUser.id,
          billId: testBillId,
          notificationType: 'bill_change',
          deliveryMethod: 'email',
          recipientEmail: 'other@example.com',
          status: 'sent',
          subject: 'Other User Notification',
          body: 'Private data',
        },
      });

      // Test user should only see their own notifications
      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .expect(200);

      const otherUserNotification = response.body.history.find(
        (n: any) => n.subject === 'Other User Notification'
      );
      expect(otherUserNotification).toBeUndefined();

      // Cleanup
      await prisma.notificationHistory.deleteMany({
        where: { userId: otherUser.id },
      });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });
});
