/**
 * Process Notifications CLI
 *
 * Process pending notifications and send emails.
 * This can be run manually or scheduled via cron.
 *
 * Usage:
 *   npm run notify:process              # Process pending notifications
 *   npm run notify:process -- --digest  # Send daily digests
 */

import { getEmailService } from '../app/services/notifications';
import { getChangeDetectionService } from '../app/services/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isDigest = args.includes('--digest') || args.includes('-d');
  const digestFrequency = args.includes('--weekly') ? 'weekly' : 'daily';

  console.log('\n📨 Processing Notifications\n');
  console.log('='.repeat(60));

  try {
    const emailService = getEmailService();
    const changeDetection = getChangeDetectionService();

    if (isDigest) {
      // Send digest emails
      console.log(`\n📬 Sending ${digestFrequency} digest emails...`);
      await emailService.sendDigests(digestFrequency);
      console.log('✓ Digest emails sent');
    } else {
      // First, process any unnotified bill changes
      console.log('\n1️⃣  Processing unnotified bill changes...');
      const changeResult = await changeDetection.processUnnotifiedChanges({ autoNotify: true });
      console.log(`✓ Processed ${changeResult.processed} changes`);
      console.log(`✓ Created ${changeResult.notificationsSent} notifications`);

      // Then process pending notifications
      console.log('\n2️⃣  Processing pending email notifications...');
      await emailService.processPendingNotifications(100);
      console.log('✓ Pending notifications processed');
    }

    // Get updated stats
    console.log('\n3️⃣  Notification statistics (last hour)...');
    const notificationService = require('../app/services/notifications').getNotificationService();
    const stats = await notificationService.getStats(1);

    console.log(`✓ Total: ${stats.total}`);
    console.log(`✓ Sent: ${stats.sent}`);
    console.log(`✓ Pending: ${stats.pending}`);
    console.log(`✓ Failed: ${stats.failed}`);

    if (stats.failed > 0) {
      console.log('\n⚠️  Warning: Some notifications failed to send');
      console.log('   Check the NotificationHistory table for details');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Notification processing complete!\n');
  } catch (error) {
    console.error('\n❌ Error processing notifications:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
