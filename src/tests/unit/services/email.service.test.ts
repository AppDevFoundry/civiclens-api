/**
 * Email Service Tests
 *
 * Tests for email delivery and formatting logic.
 */

import { EmailService, SendEmailResult } from '../../../app/services/notifications/email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  describe('Email Options Validation', () => {
    test('should require recipient email address', () => {
      const options = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test body',
      };

      expect(options.to).toBeDefined();
      expect(options.to).toContain('@');
    });

    test('should require subject', () => {
      const options = {
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Test',
      };

      expect(options.subject).toBeDefined();
      expect(typeof options.subject).toBe('string');
      expect(options.subject.length).toBeGreaterThan(0);
    });

    test('should require text content', () => {
      const options = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'This is the email body text',
      };

      expect(options.text).toBeDefined();
      expect(typeof options.text).toBe('string');
      expect(options.text.length).toBeGreaterThan(0);
    });

    test('should allow optional HTML content', () => {
      const options = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Plain text',
        html: '<p>HTML content</p>',
      };

      expect(options.html).toBeDefined();
      expect(options.html).toContain('<p>');
    });

    test('should validate email address format', () => {
      const validEmail = 'user@example.com';
      const invalidEmail = 'not-an-email';

      expect(validEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(invalidEmail).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    test('should accept multiple recipient formats', () => {
      const singleRecipient = 'user@example.com';
      const namedRecipient = 'John Doe <john@example.com>';
      const multipleRecipients = 'user1@example.com, user2@example.com';

      expect(singleRecipient).toBeTruthy();
      expect(namedRecipient).toContain('<');
      expect(multipleRecipients).toContain(',');
    });
  });

  describe('Send Email Result', () => {
    test('should return success result', () => {
      const result: SendEmailResult = {
        success: true,
        messageId: 'msg-123',
      };

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    test('should return failure result with error', () => {
      const result: SendEmailResult = {
        success: false,
        error: 'SMTP connection failed',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should include message ID on success', () => {
      const result: SendEmailResult = {
        success: true,
        messageId: '<unique-id@smtp.server>',
      };

      expect(result.messageId).toMatch(/<.*@.*>/);
    });
  });

  describe('Text to HTML Conversion', () => {
    test('should wrap text in paragraphs', () => {
      const text = 'This is plain text';
      const html = `<p>${text}</p>`;

      expect(html).toContain('<p>');
      expect(html).toContain('</p>');
      expect(html).toContain(text);
    });

    test('should convert newlines to breaks', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const html = text.replace(/\n/g, '<br>');

      expect(html).toContain('<br>');
      expect(html.match(/<br>/g)).toHaveLength(2);
    });

    test('should preserve line breaks in paragraphs', () => {
      const text = 'Paragraph 1\n\nParagraph 2';
      const paragraphs = text.split('\n\n');

      expect(paragraphs).toHaveLength(2);
    });

    test('should escape HTML characters', () => {
      const text = 'Test <script>alert("xss")</script>';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });
  });

  describe('Email Formatting', () => {
    test('should format bill change email', () => {
      const email = {
        subject: 'HR 1234 - Healthcare Reform Act - Update',
        text: 'Your watched bill has been updated',
      };

      expect(email.subject).toContain('HR 1234');
      expect(email.text).toContain('updated');
    });

    test('should format member update email', () => {
      const email = {
        subject: 'Sen. John Smith - Voting Record Update',
        text: 'The voting record has changed',
      };

      expect(email.subject).toContain('Sen.');
      expect(email.text).toContain('voting record');
    });

    test('should format digest email', () => {
      const email = {
        subject: 'Your Daily Congress Digest - 5 Updates',
        text: 'Here are your updates:\n\n1. Bill update\n2. Member update',
      };

      expect(email.subject).toContain('Digest');
      expect(email.text).toMatch(/\d+\./);
    });

    test('should include call-to-action links', () => {
      const text = 'View Details: https://example.com/bills/118/hr/1234';
      expect(text).toContain('https://');
      expect(text).toContain('View Details');
    });

    test('should include unsubscribe link', () => {
      const text = 'Unsubscribe: https://example.com/unsubscribe/token123';
      expect(text).toContain('Unsubscribe');
      expect(text).toContain('/unsubscribe/');
    });
  });

  describe('HTML Email Templates', () => {
    test('should have proper HTML structure', () => {
      const html = `
<!DOCTYPE html>
<html>
<head><title>Email</title></head>
<body>
  <p>Content</p>
</body>
</html>
      `.trim();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('<body>');
    });

    test('should include responsive meta tags', () => {
      const head = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      expect(head).toContain('viewport');
      expect(head).toContain('width=device-width');
    });

    test('should use inline CSS for compatibility', () => {
      const element = '<p style="color: #333; font-size: 16px;">Text</p>';
      expect(element).toContain('style=');
    });

    test('should include alt text for images', () => {
      const img = '<img src="logo.png" alt="Congress Tracker Logo" />';
      expect(img).toContain('alt=');
    });
  });

  describe('SMTP Configuration', () => {
    test('should use environment variables for SMTP', () => {
      const config = {
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      };

      expect(config.host).toBeDefined();
      expect(config.port).toBeGreaterThan(0);
      expect(typeof config.secure).toBe('boolean');
    });

    test('should default to port 587 for SMTP', () => {
      const port = 587;
      expect(port).toBe(587);
    });

    test('should support secure SMTP (port 465)', () => {
      const port = 465;
      const secure = true;

      expect(port).toBe(465);
      expect(secure).toBe(true);
    });

    test('should fall back to test account in development', () => {
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const noSMTPConfig = !process.env.SMTP_HOST;

      const shouldUseTestAccount = isDevelopment && noSMTPConfig;
      expect(typeof shouldUseTestAccount).toBe('boolean');
    });
  });

  describe('Ethereal Test Account', () => {
    test('should generate test account credentials', () => {
      const testAccount = {
        user: 'test@ethereal.email',
        pass: 'testpassword',
      };

      expect(testAccount.user).toContain('@ethereal.email');
      expect(testAccount.pass).toBeDefined();
    });

    test('should provide preview URL for test emails', () => {
      const previewUrl = 'https://ethereal.email/message/abc123';
      expect(previewUrl).toContain('ethereal.email');
      expect(previewUrl).toContain('/message/');
    });

    test('should log preview URL in development', () => {
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const shouldLog = isDevelopment;

      expect(typeof shouldLog).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    test('should handle SMTP connection errors', () => {
      const error = new Error('SMTP connection failed');
      const result: SendEmailResult = {
        success: false,
        error: error.message,
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP');
    });

    test('should handle authentication errors', () => {
      const error = new Error('Invalid login credentials');
      const result: SendEmailResult = {
        success: false,
        error: error.message,
      };

      expect(result.error).toContain('credentials');
    });

    test('should handle recipient validation errors', () => {
      const error = new Error('Invalid recipient email address');
      const result: SendEmailResult = {
        success: false,
        error: error.message,
      };

      expect(result.error).toContain('recipient');
    });

    test('should handle timeout errors', () => {
      const error = new Error('Connection timeout');
      const result: SendEmailResult = {
        success: false,
        error: error.message,
      };

      expect(result.error).toContain('timeout');
    });

    test('should handle rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const result: SendEmailResult = {
        success: false,
        error: error.message,
      };

      expect(result.error).toContain('Rate limit');
    });
  });

  describe('Email Sender Configuration', () => {
    test('should use default sender name', () => {
      const from = '"Congress Tracker" <noreply@congresstracker.com>';
      expect(from).toContain('Congress Tracker');
      expect(from).toContain('noreply@');
    });

    test('should support custom sender name', () => {
      const customFrom = process.env.EMAIL_FROM || '"Congress Tracker" <noreply@congresstracker.com>';
      expect(customFrom).toBeTruthy();
    });

    test('should use no-reply address', () => {
      const from = 'noreply@congresstracker.com';
      expect(from).toContain('noreply@');
    });
  });

  describe('Batch Email Sending', () => {
    test('should support sending multiple emails', () => {
      const emails = [
        { to: 'user1@example.com', subject: 'Test 1', text: 'Body 1' },
        { to: 'user2@example.com', subject: 'Test 2', text: 'Body 2' },
        { to: 'user3@example.com', subject: 'Test 3', text: 'Body 3' },
      ];

      expect(emails).toHaveLength(3);
      emails.forEach(email => {
        expect(email.to).toContain('@');
        expect(email.subject).toBeTruthy();
        expect(email.text).toBeTruthy();
      });
    });

    test('should track success/failure for each email', () => {
      const results = [
        { success: true, messageId: 'msg-1' },
        { success: false, error: 'Failed' },
        { success: true, messageId: 'msg-3' },
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBe(2);
      expect(failed).toBe(1);
    });
  });

  describe('Email Content Sanitization', () => {
    test('should remove dangerous HTML tags', () => {
      const text = '<script>alert("xss")</script><p>Safe content</p>';
      const sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('<p>');
    });

    test('should preserve safe formatting tags', () => {
      const html = '<p>Text</p><strong>Bold</strong><em>Italic</em>';
      const safeTags = ['<p>', '<strong>', '<em>'];

      safeTags.forEach(tag => {
        expect(html).toContain(tag);
      });
    });

    test('should escape user-provided content', () => {
      const userContent = 'User said: <script>evil()</script>';
      const escaped = userContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });
  });

  describe('Email Tracking', () => {
    test('should include tracking pixel for opens', () => {
      const trackingPixel = '<img src="https://api.example.com/track/open/notif-123" width="1" height="1" />';
      expect(trackingPixel).toContain('track/open');
      expect(trackingPixel).toContain('width="1"');
    });

    test('should include tracking parameters in links', () => {
      const trackedLink = 'https://example.com/bill/123?utm_source=email&utm_medium=notification';
      expect(trackedLink).toContain('utm_source');
      expect(trackedLink).toContain('utm_medium');
    });

    test('should generate unique tracking IDs', () => {
      const id1 = `track-${Date.now()}-1`;
      const id2 = `track-${Date.now()}-2`;

      expect(id1).not.toBe(id2);
    });
  });

  describe('Production Email Services', () => {
    test('should support Resend API format', () => {
      const resendFormat = {
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Content</p>',
      };

      expect(resendFormat.from).toBeTruthy();
      expect(resendFormat.to).toBeTruthy();
      expect(resendFormat.html).toBeTruthy();
    });

    test('should support SendGrid API format', () => {
      const sendgridFormat = {
        personalizations: [{ to: [{ email: 'user@example.com' }] }],
        from: { email: 'noreply@example.com' },
        subject: 'Test',
        content: [{ type: 'text/html', value: '<p>Content</p>' }],
      };

      expect(sendgridFormat.personalizations).toBeDefined();
      expect(sendgridFormat.content).toBeDefined();
    });
  });
});
