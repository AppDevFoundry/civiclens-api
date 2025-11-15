# Notification System

## Overview

The Congress Tracker notification system provides automated email notifications to users when bills they're watching experience changes. The system supports instant notifications, daily/weekly digests, and comprehensive tracking of delivery and engagement.

**Key Features:**

✅ **Real-time Notifications** - Alert users immediately when watched bills change
✅ **Digest Mode** - Batch notifications into daily or weekly summaries
✅ **Email Delivery** - Powered by Nodemailer with easy migration to Resend/SendGrid
✅ **Tracking** - Monitor open rates, click rates, and delivery status
✅ **Unsubscribe** - One-click unsubscribe with persistent tokens
✅ **Preferences** - Per-user control over notification types and frequency
✅ **Change Detection** - Automatic detection of bill status, actions, and cosponsors

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Sync System                              │
│  (Bill Sync → Change Detection → Notification Triggers)     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Notification Service                            │
│  • Creates notifications                                     │
│  • Manages user preferences                                  │
│  • Queues emails                                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Email Service                                   │
│  • Sends via Nodemailer/SMTP                                 │
│  • Handles delivery tracking                                 │
│  • Manages failures/retries                                  │
└─────────────────────────────────────────────────────────────┘
```

### Database Models

**UserNotificationPreferences**
- Global settings per user
- Email enabled/disabled
- Digest frequency (instant, daily, weekly, never)
- Timezone for digest scheduling
- Unsubscribe token

**NotificationHistory**
- Complete audit trail of all notifications
- Delivery status (pending, sent, failed, bounced)
- Engagement tracking (opened, clicked)
- Links to bills/members/change logs

**BillChangeLog** (existing, enhanced)
- `notified` flag to track which changes have triggered notifications
- Linked to NotificationHistory via `changeLogId`

---

## Usage

### For Users (via API)

#### Get Notification Preferences

```http
GET /api/notifications/preferences
Authorization: Token <jwt>
```

**Response:**
```json
{
  "preferences": {
    "id": 1,
    "userId": 42,
    "emailEnabled": true,
    "emailAddress": null,
    "digestFrequency": "daily",
    "digestTime": "08:00",
    "timezone": "America/New_York",
    "emailVerified": true
  }
}
```

#### Update Preferences

```http
PUT /api/notifications/preferences
Authorization: Token <jwt>
Content-Type: application/json

{
  "digestFrequency": "weekly",
  "digestTime": "09:00",
  "timezone": "America/Los_Angeles"
}
```

#### View Notification History

```http
GET /api/notifications/history?limit=50
Authorization: Token <jwt>
```

**Response:**
```json
{
  "history": [
    {
      "id": 123,
      "notificationType": "bill_change",
      "subject": "Update: H.R. 1234",
      "bill": {
        "id": 456,
        "title": "Sample Bill Title",
        "congress": 118,
        "billType": "hr",
        "billNumber": 1234
      },
      "status": "sent",
      "sentAt": "2025-11-15T10:00:00Z",
      "opened": true,
      "clicked": false,
      "createdAt": "2025-11-15T09:50:00Z"
    }
  ]
}
```

#### Unsubscribe

Users click the unsubscribe link in emails:

```
GET /api/notifications/unsubscribe/:token
```

This displays a confirmation page and disables notifications.

---

### For Administrators

#### Process Pending Notifications

```http
POST /api/notifications/admin/process
Authorization: Bearer <admin_secret>
Content-Type: application/json

{
  "limit": 100
}
```

#### Send Digest Emails

```http
POST /api/notifications/admin/digest
Authorization: Bearer <admin_secret>
Content-Type: application/json

{
  "frequency": "daily"  // or "weekly"
}
```

#### Test Email Configuration

```http
POST /api/notifications/admin/test-email
Authorization: Bearer <admin_secret>
Content-Type: application/json

{
  "to": "admin@example.com"
}
```

---

### CLI Commands

#### Test the Notification System

```bash
npm run test:notifications
```

This will:
1. Create a test user
2. Create a test watchlist
3. Generate a test notification
4. Send a test email
5. Display statistics

#### Process Pending Notifications

```bash
npm run notify:process
```

Processes bill changes and sends pending email notifications.

#### Send Daily Digests

```bash
npm run notify:digest:daily
```

#### Send Weekly Digests

```bash
npm run notify:digest:weekly
```

---

## Email Configuration

### Development (Ethereal Test Accounts)

By default, the system uses Ethereal test accounts:
- No SMTP configuration needed
- View emails at https://ethereal.email/messages
- Perfect for testing without sending real emails

### Production (SMTP)

Set these environment variables:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
EMAIL_FROM="Congress Tracker" <noreply@congresstracker.com>
APP_URL=https://congresstracker.com
```

### Production (Resend) - Recommended

For better deliverability, migrate to Resend:

1. Sign up at https://resend.com
2. Get your API key
3. Update `email.service.ts` to use Resend SDK:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// In sendEmail method:
await resend.emails.send({
  from: 'Congress Tracker <noreply@congresstracker.com>',
  to: options.to,
  subject: options.subject,
  html: options.html,
});
```

4. Benefits:
   - 99%+ deliverability
   - Built-in analytics
   - Webhooks for bounces/complaints
   - $20/mo for 50k emails

See `email.service.ts` for detailed migration notes.

---

## Notification Flow

### Instant Notifications

```
1. Bill sync detects changes
   ↓
2. ChangeDetectionService.processUnnotifiedChanges()
   ↓
3. For each change, find users watching that bill
   ↓
4. NotificationService.notifyBillChange()
   ↓
5. Create NotificationHistory record (status: pending)
   ↓
6. EmailService.processPendingNotifications()
   ↓
7. Send email via Nodemailer
   ↓
8. Update NotificationHistory (status: sent)
   ↓
9. Track opens/clicks via tracking pixels
```

### Digest Notifications

```
1. Cron job triggers daily/weekly digest
   ↓
2. EmailService.sendDigests('daily')
   ↓
3. Find users with digestFrequency='daily'
   ↓
4. For each user:
   - Get pending notifications from last 24 hours
   - Group by type (bill changes, member updates)
   - Create digest email
   - Mark individual notifications as sent
   ↓
5. Send digest email
```

---

## Customization

### Notification Types

Add new notification types in `notification.service.ts`:

```typescript
export enum NotificationType {
  BILL_CHANGE = 'bill_change',
  MEMBER_UPDATE = 'member_update',
  DIGEST = 'digest',
  WATCHLIST_UPDATE = 'watchlist_update',
  // Add your custom types:
  HEARING_SCHEDULED = 'hearing_scheduled',
  VOTE_ALERT = 'vote_alert',
}
```

### Email Templates

Customize email appearance in `email.service.ts`:

```typescript
private textToHtml(text: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Your custom styles */
        </style>
      </head>
      <body>
        <!-- Your custom template -->
      </body>
    </html>
  `;
}
```

### Change Detection

Add new change types in `change-detection.service.ts`:

```typescript
export enum ChangeType {
  STATUS = 'status',
  TITLE = 'title',
  ACTION = 'action',
  COSPONSORS = 'cosponsors',
  SUMMARY = 'summary',
  // Add your custom types:
  VOTE = 'vote',
  COMMITTEE_ASSIGNMENT = 'committee_assignment',
}
```

---

## Scheduled Jobs

### Recommended Cron Schedule

```cron
# Process bill changes and send notifications every hour
0 * * * * npm run notify:process

# Send daily digests at 8 AM
0 8 * * * npm run notify:digest:daily

# Send weekly digests every Monday at 9 AM
0 9 * * 1 npm run notify:digest:weekly

# Sync bills every hour (creates change logs)
0 * * * * npm run sync:bills
```

### Vercel Cron (if using Vercel)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/notifications",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/digest-daily",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/digest-weekly",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

Then add endpoints in `cron.controller.ts` to call the notification processing functions.

---

## Monitoring & Analytics

### Notification Statistics

```typescript
const stats = await notificationService.getStats(24); // last 24 hours

console.log(stats);
// {
//   total: 150,
//   sent: 145,
//   pending: 2,
//   failed: 3,
//   opened: 87,
//   clicked: 23,
//   byType: {
//     bill_change: 120,
//     digest: 25,
//     member_update: 5
//   },
//   openRate: "60.0%",
//   clickRate: "15.9%"
// }
```

### Key Metrics to Track

- **Delivery Rate**: `sent / total` (target: >99%)
- **Open Rate**: `opened / sent` (target: >20% for transactional emails)
- **Click Rate**: `clicked / sent` (target: >5%)
- **Failure Rate**: `failed / total` (target: <1%)
- **Unsubscribe Rate**: Track via UserNotificationPreferences

### Debugging Failed Notifications

```sql
-- Find recent failed notifications
SELECT * FROM "NotificationHistory"
WHERE status = 'failed'
ORDER BY "createdAt" DESC
LIMIT 20;

-- Check error messages
SELECT error, COUNT(*) as count
FROM "NotificationHistory"
WHERE status = 'failed'
GROUP BY error
ORDER BY count DESC;
```

---

## Testing

### Manual Testing

1. Create a test user:
   ```bash
   npm run dev:token
   ```

2. Create a watchlist via API:
   ```bash
   TOKEN="<your_token>"
   curl -X POST http://localhost:3000/api/watchlist \
     -H "Authorization: Token $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"billId": 1, "notifyOnActions": true}'
   ```

3. Trigger a bill sync:
   ```bash
   npm run sync:bills
   ```

4. Process notifications:
   ```bash
   npm run notify:process
   ```

5. Check your email (or Ethereal inbox)

### Automated Testing

Run the test script:

```bash
npm run test:notifications
```

This creates a complete test scenario with:
- Test user creation
- Test watchlist
- Test notification
- Test email delivery
- Statistics verification

---

## Troubleshooting

### Notifications Not Being Created

**Check:**
1. User has a watchlist for the bill
2. User has notifications enabled (`emailEnabled = true`)
3. User hasn't unsubscribed (`unsubscribedAt IS NULL`)
4. Bill changes are being detected (check `BillChangeLog` table)

**Debug:**
```typescript
// Check if changes are being logged
const changes = await prisma.billChangeLog.findMany({
  where: { notified: false },
  take: 10
});
console.log('Unnotified changes:', changes.length);

// Check user preferences
const prefs = await notificationService.getUserPreferences(userId);
console.log('User prefs:', prefs);
```

### Emails Not Being Sent

**Check:**
1. SMTP configuration is correct (or using Ethereal in dev)
2. Notifications are in "pending" status
3. No errors in `NotificationHistory.error` field

**Debug:**
```typescript
// Check pending notifications
const pending = await notificationService.getPendingNotifications(10);
console.log('Pending:', pending.length);

// Try test email
const result = await emailService.testEmail('your-email@example.com');
console.log('Test result:', result);
```

### Low Open Rates

**Possible causes:**
- Emails going to spam (check sender reputation)
- Subject lines not compelling
- Users don't find notifications valuable
- Tracking pixel being blocked (privacy tools)

**Solutions:**
- Use a dedicated email service (Resend/Postmark) for better deliverability
- A/B test subject lines
- Survey users about notification preferences
- Focus on high-value notifications only

---

## Security Considerations

### Unsubscribe Tokens

- Generated using `uuid()` (cryptographically secure)
- Unique per user
- Persistent (not time-limited)
- Can only disable notifications, not delete data

### Email Privacy

- Tracking pixels are optional (can be disabled)
- Open/click tracking respects user privacy
- No third-party tracking scripts
- Emails are sent directly, not via marketing platforms

### Rate Limiting

- Built-in 100ms delay between emails
- Respect SMTP server rate limits
- For high volume, consider:
  - Batch sending
  - Queue with rate limiting (Bull/BullMQ)
  - Dedicated email service (Resend/SendGrid)

---

## Future Enhancements

Planned improvements:

- [ ] SMS notifications (via Twilio)
- [ ] Push notifications (via Firebase)
- [ ] Slack/Discord webhooks
- [ ] In-app notifications
- [ ] Custom notification rules (advanced filtering)
- [ ] A/B testing for email content
- [ ] Rich email templates (React Email)
- [ ] Notification preferences UI
- [ ] Bulk notification management
- [ ] Notification analytics dashboard

---

## API Reference

### Notification Service

```typescript
class NotificationService {
  // Get user preferences
  async getUserPreferences(userId: number): Promise<UserNotificationPreferences>

  // Update preferences
  async updateUserPreferences(userId: number, updates: Partial<any>): Promise<UserNotificationPreferences>

  // Create notification
  async createNotification(options: NotificationOptions): Promise<NotificationHistory | null>

  // Notify about bill change
  async notifyBillChange(billId: number, changeType: string, changeLogId?: number): Promise<void>

  // Get pending notifications
  async getPendingNotifications(limit?: number): Promise<NotificationHistory[]>

  // Mark as sent/failed
  async markAsSent(notificationId: number): Promise<NotificationHistory>
  async markAsFailed(notificationId: number, error: string): Promise<NotificationHistory>

  // Track engagement
  async trackOpen(notificationId: number): Promise<NotificationHistory>
  async trackClick(notificationId: number): Promise<NotificationHistory>

  // Unsubscribe
  async unsubscribeByToken(token: string): Promise<UserNotificationPreferences>

  // Get notifications for digest
  async getNotificationsForDigest(userId: number, options: DigestOptions): Promise<NotificationHistory[]>

  // Create digest
  async createDigestNotification(userId: number, frequency: DigestFrequency): Promise<NotificationHistory | null>

  // Get stats
  async getStats(hours?: number): Promise<NotificationStats>
}
```

### Email Service

```typescript
class EmailService {
  // Send single email
  async sendEmail(options: EmailOptions): Promise<SendEmailResult>

  // Process pending notifications
  async processPendingNotifications(limit?: number): Promise<void>

  // Send digests
  async sendDigests(frequency: 'daily' | 'weekly'): Promise<void>

  // Test email
  async testEmail(toAddress: string): Promise<SendEmailResult>
}
```

---

## Related Documentation

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Developer quick-start guide
- **[ERROR_HANDLING.md](./ERROR_HANDLING.md)** - Error handling system
- **[PHASE_2_PROGRESS.md](./PHASE_2_PROGRESS.md)** - Phase 2 implementation progress
- **[PHASE_2.md](./PHASE_2.md)** - Complete Phase 2 roadmap

---

**Questions?** Open an issue or check the inline code documentation.

**Last Updated**: 2025-11-15
**Version**: 1.0.0
**Status**: ✅ Complete
