/**
 * Quick email test - sends one email and shows direct preview link
 */

import nodemailer from 'nodemailer';

async function main() {
  console.log('\n📧 Creating test email account and sending...\n');

  // Create test account
  const testAccount = await nodemailer.createTestAccount();
  console.log('✓ Test account created:', testAccount.user);

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // Send email
  const info = await transporter.sendMail({
    from: '"Congress Tracker" <noreply@congresstracker.com>',
    to: 'test@example.com',
    subject: 'Test Email from Congress Tracker',
    text: 'This is a test email to verify the notification system is working!',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #2c5282;">Congress Tracker Test Email</h2>
        <p>This is a test email to verify the notification system is working correctly.</p>
        <p>If you can see this, the email delivery system is functional! ✅</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #718096; font-size: 12px;">
          This is a test email from the Congress Tracker notification system.
        </p>
      </div>
    `,
  });

  console.log('✓ Email sent! Message ID:', info.messageId);

  // Get preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);

  console.log('\n' + '='.repeat(70));
  console.log('📧 VIEW YOUR EMAIL HERE (click or copy this URL):');
  console.log('');
  console.log('   ' + previewUrl);
  console.log('');
  console.log('='.repeat(70));
  console.log('\n✅ Test complete! Click the URL above to view the email.\n');
}

main().catch(console.error);
