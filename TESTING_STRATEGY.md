# Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the CivicLens API, focusing on achieving 80%+ test coverage while ensuring reliability of critical functionality.

## Current State

### Existing Tests

**Passing** ✅:
- `tag.service.test.ts`
- `profile.utils.test.ts`
- `congress.config.test.ts`
- `profile.service.test.ts`
- `article.service.test.ts`

**Failing** ❌:
- `bills.service.test.ts` - Prisma type errors
- `auth.service.test.ts` - Mock configuration issues

**Integration Tests**:
- `congress-api.integration.test.ts` - Tests real Congress API

### Coverage Gaps

**Critical Services Without Tests**:
1. Sync services (bill-sync, member-sync, hearing-sync, orchestrator)
2. Change detection service
3. Enrichment service
4. Notification service
5. Email service
6. Error handler service
7. Queue service
8. Parallel executor utility
9. Rate limit monitor utility
10. Parallel bill sync service

**API Endpoints Without Tests**:
- Watchlist endpoints
- Notification preference endpoints
- Admin endpoints (sync, notifications)
- Congress data endpoints

---

## Testing Pyramid

```
        /\
       /  \      E2E Tests (5-10%)
      /    \     - Critical user flows
     /------\    - Sync workflows
    /        \   - Notification workflows
   /          \
  /------------\ Integration Tests (20-30%)
 /              \ - API endpoints
/                \- External API mocking
-------------------
    Unit Tests    Unit Tests (60-75%)
                  - Service logic
                  - Utilities
                  - Data transformations
```

---

## Test Categories

### 1. Unit Tests (60-75% of tests)

**Purpose**: Test individual functions and classes in isolation

**Tools**:
- Jest (test runner)
- jest-mock-extended (mocking)
- nock (HTTP mocking for Congress API)

**Scope**:

#### Services to Test:
- ✅ `parallel-executor.ts` - Test concurrency control, retry logic
- ✅ `rate-limit-monitor.ts` - Test rate calculation, warning levels
- ✅ `change-detection.service.ts` - Test change detection algorithms
- ✅ `enrichment.service.ts` - Test enrichment prioritization
- ✅ `notification.service.ts` - Test notification creation logic
- ✅ `email.service.ts` - Test email formatting (no actual sending)
- ✅ `error-handler.service.ts` - Test error classification, retry logic
- ⏳ `bill-sync.service.ts` - Test sync logic with mocked API
- ⏳ `member-sync.service.ts` - Test member sync logic
- ⏳ `hearing-sync.service.ts` - Test hearing sync logic
- ⏳ `orchestrator.service.ts` - Test orchestration logic

#### Utilities to Test:
- `dev-auth.ts` - Test token generation

#### Data Mappers to Test:
- Congress API response mappers
- Database model transformations

### 2. Integration Tests (20-30% of tests)

**Purpose**: Test how components work together, especially API endpoints

**Tools**:
- Jest + Supertest (API testing)
- nock (External API mocking)
- Test database (SQLite or PostgreSQL)

**Scope**:

#### API Endpoints to Test:

**Watchlist Endpoints**:
- `POST /api/watchlist` - Add bill to watchlist
- `DELETE /api/watchlist/:billId` - Remove from watchlist
- `GET /api/watchlist` - Get user's watchlist

**Notification Endpoints**:
- `GET /api/notifications/preferences` - Get preferences
- `PUT /api/notifications/preferences` - Update preferences
- `GET /api/notifications/history` - Get notification history
- `GET /api/notifications/unsubscribe/:token` - Unsubscribe

**Congress Data Endpoints**:
- `GET /api/bills` - List bills with filters
- `GET /api/bills/:congress/:billType/:billNumber` - Get bill details
- `GET /api/members` - List members
- `GET /api/hearings` - List hearings

**Admin Endpoints**:
- `POST /api/admin/sync/bills` - Trigger bill sync
- `POST /api/admin/sync/members` - Trigger member sync
- `POST /api/admin/notifications/process` - Process notifications
- `GET /api/admin/errors` - Get sync errors

### 3. E2E Tests (5-10% of tests)

**Purpose**: Test complete user workflows end-to-end

**Tools**:
- Jest (test runner)
- Supertest (API testing)
- Test database with real data

**Scope**:

#### Critical Workflows:

**Bill Sync Workflow**:
1. Trigger sync via API
2. Verify bills fetched from Congress API
3. Verify bills stored in database
4. Verify change detection works
5. Verify notifications created

**Notification Workflow**:
1. User adds bill to watchlist
2. Bill gets updated (mock change)
3. Change detected
4. Notification created
5. Email sent (mocked)
6. Notification marked as sent

**User Watchlist Workflow**:
1. User authenticates
2. User searches for bills
3. User adds bills to watchlist
4. User views watchlist
5. User removes bills from watchlist

---

## Testing Best Practices

### General Principles

1. **Arrange-Act-Assert** pattern:
   ```typescript
   test('should calculate rate correctly', () => {
     // Arrange: Set up test data
     const monitor = new RateLimitMonitor();

     // Act: Execute the code
     monitor.recordRequest();
     monitor.recordRequest();

     // Assert: Verify results
     expect(monitor.getStats().totalRequests).toBe(2);
   });
   ```

2. **Test one thing at a time**: Each test should verify a single behavior

3. **Use descriptive test names**:
   - ✅ `should return empty array when no changes detected`
   - ❌ `test1`

4. **Mock external dependencies**:
   - Mock Congress API calls (use nock)
   - Mock database calls (use jest-mock-extended)
   - Mock email sending (use nodemailer-mock)

5. **Don't test implementation details**: Test behavior, not internal state

### Mocking Strategies

#### Mocking Prisma

```typescript
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

jest.mock('@prisma/client', () => ({
  __esModule: true,
  PrismaClient: jest.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(mockPrisma);
});
```

#### Mocking Congress API

```typescript
import nock from 'nock';

beforeEach(() => {
  nock.cleanAll();
});

test('should fetch bill from API', async () => {
  nock('https://api.congress.gov/v3')
    .get('/bill/118/hr/1234')
    .query({ api_key: 'test', format: 'json' })
    .reply(200, {
      bill: { /* mock bill data */ }
    });

  const result = await CongressApi.bills.getBillById({
    congress: 118,
    billType: 'hr',
    billNumber: 1234
  });

  expect(result).toBeDefined();
});
```

#### Mocking Email Service

```typescript
import nodemailer from 'nodemailer';

jest.mock('nodemailer');

const mockSendMail = jest.fn();
(nodemailer.createTransport as jest.Mock).mockReturnValue({
  sendMail: mockSendMail,
});

test('should send email', async () => {
  mockSendMail.mockResolvedValue({ messageId: '123' });

  await emailService.sendNotification(/* ... */);

  expect(mockSendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'user@example.com',
      subject: expect.any(String),
    })
  );
});
```

---

## Test Organization

### Directory Structure

```
src/
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── sync/
│   │   │   │   ├── bill-sync.service.test.ts
│   │   │   │   ├── change-detection.service.test.ts
│   │   │   │   ├── enrichment.service.test.ts
│   │   │   │   ├── error-handler.service.test.ts
│   │   │   │   ├── notification.service.test.ts
│   │   │   │   └── email.service.test.ts
│   │   │   └── congress/
│   │   │       └── congress.client.test.ts (exists)
│   │   └── utils/
│   │       ├── parallel-executor.test.ts
│   │       ├── rate-limit-monitor.test.ts
│   │       └── profile.utils.test.ts (exists)
│   ├── integration/
│   │   ├── watchlist.api.test.ts
│   │   ├── notifications.api.test.ts
│   │   ├── congress-data.api.test.ts
│   │   ├── admin.api.test.ts
│   │   └── congress-api.integration.test.ts (exists)
│   └── e2e/
│       ├── bill-sync.workflow.test.ts
│       ├── notification.workflow.test.ts
│       └── watchlist.workflow.test.ts
└── app/
    └── services/
        └── ... (production code)
```

---

## Coverage Requirements

### Target Coverage

**Overall**: 80%+
- **Unit Tests**: 85%+ for services and utilities
- **Integration Tests**: 75%+ for API endpoints
- **E2E Tests**: Critical paths covered

### Priority Services (Must have 90%+ coverage)

1. **Parallel Executor** - Critical for performance
2. **Rate Limit Monitor** - Critical for API safety
3. **Error Handler** - Critical for reliability
4. **Change Detection** - Core business logic
5. **Notification Service** - User-facing feature

### Coverage Exemptions

Files that don't need high coverage:
- Type definitions (`.types.ts`)
- Configuration files
- Index/export files
- Database migrations
- Scripts (unless critical logic)

---

## Running Tests

### Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:api

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/tests/unit/utils/parallel-executor.test.ts
```

### Coverage Reports

After running `npm run test:coverage`:
- View HTML report: `open coverage/api/lcov-report/index.html`
- View console summary in terminal
- CI/CD will fail if coverage drops below 80%

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:unit",
      "pre-push": "npm run test:coverage"
    }
  }
}
```

---

## Test Data Management

### Test Database

**Strategy**: Use SQLite for tests (faster, isolated)

```typescript
// jest.setup.ts
process.env.DATABASE_URL = 'file:./test.db';
```

### Test Fixtures

Create reusable test data:

```typescript
// src/tests/fixtures/bill.fixtures.ts
export const mockBill = {
  id: 1,
  congress: 118,
  billType: 'hr',
  billNumber: 1234,
  title: 'Test Bill',
  // ...
};

export const mockBillResponse = {
  bill: {
    congress: 118,
    type: 'HR',
    number: '1234',
    // ...
  }
};
```

### Seed Data for Integration Tests

```typescript
beforeAll(async () => {
  // Seed test database
  await prisma.user.create({ data: testUser });
  await prisma.bill.createMany({ data: testBills });
});

afterAll(async () => {
  // Clean up
  await prisma.$disconnect();
});
```

---

## Performance Testing

### Load Testing

For critical endpoints:
- Test with 100+ concurrent requests
- Verify response times stay under 200ms
- Check for memory leaks

### Profiling Tests

```typescript
test('should sync 50 bills in under 5 seconds', async () => {
  const start = Date.now();
  await billSyncService.syncBills({ limit: 50 });
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(5000);
}, 10000); // 10s timeout
```

---

## Testing Roadmap

### Phase 1: Foundation (Week 1)

- ✅ Review existing tests
- ✅ Fix failing tests
- ✅ Create testing strategy document
- ⏳ Set up test infrastructure (mocks, fixtures)
- ⏳ Write unit tests for utilities (parallel-executor, rate-limit-monitor)

### Phase 2: Core Services (Week 1)

- ⏳ Unit tests for change detection service
- ⏳ Unit tests for enrichment service
- ⏳ Unit tests for notification service
- ⏳ Unit tests for email service
- ⏳ Unit tests for error handler service

### Phase 3: Sync Services (Week 2)

- ⏳ Unit tests for bill sync service
- ⏳ Unit tests for member sync service
- ⏳ Unit tests for hearing sync service
- ⏳ Unit tests for parallel bill sync service
- ⏳ Unit tests for orchestrator service

### Phase 4: Integration Tests (Week 2)

- ⏳ Integration tests for watchlist API
- ⏳ Integration tests for notification API
- ⏳ Integration tests for admin API
- ⏳ Integration tests for Congress data API

### Phase 5: E2E Tests & Coverage (Week 3)

- ⏳ E2E test for bill sync workflow
- ⏳ E2E test for notification workflow
- ⏳ E2E test for watchlist workflow
- ⏳ Coverage reporting setup
- ⏳ CI/CD integration
- ⏳ Documentation finalization

---

## Success Metrics

### Quantitative

- ✅ **80%+ overall test coverage**
- ✅ **90%+ coverage for critical services**
- ✅ **All tests passing in CI/CD**
- ✅ **<5 minute test execution time**

### Qualitative

- ✅ **Confidence in refactoring**: Can change code without fear
- ✅ **Fast feedback**: Catch bugs early in development
- ✅ **Documentation**: Tests serve as usage examples
- ✅ **Reliability**: Production incidents caught by tests

---

## Maintenance

### Test Review Process

1. **New Features**: Must include tests (unit + integration minimum)
2. **Bug Fixes**: Add test that reproduces the bug first
3. **Refactoring**: Maintain or improve test coverage
4. **Code Review**: Check test quality and coverage

### Keeping Tests Fast

- Mock external services (Congress API, email)
- Use in-memory database for unit tests
- Run tests in parallel
- Only use real database for integration tests
- Skip slow tests in watch mode

### Avoiding Test Rot

- Review and update tests quarterly
- Remove tests for removed features
- Update tests when APIs change
- Keep test data current with production

---

## Resources

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [jest-mock-extended](https://github.com/marchaos/jest-mock-extended)
- [nock Documentation](https://github.com/nock/nock)

### Examples

See existing tests for patterns:
- Unit test example: `src/tests/services/congress.client.test.ts`
- Integration test example: `src/tests/integration/congress-api.integration.test.ts`

---

**Last Updated**: November 14, 2025
**Status**: Phase 1 Complete, Phases 2-5 In Progress
**Target Completion**: December 2025
