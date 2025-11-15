# ![Node/Express/Prisma Example App](project-logo.png)

[![Build Status](https://travis-ci.org/anishkny/node-express-realworld-example-app.svg?branch=master)](https://travis-ci.org/anishkny/node-express-realworld-example-app)

> **Note**: This repository is part of [CivicLens](https://github.com/AppDevFoundry/civiclens), a multi-platform Congressional legislation tracker. It is based on the Node/Express/Prisma RealWorld implementation and will be adapted to integrate with the Congress.gov API for civic engagement functionality.

> ### Example Node (Express + Prisma) codebase containing real world examples (CRUD, auth, advanced patterns, etc) that adheres to the [RealWorld](https://github.com/gothinkster/realworld-example-apps) API spec.

<a href="https://thinkster.io/tutorials/node-json-api" target="_blank"><img width="454" src="https://raw.githubusercontent.com/gothinkster/realworld/master/media/learn-btn-hr.png" /></a>

## Getting Started

### Prerequisites

Run the following command to install dependencies:

```shell
npm install
```

### Environment variables

This project depends on some environment variables.
If you are running this project locally, create a `.env` file at the root for these variables.
Your host provider should included a feature to set them there directly to avoid exposing them.

Here are the required ones:

```
DATABASE_URL=
JWT_SECRET=
NODE_ENV=production
CONGRESS_API_KEY=
```

#### Congress Sync Configuration (Optional)

For automated data sync from Congress.gov:

```
# Sync behavior
CONGRESS_SYNC_ENABLED=true                    # Enable/disable sync (default: true)
CONGRESS_SYNC_WINDOW_DAYS=14                  # Days to look back on first sync (default: 14)
CONGRESS_SYNC_PAGE_SIZE=250                   # Bills per API page (default: 250)
CONGRESS_SYNC_REQUEST_THRESHOLD=500           # Stop when this many requests remain (default: 500)

# Vercel cron authentication
CRON_SECRET=your_secure_cron_secret           # Required for production cron jobs

# AI Insights (Phase 1b - optional)
OPENAI_API_KEY=                               # For AI-generated summaries
AI_MODEL=gpt-4o                               # Model for insights
```

#### Congress.gov API Configuration

The application integrates with the [Congress.gov API](https://api.congress.gov/) to fetch legislative data. You must obtain an API key:

1. Sign up for a free API key at: https://api.congress.gov/sign-up/
2. Add `CONGRESS_API_KEY` to your `.env` file

Optional Congress.gov API settings:

```
CONGRESS_API_BASE_URL=https://api.congress.gov/v3  # Optional, defaults to v3 API
```

### Generate your Prisma client

Run the following command to generate the Prisma Client which will include types based on your database schema:

```shell
npx prisma generate
```

### Apply any SQL migration script

Run the following command to create/update your database based on existing sql migration scripts:

```shell
npx prisma migrate deploy
```

### Run the project

Run the following command to run the project:

```shell
npx nx serve api
```

### Seed the database

The project includes a seed script to populate the database:

```shell
npx prisma db seed
```

## Deploy on a remote server

Run the following command to:
- install dependencies
- apply any new migration sql scripts
- run the server

```shell
npm ci && npx prisma migrate deploy && node dist/api/main.js
```

## Congress.gov API Integration

CivicLens integrates with the [Congress.gov API](https://api.congress.gov/) to provide access to comprehensive Congressional data including bills, members, committees, nominations, and hearings.

### Features

- **Strongly Typed API Client**: Full TypeScript support with comprehensive type definitions
- **Database Caching**: Automatic caching of API responses in PostgreSQL for improved performance
- **Rate Limit Handling**: Automatic retry with exponential backoff for rate-limited requests
- **Error Handling**: Robust error handling with typed exceptions
- **RESTful Endpoints**: Express routes for easy frontend integration

### Architecture

The Congress.gov integration follows a hybrid architecture:

- **Services Layer** (`src/app/services/congress/`): Reusable API client and business logic
- **Routes Layer** (`src/app/routes/congress/`): Express endpoints for HTTP access
- **Database Layer**: Prisma models for data persistence

### Available Resources

#### Bills & Legislation
- List bills with filtering (congress, type, dates, sponsor)
- Get bill details, actions, subjects, cosponsors, amendments
- Search cached bills in database

#### Members of Congress
- List members with filtering (chamber, state, party, district)
- Get member details, sponsored/cosponsored legislation
- Search cached members

#### Committees
- List committees with filtering (chamber, type)
- Get committee details, bills, reports
- Access subcommittee information

#### Nominations
- List presidential nominations
- Get nomination details, actions, hearings

#### Hearings
- List committee hearings with date filtering
- Get hearing details, transcripts, associated bills

### API Endpoints

All endpoints are prefixed with `/api` and support optional authentication via `auth.optional` middleware.

#### Health Check
```http
GET /api/congress/ping
```

#### Bills
```http
GET /api/bills?congress=118&billType=hr&limit=20
GET /api/bills/:congress/:type/:number
GET /api/bills/:congress/:type/:number/actions
GET /api/bills/:congress/:type/:number/subjects
```

#### Members
```http
GET /api/members?state=CA&party=D&chamber=House
GET /api/members/:bioguideId
GET /api/members/:bioguideId/sponsored-legislation
```

#### Committees
```http
GET /api/committees?chamber=House
GET /api/committees/:chamber/:systemCode
```

#### Nominations
```http
GET /api/nominations?congress=118
GET /api/nominations/:congress/:number
```

#### Hearings
```http
GET /api/hearings?congress=118&chamber=House
```

### Code Examples

#### Using the Congress API Client Internally

```typescript
import { CongressApi } from '@/services/congress';

// Fetch recent bills
const { bills, pagination } = await CongressApi.bills.listBills({
  congress: 118,
  limit: 10,
  sort: 'updateDate desc'
});

// Get specific bill
const bill = await CongressApi.bills.getBillById({
  congress: 118,
  billType: 'hr',
  billNumber: 1234
});

// Search members by state
const { members } = await CongressApi.members.listMembers({
  state: 'CA',
  chamber: 'House'
});

// Health check
const isHealthy = await CongressApi.ping();
```

#### Consuming REST Endpoints

```bash
# List recent bills
curl http://localhost:3000/api/bills?congress=118&limit=5

# Get specific member
curl http://localhost:3000/api/members/B000944

# List House committees
curl http://localhost:3000/api/committees?chamber=House
```

### Testing

The Congress.gov integration includes comprehensive test coverage with multiple testing strategies:

#### Running Tests

```shell
# Run all tests
npm run test

# Run integration tests only (API endpoints)
npm run test:api

# Run unit tests only (services, utilities)
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run Congress-specific tests
npm run test -- congress
```

#### Test Types

##### 1. Unit Tests (`src/tests/services/`)

Unit tests validate individual services and utilities in isolation using mocks:

**Tools:**
- **Jest** - Testing framework
- **nock** - HTTP request mocking for Congress.gov API
- **jest-mock-extended** - Prisma database mocking
- Test fixtures in `src/tests/fixtures/congress/`

**Example:**
```typescript
import nock from 'nock';
import prismaMock from '../prisma-mock';
import { listBills } from '@/services/congress/resources/bills.service';

test('should fetch and cache bills', async () => {
  // Mock Congress.gov API
  nock('https://api.congress.gov/v3')
    .get('/bill')
    .query(true)
    .reply(200, { bills: [...] });

  // Mock database
  prismaMock.bill.upsert.mockResolvedValue({} as any);

  // Test service
  const result = await listBills({ congress: 118 });
  expect(result.bills).toHaveLength(2);
});
```

##### 2. Integration Tests (`src/tests/integration/`)

Integration tests validate Express endpoints end-to-end using supertest:

**Tools:**
- **Supertest** - HTTP assertion library for Express
- **nock** - Mock external Congress.gov API calls
- **Jest** - Test runner

**Example:**
```typescript
import request from 'supertest';
import nock from 'nock';
import app from '../../app';

test('GET /api/bills should return bills list', async () => {
  // Mock Congress.gov API
  nock('https://api.congress.gov')
    .get('/v3/bill')
    .query(true)
    .reply(200, mockBillsResponse);

  // Test Express endpoint
  const response = await request(app)
    .get('/api/bills')
    .query({ congress: 118, limit: 10 })
    .expect(200);

  expect(response.body.bills).toBeDefined();
  expect(response.body.pagination).toBeDefined();
});
```

##### 3. Manual Testing with Postman

For manual API testing and documentation, use the Postman collection:

**Setup:**
1. Import collection: `postman/CivicLens-Congress-API.postman_collection.json`
2. Import environment:
   - Local: `postman/Local.postman_environment.json`
   - Production: `postman/Production.postman_environment.json`
3. Select the appropriate environment
4. Run individual requests or entire folders

**Features:**
- 25+ pre-configured requests covering all endpoints
- Automated test assertions for each request
- Environment variables for easy switching between local/production
- Test data variables (bioguideIds, bill numbers, etc.)

**Running in CI/CD:**
```shell
# Using newman (Postman CLI)
npm install -g newman
newman run postman/CivicLens-Congress-API.postman_collection.json \
  -e postman/Production.postman_environment.json
```

#### Test Coverage Goals

- **Unit Tests**: Cover all service methods, error handling, and edge cases
- **Integration Tests**: Validate all Express endpoints, parameter validation, response formats
- **Manual Tests**: Document API usage, onboard new developers, validate against production

#### Best Practices

1. **Never hit real APIs in tests**: Always use nock to mock Congress.gov API calls
2. **Mock database operations**: Use jest-mock-extended for Prisma to avoid database dependencies
3. **Test error scenarios**: Validate handling of 404, 429, 500, and other error codes
4. **Test pagination**: Ensure limit, offset, and pagination metadata work correctly
5. **Validate response schemas**: Check that responses match expected TypeScript types

### Database Models

The integration includes Prisma models for:
- **Bill**: Legislative bills with sponsor, status, and actions
- **Member**: Congress members with terms and party history
- **Committee**: Congressional committees with subcommittees
- **Nomination**: Presidential nominations with status
- **Hearing**: Committee hearings with location and date

Run migrations to create these tables:
```shell
npx prisma migrate dev --name add-congress-models
```

### Error Handling

The client converts all Congress.gov API errors into typed `CongressApiException`:

```typescript
try {
  const bill = await CongressApi.bills.getBillById({
    congress: 118,
    billType: 'hr',
    billNumber: 99999
  });
} catch (error) {
  if (error instanceof CongressApiException) {
    console.error(`API Error: ${error.status} - ${error.message}`);
  }
}
```

Common error codes:
- `401`: Invalid or missing API key
- `404`: Resource not found
- `429`: Rate limit exceeded (automatically retried)
- `500`: Congress.gov API server error

### Rate Limiting

The client automatically handles rate limiting (HTTP 429) with:
- Exponential backoff retry strategy
- Maximum 3 retry attempts
- Base delay of 1 second (doubles each retry)

### Configuration

Override default settings via environment variables:

```shell
# Required
CONGRESS_API_KEY=your_api_key_here

# Optional
CONGRESS_API_BASE_URL=https://api.congress.gov/v3  # Default
```

Configuration parameters:
- `requestTimeout`: 30 seconds
- `retryAttempts`: 3
- `retryDelay`: 1000ms (exponential backoff)
- `defaultLimit`: 20 results per page

## CivicLens Data Sync System

CivicLens includes an automated sync system that regularly fetches data from Congress.gov and stores it in your database. This enables fast querying, rich relationships between entities, and the foundation for user subscriptions and notifications.

### Architecture Overview

The sync system consists of:
- **Member Sync**: Fetches all current members of Congress (~540 members, 2-3 API calls)
- **Bill Sync**: Incrementally fetches updated bills with summaries, actions, subjects, cosponsors
- **Event Generation**: Creates notification events for new bills and status changes
- **Job Tracking**: Records all sync runs with stats and error logging

### Running Syncs

#### Manual Sync (Development)

```bash
# Sync all current members first
curl -X POST http://localhost:3000/api/sync/members

# Then sync bills
curl -X POST http://localhost:3000/api/sync/bills

# Check sync status
curl http://localhost:3000/api/sync/status
```

#### Automated Sync (Production with Vercel)

The project includes a `vercel.json` with cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/sync/bills",
      "schedule": "0 * * * *"  // Hourly
    }
  ]
}
```

For production, set the `CRON_SECRET` environment variable. Vercel will authenticate cron requests automatically.

### Initial Data Population

On first deployment:

1. **Run member sync** to populate the Member table:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync/members \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

2. **Run bill sync** to populate bills with relations:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync/bills \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

The first bill sync will fetch bills from the last 14 days (configurable via `CONGRESS_SYNC_WINDOW_DAYS`).

### Sync Endpoints

```http
# Trigger member sync
POST /api/sync/members
Authorization: Bearer <CRON_SECRET>

# Trigger bill sync (main cron endpoint)
POST /api/sync/bills
Authorization: Bearer <CRON_SECRET>

# Get sync status and stats
GET /api/sync/status

# Simple health check
GET /api/sync/health
```

### Rate Limit Management

Congress.gov allows 5,000 requests per hour. The sync system:
- Tracks API requests made during each sync run
- Stops automatically when approaching the limit (500 requests remaining by default)
- Uses incremental sync with cursors to resume from where it left off

## CivicLens Bills API

The `/api/bills` endpoints provide access to synced Congressional bills with rich relationships. This is the primary API for CivicLens frontends.

### Bill Endpoints

```http
# List bills with filtering and pagination
GET /api/bills?congress=118&type=hr&topic=Healthcare&limit=20&cursor=<id>

# Get bill details with all relations
GET /api/bills/:slug
# e.g., GET /api/bills/118-hr-1234

# Get paginated actions for a bill
GET /api/bills/:slug/actions?limit=50&cursor=<id>

# Get all cosponsors
GET /api/bills/:slug/cosponsors?limit=100
```

### Query Parameters

For `GET /api/bills`:
- `congress` - Filter by congress number (e.g., 118)
- `type` - Filter by bill type (hr, s, hjres, sjres, hconres, sconres, hres, sres)
- `topic` - Filter by subject/policy area
- `member` - Filter by sponsor/cosponsor bioguide ID
- `search` - Search in title and subjects
- `isLaw` - Filter to only show bills that became law
- `cursor` - Pagination cursor (bill ID)
- `limit` - Results per page (default 20, max 100)

### Response Format

Bill list response:
```json
{
  "bills": [
    {
      "id": 123,
      "slug": "118-hr-1234",
      "congress": 118,
      "type": "hr",
      "number": 1234,
      "title": "Example Bill Title",
      "introducedDate": "2024-01-15T00:00:00.000Z",
      "updateDate": "2024-01-20T00:00:00.000Z",
      "latestActionDate": "2024-01-20T00:00:00.000Z",
      "latestActionText": "Referred to the Committee on...",
      "policyArea": "Healthcare",
      "isLaw": false,
      "sponsor": {
        "bioguideId": "A000001",
        "name": "John Smith",
        "party": "D",
        "state": "CA"
      },
      "cosponsorsCount": 25,
      "actionsCount": 5,
      "links": {
        "congressGov": "https://congress.gov/bill/118th/hr/1234"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "nextCursor": "122",
    "hasMore": true
  }
}
```

Bill detail response includes:
```json
{
  "bill": {
    "id": 123,
    "slug": "118-hr-1234",
    // ... basic fields ...

    "insights": {
      "plainSummary": "AI-generated plain language summary...",
      "impactSummary": "Who this affects...",
      "keyProvisions": "Main points...",
      "generatedAt": "2024-01-20T10:30:00.000Z"
    },

    "officialSummary": "CRS official summary text...",

    "links": {
      "congressGov": "https://congress.gov/bill/...",
      "fullTextPdf": "https://...",
      "fullTextTxt": "https://...",
      "fullTextXml": "https://..."
    },

    "subjects": ["Healthcare", "Medicare", "Medicaid"],

    "actions": [
      {
        "actionCode": "H11100",
        "actionDate": "2024-01-20T00:00:00.000Z",
        "text": "Referred to the Committee on...",
        "type": "IntroReferral",
        "chamber": "House"
      }
    ],

    "cosponsors": [
      {
        "bioguideId": "B000002",
        "name": "Jane Doe",
        "party": "R",
        "state": "TX",
        "chamber": "House",
        "cosponsorDate": "2024-01-16T00:00:00.000Z",
        "isOriginalCosponsor": true
      }
    ],

    "textVersions": [
      {
        "type": "Introduced",
        "date": "2024-01-15T00:00:00.000Z",
        "pdfUrl": "https://...",
        "txtUrl": "https://...",
        "xmlUrl": "https://...",
        "htmlUrl": "https://..."
      }
    ]
  }
}
```

## CivicLens Members API

```http
# List members
GET /api/members?state=CA&party=D&chamber=House&current=true&search=Smith&limit=50

# Get member details with recent bills
GET /api/members/:bioguideId

# Get member's sponsored or cosponsored bills
GET /api/members/:bioguideId/bills?type=sponsored&limit=20
GET /api/members/:bioguideId/bills?type=cosponsored&limit=20
```

## Subscription & Notification System (Infrastructure Ready)

The database schema includes tables for a powerful subscription system:

- **UserSubscription**: Users can subscribe to bills, members, topics, keywords, or activity types
- **NotificationEvent**: Events generated during sync (new bills, status changes)
- **NotificationDelivery**: Track delivery status across channels (push, email, in-app)

The sync system already generates notification events. Frontend integration for managing subscriptions and sending notifications will be added in Phase 2.

### Subscription Types

Users will be able to subscribe to:
- **BILL**: Specific bill by slug (e.g., "118-hr-1234")
- **MEMBER**: Member by bioguideId (e.g., "A000001")
- **TOPIC**: Policy area or subject (e.g., "Healthcare")
- **KEYWORD**: Any keyword in bill titles
- **ACTIVITY_TYPE**: Type of action (e.g., "IntroducedHouse", "PassedSenate")

### Additional Resources

- [Congress.gov API Documentation](https://gpo.congress.gov/)
- [API GitHub Repository](https://github.com/LibraryOfCongress/api.congress.gov/)
- [Sign up for API Key](https://api.congress.gov/sign-up/)
