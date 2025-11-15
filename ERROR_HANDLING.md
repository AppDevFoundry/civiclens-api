# Error Handling System

## Overview

The Congress Sync System includes a comprehensive error handling and retry mechanism that automatically handles transient failures, respects API rate limits, and provides visibility into system health.

## Features

✅ **Intelligent Error Classification** - Automatic categorization of errors
✅ **Exponential Backoff Retry** - Smart retry logic with jitter
✅ **Error Tracking** - Database logging of all errors
✅ **Metrics & Monitoring** - Real-time error statistics
✅ **Admin Alerts** - Automatic alerting for critical issues
✅ **Resolution Tracking** - Mark errors as resolved with notes

---

## Error Classification

The system automatically classifies errors into types and severity levels:

### Error Types

| Type | Description | Retry? | Example |
|------|-------------|--------|---------|
| **RETRYABLE** | Temporary issues that should be retried | ✅ Yes | Rate limits, server errors (500+) |
| **FATAL** | Permanent failures that won't succeed on retry | ❌ No | Bad requests (400), not found (404) |
| **TRANSIENT** | Brief issues that auto-resolve | ✅ Yes | Network timeouts, connection refused |
| **CONFIGURATION** | Setup/config problems | ❌ No | Invalid API key, auth failures |
| **UNKNOWN** | Unclassified errors | ❌ No | Conservative default |

### Severity Levels

| Severity | Impact | Alert? | Example |
|----------|--------|--------|---------|
| **LOW** | Minor, doesn't affect core functionality | ❌ | Single bill not found |
| **MEDIUM** | Noticeable, some features affected | ❌ | Rate limit exceeded |
| **HIGH** | Major, core functionality impaired | ⚠️ | Server errors |
| **CRITICAL** | System-breaking, immediate attention | 🚨 | Authentication failures |

---

## Usage

### Basic Usage (withRetry)

The error handler automatically wraps operations with retry logic:

```typescript
import { getErrorHandler } from './services/sync';

const errorHandler = getErrorHandler();

// Wrap any async operation
const result = await errorHandler.withRetry(
  async () => {
    // Your operation here
    return await someApiCall();
  },
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
  { operation: 'someApiCall', param1: 'value' } // Context for debugging
);
```

### Integrated in Sync Services

The bill sync service already uses the error handler:

```typescript
// In bill-sync.service.ts
const apiResponse = await this.errorHandler.withRetry(
  async () => {
    return await CongressApi.bills.listBills({
      congress: 118,
      limit: 100,
    });
  },
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
  },
  { operation: 'listBills', congress: 118 }
);
```

### Manual Error Classification

```typescript
const errorHandler = getErrorHandler();

try {
  // Some operation
} catch (error) {
  const classified = errorHandler.classifyError(error, {
    operation: 'customOperation',
    billId: 123,
  });

  console.log('Error type:', classified.type);
  console.log('Severity:', classified.severity);
  console.log('Should retry:', classified.shouldRetry);
  console.log('Retry after:', classified.retryAfterMs);
}
```

---

## Retry Configuration

### Default Configuration

```typescript
{
  maxAttempts: 3,              // Try up to 3 times
  initialDelayMs: 1000,        // Start with 1 second delay
  maxDelayMs: 60000,           // Cap at 1 minute
  backoffMultiplier: 2,        // Double delay each retry
  jitterMs: 100                // Add random jitter
}
```

### Exponential Backoff Calculation

```
Delay = min(
  initialDelay * (multiplier ^ (attempt - 1)) + jitter,
  maxDelay
)
```

**Example delays** (with default config):
- Attempt 1: 1000ms + jitter (~1.0-1.1s)
- Attempt 2: 2000ms + jitter (~2.0-2.1s)
- Attempt 3: 4000ms + jitter (~4.0-4.1s)

### Custom Configuration

```typescript
await errorHandler.withRetry(
  operation,
  {
    maxAttempts: 5,              // More attempts
    initialDelayMs: 500,         // Start faster
    maxDelayMs: 30000,           // Cap lower
    backoffMultiplier: 3,        // Aggressive backoff
    jitterMs: 200,               // More jitter
  }
);
```

---

## Monitoring & Metrics

### Get Error Metrics

```typescript
const errorHandler = getErrorHandler();
const metrics = errorHandler.getMetrics();

console.log('Total errors:', metrics.totalErrors);
console.log('Retries attempted:', metrics.retriesAttempted);
console.log('Retries succeeded:', metrics.retriesSucceeded);
console.log('Retries failed:', metrics.retriesFailed);
console.log('Errors by type:', metrics.errorsByType);
console.log('Errors by severity:', metrics.errorsBySeverity);
```

### Get Error Statistics

```typescript
// Get errors from last 24 hours
const stats = await errorHandler.getErrorStats(24);

console.log('Total errors:', stats.totalErrors);
console.log('Critical errors:', stats.criticalErrors);
console.log('Errors by type:', stats.errorsByType);
console.log('Errors by severity:', stats.errorsBySeverity);
console.log('Recent errors:', stats.recentErrors);
```

### Check Alert Conditions

```typescript
const shouldAlert = await errorHandler.shouldAlert();

if (shouldAlert) {
  // Trigger alert (email, Slack, PagerDuty, etc.)
  console.log('⚠️  Alert condition detected!');
}
```

**Alert triggers:**
- More than 10 errors in the last hour
- Any critical errors

---

## Admin API Endpoints

### View Error Dashboard

```http
GET /api/admin/errors?hours=24&critical=false
```

**Response:**
```json
{
  "stats": {
    "totalErrors": 5,
    "criticalErrors": 1,
    "errorsByType": {
      "retryable": 3,
      "fatal": 2
    },
    "errorsBySeverity": {
      "medium": 3,
      "high": 2
    }
  },
  "recentErrors": [...],
  "metrics": {
    "totalErrors": 5,
    "retriesAttempted": 9,
    "retriesSucceeded": 6,
    "retriesFailed": 3
  }
}
```

### Check Alert Status

```http
GET /api/admin/errors/alerts
```

**Response:**
```json
{
  "shouldAlert": false,
  "stats": {
    "totalErrors": 2,
    "criticalErrors": 0
  },
  "timestamp": "2025-11-15T04:00:00.000Z"
}
```

### Resolve Error

```http
POST /api/admin/errors/:id/resolve
Content-Type: application/json

{
  "resolvedBy": "admin@example.com",
  "notes": "Fixed by updating API key"
}
```

**Response:**
```json
{
  "success": true,
  "error": {
    "id": 123,
    "resolved": true,
    "resolvedAt": "2025-11-15T04:00:00.000Z",
    "resolvedBy": "admin@example.com",
    "notes": "Fixed by updating API key"
  }
}
```

---

## Database Schema

### SyncError Model

```prisma
model SyncError {
  id          Int      @id @default(autoincrement())
  errorType   String   // "retryable", "fatal", etc.
  severity    String   // "low", "medium", "high", "critical"
  message     String
  stackTrace  String?  @db.Text
  context     Json?    // Additional context
  shouldAlert Boolean  @default(false)
  alerted     Boolean  @default(false)
  alertedAt   DateTime?
  resolved    Boolean  @default(false)
  resolvedAt  DateTime?
  resolvedBy  String?
  notes       String?  @db.Text
  createdAt   DateTime @default(now())

  @@index([errorType])
  @@index([severity])
  @@index([createdAt])
  @@index([shouldAlert, alerted])
}
```

---

## Testing Error Handling

### Test Rate Limiting

```bash
# Make many requests quickly to trigger rate limiting
for i in {1..10}; do
  npm run sync:bills &
done
```

The error handler will:
1. Detect the 429 rate limit error
2. Classify it as RETRYABLE
3. Wait 60 seconds before retrying
4. Log the error to database
5. Track retry metrics

### Test Network Failures

```typescript
// Temporarily set invalid API URL
process.env.CONGRESS_API_BASE_URL = 'http://invalid-host';

// Run sync - will detect network errors and retry
await billSync.syncBills();
```

### View Errors in Database

```bash
# Using Prisma Studio
npx prisma studio

# Navigate to SyncError table to see logged errors
```

---

## Best Practices

### DO ✅

- Use `withRetry` for all external API calls
- Provide meaningful context in the context parameter
- Monitor error metrics regularly
- Set up alerts for critical errors
- Resolve errors after fixing the underlying issue

### DON'T ❌

- Retry fatal errors (400, 404, 401, 403)
- Set maxAttempts too high (3-5 is usually sufficient)
- Ignore critical errors
- Remove error logs prematurely
- Disable retry logic in production

---

## Integration with External Services

### Example: Slack Alerts

```typescript
async function sendSlackAlert(error: ClassifiedError) {
  if (error.severity === ErrorSeverity.CRITICAL) {
    await fetch('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 CRITICAL ERROR: ${error.message}`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Type', value: error.type, short: true },
            { title: 'Severity', value: error.severity, short: true },
            { title: 'Context', value: JSON.stringify(error.context), short: false },
          ]
        }]
      })
    });
  }
}
```

### Example: Email Alerts

```typescript
import { sendEmail } from './email-service';

async function sendEmailAlert(error: ClassifiedError) {
  if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
    await sendEmail({
      to: 'admin@example.com',
      subject: `[ALERT] ${error.severity.toUpperCase()}: ${error.message}`,
      body: `
        Error Details:
        - Type: ${error.type}
        - Severity: ${error.severity}
        - Message: ${error.message}
        - Context: ${JSON.stringify(error.context, null, 2)}
        - Stack: ${error.originalError.stack}
      `
    });
  }
}
```

---

## Troubleshooting

### High Error Rate

If you see many errors:

1. Check error types - are they retryable?
2. Check severity - are they critical?
3. Look at recent errors for patterns
4. Check API status (Congress.gov may be down)
5. Verify API key is valid

### Retry Exhaustion

If retries keep failing:

1. Classify the error - should it be retried?
2. Check retry configuration - is maxDelay too low?
3. Look at stack trace for root cause
4. Consider if the issue is on your end

### Missing Errors in Dashboard

If errors aren't showing up:

1. Check that error handler is imported and used
2. Verify database connection
3. Check Prisma migrations are applied
4. Look for errors in console logs

---

## Performance Impact

The error handling system is designed to be lightweight:

- **Memory**: < 1MB for metrics tracking
- **CPU**: Minimal overhead, only on errors
- **Database**: One insert per logged error
- **Network**: No additional network calls

**Recommendation**: Use in all production environments.

---

## Future Enhancements

Planned improvements:

- [ ] Dead letter queue for permanently failed operations
- [ ] Automatic retry scheduling for transient errors
- [ ] Error trend analysis and prediction
- [ ] Integration with APM tools (New Relic, DataDog)
- [ ] Circuit breaker pattern for cascading failures
- [ ] Customizable alert channels (Slack, PagerDuty, email)

---

**Questions?** See `DEVELOPMENT.md` for general development info or `PHASE_2.md` for the full roadmap.
