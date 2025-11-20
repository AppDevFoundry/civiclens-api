/**
 * Notifications API Integration Tests
 *
 * These tests validate the notifications Express endpoints using supertest,
 * with Prisma and services mocked.
 */

// @ts-nocheck - Disable TypeScript for this file due to Prisma mock typing issues

// Import prisma-mock FIRST to ensure Prisma is mocked before app loads
import prismaMock from '../prisma-mock';

import request from 'supertest';
import {
  mockUsers,
  mockAuthHeaders,
  mockBills,
  mockMembers,
  mockNotificationPreferences,
  mockNotificationHistory,
  mockNotificationPayloads,
  mockUnsubscribeTokens,
} from '../fixtures';

// Mock express-jwt to bypass JWT validation
jest.mock('express-jwt', () => ({
  expressjwt: jest.fn(() => (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Parse mock tokens
    if (authHeader === mockAuthHeaders.testUser) {
      req.auth = { user: mockUsers.testUser };
    } else if (authHeader === mockAuthHeaders.secondaryUser) {
      req.auth = { user: mockUsers.secondaryUser };
    } else if (authHeader === mockAuthHeaders.newUser) {
      req.auth = { user: mockUsers.newUser };
    } else if (authHeader === mockAuthHeaders.invalid) {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      req.auth = null;
    }
    next();
  }),
}));

// Mock the notification and email services before importing app
const mockNotificationService = {
  getUserPreferences: jest.fn(),
  updateUserPreferences: jest.fn(),
  unsubscribeByToken: jest.fn(),
  trackOpen: jest.fn(),
  trackClick: jest.fn(),
  getStats: jest.fn(),
  prisma: prismaMock, // Add prisma to the mock service
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

// Import app after mocks are set up
import app from '../../app';

describe('Notifications API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return user notification preferences', async () => {
      (mockNotificationService.getUserPreferences as jest.Mock).mockResolvedValue(
        mockNotificationPreferences.testUserPrefs
      );

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences).toHaveProperty('emailEnabled', true);
      expect(response.body.preferences).toHaveProperty('digestFrequency', 'daily');
      expect(response.body.preferences).toHaveProperty('timezone', 'America/New_York');
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/notifications/preferences')
        .expect(401);
    });

    it('should handle service errors gracefully', async () => {
      (mockNotificationService.getUserPreferences as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Database error');
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should update notification preferences', async () => {
      const updatedPrefs = {
        ...mockNotificationPreferences.testUserPrefs,
        ...mockNotificationPayloads.updatePreferencesValid,
      };
      (mockNotificationService.updateUserPreferences as jest.Mock).mockResolvedValue(updatedPrefs);

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .send(mockNotificationPayloads.updatePreferencesValid)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences.digestFrequency).toBe('weekly');
      expect(response.body.preferences.timezone).toBe('America/Los_Angeles');
    });

    it('should filter out disallowed fields', async () => {
      (mockNotificationService.updateUserPreferences as jest.Mock).mockResolvedValue(
        mockNotificationPreferences.testUserPrefs
      );

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          emailEnabled: true,
          unsubscribeToken: 'hacker-token', // Should be filtered
          userId: 999, // Should be filtered
        })
        .expect(200);

      // Verify only allowed fields were passed
      expect(mockNotificationService.updateUserPreferences).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ emailEnabled: true })
      );
      expect(mockNotificationService.updateUserPreferences).toHaveBeenCalledWith(
        expect.any(Number),
        expect.not.objectContaining({ unsubscribeToken: expect.anything() })
      );
    });

    it('should disable notifications', async () => {
      const disabledPrefs = {
        ...mockNotificationPreferences.testUserPrefs,
        emailEnabled: false,
        digestFrequency: 'never',
      };
      (mockNotificationService.updateUserPreferences as jest.Mock).mockResolvedValue(disabledPrefs);

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .send(mockNotificationPayloads.updatePreferencesDisable)
        .expect(200);

      expect(response.body.preferences.emailEnabled).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .put('/api/notifications/preferences')
        .send(mockNotificationPayloads.updatePreferencesValid)
        .expect(401);
    });
  });

  describe('GET /api/notifications/unsubscribe/:token', () => {
    it('should unsubscribe user and return HTML success page', async () => {
      (mockNotificationService.unsubscribeByToken as jest.Mock).mockResolvedValue(
        mockNotificationPreferences.unsubscribedUserPrefs
      );

      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${mockUnsubscribeTokens.valid}`)
        .expect(200);

      expect(response.text).toContain('unsubscribed');
      expect(response.text).toContain('class="success"');
      expect(mockNotificationService.unsubscribeByToken).toHaveBeenCalledWith(
        mockUnsubscribeTokens.valid
      );
    });

    it('should return HTML error page for invalid token', async () => {
      (mockNotificationService.unsubscribeByToken as jest.Mock).mockRejectedValue(
        new Error('Token not found')
      );

      const response = await request(app)
        .get(`/api/notifications/unsubscribe/${mockUnsubscribeTokens.invalid}`)
        .expect(400);

      expect(response.text).toContain('Invalid unsubscribe link');
      expect(response.text).toContain('class="error"');
    });
  });

  describe('GET /api/notifications/:id/track/open', () => {
    it('should track notification open and return tracking pixel', async () => {
      (mockNotificationService.trackOpen as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/notifications/1/track/open')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(mockNotificationService.trackOpen).toHaveBeenCalledWith(1);
    });

    it('should handle tracking errors silently', async () => {
      (mockNotificationService.trackOpen as jest.Mock).mockRejectedValue(
        new Error('Tracking failed')
      );

      const response = await request(app)
        .get('/api/notifications/999/track/open')
        .expect(200);

      // Should return 200 even on error (silent fail for tracking pixels)
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/notifications/:id/track/click', () => {
    it('should track click and redirect to URL', async () => {
      (mockNotificationService.trackClick as jest.Mock).mockResolvedValue(undefined);

      const redirectUrl = 'https://example.com/bills/118/hr/1234';
      const response = await request(app)
        .get(`/api/notifications/1/track/click?url=${encodeURIComponent(redirectUrl)}`)
        .expect(302);

      expect(response.headers.location).toBe(redirectUrl);
      expect(mockNotificationService.trackClick).toHaveBeenCalledWith(1);
    });

    it('should return JSON if no redirect URL provided', async () => {
      (mockNotificationService.trackClick as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/notifications/1/track/click')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle tracking errors', async () => {
      (mockNotificationService.trackClick as jest.Mock).mockRejectedValue(
        new Error('Click tracking failed')
      );

      const response = await request(app)
        .get('/api/notifications/999/track/click')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/notifications/history', () => {
    it('should return notification history', async () => {
      prismaMock.notificationHistory.findMany.mockResolvedValue([
        {
          ...mockNotificationHistory.billChangeNotification,
          bill: {
            id: mockBills.bill1.id,
            title: mockBills.bill1.title,
            congress: mockBills.bill1.congress,
            billType: mockBills.bill1.billType,
            billNumber: mockBills.bill1.billNumber,
          },
          member: null,
        },
        {
          ...mockNotificationHistory.digestNotification,
          bill: null,
          member: null,
        },
      ] as any);

      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(Array.isArray(response.body.history)).toBe(true);
      expect(response.body.history).toHaveLength(2);
      expect(response.body.history[0]).toHaveProperty('notificationType', 'bill_change');
    });

    it('should respect limit parameter', async () => {
      prismaMock.notificationHistory.findMany.mockResolvedValue([
        mockNotificationHistory.billChangeNotification,
      ] as any);

      await request(app)
        .get('/api/notifications/history?limit=10')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(prismaMock.notificationHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should return empty history for new user', async () => {
      prismaMock.notificationHistory.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', mockAuthHeaders.newUser)
        .expect(200);

      expect(response.body.history).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/notifications/history')
        .expect(401);
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should return notification statistics', async () => {
      const mockStats = {
        total: 100,
        sent: 85,
        pending: 10,
        failed: 5,
        openRate: 0.45,
        clickRate: 0.12,
      };
      (mockNotificationService.getStats as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('total', 100);
      expect(response.body.stats).toHaveProperty('openRate', 0.45);
    });

    it('should respect hours parameter', async () => {
      (mockNotificationService.getStats as jest.Mock).mockResolvedValue({});

      await request(app)
        .get('/api/notifications/stats?hours=48')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(mockNotificationService.getStats).toHaveBeenCalledWith(48);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/notifications/stats')
        .expect(401);
    });
  });

  describe('Admin Endpoints', () => {
    describe('POST /api/notifications/admin/process', () => {
      it('should process pending notifications', async () => {
        (mockEmailService.processPendingNotifications as jest.Mock).mockResolvedValue(undefined);
        (mockNotificationService.getStats as jest.Mock).mockResolvedValue({
          total: 100,
          sent: 95,
          pending: 5,
          failed: 0,
        });

        const response = await request(app)
          .post('/api/notifications/admin/process')
          .send(mockNotificationPayloads.adminProcessPending)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Processed pending notifications');
        expect(response.body).toHaveProperty('stats');
        expect(mockEmailService.processPendingNotifications).toHaveBeenCalledWith(100);
      });

      it('should use default limit if not provided', async () => {
        (mockEmailService.processPendingNotifications as jest.Mock).mockResolvedValue(undefined);
        (mockNotificationService.getStats as jest.Mock).mockResolvedValue({});

        await request(app)
          .post('/api/notifications/admin/process')
          .send({})
          .expect(200);

        expect(mockEmailService.processPendingNotifications).toHaveBeenCalledWith(100);
      });

      it('should handle processing errors', async () => {
        (mockEmailService.processPendingNotifications as jest.Mock).mockRejectedValue(
          new Error('SMTP connection failed')
        );

        const response = await request(app)
          .post('/api/notifications/admin/process')
          .send({})
          .expect(500);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('SMTP connection failed');
      });
    });

    describe('POST /api/notifications/admin/digest', () => {
      it('should send daily digest emails', async () => {
        (mockEmailService.sendDigests as jest.Mock).mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/notifications/admin/digest')
          .send(mockNotificationPayloads.adminDigestDaily)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Sent daily digest emails');
        expect(mockEmailService.sendDigests).toHaveBeenCalledWith('daily');
      });

      it('should send weekly digest emails', async () => {
        (mockEmailService.sendDigests as jest.Mock).mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/notifications/admin/digest')
          .send(mockNotificationPayloads.adminDigestWeekly)
          .expect(200);

        expect(response.body).toHaveProperty('message', 'Sent weekly digest emails');
        expect(mockEmailService.sendDigests).toHaveBeenCalledWith('weekly');
      });

      it('should return 400 for invalid frequency', async () => {
        const response = await request(app)
          .post('/api/notifications/admin/digest')
          .send({ frequency: 'monthly' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid frequency');
      });

      it('should default to daily frequency', async () => {
        (mockEmailService.sendDigests as jest.Mock).mockResolvedValue(undefined);

        await request(app)
          .post('/api/notifications/admin/digest')
          .send({})
          .expect(200);

        expect(mockEmailService.sendDigests).toHaveBeenCalledWith('daily');
      });
    });

    describe('POST /api/notifications/admin/test-email', () => {
      it('should send test email', async () => {
        const testResult = {
          success: true,
          messageId: 'test-message-id-123',
        };
        (mockEmailService.testEmail as jest.Mock).mockResolvedValue(testResult);

        const response = await request(app)
          .post('/api/notifications/admin/test-email')
          .send(mockNotificationPayloads.adminTestEmail)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('messageId', 'test-message-id-123');
        expect(mockEmailService.testEmail).toHaveBeenCalledWith('admin-test@example.com');
      });

      it('should return 400 if email not provided', async () => {
        const response = await request(app)
          .post('/api/notifications/admin/test-email')
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Email address required');
      });

      it('should handle email sending errors', async () => {
        (mockEmailService.testEmail as jest.Mock).mockResolvedValue({
          success: false,
          error: 'Invalid email address',
        });

        const response = await request(app)
          .post('/api/notifications/admin/test-email')
          .send({ to: 'invalid-email' })
          .expect(200);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'Invalid email address');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing notification preferences gracefully', async () => {
      (mockNotificationService.getUserPreferences as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body).toHaveProperty('preferences', null);
    });

    it('should handle database connection errors', async () => {
      prismaMock.notificationHistory.findMany.mockRejectedValue(
        new Error('Connection timeout')
      );

      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});
