# CivicLens Congress Sync Runbook

This document provides operational procedures for the Congress.gov data sync system.

## Overview

The sync system fetches Congressional data from Congress.gov API and stores it in your database. It consists of:

- **Member Sync**: Fetches all current members (~540), should run weekly or on demand
- **Bill Sync**: Incrementally fetches updated bills, runs hourly via Vercel cron

## Initial Setup

### 1. Configure Environment Variables

```bash
# Required
CONGRESS_API_KEY=your_api_key        # Get from https://api.congress.gov/sign-up/
DATABASE_URL=your_database_url        # PostgreSQL connection string
CRON_SECRET=your_secure_secret        # For authenticating cron requests

# Optional
CONGRESS_SYNC_ENABLED=true            # Master enable/disable
CONGRESS_SYNC_WINDOW_DAYS=14          # Days to look back on first sync
CONGRESS_SYNC_PAGE_SIZE=250           # Bills per API page
CONGRESS_SYNC_REQUEST_THRESHOLD=500   # Stop when this many requests remain
```

### 2. Run Database Migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. Initial Data Population

**Important**: Run member sync BEFORE bill sync to ensure sponsor references are valid.

```bash
# 1. Sync members first (creates Member records)
curl -X POST https://your-app.vercel.app/api/sync/members \
  -H "Authorization: Bearer $CRON_SECRET"

# 2. Then sync bills (creates Bill records with Member relations)
curl -X POST https://your-app.vercel.app/api/sync/bills \
  -H "Authorization: Bearer $CRON_SECRET"
```

The first bill sync will fetch approximately 14 days of bills (configurable).

## Monitoring

### Check Sync Status

```bash
curl https://your-app.vercel.app/api/sync/status
```

Response includes:
- Last sync timestamp
- Status (COMPLETED, FAILED, RUNNING)
- Records processed, created, updated
- API requests made
- Current cursor for bill sync

### View Sync Jobs in Database

```sql
-- Latest sync jobs
SELECT * FROM "SyncJob"
ORDER BY "startedAt" DESC
LIMIT 10;

-- Failed jobs
SELECT * FROM "SyncJob"
WHERE status = 'FAILED'
ORDER BY "startedAt" DESC;

-- Average sync duration
SELECT
  "jobType",
  AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as avg_seconds,
  AVG("recordsProcessed") as avg_records,
  AVG("apiRequestsMade") as avg_requests
FROM "SyncJob"
WHERE status = 'COMPLETED'
GROUP BY "jobType";
```

## Common Operations

### Re-sync All Members

If you need to refresh all member data:

```bash
curl -X POST https://your-app.vercel.app/api/sync/members \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Reset Bill Sync Cursor

If you need to re-sync bills from a specific date:

1. Find the last COMPLETED bill sync job:
   ```sql
   SELECT id FROM "SyncJob"
   WHERE "jobType" = 'BILL_SYNC' AND status = 'COMPLETED'
   ORDER BY "startedAt" DESC LIMIT 1;
   ```

2. Update the cursor:
   ```sql
   UPDATE "SyncJob"
   SET cursor = '2024-01-01T00:00:00.000Z'  -- Your desired start date
   WHERE id = <job_id>;
   ```

3. Run bill sync:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync/bills \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

### Full Re-sync

To re-sync everything from scratch:

```sql
-- Delete all synced data (be careful!)
DELETE FROM "NotificationEvent";
DELETE FROM "BillAction";
DELETE FROM "BillSubject";
DELETE FROM "BillSummary";
DELETE FROM "BillTextVersion";
DELETE FROM "BillCosponsor";
DELETE FROM "BillRelated";
DELETE FROM "BillInsight";
DELETE FROM "Bill";
DELETE FROM "Member";
DELETE FROM "SyncJob";
```

Then run member sync and bill sync as described above.

## Troubleshooting

### Sync Job Failed

1. Check the error in sync status:
   ```bash
   curl https://your-app.vercel.app/api/sync/status
   ```

2. View detailed error in database:
   ```sql
   SELECT "errorMessage", "errorDetails"
   FROM "SyncJob"
   WHERE status = 'FAILED'
   ORDER BY "startedAt" DESC LIMIT 1;
   ```

3. Common errors:
   - **Rate limit exceeded**: Wait for an hour, the sync will auto-stop before hitting the limit
   - **Database connection error**: Check DATABASE_URL and database accessibility
   - **Invalid API key**: Verify CONGRESS_API_KEY is set and valid
   - **Timeout**: Increase Vercel function timeout or reduce page size

### Bills Missing Sponsors

If bill sponsors show as null, the member wasn't in the database when the bill was synced:

1. Run member sync:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync/members \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

2. The next bill sync will populate the sponsor reference.

### Cosponsors Not Linked

Similar to above - cosponsors can only be linked if the Member exists:

1. Run member sync first
2. Re-sync the specific bill or wait for the next bill sync

### Vercel Cron Not Running

1. Check Vercel dashboard for cron job status
2. Verify `CRON_SECRET` is set in Vercel environment
3. Check function logs for errors
4. Verify vercel.json cron configuration

## Rate Limits

Congress.gov API allows 5,000 requests per hour.

### Bill Sync Request Usage

For each bill, the sync makes approximately 6 API requests:
1. Bill list (paginated)
2. Bill detail
3. Actions
4. Subjects
5. Summaries
6. Cosponsors
7. Text versions

So syncing 100 bills uses ~600 requests.

### Managing Rate Limits

The sync system automatically:
- Tracks requests made
- Stops when reaching the threshold (default: 500 remaining)
- Resumes from cursor on next run

If you're consistently hitting limits:
1. Increase `CONGRESS_SYNC_REQUEST_THRESHOLD`
2. Reduce `CONGRESS_SYNC_PAGE_SIZE`
3. Reduce cron frequency
4. Contact Congress.gov for higher limits

## Vercel Deployment

### vercel.json Configuration

```json
{
  "crons": [
    {
      "path": "/api/sync/bills",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Environment Variables in Vercel

Set these in Vercel dashboard → Settings → Environment Variables:
- `CONGRESS_API_KEY`
- `DATABASE_URL`
- `CRON_SECRET`
- `JWT_SECRET`

### Function Timeout

For Pro plan, the default 300s timeout should be sufficient.
For Hobby plan (10s limit), sync will be very limited.

## Database Indexes

The schema includes indexes for efficient queries:

```sql
-- Bill queries
CREATE INDEX "Bill_updateDate_idx" ON "Bill"("updateDate");
CREATE INDEX "Bill_policyArea_idx" ON "Bill"("policyArea");
CREATE INDEX "Bill_sponsorBioguideId_idx" ON "Bill"("sponsorBioguideId");

-- Action timeline
CREATE INDEX "BillAction_billId_actionDate_idx" ON "BillAction"("billId", "actionDate" DESC);

-- Subject search
CREATE INDEX "BillSubject_name_idx" ON "BillSubject"("name");

-- Notification matching
CREATE INDEX "NotificationEvent_matchableValues_idx" ON "NotificationEvent"("matchableValues");
```

## Data Statistics

After initial sync, you should have approximately:
- ~540 current members
- 500-2000 bills (depending on window)
- 5-50 actions per bill
- 10-100 subjects per bill
- 1-3 summaries per bill
- 0-500 cosponsors per bill

Check your stats:
```sql
SELECT
  (SELECT COUNT(*) FROM "Member") as members,
  (SELECT COUNT(*) FROM "Bill") as bills,
  (SELECT COUNT(*) FROM "BillAction") as actions,
  (SELECT COUNT(*) FROM "BillSubject") as subjects,
  (SELECT COUNT(*) FROM "BillSummary") as summaries,
  (SELECT COUNT(*) FROM "BillCosponsor") as cosponsors;
```
