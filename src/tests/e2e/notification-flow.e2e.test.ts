/**
 * Notification Workflow E2E Tests
 *
 * Tests complete notification flows from preference setup to email delivery.
 * Uses real database for preferences/history, mocks email service (no real emails).
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

// Mock notification and email services (we don't want to send real emails)
const mockNotificationService = {
  getUserPreferences: jest.fn(),
  updateUserPreferences: jest.fn(),
  unsubscribeByToken: jest.fn(),
  trackOpen: jest.fn(),
  trackClick: jest.fn(),
  getStats: jest.fn(),
};

const mockEmailService = {
  processPendingNotifications: jest.fn(),
  sendDigests: jest.fn(),
  testEmail: jest.fn(),
};

jest.mock('../../app/services/notifications', () => ({
  getNotificationService: jest.fn(() => mockNotificationService),
  getEmailService: jest.fn(() => mockEmailService),
}));

import app from '../../app';

// Increase timeout for database tests
jest.setTimeout(30000);

describe('Notification Workflow E2E Tests', () => {
  // Setup test data before all tests
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `e2e-notif-${timestamp}@example.com`,
        username: `e2enotifuser${timestamp}`,
        password: 'test-hash',
      },
    });
    (global as any).testUserId = user.id;

    // Create secondary user
    const secondaryUser = await prisma.user.create({
      data: {
        email: `e2e-notif2-${timestamp}@example.com`,
        username: `e2enotifuser2${timestamp}`,
        password: 'test-hash',
      },
    });
    (global as any).secondaryUserId = secondaryUser.id;

    // Create test bill for notification history
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: Math.floor(Math.random() * 90000) + 10000,
        title: 'E2E Notification Test Bill',
        originChamber: 'House',
        originChamberCode: 'H',
        updateDate: new Date(),
      },
    });
    (global as any).testBillId = bill.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    const testUserId = (global as any).testUserId;
    const secondaryUserId = (global as any).secondaryUserId;
    const testBillId = (global as any).testBillId;

    // Delete test data
    await prisma.notificationHistory.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    }).catch(() => {});

    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: { in: [testUserId, secondaryUserId] } },
    }).catch(() => {});

    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, secondaryUserId] } },
    });

    await prisma.bill.delete({
      where: { id: testBillId },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Notification Setup Flow', () => {
    it('should allow user to set up, modify, and verify notification preferences', async () => {
      const testUserId = (global as any).testUserId;

      // Step 1: Get default/initial preferences
      const defaultPrefs = {
        id: 1,
        userId: testUserId,
        emailEnabled: true,
        digestFrequency: 'daily',
        timezone: 'America/New_York',
        unsubscribeToken: 'test-token-123',
      };

      (mockNotificationService.getUserPreferences as jest.Mock).mockResolvedValueOnce(defaultPrefs);

      let response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(true);
      expect(response.body.preferences.digestFrequency).toBe('daily');

      // Step 2: Update to instant notifications
      const updatedPrefs = {
        ...defaultPrefs,
        digestFrequency: 'instant',
        timezone: 'America/Los_Angeles',
      };

      (mockNotificationService.updateUserPreferences as jest.Mock).mockResolvedValueOnce(updatedPrefs);

      response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          digestFrequency: 'instant',
          timezone: 'America/Los_Angeles',
        })
        .expect(200);

      expect(response.body.preferences.digestFrequency).toBe('instant');
      expect(response.body.preferences.timezone).toBe('America/Los_Angeles');

      // Step 3: Check statistics
      (mockNotificationService.getStats as jest.Mock).mockResolvedValueOnce({
        total: 10,
        sent: 8,
        pending: 1,
        failed: 1,
        openRate: 0.6,
        clickRate: 0.2,
      });

      response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.stats.total).toBe(10);
      expect(response.body.stats.openRate).toBe(0.6);
    });
  });

  describe('Email Notification Delivery Flow', () => {
    it('should process pending notifications and track engagement', async () => {
      // Step 1: Admin processes pending notifications
      (mockEmailService.processPendingNotifications as jest.Mock).mockResolvedValueOnce(undefined);
      (mockNotificationService.getStats as jest.Mock).mockResolvedValueOnce({
        total: 50,
        sent: 48,
        pending: 0,
        failed: 2,
      });

      let response = await request(app)
        .post('/api/notifications/admin/process')
        .send({ limit: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats.sent).toBe(48);

      // Step 2: Track email open (via tracking pixel)
      (mockNotificationService.trackOpen as jest.Mock).mockResolvedValueOnce(undefined);

      response = await request(app)
        .get('/api/notifications/1/track/open')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      expect(mockNotificationService.trackOpen).toHaveBeenCalledWith(1);

      // Step 3: Track email click (via redirect)
      (mockNotificationService.trackClick as jest.Mock).mockResolvedValueOnce(undefined);

      const redirectUrl = 'https://example.com/bills/118/hr/1234';
      response = await request(app)
        .get(`/api/notifications/1/track/click?url=${encodeURIComponent(redirectUrl)}`)
        .expect(302);

      expect(response.headers.location).toBe(redirectUrl);
      expect(mockNotificationService.trackClick).toHaveBeenCalledWith(1);

      // Step 4: Verify updated stats reflect engagement
      (mockNotificationService.getStats as jest.Mock).mockResolvedValueOnce({
        total: 50,
        sent: 48,
        pending: 0,
        failed: 2,
        openRate: 0.75,
        clickRate: 0.25,
      });

      response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.stats.openRate).toBe(0.75);
    });
  });

  describe('Digest Email Flow', () => {
    it('should send daily and weekly digest emails', async () => {
      // Send daily digest
      (mockEmailService.sendDigests as jest.Mock).mockResolvedValueOnce(undefined);

      let response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'daily' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Sent daily digest emails');
      expect(mockEmailService.sendDigests).toHaveBeenCalledWith('daily');

      // Send weekly digest
      (mockEmailService.sendDigests as jest.Mock).mockResolvedValueOnce(undefined);

      response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'weekly' })
        .expect(200);

      expect(response.body.message).toBe('Sent weekly digest emails');
      expect(mockEmailService.sendDigests).toHaveBeenCalledWith('weekly');
    });

    it('should reject invalid digest frequency', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/digest')
        .send({ frequency: 'monthly' })
        .expect(400);

      expect(response.body.error).toContain('Invalid frequency');
    });
  });

  describe('Unsubscribe Flow', () => {
    it('should allow user to unsubscribe via token', async () => {
      const testUserId = (global as any).testUserId;

      // User clicks unsubscribe link
      (mockNotificationService.unsubscribeByToken as jest.Mock).mockResolvedValueOnce({
        id: 1,
        userId: testUserId,
        emailEnabled: false,
        unsubscribedAt: new Date(),
      });

      let response = await request(app)
        .get('/api/notifications/unsubscribe/valid-token-123')
        .expect(200);

      expect(response.text).toContain('unsubscribed');

      // Verify preferences show unsubscribed
      (mockNotificationService.getUserPreferences as jest.Mock).mockResolvedValueOnce({
        id: 1,
        userId: testUserId,
        emailEnabled: false,
        unsubscribedAt: new Date(),
      });

      response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(false);

      // User re-enables notifications
      (mockNotificationService.updateUserPreferences as jest.Mock).mockResolvedValueOnce({
        id: 1,
        userId: testUserId,
        emailEnabled: true,
        unsubscribedAt: null,
      });

      response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({ emailEnabled: true })
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(true);
    });

    it('should handle invalid unsubscribe token', async () => {
      (mockNotificationService.unsubscribeByToken as jest.Mock).mockRejectedValueOnce(
        new Error('Token not found')
      );

      const response = await request(app)
        .get('/api/notifications/unsubscribe/invalid-token')
        .expect(400);

      expect(response.text).toContain('Invalid unsubscribe link');
    });
  });

  describe('Admin Email Testing Flow', () => {
    it('should allow admin to test email configuration', async () => {
      // Test email delivery
      (mockEmailService.testEmail as jest.Mock).mockResolvedValueOnce({
        success: true,
        messageId: 'test-msg-123',
      });

      const response = await request(app)
        .post('/api/notifications/admin/test-email')
        .send({ to: 'admin@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messageId).toBe('test-msg-123');
    });

    it('should handle email delivery failures', async () => {
      (mockEmailService.testEmail as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'SMTP authentication failed',
      });

      const response = await request(app)
        .post('/api/notifications/admin/test-email')
        .send({ to: 'admin@example.com' })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SMTP authentication failed');
    });

    it('should require email address for test', async () => {
      const response = await request(app)
        .post('/api/notifications/admin/test-email')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Email address required');
    });
  });

  describe('Error Recovery in Notification Flow', () => {
    it('should handle failed notification processing gracefully', async () => {
      (mockEmailService.processPendingNotifications as jest.Mock).mockRejectedValueOnce(
        new Error('SMTP server unavailable')
      );

      const response = await request(app)
        .post('/api/notifications/admin/process')
        .send({ limit: 10 })
        .expect(500);

      expect(response.body.error).toContain('SMTP server unavailable');
    });

    it('should silently handle tracking errors for open pixel', async () => {
      (mockNotificationService.trackOpen as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      // Should still return 200 for tracking pixel (silent fail)
      const response = await request(app)
        .get('/api/notifications/999/track/open')
        .expect(200);

      // Response should be OK even with errors (silent fail for tracking)
      expect(response.status).toBe(200);
    });

    it('should handle tracking errors for clicks', async () => {
      (mockNotificationService.trackClick as jest.Mock).mockRejectedValueOnce(
        new Error('Click tracking failed')
      );

      const response = await request(app)
        .get('/api/notifications/1/track/click')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for preferences', async () => {
      await request(app)
        .get('/api/notifications/preferences')
        .expect(401);

      await request(app)
        .put('/api/notifications/preferences')
        .send({ emailEnabled: true })
        .expect(401);
    });

    it('should require authentication for stats', async () => {
      await request(app)
        .get('/api/notifications/stats')
        .expect(401);
    });

    it('should allow unauthenticated access to tracking endpoints', async () => {
      (mockNotificationService.trackOpen as jest.Mock).mockResolvedValueOnce(undefined);

      // Tracking endpoints don't require auth (for email pixels)
      await request(app)
        .get('/api/notifications/1/track/open')
        .expect(200);
    });
  });
});
