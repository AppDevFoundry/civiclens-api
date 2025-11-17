# Congress Sync System - Implementation Guide

## Overview

The Congress Sync System is a comprehensive data synchronization infrastructure that:
- **Fetches** bills, members, and hearings from Congress.gov API
- **Tracks changes** for notification purposes
- **Manages rate limits** (5,000 requests/hour)
- **Enables user watchlists** for bills, members, and topics
- **Provides admin visibility** into sync health and data coverage

## What's Been Built

### ✅ Phase 1 Complete - Core Infrastructure

#### 1. Database Schema
**New Prisma Models:**
- `SyncRun` - Tracks each sync execution with metrics
- `SyncJob` - Queue for background jobs (pg-boss integration)
- `BillChangeLog` - Logs detected changes to bills
- `UserWatchlist` - User subscriptions to bills/members/topics
- `BillSummary` - AI-generated plain-language summaries (schema ready)
- `BillRelationship` - Bill-to-bill relationships

**Enhanced Models:**
- `Bill` - Added sync tracking fields (`lastSyncedAt`, `priority`, `lastChangedAt`, `syncAttempts`)
- `User` - Added `watchlists` relation
- `Member` - Added `watchlists` relation

#### 2. Sync Services (`src/app/services/sync/`)
- **QueueService** - PostgreSQL-based job queue using pg-boss
- **ChangeDetectionService** - Detects and logs changes to bills
- **BillSyncService** - Synchronizes bills with incremental/stale/full strategies
- **MemberSyncService** - Synchronizes members of Congress
- **HearingSyncService** - Synchronizes committee hearings
- **CongressSyncOrchestrator** - Master coordinator for all syncs

#### 3. API Endpoints

**Cron Endpoints** (`/api/cron/*`)
- `POST /api/cron/sync-bills` - Hourly bill sync
- `POST /api/cron/sync-members` - 6-hour member sync
- `POST /api/cron/sync-hearings` - 8-hour hearing sync
- `POST /api/cron/sync-stale` - Daily stale data refresh
- `POST /api/cron/sync-full` - Manual full sync trigger
- `GET /api/cron/health` - Health check endpoint

**Watchlist Endpoints** (`/api/watchlist/*`)
- `GET /api/watchlist` - Get user's watchlist with unread changes
- `POST /api/watchlist/bill/:billId` - Add bill to watchlist
- `POST /api/watchlist/member/:memberId` - Add member to watchlist
- `POST /api/watchlist/topic` - Add topic keyword to watchlist
- `DELETE /api/watchlist/:id` - Remove from watchlist
- `PATCH /api/watchlist/:id` - Update notification preferences
- `POST /api/watchlist/:id/mark-read` - Mark changes as read

**Admin Endpoints** (`/api/admin/*`)
- `GET /api/admin/dashboard` - Complete dashboard overview
- `GET /api/admin/sync-status` - Sync health metrics
- `GET /api/admin/coverage` - Data coverage statistics
- `GET /api/admin/errors` - Error logs and failed jobs
- `GET /api/admin/queue` - Queue status and recent jobs
- `GET /api/admin/changes` - Recent bill changes
- `POST /api/admin/trigger-sync` - Manual sync trigger

#### 4. Vercel Cron Configuration
**`vercel.json`** configured with:
- Bills sync: Every hour
- Members sync: Every 6 hours
- Hearings sync: Every 8 hours
- Stale sync: Daily at 2 AM

#### 5. CLI Scripts
**npm run sync:*** commands:
- `npm run sync:bills` - Sync bills manually
- `npm run sync:members` - Sync members manually
- `npm run sync:hearings` - Sync hearings manually
- `npm run sync:all` - Sync all resources
- `npm run sync:status` - Show sync statistics

**Options:**
- `--strategy=<incremental|stale|priority|full>` - Choose sync strategy
- Examples: `npm run sync:bills -- --strategy=full`

## How It Works

### Sync Strategy

#### Incremental Sync (Default for Cron)
- Syncs last 30 days of bills
- Syncs current members
- Syncs upcoming hearings (next 14 days)
- **Goal**: Keep recent data fresh

#### Stale Sync (Daily)
- Finds bills not synced in 48 hours
- Prioritizes high-priority bills
- Refreshes hearings from last week
- **Goal**: Prevent data from going stale

#### Priority Sync
- Syncs last 90 days of active bills
- All current members
- Upcoming hearings
- **Goal**: Focus on actively moving legislation

#### Full Sync (Manual Only)
- Complete refresh of current Congress (118th)
- All current members
- All hearings for current congress
- **Goal**: Comprehensive data backfill

### Change Detection

**What We Track:**
- Bill status changes (introduced → committee → floor → law)
- New actions added to bill timeline
- Cosponsor count changes
- Title changes
- Policy area changes
- Law number assignment

**Significance Levels:**
- **High**: Status changes, new actions, becomes law
- **Medium**: Cosponsor increases, title changes
- **Low**: Policy area changes, minor metadata

**Change Logs:**
- Stored in `BillChangeLog` table
- Linked to bills for user notifications
- `notified` flag prevents duplicate alerts

### Rate Limiting Strategy

**Congress.gov Limit:** 5,000 requests/hour (~83 requests/minute)

**Our Approach:**
- **Incremental syncs** - Focus on recently updated bills
- **Smart pagination** - Fetch 100-200 bills per sync
- **Staggered schedules** - Different resources sync at different times
- **Priority system** - High-priority bills synced more frequently
- **Exponential backoff** - Automatic retry on 429 errors (built into Congress API client)

**Estimated Usage (Hourly):**
- Bills sync: ~15-20 requests (100 bills, paginated)
- Members sync: ~5-10 requests (less frequent)
- Hearings sync: ~10-15 requests
- **Total**: ~30-45 requests/hour (well under limit)

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://...          # Neon PostgreSQL
CONGRESS_API_KEY=your_key_here         # Congress.gov API key
JWT_SECRET=your_secret_here            # For user authentication
```

### Optional (but Recommended)
```bash
# Cron Security
CRON_SECRET=random_secret_string       # Vercel cron authentication

# Admin Dashboard Security
ADMIN_SECRET=random_admin_secret       # Admin endpoint authentication

# AI Summaries (for future implementation)
OPENAI_API_KEY=sk-...                  # For AI summaries
# OR
ANTHROPIC_API_KEY=sk-ant-...          # Alternative: Claude API
```

## How to Use

### 1. Local Development Setup

```bash
# Install dependencies
npm install

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start the server
npm start
```

### 2. Manual Sync

```bash
# Sync recent bills
npm run sync:bills

# Sync all members
npm run sync:members

# Sync upcoming hearings
npm run sync:hearings

# Sync everything (full refresh)
npm run sync:all -- --strategy=full

# Check sync status
npm run sync:status
```

### 3. Test Watchlist API

```bash
# Login as a user first
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"user":{"email":"test@example.com","password":"password"}}'

# Get user's watchlist
curl -H "Authorization: Token YOUR_TOKEN" \
  http://localhost:3000/api/watchlist

# Add bill to watchlist
curl -X POST http://localhost:3000/api/watchlist/bill/123 \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notifyOnStatus":true,"notifyOnActions":true}'

# Add topic to watchlist
curl -X POST http://localhost:3000/api/watchlist/topic \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keyword":"privacy","notifyOnStatus":true}'
```

### 4. Access Admin Dashboard

```bash
# Get dashboard overview
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  http://localhost:3000/api/admin/dashboard

# Check sync status
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  http://localhost:3000/api/admin/sync-status

# View data coverage
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  http://localhost:3000/api/admin/coverage

# Trigger manual sync
curl -X POST http://localhost:3000/api/admin/trigger-sync \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"strategy":"incremental","resources":["bills"]}'
```

## Deployment to Vercel

### 1. Configure Environment Variables
In Vercel dashboard, add:
- `DATABASE_URL`
- `CONGRESS_API_KEY`
- `JWT_SECRET`
- `CRON_SECRET` (generate a random string)
- `ADMIN_SECRET` (generate a random string)

### 2. Deploy
```bash
vercel deploy --prod
```

### 3. Verify Cron Jobs
- Check Vercel dashboard → Project → Cron Jobs
- Should see 4 cron jobs configured
- Test by triggering manually in dashboard

### 4. Monitor Sync Health
```bash
# Check sync health
curl https://your-app.vercel.app/api/cron/health

# View admin dashboard
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  https://your-app.vercel.app/api/admin/dashboard
```

## What's Next (Phase 2)

### 1. AI Summary Generation Service
**Goal**: Generate plain-language summaries for bills

**Implementation:**
```typescript
// Install SDK
npm install openai
// OR
npm install @anthropic-ai/sdk

// Create service: src/app/services/sync/summary-generation.service.ts
// Queue job: JobType.GENERATE_SUMMARY
// Store in: BillSummary table
```

**Strategy:**
- Generate on-demand for watched bills
- Batch process active bills nightly
- Cache aggressively (summaries don't change often)
- Track cost/token usage

### 2. Admin Dashboard HTML Page
**Goal**: Simple web interface for monitoring

**Location**: `src/public/admin.html`
**Features**:
- Real-time sync status
- Coverage charts (Chart.js)
- Error logs table
- Manual sync triggers
- Queue health visualization

### 3. Notification Delivery
**Goal**: Actually send notifications to users

**Components:**
- Email service (SendGrid, AWS SES)
- Push notifications (for mobile app)
- Digest scheduler (daily summary emails)
- Notification templates

### 4. Comprehensive Testing
**Test Coverage Needed:**
- Unit tests for all sync services
- Integration tests for API endpoints
- Mock Congress API responses
- Change detection scenarios
- Queue job processing

### 5. Bill Relationship Detection
**Goal**: Automatically detect related bills

**Methods:**
- Companion bills (from Congress API)
- Similar bills (cosine similarity on text)
- Amendment relationships
- Historical precedents

## Architecture Decisions

### Why pg-boss instead of graphile-worker?
- **Simpler API** - Less boilerplate
- **Good enough** - Handles moderate scale well
- **PostgreSQL-based** - No additional infrastructure
- **Migration path** - Can move to Upstash/BullMQ if needed

### Why PostgreSQL queue instead of Redis?
- **Cost** - No additional service cost
- **Simplicity** - One less thing to manage
- **ACID guarantees** - Safer for critical jobs
- **Trade-off** - Lower throughput than Redis (but sufficient for our needs)

### Why Vercel Cron instead of node-cron?
- **Serverless-native** - Designed for Vercel
- **Auto-scaling** - No manual worker management
- **Monitoring** - Built-in cron logs
- **Limitation** - 60-second timeout (handled by enqueueing jobs)

## Monitoring & Observability

### Health Checks
```bash
# Cron health
GET /api/cron/health

# Returns:
{
  "status": "healthy",
  "timestamp": "2025-11-15T03:00:00.000Z",
  "stats": {
    "recentSyncs": 10,
    "successRate": 0.9,
    "avgDuration": 1234,
    "byResource": {...}
  }
}
```

### Metrics to Watch
1. **Success Rate** - Should be >90%
2. **Avg Duration** - Should be <30 seconds
3. **Queue Depth** - Should stay low (<10)
4. **Error Count** - Should be near zero
5. **Coverage Growth** - Bills should increase over time

### Common Issues

**High Error Rate:**
- Check Congress API key validity
- Verify rate limit not exceeded
- Review error logs: `/api/admin/errors`

**Slow Syncs:**
- Reduce `limit` parameter in sync options
- Check database connection pool
- Review Neon database metrics

**Stale Data:**
- Verify cron jobs are running (Vercel dashboard)
- Check `lastSyncedAt` timestamps
- Run manual sync: `npm run sync:all`

**Queue Backlog:**
- Check pg-boss tables in database
- Review failed jobs: `/api/admin/queue`
- Clear failed jobs if necessary

## Database Queries for Debugging

```sql
-- Check sync history
SELECT * FROM "SyncRun" ORDER BY "startedAt" DESC LIMIT 10;

-- Check recent changes
SELECT * FROM "BillChangeLog"
WHERE "detectedAt" > NOW() - INTERVAL '24 hours'
ORDER BY "detectedAt" DESC;

-- Check bill coverage
SELECT congress, "billType", COUNT(*)
FROM "Bill"
GROUP BY congress, "billType"
ORDER BY congress DESC;

-- Check stale bills
SELECT COUNT(*) FROM "Bill"
WHERE "lastSyncedAt" < NOW() - INTERVAL '48 hours';

-- Check watchlist activity
SELECT u.username, COUNT(*) as watchlist_items
FROM "UserWatchlist" w
JOIN "User" u ON w."userId" = u.id
GROUP BY u.username;

-- Check queue status
SELECT status, COUNT(*)
FROM "SyncJob"
GROUP BY status;
```

## Support & Troubleshooting

### Logs
```bash
# View server logs (local)
npm start

# View Vercel logs
vercel logs --follow

# View specific cron logs
vercel logs --follow --filter="cron"
```

### Reset & Reseed
```bash
# Reset database (DESTRUCTIVE)
npx prisma migrate reset

# Run seed data
npx prisma db seed

# Full resync
npm run sync:all -- --strategy=full
```

### Contact & Resources
- **Congress.gov API Docs**: https://api.congress.gov/
- **pg-boss Docs**: https://github.com/timgit/pg-boss
- **Vercel Cron Docs**: https://vercel.com/docs/cron-jobs
- **Project Roadmap**: `docs/PROJECT_OVERVIEW_AND_ROADMAP.md`

---

**Status**: Phase 1 Complete ✅
**Next**: AI Summaries + Admin Dashboard UI + Notification Delivery
**Last Updated**: November 15, 2025
