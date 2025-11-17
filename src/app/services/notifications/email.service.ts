/**
 * Email Service
 *
 * Handles email delivery for notifications using Nodemailer.
 * Supports HTML and text emails with tracking pixels for open/click tracking.
 *
 * TODO: Production Email Service Migration
 * ========================================
 * For production deployment, consider migrating to a dedicated email service for:
 * - Better deliverability rates (99%+ vs ~95% with generic SMTP)
 * - Built-in spam protection and domain reputation management
 * - Advanced analytics (open rates, click rates, bounce rates)
 * - Better rate limiting and queue management
 * - Webhooks for delivery events
 *
 * Recommended services (in order of ease of integration):
 *
 * 1. **Resend** (https://resend.com)
 *    - Modern API, great DX, similar to Nodemailer
 *    - Free tier: 100 emails/day, 3,000/month
 *    - Paid: $20/mo for 50k emails
 *    - Migration effort: ~1 hour (just swap transporter)
 *
 * 2. **Postmark** (https://postmarkapp.com)
 *    - Best deliverability (99.7%+), focused on transactional emails
 *    - Free tier: 100 emails/month
 *    - Paid: $15/mo for 10k emails
 *    - Migration effort: ~1-2 hours
 *
 * 3. **SendGrid** (https://sendgrid.com)
 *    - Industry standard, robust features
 *    - Free tier: 100 emails/day
 *    - Paid: $20/mo for 50k emails
 *    - Migration effort: ~2 hours
 *
 * 4. **AWS SES** (https://aws.amazon.com/ses/)
 *    - Most cost-effective for high volume ($0.10 per 1k emails)
 *    - Requires AWS setup, more complex
 *    - Migration effort: ~3-4 hours
 *
 * Current architecture makes swapping easy - just implement a new EmailService
 * with the same interface and update the factory function below.
 */

import nodemailer from 'nodemailer';
import { getNotificationService, NotificationType } from './notification.service';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private notificationService = getNotificationService();

  /**
   * Initialize email transporter
   */
  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    // Check for email configuration
    const emailConfig = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // If no SMTP config, use test account (for development)
    if (!emailConfig.host || !emailConfig.auth.user) {
      console.log('[EmailService] No SMTP config found, creating test account...');
      const testAccount = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      console.log('[EmailService] Using Ethereal test account:', testAccount.user);
      console.log('[EmailService] View emails at: https://ethereal.email/messages');
    } else {
      this.transporter = nodemailer.createTransport(emailConfig);
      console.log('[EmailService] Using configured SMTP server:', emailConfig.host);
    }

    return this.transporter;
  }

  /**
   * Send a single email
   */
  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const transporter = await this.getTransporter();

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Congress Tracker" <noreply@congresstracker.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || this.textToHtml(options.text),
      });

      console.log('[EmailService] Email sent:', info.messageId);

      // For Ethereal test account, log preview URL
      if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('\n📧 ========================================');
        console.log('   EMAIL PREVIEW URL (click to view):');
        console.log('   ' + previewUrl);
        console.log('   ========================================\n');
      }

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Convert plain text to basic HTML
   */
  private textToHtml(text: string): string {
    return `
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
              border-radius: 0 0 5px 5px;
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
            <h2>Congress Tracker</h2>
          </div>
          <div class="content">
            ${text.split('\n').map(line => {
              if (line.trim().startsWith('•')) {
                return `<li>${line.trim().substring(1)}</li>`;
              }
              return line.trim() ? `<p>${line}</p>` : '';
            }).join('')}
          </div>
          <div class="footer">
            <p>You received this email because you're watching Congressional activity.</p>
            <p><a href="{{unsubscribeUrl}}">Unsubscribe</a> | <a href="{{preferencesUrl}}">Manage Preferences</a></p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Format notification as email with tracking
   */
  private formatNotificationEmail(notification: any): EmailOptions {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const unsubscribeToken = notification.user?.notificationPreferences?.unsubscribeToken;
    const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe/${unsubscribeToken}`;
    const preferencesUrl = `${baseUrl}/settings/notifications`;
    const trackingUrl = `${baseUrl}/api/notifications/${notification.id}/track/open`;

    // Replace placeholders in HTML
    let html = this.textToHtml(notification.body);
    html = html.replace('{{unsubscribeUrl}}', unsubscribeUrl);
    html = html.replace('{{preferencesUrl}}', preferencesUrl);

    // Add tracking pixel
    html += `<img src="${trackingUrl}" width="1" height="1" alt="" />`;

    return {
      to: notification.recipientEmail,
      subject: notification.subject,
      text: notification.body + `\n\nUnsubscribe: ${unsubscribeUrl}`,
      html,
    };
  }

  /**
   * Process and send pending notifications
   */
  async processPendingNotifications(limit = 100): Promise<void> {
    console.log('[EmailService] Processing pending notifications...');

    const notifications = await this.notificationService.getPendingNotifications(limit);

    if (notifications.length === 0) {
      console.log('[EmailService] No pending notifications');
      return;
    }

    console.log(`[EmailService] Found ${notifications.length} pending notifications`);

    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      // Skip if user has unsubscribed
      if (notification.user?.notificationPreferences?.unsubscribedAt) {
        console.log(`[EmailService] Skipping notification ${notification.id} - user unsubscribed`);
        await this.notificationService.markAsFailed(notification.id, 'User unsubscribed');
        failed++;
        continue;
      }

      const emailOptions = this.formatNotificationEmail(notification);
      const result = await this.sendEmail(emailOptions);

      if (result.success) {
        await this.notificationService.markAsSent(notification.id);
        sent++;
      } else {
        await this.notificationService.markAsFailed(notification.id, result.error || 'Unknown error');
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[EmailService] Completed: ${sent} sent, ${failed} failed`);
  }

  /**
   * Send digest emails for users with daily/weekly preferences
   */
  async sendDigests(frequency: 'daily' | 'weekly'): Promise<void> {
    console.log(`[EmailService] Sending ${frequency} digests...`);

    // Find users who want digests at this frequency
    const users = await this.notificationService['prisma'].userNotificationPreferences.findMany({
      where: {
        emailEnabled: true,
        digestFrequency: frequency,
        unsubscribedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    console.log(`[EmailService] Found ${users.length} users with ${frequency} digest preference`);

    for (const userPref of users) {
      try {
        // Create digest notification
        const digestNotification = await this.notificationService.createDigestNotification(
          userPref.userId,
          frequency as any
        );

        if (digestNotification) {
          console.log(`[EmailService] Created digest for user ${userPref.userId}`);
        }
      } catch (error) {
        console.error(`[EmailService] Failed to create digest for user ${userPref.userId}:`, error);
      }
    }

    // Now process the pending digest notifications
    await this.processPendingNotifications();
  }

  /**
   * Test email configuration
   */
  async testEmail(toAddress: string): Promise<SendEmailResult> {
    console.log('[EmailService] Sending test email to:', toAddress);

    return await this.sendEmail({
      to: toAddress,
      subject: 'Congress Tracker - Test Email',
      text: `This is a test email from Congress Tracker.\n\n` +
        `If you received this, your email configuration is working correctly!\n\n` +
        `Sent at: ${new Date().toISOString()}`,
    });
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
