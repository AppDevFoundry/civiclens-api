/**
 * E2E Test: Notification Preferences Workflow
 *
 * Tests the complete notification preferences user journey:
 * 1. User views default notification preferences
 * 2. User updates email preferences
 * 3. User configures quiet hours
 * 4. User sets digest frequency
 * 5. User unsubscribes from notifications
 * 6. User manages push notification preferences
 */

import request from 'supertest';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import devAuth from '../../app/utils/dev-auth';

describe('E2E: Notification Preferences', () => {
  let testUserId: number;
  let authToken: string;

  beforeAll(async () => {
    // Create test user
    const user = await devAuth.getOrCreateTestUser();
    testUserId = user.id;
    authToken = `Token ${user.token}`;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.pushNotificationPreference.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Reset preferences after each test
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.pushNotificationPreference.deleteMany({
      where: { userId: testUserId }
    });
  });

  describe('Email Notification Preferences', () => {
    beforeEach(async () => {
      // Clean up preferences before each test to ensure clean state
      await prisma.userNotificationPreferences.deleteMany({
        where: { userId: testUserId }
      });
    });

    it('should return default preferences for new user', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences).toBeDefined();
      expect(response.body.preferences).toMatchObject({
        emailEnabled: true,
        digestFrequency: 'daily',
        timezone: 'America/New_York'
      });
    });

    it('should allow updating email preferences', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          emailAddress: 'custom@example.com',
          digestFrequency: 'weekly',
          digestTime: '09:00',
          timezone: 'America/Los_Angeles'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences).toMatchObject({
        emailEnabled: true,
        emailAddress: 'custom@example.com',
        digestFrequency: 'weekly',
        digestTime: '09:00',
        timezone: 'America/Los_Angeles'
      });

      // Verify persistence
      const checkResponse = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(checkResponse.body.preferences.digestFrequency).toBe('weekly');
    });

    it('should allow disabling email notifications', async () => {
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: false
        })
        .expect(200);

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(false);
    });

    it('should support different digest frequencies', async () => {
      const frequencies = ['instant', 'daily', 'weekly', 'never'];

      for (const frequency of frequencies) {
        const response = await request(app)
          .put('/api/notifications/preferences')
          .set('Authorization', authToken)
          .send({
            digestFrequency: frequency
          })
          .expect(200);

        expect(response.body.preferences.digestFrequency).toBe(frequency);
      }
    });

    it('should filter out invalid fields', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          invalidField: 'should be ignored',
          hackerField: 'malicious'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences.invalidField).toBeUndefined();
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/notifications/preferences')
        .expect(401);

      await request(app)
        .put('/api/notifications/preferences')
        .send({ emailEnabled: false })
        .expect(401);
    });
  });

  describe('Unsubscribe Workflow', () => {
    it('should allow unsubscribing via token', async () => {
      // First, create preferences to get unsubscribe token
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          emailAddress: 'test@example.com'
        })
        .expect(200);

      // Get the unsubscribe token
      const prefs = await prisma.userNotificationPreferences.findUnique({
        where: { userId: testUserId }
      });

      expect(prefs).not.toBeNull();
      expect(prefs!.unsubscribeToken).toBeDefined();

      // Unsubscribe via token
      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${prefs!.unsubscribeToken}`)
        .expect(200);

      expect(response.text).toContain('unsubscribed');
      expect(response.text).toContain('no longer receive email notifications');

      // Verify email is disabled
      const updated = await prisma.userNotificationPreferences.findUnique({
        where: { userId: testUserId }
      });
      expect(updated!.emailEnabled).toBe(false);
      expect(updated!.unsubscribedAt).not.toBeNull();
    });

    it('should return error for invalid unsubscribe token', async () => {
      const response = await request(app)
        .get('/api/notifications/unsubscribe/invalid-token-12345')
        .expect(400);

      expect(response.text).toContain('Invalid unsubscribe link');
      expect(response.text).toContain('invalid or has expired');
    });

    it('should handle already unsubscribed users gracefully', async () => {
      // Create and unsubscribe
      const prefs = await prisma.userNotificationPreferences.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          emailEnabled: false,
          unsubscribedAt: new Date()
        },
        update: {
          emailEnabled: false,
          unsubscribedAt: new Date()
        }
      });

      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${prefs.unsubscribeToken}`)
        .expect(200);

      expect(response.text).toContain('unsubscribed');
    });
  });

  describe('Push Notification Preferences', () => {
    it('should return default push preferences', async () => {
      const response = await request(app)
        .get('/api/push/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences).toBeDefined();
      expect(response.body.preferences).toMatchObject({
        pushEnabled: true,
        soundEnabled: true,
        vibrationEnabled: true,
        quietHoursEnabled: false
      });
    });

    it('should allow updating push preferences', async () => {
      const response = await request(app)
        .put('/api/push/preferences')
        .set('Authorization', authToken)
        .send({
          pushEnabled: true,
          soundEnabled: false,
          vibrationEnabled: true,
          quietHoursEnabled: true,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          maxNotificationsPerDay: 30,
          maxNotificationsPerHour: 10
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences).toMatchObject({
        pushEnabled: true,
        soundEnabled: false,
        quietHoursEnabled: true,
        maxNotificationsPerDay: 30
      });
    });

    it('should allow disabling push notifications', async () => {
      await request(app)
        .put('/api/push/preferences')
        .set('Authorization', authToken)
        .send({
          pushEnabled: false
        })
        .expect(200);

      const response = await request(app)
        .get('/api/push/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences.pushEnabled).toBe(false);
    });

    it('should support flexible criteria settings', async () => {
      const response = await request(app)
        .put('/api/push/preferences')
        .set('Authorization', authToken)
        .send({
          billCriteria: {
            watchlistOnly: true,
            minSignificance: 'high',
            policyAreas: ['Healthcare', 'Defense']
          },
          memberCriteria: {
            watchlistOnly: true,
            states: ['CA', 'NY']
          },
          keywordCriteria: {
            keywords: ['climate change', 'privacy'],
            exactMatch: false
          }
        })
        .expect(200);

      expect(response.body.preferences.billCriteria).toBeDefined();
      expect(response.body.preferences.billCriteria.policyAreas).toContain('Healthcare');
    });
  });

  describe('Notification History and Stats', () => {
    beforeEach(async () => {
      // Create some notification history
      const bill = await prisma.bill.create({
        data: {
          congress: 118,
          billType: 'hr',
          billNumber: 7777,
          title: 'Test Bill for History',
          latestActionDate: new Date(),
          latestActionText: 'Introduced',
          apiResponseData: {}
        }
      });

      await prisma.notificationHistory.createMany({
        data: [
          {
            userId: testUserId,
            billId: bill.id,
            notificationType: 'bill_change',
            subject: 'Bill Update 1',
            body: 'Test',
            deliveryMethod: 'email',
            recipientEmail: 'test@example.com',
            status: 'sent',
            sentAt: new Date()
          },
          {
            userId: testUserId,
            billId: bill.id,
            notificationType: 'bill_change',
            subject: 'Bill Update 2',
            body: 'Test',
            deliveryMethod: 'email',
            recipientEmail: 'test@example.com',
            status: 'delivered',
            sentAt: new Date(),
            opened: true,
            openedAt: new Date()
          }
        ]
      });
    });

    afterEach(async () => {
      await prisma.notificationHistory.deleteMany({
        where: { userId: testUserId }
      });
      await prisma.bill.deleteMany({
        where: { billNumber: 7777 }
      });
    });

    it('should return notification history', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.history).toBeDefined();
      expect(response.body.history.length).toBeGreaterThan(0);
      expect(response.body.history[0]).toHaveProperty('subject');
      expect(response.body.history[0]).toHaveProperty('status');
      expect(response.body.history[0]).toHaveProperty('bill');
    });

    it('should support pagination for history', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', authToken)
        .query({ limit: 1 })
        .expect(200);

      expect(response.body.history.length).toBe(1);
    });

    it('should return notification statistics', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.stats).toBeDefined();
    });
  });

  describe('Combined Email and Push Preferences', () => {
    it('should allow managing both email and push preferences independently', async () => {
      // Set email preferences
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({
          emailEnabled: true,
          digestFrequency: 'instant'
        })
        .expect(200);

      // Set push preferences
      await request(app)
        .put('/api/push/preferences')
        .set('Authorization', authToken)
        .send({
          pushEnabled: true,
          soundEnabled: false
        })
        .expect(200);

      // Verify both are set correctly
      const emailPrefs = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      const pushPrefs = await request(app)
        .get('/api/push/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(emailPrefs.body.preferences.emailEnabled).toBe(true);
      expect(emailPrefs.body.preferences.digestFrequency).toBe('instant');
      expect(pushPrefs.body.preferences.pushEnabled).toBe(true);
      expect(pushPrefs.body.preferences.soundEnabled).toBe(false);
    });

    it('should allow disabling all notifications', async () => {
      // Disable email
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({ emailEnabled: false })
        .expect(200);

      // Disable push
      await request(app)
        .put('/api/push/preferences')
        .set('Authorization', authToken)
        .send({ pushEnabled: false })
        .expect(200);

      // Verify both disabled
      const emailPrefs = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      const pushPrefs = await request(app)
        .get('/api/push/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(emailPrefs.body.preferences.emailEnabled).toBe(false);
      expect(pushPrefs.body.preferences.pushEnabled).toBe(false);
    });
  });

  describe('Data Privacy and Security', () => {
    it('should not expose other users\' preferences', async () => {
      // Create another user with specific preferences
      const otherUser = await prisma.user.create({
        data: {
          username: `privacytest_${Date.now()}`,
          email: `privacy_${Date.now()}@example.com`,
          password: 'password'
        }
      });

      await prisma.userNotificationPreferences.create({
        data: {
          userId: otherUser.id,
          emailEnabled: true,
          emailAddress: 'secret@example.com',
          digestFrequency: 'weekly'
        }
      });

      // Try to access with different user (should only see own preferences)
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.preferences.emailAddress).not.toBe('secret@example.com');

      // Cleanup
      await prisma.userNotificationPreferences.deleteMany({
        where: { userId: otherUser.id }
      });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should generate unique unsubscribe tokens', async () => {
      // Create preferences for test user
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', authToken)
        .send({ emailEnabled: true })
        .expect(200);

      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          username: `tokentest_${Date.now()}`,
          email: `token_${Date.now()}@example.com`,
          password: 'password'
        }
      });

      await prisma.userNotificationPreferences.create({
        data: {
          userId: otherUser.id,
          emailEnabled: true
        }
      });

      // Get both tokens
      const prefs1 = await prisma.userNotificationPreferences.findUnique({
        where: { userId: testUserId }
      });

      const prefs2 = await prisma.userNotificationPreferences.findUnique({
        where: { userId: otherUser.id }
      });

      expect(prefs1!.unsubscribeToken).toBeDefined();
      expect(prefs2!.unsubscribeToken).toBeDefined();
      expect(prefs1!.unsubscribeToken).not.toBe(prefs2!.unsubscribeToken);

      // Cleanup
      await prisma.userNotificationPreferences.deleteMany({
        where: { userId: otherUser.id }
      });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });
});
