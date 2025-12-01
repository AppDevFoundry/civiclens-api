/**
 * Mock Notification Data for Testing
 *
 * Provides test fixtures for notification-related integration tests.
 */

import { mockUsers } from '../users/mock-data';
import { mockBills, mockMembers } from '../watchlist/mock-data';

/**
 * Generate a UUID-like token for testing
 */
function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Mock user notification preferences
 */
export const mockNotificationPreferences = {
  // User 1 - default settings
  testUserPrefs: {
    id: 1,
    userId: mockUsers.testUser.id,
    emailEnabled: true,
    emailAddress: null, // Uses user.email
    digestFrequency: 'daily',
    digestTime: '08:00',
    timezone: 'America/New_York',
    unsubscribeToken: 'test-unsub-token-12345',
    unsubscribedAt: null,
    emailVerified: true,
    emailVerificationToken: null,
    emailVerifiedAt: new Date('2023-10-01T10:00:00Z'),
    createdAt: new Date('2023-10-01T10:00:00Z'),
    updatedAt: new Date('2023-10-01T10:00:00Z'),
  },
  // User 2 - instant notifications
  secondaryUserPrefs: {
    id: 2,
    userId: mockUsers.secondaryUser.id,
    emailEnabled: true,
    emailAddress: 'alternate@example.com',
    digestFrequency: 'instant',
    digestTime: '09:00',
    timezone: 'America/Los_Angeles',
    unsubscribeToken: 'test-unsub-token-67890',
    unsubscribedAt: null,
    emailVerified: true,
    emailVerificationToken: null,
    emailVerifiedAt: new Date('2023-10-02T10:00:00Z'),
    createdAt: new Date('2023-10-02T10:00:00Z'),
    updatedAt: new Date('2023-10-02T10:00:00Z'),
  },
  // User 3 - weekly digest
  newUserPrefs: {
    id: 3,
    userId: mockUsers.newUser.id,
    emailEnabled: true,
    emailAddress: null,
    digestFrequency: 'weekly',
    digestTime: '10:00',
    timezone: 'America/Chicago',
    unsubscribeToken: 'test-unsub-token-abcde',
    unsubscribedAt: null,
    emailVerified: false,
    emailVerificationToken: 'verify-token-12345',
    emailVerifiedAt: null,
    createdAt: new Date('2023-10-03T10:00:00Z'),
    updatedAt: new Date('2023-10-03T10:00:00Z'),
  },
  // User 4 - unsubscribed
  unsubscribedUserPrefs: {
    id: 4,
    userId: mockUsers.unsubscribedUser.id,
    emailEnabled: false,
    emailAddress: null,
    digestFrequency: 'never',
    digestTime: '08:00',
    timezone: 'America/New_York',
    unsubscribeToken: 'test-unsub-token-fghij',
    unsubscribedAt: new Date('2023-10-15T10:00:00Z'),
    emailVerified: true,
    emailVerificationToken: null,
    emailVerifiedAt: new Date('2023-10-04T10:00:00Z'),
    createdAt: new Date('2023-10-04T10:00:00Z'),
    updatedAt: new Date('2023-10-15T10:00:00Z'),
  },
};

/**
 * Mock notification history entries
 */
export const mockNotificationHistory = {
  // Sent notification for bill change
  billChangeNotification: {
    id: 1,
    userId: mockUsers.testUser.id,
    notificationType: 'bill_change',
    subject: 'HR 1234 - Infrastructure Investment and Jobs Act - Status Update',
    body: 'Your watched bill has been updated.\n\nLatest Action: Referred to the Committee on Transportation\n\nView Details: https://example.com/bills/118/hr/1234',
    billId: mockBills.bill1.id,
    memberId: null,
    changeLogId: 1,
    deliveryMethod: 'email',
    recipientEmail: 'test@example.com',
    status: 'sent',
    sentAt: new Date('2023-11-10T14:00:00Z'),
    failedAt: null,
    error: null,
    opened: true,
    openedAt: new Date('2023-11-10T15:30:00Z'),
    clicked: true,
    clickedAt: new Date('2023-11-10T15:31:00Z'),
    createdAt: new Date('2023-11-10T12:00:00Z'),
  },
  // Pending notification
  pendingNotification: {
    id: 2,
    userId: mockUsers.testUser.id,
    notificationType: 'bill_change',
    subject: 'S 567 - Healthcare Reform Act - Passed Senate',
    body: 'Your watched bill has been updated.\n\nLatest Action: Passed Senate\n\nView Details: https://example.com/bills/118/s/567',
    billId: mockBills.bill2.id,
    memberId: null,
    changeLogId: 3,
    deliveryMethod: 'email',
    recipientEmail: 'test@example.com',
    status: 'pending',
    sentAt: null,
    failedAt: null,
    error: null,
    opened: false,
    openedAt: null,
    clicked: false,
    clickedAt: null,
    createdAt: new Date('2023-10-25T09:00:00Z'),
  },
  // Failed notification
  failedNotification: {
    id: 3,
    userId: mockUsers.secondaryUser.id,
    notificationType: 'digest',
    subject: 'Your Daily Congress Digest',
    body: 'Here are the updates from your watchlist...',
    billId: null,
    memberId: null,
    changeLogId: null,
    deliveryMethod: 'email',
    recipientEmail: 'alternate@example.com',
    status: 'failed',
    sentAt: null,
    failedAt: new Date('2023-11-09T08:05:00Z'),
    error: 'SMTP connection timeout',
    opened: false,
    openedAt: null,
    clicked: false,
    clickedAt: null,
    createdAt: new Date('2023-11-09T08:00:00Z'),
  },
  // Member update notification
  memberUpdateNotification: {
    id: 4,
    userId: mockUsers.testUser.id,
    notificationType: 'member_update',
    subject: 'Rep. John Smith - Voting Record Update',
    body: 'The member you are watching has new activity.',
    billId: null,
    memberId: mockMembers.member1.id,
    changeLogId: null,
    deliveryMethod: 'email',
    recipientEmail: 'test@example.com',
    status: 'sent',
    sentAt: new Date('2023-11-08T10:00:00Z'),
    failedAt: null,
    error: null,
    opened: false,
    openedAt: null,
    clicked: false,
    clickedAt: null,
    createdAt: new Date('2023-11-08T09:00:00Z'),
  },
  // Digest notification
  digestNotification: {
    id: 5,
    userId: mockUsers.testUser.id,
    notificationType: 'digest',
    subject: 'Your Daily Congress Digest - 3 Updates',
    body: 'Here are the updates from your watchlist:\n\n1. HR 1234 - New action\n2. S 567 - Passed Senate\n3. Rep. John Smith - New vote',
    billId: null,
    memberId: null,
    changeLogId: null,
    deliveryMethod: 'email',
    recipientEmail: 'test@example.com',
    status: 'sent',
    sentAt: new Date('2023-11-11T08:00:00Z'),
    failedAt: null,
    error: null,
    opened: true,
    openedAt: new Date('2023-11-11T09:15:00Z'),
    clicked: false,
    clickedAt: null,
    createdAt: new Date('2023-11-11T08:00:00Z'),
  },
};

/**
 * Request payloads for notification API tests
 */
export const mockNotificationPayloads = {
  updatePreferencesValid: {
    emailEnabled: true,
    digestFrequency: 'weekly',
    digestTime: '09:00',
    timezone: 'America/Los_Angeles',
  },
  updatePreferencesDisable: {
    emailEnabled: false,
    digestFrequency: 'never',
  },
  updatePreferencesInstant: {
    emailEnabled: true,
    digestFrequency: 'instant',
  },
  updatePreferencesEmail: {
    emailAddress: 'newemail@example.com',
  },
  adminProcessPending: {
    limit: 100,
  },
  adminDigestDaily: {
    frequency: 'daily',
  },
  adminDigestWeekly: {
    frequency: 'weekly',
  },
  adminTestEmail: {
    to: 'admin-test@example.com',
  },
  adminTestEmailInvalid: {
    // Missing 'to' field
  },
};

/**
 * Expected response structures for assertions
 */
export const mockNotificationResponses = {
  preferencesDefault: {
    preferences: expect.objectContaining({
      id: expect.any(Number),
      userId: expect.any(Number),
      emailEnabled: true,
      digestFrequency: expect.any(String),
    }),
  },
  preferencesUpdated: {
    success: true,
    preferences: expect.objectContaining({
      id: expect.any(Number),
    }),
  },
  historyEmpty: {
    history: [],
  },
  historyWithItems: {
    history: expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(Number),
        notificationType: expect.any(String),
        subject: expect.any(String),
      }),
    ]),
  },
  statsDefault: {
    stats: expect.objectContaining({
      total: expect.any(Number),
      sent: expect.any(Number),
      pending: expect.any(Number),
      failed: expect.any(Number),
    }),
  },
  adminProcessSuccess: {
    success: true,
    message: 'Processed pending notifications',
    stats: expect.any(Object),
  },
  adminDigestSuccess: {
    success: true,
    message: expect.stringMatching(/Sent (daily|weekly) digest emails/),
  },
  adminTestEmailSuccess: {
    success: true,
    messageId: expect.any(String),
  },
};

/**
 * Unsubscribe tokens for testing
 */
export const mockUnsubscribeTokens = {
  valid: mockNotificationPreferences.testUserPrefs.unsubscribeToken,
  secondary: mockNotificationPreferences.secondaryUserPrefs.unsubscribeToken,
  invalid: 'invalid-token-not-in-database',
  expired: 'expired-token-12345',
};

/**
 * Mock email templates
 */
export const mockEmailTemplates = {
  billChangeSubject: (billNumber: string, billTitle: string) =>
    `${billNumber} - ${billTitle} - Status Update`,

  billChangeBody: (billNumber: string, action: string, url: string) => `
Your watched bill has been updated.

Latest Action: ${action}

View Details: ${url}

---
To unsubscribe from these notifications, click here: [unsubscribe_url]
  `.trim(),

  digestSubject: (count: number) =>
    `Your Daily Congress Digest - ${count} Update${count !== 1 ? 's' : ''}`,

  digestBody: (updates: string[]) => `
Here are the updates from your watchlist:

${updates.map((u, i) => `${i + 1}. ${u}`).join('\n')}

---
To update your notification preferences, visit your account settings.
  `.trim(),
};

export default {
  mockNotificationPreferences,
  mockNotificationHistory,
  mockNotificationPayloads,
  mockNotificationResponses,
  mockUnsubscribeTokens,
  mockEmailTemplates,
};
