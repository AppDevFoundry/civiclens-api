/**
 * Send a bill notification email and show preview URL
 */

import nodemailer from 'nodemailer';

async function main() {
  console.log('\n📧 Sending bill change notification email...\n');

  // Create test account
  const testAccount = await nodemailer.createTestAccount();

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

  const billTitle = 'Healthcare Reform Act';
  const latestAction = 'Passed by House - Major update!';
  const actionDate = new Date().toLocaleDateString();

  // Send email
  const info = await transporter.sendMail({
    from: '"Congress Tracker" <noreply@congresstracker.com>',
    to: 'testuser@example.com',
    subject: `Update: ${billTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: #2c5282;
              color: white;
              padding: 20px;
              border-radius: 5px 5px 0 0;
            }
            .content {
              background: #f7fafc;
              padding: 20px;
              border: 1px solid #e2e8f0;
            }
            .alert {
              background: #fef5e7;
              border-left: 4px solid #f39c12;
              padding: 15px;
              margin: 15px 0;
            }
            .footer {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              font-size: 12px;
              color: #718096;
            }
            a {
              color: #3182ce;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin: 0;">📜 Congress Tracker</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Bill Update Notification</p>
          </div>
          <div class="content">
            <div class="alert">
              <strong>🔔 Bill Status Change</strong>
            </div>

            <h3 style="color: #2c5282; margin-top: 0;">${billTitle}</h3>

            <p><strong>Latest Action:</strong><br>${latestAction}</p>
            <p><strong>Date:</strong> ${actionDate}</p>

            <p style="margin-top: 20px;">
              This bill is on your watchlist. The status has been updated with new congressional action.
            </p>

            <p style="margin-top: 20px;">
              <a href="#" style="background: #3182ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                View Full Bill Details →
              </a>
            </p>
          </div>
          <div class="footer">
            <p>You received this email because you're watching this bill.</p>
            <p><a href="#">Manage Preferences</a> | <a href="#">Unsubscribe</a></p>
          </div>
        </body>
      </html>
    `,
  });

  console.log('✓ Email sent! Message ID:', info.messageId);

  // Get preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);

  console.log('\n' + '='.repeat(70));
  console.log('📧 VIEW THE BILL NOTIFICATION EMAIL (click this URL):');
  console.log('');
  console.log('   ' + previewUrl);
  console.log('');
  console.log('='.repeat(70));
  console.log('\n✅ This is what users will receive when bills they watch are updated!\n');
}

main().catch(console.error);
