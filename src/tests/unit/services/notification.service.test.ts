/**
 * Notification Service Unit Tests
 *
 * Tests for the notification service business logic.
 */

// @ts-nocheck - Disable TypeScript for Prisma mock circular type issues

import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create mock before jest.mock is called
const mockPrisma = mockDeep<PrismaClient>();

// Mock @prisma/client - must be before importing the service
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    __esModule: true,
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  };
});

// Import service after mock is set up
import {
  NotificationService,
  NotificationType,
  DeliveryMethod,
  DigestFrequency,
  getNotificationService,
} from '../../../app/services/notifications/notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    mockReset(mockPrisma);
    service = new NotificationService();
  });

  describe('Enum Values', () => {
    test('should have correct NotificationType values', () => {
      expect(NotificationType.BILL_CHANGE).toBe('bill_change');
      expect(NotificationType.MEMBER_UPDATE).toBe('member_update');
      expect(NotificationType.DIGEST).toBe('digest');
      expect(NotificationType.WATCHLIST_UPDATE).toBe('watchlist_update');
    });

    test('should have correct DeliveryMethod values', () => {
      expect(DeliveryMethod.EMAIL).toBe('email');
      expect(DeliveryMethod.PUSH).toBe('push');
      expect(DeliveryMethod.SMS).toBe('sms');
    });

    test('should have correct DigestFrequency values', () => {
      expect(DigestFrequency.INSTANT).toBe('instant');
      expect(DigestFrequency.DAILY).toBe('daily');
      expect(DigestFrequency.WEEKLY).toBe('weekly');
      expect(DigestFrequency.NEVER).toBe('never');
    });
  });

  describe('getUserPreferences', () => {
    it('should return existing preferences', async () => {
      const mockPrefs = {
        id: 1,
        userId: 1,
        emailEnabled: true,
        digestFrequency: 'daily',
        digestTime: '08:00',
        timezone: 'America/New_York',
        emailVerified: true,
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(mockPrefs);

      const result = await service.getUserPreferences(1);

      expect(result).toEqual(mockPrefs);
      expect(mockPrisma.userNotificationPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('should create default preferences if none exist', async () => {
      const newPrefs = {
        id: 1,
        userId: 1,
        emailEnabled: true,
        digestFrequency: 'daily',
        digestTime: '08:00',
        timezone: 'America/New_York',
        emailVerified: false,
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(null);
      (mockPrisma.userNotificationPreferences.create as any).mockResolvedValue(newPrefs);

      const result = await service.getUserPreferences(1);

      expect(result).toEqual(newPrefs);
      expect(mockPrisma.userNotificationPreferences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          emailEnabled: true,
          digestFrequency: DigestFrequency.DAILY,
        }),
      });
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences', async () => {
      const updates = {
        digestFrequency: 'weekly',
        timezone: 'America/Los_Angeles',
      };
      const updatedPrefs = {
        id: 1,
        userId: 1,
        ...updates,
      };

      (mockPrisma.userNotificationPreferences.upsert as any).mockResolvedValue(updatedPrefs);

      const result = await service.updateUserPreferences(1, updates);

      expect(result).toEqual(updatedPrefs);
      expect(mockPrisma.userNotificationPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: updates,
        create: {
          userId: 1,
          ...updates,
        },
      });
    });
  });

  describe('createNotification', () => {
    it('should create a notification for enabled user', async () => {
      const prefs = {
        id: 1,
        userId: 1,
        emailEnabled: true,
        digestFrequency: 'instant',
        unsubscribedAt: null,
        emailAddress: null,
      };
      const user = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
      };
      const notification = {
        id: 1,
        userId: 1,
        notificationType: 'bill_change',
        subject: 'Test',
        body: 'Test body',
        status: 'pending',
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue(user);
      (mockPrisma.notificationHistory.create as any).mockResolvedValue(notification);

      const result = await service.createNotification({
        userId: 1,
        type: NotificationType.BILL_CHANGE,
        subject: 'Test',
        body: 'Test body',
      });

      expect(result).toEqual(notification);
      expect(mockPrisma.notificationHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          notificationType: NotificationType.BILL_CHANGE,
          subject: 'Test',
          body: 'Test body',
          status: 'pending',
        }),
      });
    });

    it('should return null for disabled user', async () => {
      const prefs = {
        id: 1,
        userId: 1,
        emailEnabled: false,
        unsubscribedAt: null,
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(null);
      (mockPrisma.userNotificationPreferences.create as any).mockResolvedValue(prefs);

      const result = await service.createNotification({
        userId: 1,
        type: NotificationType.BILL_CHANGE,
        subject: 'Test',
        body: 'Test body',
      });

      expect(result).toBeNull();
    });

    it('should return null for unsubscribed user', async () => {
      const prefs = {
        id: 1,
        userId: 1,
        emailEnabled: true,
        unsubscribedAt: new Date(),
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);

      const result = await service.createNotification({
        userId: 1,
        type: NotificationType.BILL_CHANGE,
        subject: 'Test',
        body: 'Test body',
      });

      expect(result).toBeNull();
    });

    it('should return null if user not found', async () => {
      const prefs = {
        id: 1,
        userId: 1,
        emailEnabled: true,
        unsubscribedAt: null,
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue(null);

      const result = await service.createNotification({
        userId: 1,
        type: NotificationType.BILL_CHANGE,
        subject: 'Test',
        body: 'Test body',
      });

      expect(result).toBeNull();
    });
  });

  describe('getPendingNotifications', () => {
    it('should return pending notifications', async () => {
      const notifications = [
        { id: 1, status: 'pending', userId: 1 },
        { id: 2, status: 'pending', userId: 2 },
      ];

      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue(notifications);

      const result = await service.getPendingNotifications(100);

      expect(result).toEqual(notifications);
      expect(mockPrisma.notificationHistory.findMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          deliveryMethod: DeliveryMethod.EMAIL,
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
    });

    it('should use default limit', async () => {
      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue([]);

      await service.getPendingNotifications();

      expect(mockPrisma.notificationHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('markAsSent', () => {
    it('should mark notification as sent', async () => {
      const updated = {
        id: 1,
        status: 'sent',
        sentAt: new Date(),
      };

      (mockPrisma.notificationHistory.update as any).mockResolvedValue(updated);

      const result = await service.markAsSent(1);

      expect(mockPrisma.notificationHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: 'sent',
          sentAt: expect.any(Date),
        },
      });
    });
  });

  describe('markAsFailed', () => {
    it('should mark notification as failed with error', async () => {
      const updated = {
        id: 1,
        status: 'failed',
        error: 'SMTP error',
      };

      (mockPrisma.notificationHistory.update as any).mockResolvedValue(updated);

      const result = await service.markAsFailed(1, 'SMTP error');

      expect(mockPrisma.notificationHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: 'failed',
          failedAt: expect.any(Date),
          error: 'SMTP error',
        },
      });
    });
  });

  describe('trackOpen', () => {
    it('should track notification open', async () => {
      (mockPrisma.notificationHistory.update as any).mockResolvedValue({
        id: 1,
        opened: true,
      });

      await service.trackOpen(1);

      expect(mockPrisma.notificationHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          opened: true,
          openedAt: expect.any(Date),
        },
      });
    });
  });

  describe('trackClick', () => {
    it('should track notification click', async () => {
      (mockPrisma.notificationHistory.update as any).mockResolvedValue({
        id: 1,
        clicked: true,
      });

      await service.trackClick(1);

      expect(mockPrisma.notificationHistory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          clicked: true,
          clickedAt: expect.any(Date),
        },
      });
    });
  });

  describe('unsubscribeByToken', () => {
    it('should unsubscribe user by token', async () => {
      const prefs = {
        id: 1,
        userId: 1,
        unsubscribeToken: 'valid-token',
      };
      const updatedPrefs = {
        ...prefs,
        emailEnabled: false,
        unsubscribedAt: new Date(),
      };

      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.userNotificationPreferences.update as any).mockResolvedValue(updatedPrefs);

      const result = await service.unsubscribeByToken('valid-token');

      expect(result).toEqual(updatedPrefs);
      expect(mockPrisma.userNotificationPreferences.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          emailEnabled: false,
          unsubscribedAt: expect.any(Date),
        },
      });
    });

    it('should throw error for invalid token', async () => {
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(null);

      await expect(service.unsubscribeByToken('invalid-token')).rejects.toThrow(
        'Invalid unsubscribe token'
      );
    });
  });

  describe('getNotificationsForDigest', () => {
    it('should get pending notifications for digest period', async () => {
      const notifications = [
        { id: 1, userId: 1, notificationType: 'bill_change' },
        { id: 2, userId: 1, notificationType: 'member_update' },
      ];

      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue(notifications);

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-02');

      const result = await service.getNotificationsForDigest(1, {
        frequency: DigestFrequency.DAILY,
        startDate,
        endDate,
      });

      expect(result).toEqual(notifications);
      expect(mockPrisma.notificationHistory.findMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          status: 'pending',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          notificationType: {
            not: NotificationType.DIGEST,
          },
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('createDigestNotification', () => {
    it('should create daily digest notification', async () => {
      const notifications = [
        {
          id: 1,
          userId: 1,
          notificationType: 'bill_change',
          subject: 'Bill update',
          bill: { title: 'Test Bill' },
        },
      ];
      const prefs = {
        emailEnabled: true,
        unsubscribedAt: null,
        emailAddress: null,
        digestFrequency: 'instant',
      };
      const user = { email: 'test@example.com', username: 'test' };
      const digestNotification = { id: 2, notificationType: 'digest' };

      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue(notifications);
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue(user);
      (mockPrisma.notificationHistory.create as any).mockResolvedValue(digestNotification);
      (mockPrisma.notificationHistory.updateMany as any).mockResolvedValue({ count: 1 });

      const result = await service.createDigestNotification(1, DigestFrequency.DAILY);

      expect(result).toEqual(digestNotification);
      expect(mockPrisma.notificationHistory.updateMany).toHaveBeenCalled();
    });

    it('should create weekly digest notification', async () => {
      const notifications = [
        {
          id: 1,
          userId: 1,
          notificationType: 'bill_change',
          subject: 'Bill update',
          bill: { title: 'Test Bill' },
        },
      ];
      const prefs = {
        emailEnabled: true,
        unsubscribedAt: null,
        emailAddress: null,
        digestFrequency: 'instant',
      };
      const user = { email: 'test@example.com', username: 'test' };
      const digestNotification = { id: 2, notificationType: 'digest' };

      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue(notifications);
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue(user);
      (mockPrisma.notificationHistory.create as any).mockResolvedValue(digestNotification);
      (mockPrisma.notificationHistory.updateMany as any).mockResolvedValue({ count: 1 });

      const result = await service.createDigestNotification(1, DigestFrequency.WEEKLY);

      expect(result).toEqual(digestNotification);
    });

    it('should return null if no notifications to digest', async () => {
      (mockPrisma.notificationHistory.findMany as any).mockResolvedValue([]);

      const result = await service.createDigestNotification(1, DigestFrequency.DAILY);

      expect(result).toBeNull();
    });

    it('should return null for instant frequency', async () => {
      const result = await service.createDigestNotification(1, DigestFrequency.INSTANT);

      expect(result).toBeNull();
    });

    it('should return null for never frequency', async () => {
      const result = await service.createDigestNotification(1, DigestFrequency.NEVER);

      expect(result).toBeNull();
    });
  });

  describe('notifyBillChange', () => {
    it('should create notifications for bill watchers', async () => {
      const bill = {
        id: 1,
        title: 'Test Bill',
        billType: 'hr',
        billNumber: 123,
        latestActionText: 'Passed House',
        latestActionDate: new Date(),
        watchlists: [
          {
            userId: 1,
            notifyOnStatus: true,
            notifyOnActions: true,
            notifyOnCosponsors: true,
            user: { id: 1, username: 'user1', email: 'user1@example.com' },
          },
        ],
      };
      const prefs = {
        emailEnabled: true,
        unsubscribedAt: null,
        emailAddress: null,
        digestFrequency: 'instant',
      };

      (mockPrisma.bill.findUnique as any).mockResolvedValue(bill);
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ email: 'test@example.com', username: 'test' });
      (mockPrisma.notificationHistory.create as any).mockResolvedValue({ id: 1 });

      await service.notifyBillChange(1, 'status');

      expect(mockPrisma.notificationHistory.create).toHaveBeenCalledTimes(1);
    });

    it('should skip notification for users without matching notification type', async () => {
      const bill = {
        id: 1,
        title: 'Test Bill',
        billType: 'hr',
        billNumber: 123,
        watchlists: [
          {
            userId: 1,
            notifyOnStatus: false,
            notifyOnActions: false,
            notifyOnCosponsors: true,
            user: { id: 1, username: 'user1', email: 'user1@example.com' },
          },
        ],
      };

      (mockPrisma.bill.findUnique as any).mockResolvedValue(bill);

      await service.notifyBillChange(1, 'status');

      expect(mockPrisma.notificationHistory.create).not.toHaveBeenCalled();
    });

    it('should notify for action changes', async () => {
      const bill = {
        id: 1,
        title: 'Test Bill',
        billType: 'hr',
        billNumber: 123,
        latestActionText: 'Passed House',
        latestActionDate: new Date(),
        watchlists: [
          {
            userId: 1,
            notifyOnStatus: false,
            notifyOnActions: true,
            notifyOnCosponsors: false,
            user: { id: 1, username: 'user1', email: 'user1@example.com' },
          },
        ],
      };
      const prefs = {
        emailEnabled: true,
        unsubscribedAt: null,
        emailAddress: null,
        digestFrequency: 'instant',
      };

      (mockPrisma.bill.findUnique as any).mockResolvedValue(bill);
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ email: 'test@example.com', username: 'test' });
      (mockPrisma.notificationHistory.create as any).mockResolvedValue({ id: 1 });

      await service.notifyBillChange(1, 'action');

      expect(mockPrisma.notificationHistory.create).toHaveBeenCalledTimes(1);
    });

    it('should notify for cosponsor changes', async () => {
      const bill = {
        id: 1,
        title: 'Test Bill',
        billType: 'hr',
        billNumber: 123,
        latestActionText: null,
        latestActionDate: null,
        watchlists: [
          {
            userId: 1,
            notifyOnStatus: false,
            notifyOnActions: false,
            notifyOnCosponsors: true,
            user: { id: 1, username: 'user1', email: 'user1@example.com' },
          },
        ],
      };
      const prefs = {
        emailEnabled: true,
        unsubscribedAt: null,
        emailAddress: null,
        digestFrequency: 'instant',
      };

      (mockPrisma.bill.findUnique as any).mockResolvedValue(bill);
      (mockPrisma.userNotificationPreferences.findUnique as any).mockResolvedValue(prefs);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ email: 'test@example.com', username: 'test' });
      (mockPrisma.notificationHistory.create as any).mockResolvedValue({ id: 1 });

      await service.notifyBillChange(1, 'cosponsors');

      expect(mockPrisma.notificationHistory.create).toHaveBeenCalledTimes(1);
    });

    it('should handle bill not found', async () => {
      (mockPrisma.bill.findUnique as any).mockResolvedValue(null);

      await service.notifyBillChange(999, 'status');

      expect(mockPrisma.notificationHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return notification statistics', async () => {
      (mockPrisma.notificationHistory.count as any)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80)  // sent
        .mockResolvedValueOnce(5)   // failed
        .mockResolvedValueOnce(15)  // pending
        .mockResolvedValueOnce(60)  // opened
        .mockResolvedValueOnce(20); // clicked

      (mockPrisma.notificationHistory.groupBy as any).mockResolvedValue([
        { notificationType: 'bill_change', _count: 70 },
        { notificationType: 'digest', _count: 30 },
      ]);

      const result = await service.getStats(24);

      expect(result).toEqual({
        total: 100,
        sent: 80,
        failed: 5,
        pending: 15,
        opened: 60,
        clicked: 20,
        byType: {
          bill_change: 70,
          digest: 30,
        },
        openRate: '75.0%',
        clickRate: '25.0%',
      });
    });

    it('should handle zero sent notifications', async () => {
      (mockPrisma.notificationHistory.count as any).mockResolvedValue(0);
      (mockPrisma.notificationHistory.groupBy as any).mockResolvedValue([]);

      const result = await service.getStats(24);

      expect(result.openRate).toBe('0%');
      expect(result.clickRate).toBe('0%');
    });

    it('should use default hours', async () => {
      (mockPrisma.notificationHistory.count as any).mockResolvedValue(0);
      (mockPrisma.notificationHistory.groupBy as any).mockResolvedValue([]);

      await service.getStats();

      expect(mockPrisma.notificationHistory.count).toHaveBeenCalled();
    });
  });

  describe('getNotificationService', () => {
    it('should return singleton instance', () => {
      const instance1 = getNotificationService();
      const instance2 = getNotificationService();

      expect(instance1).toBe(instance2);
    });
  });
});
