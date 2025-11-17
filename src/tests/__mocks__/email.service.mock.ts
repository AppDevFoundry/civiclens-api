/**
 * Mock Email Service for Testing
 *
 * This mock replaces the real email service during tests to avoid:
 * - Network calls to create Ethereal test accounts
 * - Actual email sending
 * - SMTP configuration requirements
 */

import { SendEmailResult } from '../../app/services/notifications/email.service';

export class MockEmailService {
  // Track sent emails for test assertions
  public sentEmails: Array<{
    to: string;
    subject: string;
    text: string;
    html?: string;
  }> = [];

  /**
   * Mock sendEmail - just records the email instead of sending
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<SendEmailResult> {
    this.sentEmails.push(options);

    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
  }

  /**
   * Mock processPendingNotifications - does nothing in tests
   */
  async processPendingNotifications(limit = 100): Promise<void> {
    // In tests, we just resolve immediately without processing
    // The actual notification service logic is tested separately
    console.log('[MockEmailService] processPendingNotifications called (no-op in tests)');
  }

  /**
   * Mock sendDigests - does nothing in tests
   */
  async sendDigests(frequency: 'daily' | 'weekly'): Promise<void> {
    // In tests, we just resolve immediately
    console.log(`[MockEmailService] sendDigests(${frequency}) called (no-op in tests)`);
  }

  /**
   * Mock testEmail - simulates success
   */
  async testEmail(toAddress: string): Promise<SendEmailResult> {
    return {
      success: true,
      messageId: `test-${Date.now()}`,
    };
  }

  /**
   * Reset mock state between tests
   */
  reset() {
    this.sentEmails = [];
  }
}

// Singleton instance
let mockEmailServiceInstance: MockEmailService | null = null;

export function getMockEmailService(): MockEmailService {
  if (!mockEmailServiceInstance) {
    mockEmailServiceInstance = new MockEmailService();
  }
  return mockEmailServiceInstance;
}
