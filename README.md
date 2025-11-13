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

### Additional Resources

- [Congress.gov API Documentation](https://gpo.congress.gov/)
- [API GitHub Repository](https://github.com/LibraryOfCongress/api.congress.gov/)
- [Sign up for API Key](https://api.congress.gov/sign-up/)
