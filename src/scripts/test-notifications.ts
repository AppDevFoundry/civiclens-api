/**
 * Test Notifications CLI
 *
 * Test the notification system:
 * - Create test notifications
 * - Send test emails
 * - View pending notifications
 * - Process notifications
 *
 * Usage:
 *   npm run test:notifications
 */

import { PrismaClient } from '@prisma/client';
import { getNotificationService, getEmailService, NotificationType } from '../app/services/notifications';
import * as devAuth from '../app/utils/dev-auth';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔔 Testing Notification System\n');
  console.log('='.repeat(60));

  try {
    // 1. Get or create test user
    console.log('\n1️⃣  Setting up test user...');
    const testUser = await devAuth.getOrCreateTestUser();
    console.log(`✓ Test user: ${testUser.username} (ID: ${testUser.id})`);

    // 2. Create a test bill watchlist
    console.log('\n2️⃣  Creating test watchlist...');
    const testBill = await prisma.bill.findFirst();

    if (!testBill) {
      console.log('❌ No bills found in database. Run sync:bills first.');
      process.exit(1);
    }

    const existingWatchlist = await prisma.userWatchlist.findUnique({
      where: {
        userId_billId: {
          userId: testUser.id,
          billId: testBill.id,
        },
      },
    });

    if (!existingWatchlist) {
      await prisma.userWatchlist.create({
        data: {
          userId: testUser.id,
          billId: testBill.id,
          notifyOnStatus: true,
          notifyOnActions: true,
        },
      });
      console.log(`✓ Created watchlist for bill: ${testBill.title}`);
    } else {
      console.log(`✓ Watchlist already exists for: ${testBill.title}`);
    }

    // 3. Create test notification
    console.log('\n3️⃣  Creating test notification...');
    const notificationService = getNotificationService();

    const notification = await notificationService.createNotification({
      userId: testUser.id,
      type: NotificationType.BILL_CHANGE,
      subject: `Test: Update to ${testBill.title || 'Test Bill'}`,
      body: `This is a test notification.\n\n` +
        `Bill: ${testBill.title || 'Unknown'}\n` +
        `Latest action: ${testBill.latestActionText || 'None'}\n\n` +
        `This is just a test to verify the notification system is working correctly.`,
      billId: testBill.id,
    });

    if (notification) {
      console.log(`✓ Created notification ID: ${notification.id}`);
    } else {
      console.log('ℹ️  Notification not created (user may have notifications disabled)');
    }

    // 4. Check user preferences
    console.log('\n4️⃣  Checking user notification preferences...');
    const preferences = await notificationService.getUserPreferences(testUser.id);
    console.log(`✓ Email enabled: ${preferences.emailEnabled}`);
    console.log(`✓ Digest frequency: ${preferences.digestFrequency}`);
    console.log(`✓ Email: ${preferences.emailAddress || testUser.email}`);

    // 5. Get pending notifications
    console.log('\n5️⃣  Checking pending notifications...');
    const pending = await notificationService.getPendingNotifications(10);
    console.log(`✓ Found ${pending.length} pending notifications`);

    if (pending.length > 0) {
      console.log('\nPending notifications:');
      pending.slice(0, 3).forEach((n, i) => {
        console.log(`  ${i + 1}. [${n.notificationType}] ${n.subject}`);
      });
    }

    // 6. Send test email
    console.log('\n6️⃣  Sending test email...');
    const emailService = getEmailService();

    const result = await emailService.testEmail(testUser.email);

    if (result.success) {
      console.log(`✓ Test email sent successfully!`);
      console.log(`  Message ID: ${result.messageId}`);

      if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
        console.log(`\n📧 Check your email at: https://ethereal.email/messages`);
        console.log(`   Look for emails to: ${testUser.email}`);
      }
    } else {
      console.log(`❌ Failed to send test email: ${result.error}`);
    }

    // 7. Process pending notifications
    console.log('\n7️⃣  Processing pending notifications...');
    console.log('   (This will send emails for all pending notifications)');
    console.log('   Waiting 3 seconds... (Ctrl+C to cancel)');

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await emailService.processPendingNotifications(5);
    console.log('✓ Processed notifications');

    // 8. Get stats
    console.log('\n8️⃣  Notification statistics...');
    const stats = await notificationService.getStats(24);
    console.log(`✓ Total notifications (24h): ${stats.total}`);
    console.log(`✓ Sent: ${stats.sent}`);
    console.log(`✓ Pending: ${stats.pending}`);
    console.log(`✓ Failed: ${stats.failed}`);
    console.log(`✓ Open rate: ${stats.openRate}`);
    console.log(`✓ Click rate: ${stats.clickRate}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Notification system test complete!\n');
    console.log('Next steps:');
    console.log('  1. Check your email (or Ethereal) for test messages');
    console.log('  2. Create a watchlist for a bill via the API');
    console.log('  3. Run a bill sync to trigger real notifications');
    console.log('  4. Use `npm run notify:process` to send pending notifications');
    console.log('');
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
