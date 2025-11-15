/**
 * Send a single test email and show the preview URL
 */

import { getEmailService } from '../app/services/notifications';

async function main() {
  const emailService = getEmailService();

  console.log('\n📧 Sending test email...\n');

  const result = await emailService.testEmail('test@example.com');

  if (result.success) {
    console.log('✓ Email sent successfully!');
    console.log('  Message ID:', result.messageId);
  } else {
    console.log('✗ Failed:', result.error);
  }

  console.log('\n');
}

main();
