# Testing Infrastructure Improvements

This document outlines recommended enhancements to improve automated testing for CI/CD, specifically for the Congress API integration tests.

## Current State

### What Works
- ✅ **Unit Tests**: Service layer tests with mocked HTTP and database calls (using nock + jest-mock-extended)
- ✅ **Integration Tests**: Express endpoint tests with supertest (9/18 passing)
- ✅ **Postman Collection**: Manual testing with 25+ pre-configured requests
- ✅ **Test Scripts**: Organized npm scripts for different test types

### Current Limitations
- ⚠️ Integration tests fail when database caching is involved (9 failures out of 18)
- ⚠️ No test database configured for integration tests
- ⚠️ Prisma operations in integration tests hit real database or fail
- ⚠️ No CI/CD pipeline configuration yet

## Recommended Improvements

### 1. Test Database Setup (High Priority)

**Problem**: Integration tests currently attempt to write to the production/development database, causing failures and potential data pollution.

**Solution**: Set up a dedicated test database that can be reset between test runs.

#### Implementation Steps

**A. Add Test Database Configuration**

Create `src/tests/setup/test-database.ts`:
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function setupTestDatabase() {
  // Use a separate test database
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL?.replace(/\/\w+\?/, '/civiclens_test?');

  process.env.DATABASE_URL = testDatabaseUrl;

  // Run migrations
  await execAsync('npx prisma migrate deploy');
}

export async function teardownTestDatabase() {
  // Clean up test data
  await execAsync('npx prisma migrate reset --force --skip-seed');
}

export async function resetTestDatabase() {
  // Clear all tables between tests
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  await prisma.$transaction([
    prisma.bill.deleteMany(),
    prisma.member.deleteMany(),
    prisma.committee.deleteMany(),
    prisma.nomination.deleteMany(),
    prisma.hearing.deleteMany()
  ]);

  await prisma.$disconnect();
}
```

**B. Update Jest Configuration**

In `jest.config.ts`, add global setup/teardown:
```typescript
export default {
  // ... existing config
  globalSetup: '<rootDir>/src/tests/setup/jest-global-setup.ts',
  globalTeardown: '<rootDir>/src/tests/setup/jest-global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/jest-setup.ts']
};
```

**C. Create Setup Files**

`src/tests/setup/jest-global-setup.ts`:
```typescript
import { setupTestDatabase } from './test-database';

export default async function globalSetup() {
  console.log('Setting up test database...');
  await setupTestDatabase();
}
```

`src/tests/setup/jest-global-teardown.ts`:
```typescript
import { teardownTestDatabase } from './test-database';

export default async function globalTeardown() {
  console.log('Tearing down test database...');
  await teardownTestDatabase();
}
```

`src/tests/setup/jest-setup.ts`:
```typescript
import { resetTestDatabase } from './test-database';

beforeEach(async () => {
  // Reset database between tests
  await resetTestDatabase();
});
```

**D. Environment Variables**

Add to `.env.test`:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/civiclens_test?schema=public"
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/civiclens_test?schema=public"
CONGRESS_API_KEY="test-api-key"
NODE_ENV="test"
```

**Benefits**:
- ✅ Isolated test environment
- ✅ No data pollution in development/production
- ✅ Repeatable test runs
- ✅ Safe to run in parallel
- ✅ Integration tests can validate full stack including database

---

### 2. Prisma Test Utilities (Medium Priority)

**Problem**: Creating test data for integration tests is verbose and error-prone.

**Solution**: Create utility functions for seeding test data.

#### Implementation

Create `src/tests/utils/test-data-factory.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const testDataFactory = {
  async createBill(overrides: Partial<any> = {}) {
    return prisma.bill.create({
      data: {
        congress: 118,
        billType: 'hr',
        billNumber: Math.floor(Math.random() * 10000),
        title: 'Test Bill',
        originChamber: 'House',
        originChamberCode: 'H',
        updateDate: new Date(),
        introducedDate: new Date(),
        isLaw: false,
        apiResponseData: {},
        ...overrides
      }
    });
  },

  async createMember(overrides: Partial<any> = {}) {
    return prisma.member.create({
      data: {
        bioguideId: `TEST${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        firstName: 'Test',
        lastName: 'Member',
        fullName: 'Test Member',
        party: 'D',
        state: 'CA',
        chamber: 'House',
        isCurrent: true,
        apiResponseData: {},
        ...overrides
      }
    });
  },

  async createCommittee(overrides: Partial<any> = {}) {
    return prisma.committee.create({
      data: {
        systemCode: `test${Math.random().toString(36).substr(2, 6)}`,
        name: 'Test Committee',
        chamber: 'House',
        type: 'Standing',
        isCurrent: true,
        apiResponseData: {},
        ...overrides
      }
    });
  },

  // Add factories for other models...
};

export default testDataFactory;
```

**Usage in tests**:
```typescript
import { testDataFactory } from '../utils/test-data-factory';

test('should retrieve cached bill', async () => {
  // Setup: Create test data
  await testDataFactory.createBill({
    congress: 118,
    billType: 'hr',
    billNumber: 1234
  });

  // Test: Query the bill
  const response = await request(app)
    .get('/api/bills/118/hr/1234')
    .expect(200);

  expect(response.body.bill).toBeDefined();
});
```

**Benefits**:
- ✅ Consistent test data creation
- ✅ Reduces boilerplate in tests
- ✅ Easy to create complex test scenarios
- ✅ Centralized data structure management

---

### 3. Separate Integration and E2E Tests (Medium Priority)

**Problem**: Current "integration tests" mix HTTP endpoint testing with database operations.

**Solution**: Distinguish between integration tests (with mocks) and E2E tests (full stack).

#### Structure

```
src/tests/
├── unit/                    # Service/utility tests with all mocks
│   ├── services/
│   └── utils/
├── integration/             # HTTP endpoint tests with mocked externals
│   ├── congress-api.integration.test.ts (mock DB + mock Congress.gov)
│   └── ...
└── e2e/                     # Full stack tests with test database
    ├── congress-api.e2e.test.ts (real DB + mock Congress.gov)
    └── ...
```

#### Update Test Scripts

```json
{
  "scripts": {
    "test": "nx test",
    "test:unit": "nx test --testPathPattern='(unit|services)'",
    "test:integration": "nx test --testPathPattern=integration",
    "test:e2e": "NODE_ENV=test nx test --testPathPattern=e2e",
    "test:watch": "nx test --watch",
    "test:coverage": "nx test --coverage",
    "test:ci": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

#### Integration Test Example (Mock Everything)

```typescript
// src/tests/integration/congress-api.integration.test.ts
import request from 'supertest';
import nock from 'nock';
import app from '../../app';
import prismaMock from '../prisma-mock';

// Mock Prisma globally for integration tests
jest.mock('../../prisma/prisma-client', () => ({
  __esModule: true,
  default: prismaMock
}));

test('GET /api/bills should return bills', async () => {
  // Mock Congress.gov API
  nock('https://api.congress.gov').get('/v3/bill').query(true).reply(200, mockData);

  // Mock database
  prismaMock.bill.upsert.mockResolvedValue({} as any);

  const response = await request(app).get('/api/bills').expect(200);
  expect(response.body.bills).toBeDefined();
});
```

#### E2E Test Example (Real Database, Mock External APIs)

```typescript
// src/tests/e2e/congress-api.e2e.test.ts
import request from 'supertest';
import nock from 'nock';
import app from '../../app';
import prisma from '../../prisma/prisma-client';
import { resetTestDatabase } from '../setup/test-database';

beforeEach(async () => {
  await resetTestDatabase();
});

test('GET /api/bills should cache bills in database', async () => {
  // Mock Congress.gov API only
  nock('https://api.congress.gov').get('/v3/bill').query(true).reply(200, mockData);

  // Make request (will hit real test database)
  const response = await request(app).get('/api/bills').expect(200);

  // Verify data was cached in database
  const cachedBills = await prisma.bill.findMany();
  expect(cachedBills.length).toBeGreaterThan(0);
});
```

**Benefits**:
- ✅ Clear separation of concerns
- ✅ Fast integration tests (all mocked)
- ✅ Thorough E2E tests (validates full stack)
- ✅ Can run integration tests without database setup

---

### 4. CI/CD Pipeline Configuration (High Priority)

**Problem**: No automated testing in continuous integration.

**Solution**: Add GitHub Actions workflow for automated testing.

#### GitHub Actions Workflow

Create `.github/workflows/test.yml`:
```yaml
name: Test

on:
  push:
    branches: [main, develop, feature/*]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: civiclens_test
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: civiclens_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://civiclens_test:test_password@localhost:5432/civiclens_test?schema=public
      CONGRESS_API_KEY: ${{ secrets.CONGRESS_API_KEY }}
      NODE_ENV: test

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Run database migrations
        run: npx prisma migrate deploy

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Run Postman/Newman tests
        run: |
          npm install -g newman
          newman run postman/CivicLens-Congress-API.postman_collection.json \
            -e postman/Local.postman_environment.json \
            --bail

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

      - name: Test Summary
        if: always()
        run: echo "✅ All tests passed!"
```

**Benefits**:
- ✅ Automated testing on every push/PR
- ✅ Catches bugs before merge
- ✅ Test database automatically provisioned
- ✅ Coverage reports generated
- ✅ Blocks merges if tests fail

---

### 5. Mock Strategy Documentation (Low Priority)

**Problem**: Inconsistent mocking approaches across tests.

**Solution**: Document and enforce mocking best practices.

#### Create Mocking Guidelines

Create `docs/TESTING_MOCKING_GUIDE.md`:
```markdown
# Mocking Strategy Guide

## When to Mock

### Unit Tests
- ✅ Mock ALL external dependencies:
  - HTTP calls (nock)
  - Database (jest-mock-extended)
  - File system
  - Third-party libraries

### Integration Tests
- ✅ Mock external APIs (nock)
- ✅ Mock database (jest-mock-extended)
- ❌ Don't mock internal services

### E2E Tests
- ✅ Mock external APIs (nock)
- ❌ Don't mock database (use test DB)
- ❌ Don't mock internal services

## Mocking Examples

### HTTP Mocking with Nock
// ... examples

### Database Mocking with jest-mock-extended
// ... examples

### Partial Mocking
// ... examples
```

---

### 6. Test Coverage Requirements (Medium Priority)

**Problem**: No defined coverage thresholds.

**Solution**: Set and enforce coverage requirements.

#### Update Jest Configuration

In `jest.config.ts`:
```typescript
export default {
  // ... existing config
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 85,
      statements: 85
    },
    './src/app/services/congress/': {
      branches: 90,
      functions: 90,
      lines: 95,
      statements: 95
    }
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/tests/**',
    '!src/main.ts'
  ]
};
```

#### Add Coverage Reporting

```json
{
  "scripts": {
    "test:coverage": "nx test --coverage",
    "test:coverage:report": "nx test --coverage && open coverage/lcov-report/index.html"
  }
}
```

**Benefits**:
- ✅ Enforces minimum test coverage
- ✅ Prevents untested code from being merged
- ✅ Identifies gaps in test suite
- ✅ Visual coverage reports

---

### 7. Performance Testing (Low Priority)

**Problem**: No load testing or performance validation.

**Solution**: Add basic performance tests for critical endpoints.

#### Using Artillery

Install: `npm install --save-dev artillery`

Create `tests/performance/load-test.yml`:
```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 120
      arrivalRate: 50
      name: Sustained load
  plugins:
    expect: {}

scenarios:
  - name: List Bills
    flow:
      - get:
          url: '/api/bills?congress=118&limit=20'
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: bills

  - name: Get Bill Detail
    flow:
      - get:
          url: '/api/bills/118/hr/3746'
          expect:
            - statusCode: 200
```

Add script:
```json
{
  "scripts": {
    "test:load": "artillery run tests/performance/load-test.yml"
  }
}
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. ✅ Test database setup
2. ✅ Update integration tests to use test database
3. ✅ Configure CI/CD pipeline

### Phase 2: Enhancement (Week 3-4)
4. ✅ Create test data factories
5. ✅ Separate integration and E2E tests
6. ✅ Add coverage requirements

### Phase 3: Polish (Week 5+)
7. ✅ Document mocking strategies
8. ✅ Add performance tests
9. ✅ Optimize test execution time

---

## Expected Outcomes

After implementing these improvements:

- **100% test pass rate** in CI/CD
- **85%+ code coverage** for all services
- **< 30 second** unit test execution
- **< 2 minute** full test suite execution
- **Zero flaky tests** (no intermittent failures)
- **Automated** test runs on every PR
- **Blocked merges** for failing tests
- **Clear separation** between unit, integration, and E2E tests

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Nock Documentation](https://github.com/nock/nock)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Artillery Documentation](https://www.artillery.io/docs)

---

## Questions or Issues?

If you encounter issues implementing these improvements:

1. Check existing tests for examples
2. Review the documentation links above
3. Consult with the team
4. Create an issue in the repository with details

---

**Last Updated**: 2025-11-13
**Status**: Proposed improvements for future implementation
**Owner**: Engineering Team
