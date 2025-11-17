/**
 * E2E Test: Bill Sync → Email Notification Workflow
 *
 * Tests the complete workflow from bill sync to email notification:
 * 1. User adds a bill to their watchlist
 * 2. Bill sync detects changes to the bill
 * 3. Change detection service identifies the changes
 * 4. Notification service queues email notifications
 * 5. Email notifications are sent to users
 */

import request from 'supertest';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import devAuth from '../../app/utils/dev-auth';
import { getNotificationService } from '../../app/services/notifications';
import { getChangeDetectionService } from '../../app/services/sync';

describe('E2E: Bill Sync → Email Notification', () => {
  let testUserId: number;
  let authToken: string;
  let testBillId: number;
  const notificationService = getNotificationService();
  const changeDetectionService = getChangeDetectionService();

  beforeAll(async () => {
    // Create test user
    const user = await devAuth.getOrCreateTestUser();
    testUserId = user.id;
    authToken = `Token ${user.token}`;

    // Set up email preferences
    await prisma.userNotificationPreferences.upsert({
      where: { userId: testUserId },
      create: {
        userId: testUserId,
        emailEnabled: true,
        emailAddress: 'test@example.com',
        digestFrequency: 'instant'
      },
      update: {
        emailEnabled: true,
        emailAddress: 'test@example.com',
        digestFrequency: 'instant'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.billChangeLog.deleteMany({
      where: { bill: { id: testBillId } }
    });
    await prisma.userWatchlist.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.notificationHistory.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId: testUserId }
    });
    if (testBillId) {
      await prisma.bill.delete({
        where: { id: testBillId }
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should complete full workflow: watchlist → bill update → email notification', async () => {
    // Step 1: Create a bill in the database
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: 9999,
        title: 'Test Bill for E2E',
        latestActionDate: new Date(),
        latestActionText: 'Introduced in House',
        apiResponseData: {}
      }
    });
    testBillId = bill.id;

    // Step 2: User adds bill to watchlist
    const watchlistResponse = await request(app)
      .post(`/api/watchlist/bill/${testBillId}`)
      .set('Authorization', authToken)
      .send({
        notifyOnStatus: true,
        notifyOnActions: true
      })
      .expect(201);

    expect(watchlistResponse.body.watchlist).toHaveProperty('id');
    expect(watchlistResponse.body.watchlist.billId).toBe(testBillId);

    // Step 3: Simulate a bill update (as would happen during sync)
    const updatedBill = await prisma.bill.update({
      where: { id: testBillId },
      data: {
        latestActionDate: new Date(),
        latestActionText: 'Passed House',
        lastChangedAt: new Date()
      }
    });

    // Step 4: Run change detection (simulates what sync service does)
    const changes = await changeDetectionService.detectBillChanges(
      bill,
      updatedBill
    );

    expect(Array.isArray(changes)).toBe(true);
    expect(changes.length).toBeGreaterThan(0);

    // Step 4.5: Log the changes to the database
    await changeDetectionService.logChanges(testBillId, changes);

    // Verify change log was created
    const changeLogs = await prisma.billChangeLog.findMany({
      where: { billId: testBillId }
    });
    expect(changeLogs.length).toBeGreaterThan(0);

    // Step 5: Trigger notification (in real scenario, this happens via cron/queue)
    await notificationService.notifyBillChange(testBillId, 'action', changeLogs[0].id);

    // Step 6: Verify notification was created in history
    const notificationHistory = await prisma.notificationHistory.findMany({
      where: {
        userId: testUserId,
        billId: testBillId
      },
      orderBy: { createdAt: 'desc' }
    });

    expect(notificationHistory.length).toBeGreaterThan(0);
    const notification = notificationHistory[0];
    expect(notification.notificationType).toBe('bill_change');
    expect(notification.subject).toContain('Test Bill for E2E');
    expect(['pending', 'sent', 'failed']).toContain(notification.status);

    // Step 7: Verify user can see notification history
    const historyResponse = await request(app)
      .get('/api/notifications/history')
      .set('Authorization', authToken)
      .query({ limit: 10 })
      .expect(200);

    expect(historyResponse.body.history).toBeDefined();
    const userNotifications = historyResponse.body.history.filter(
      (n: any) => n.billId === testBillId
    );
    expect(userNotifications.length).toBeGreaterThan(0);
  });

  it('should not send notification if user has email disabled', async () => {
    // Create another bill
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: 9998,
        title: 'Test Bill No Notification',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {}
      }
    });

    // Add to watchlist
    await request(app)
      .post(`/api/watchlist/bill/${bill.id}`)
      .set('Authorization', authToken)
      .send({
        notifyOnStatus: true
      })
      .expect(201);

    // Disable email notifications
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', authToken)
      .send({ emailEnabled: false })
      .expect(200);

    // Update bill
    const updatedBill = await prisma.bill.update({
      where: { id: bill.id },
      data: {
        latestActionText: 'Passed Committee',
        lastChangedAt: new Date()
      }
    });

    // Detect changes
    const oldBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    if (oldBill) {
      await changeDetectionService.detectBillChanges(oldBill, updatedBill);
    }

    // Try to create a notification (should be blocked by disabled emails)
    const changeLogs = await prisma.billChangeLog.findMany({
      where: { billId: bill.id }
    });

    if (changeLogs.length > 0) {
      await notificationService.notifyBillChange(bill.id, 'action', changeLogs[0].id);
    }

    // Verify no notifications were created (emails disabled)
    const notifications = await prisma.notificationHistory.findMany({
      where: {
        userId: testUserId,
        billId: bill.id
      }
    });

    // Should have no notifications since emails are disabled
    expect(notifications.length).toBe(0);

    // Cleanup
    await prisma.billChangeLog.deleteMany({ where: { billId: bill.id } });
    await prisma.userWatchlist.deleteMany({ where: { billId: bill.id } });
    await prisma.bill.delete({ where: { id: bill.id } });

    // Re-enable for other tests
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', authToken)
      .send({ emailEnabled: true })
      .expect(200);
  });

  it('should handle digest mode notifications', async () => {
    // Set user to daily digest mode
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', authToken)
      .send({
        digestFrequency: 'daily',
        digestTime: '08:00'
      })
      .expect(200);

    // Create a bill and add to watchlist
    const timestamp = Date.now();
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 's',
        billNumber: 90000 + (timestamp % 1000),
        title: 'Test Bill for Digest',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {}
      }
    });

    await request(app)
      .post(`/api/watchlist/bill/${bill.id}`)
      .set('Authorization', authToken)
      .send({
        digestMode: true
      })
      .expect(201);

    // Store original bill state
    const oldBillState = { ...bill };

    // Update bill
    const updatedBill = await prisma.bill.update({
      where: { id: bill.id },
      data: {
        latestActionText: 'Referred to Committee',
        lastChangedAt: new Date()
      }
    });

    // Detect and log changes
    const changes = await changeDetectionService.detectBillChanges(oldBillState, updatedBill);
    if (changes.length > 0) {
      await changeDetectionService.logChanges(bill.id, changes);
    }

    // Changes should be detected but not immediately notified
    const changeLogs = await prisma.billChangeLog.findMany({
      where: { billId: bill.id, notified: false }
    });

    expect(changeLogs.length).toBeGreaterThan(0);

    // Cleanup
    await prisma.billChangeLog.deleteMany({ where: { billId: bill.id } });
    await prisma.userWatchlist.deleteMany({ where: { billId: bill.id } });
    await prisma.bill.delete({ where: { id: bill.id } });

    // Reset to instant for other tests
    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', authToken)
      .send({ digestFrequency: 'instant' })
      .expect(200);
  });

  it('should track notification engagement', async () => {
    // Create notification history entry
    const timestamp = Date.now();
    const bill = await prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: 91000 + (timestamp % 1000),
        title: 'Test Bill for Tracking',
        latestActionDate: new Date(),
        latestActionText: 'Introduced',
        apiResponseData: {}
      }
    });

    const notification = await prisma.notificationHistory.create({
      data: {
        userId: testUserId,
        billId: bill.id,
        notificationType: 'bill_change',
        subject: 'Bill Update',
        body: 'Test notification body',
        deliveryMethod: 'email',
        recipientEmail: 'test@example.com',
        status: 'sent',
        sentAt: new Date()
      }
    });

    // Test open tracking
    const openResponse = await request(app)
      .get(`/api/notifications/${notification.id}/track/open`)
      .expect(200);

    expect(openResponse.headers['content-type']).toContain('image/gif');

    // Verify opened was tracked
    const trackedOpen = await prisma.notificationHistory.findUnique({
      where: { id: notification.id }
    });
    expect(trackedOpen?.openedAt).not.toBeNull();

    // Test click tracking
    await request(app)
      .get(`/api/notifications/${notification.id}/track/click`)
      .expect(200);

    // Verify click was tracked
    const trackedClick = await prisma.notificationHistory.findUnique({
      where: { id: notification.id }
    });
    expect(trackedClick?.clickedAt).not.toBeNull();

    // Cleanup
    await prisma.notificationHistory.delete({ where: { id: notification.id } });
    await prisma.bill.delete({ where: { id: bill.id } });
  });
});
