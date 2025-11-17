# CivicLens Testing Roadmap

## Relationship to PR #2

This testing completion work builds on **PR #2: Phase 2 Congress Sync System, Notifications & Testing Suite**.

**PR #2** established:
- Core Phase 2 functionality (sync system, notifications, watchlists)
- Initial test suite with 215 unit tests
- Test patterns for services (error-handler, email, notification, etc.)
- Testing strategy documentation

**This PR** extends that foundation:
- Added 291 more tests (506 total, up from 215)
- Added integration tests for API endpoints
- Added E2E tests with real database
- Added smoke tests for real Congress API
- Increased coverage from ~47% to ~61%
- Added path-to-70% documentation

**Merge Order**: PR #2 should be merged first, then this PR can be merged on top of it.

---

## Current Status (Phase 2 Testing Complete)

### Test Metrics
- **Test Suites**: 28 passing
- **Total Tests**: 506 passing (9 skipped, 2 todo)
- **Coverage**:
  - Statements: 61.08% (target: 70%)
  - Branches: 49.1% (target: 60%)
  - Lines: 60.72% (target: 70%)
  - Functions: 60.46% (target: 70%)

### Phase 2 Accomplishments

#### New Test Files Created
1. `src/tests/integration/watchlist.integration.test.ts` - Watchlist API endpoints
2. `src/tests/integration/notifications.integration.test.ts` - Notification API endpoints
3. `src/tests/integration/admin.integration.test.ts` - Admin dashboard endpoints
4. `src/tests/integration/cron.integration.test.ts` - Cron job endpoints
5. `src/tests/integration/article.integration.test.ts` - Article CRUD endpoints
6. `src/tests/integration/tag.integration.test.ts` - Tag listing endpoint
7. `src/tests/unit/services/notification.service.test.ts` - Notification service unit tests
8. `src/tests/unit/services/enrichment.service.test.ts` - Bill enrichment service
9. `src/tests/unit/services/queue.service.test.ts` - Job queue service
10. `src/tests/unit/services/change-detection.service.test.ts` - Change detection
11. `src/tests/unit/services/orchestrator.service.test.ts` - Sync orchestrator
12. `src/tests/e2e/watchlist-flow.e2e.test.ts` - E2E watchlist workflows
13. `src/tests/e2e/notification-flow.e2e.test.ts` - E2E notification workflows
14. `src/tests/smoke/congress-api-real.smoke.test.ts` - Real API smoke tests

#### Test Fixtures
- `src/tests/fixtures/index.ts` - Centralized mock data for users, bills, watchlists, notifications

#### Infrastructure Improvements
- Configured Jest coverage thresholds in `jest.config.ts`
- Set up real database testing with Prisma
- Created smoke tests for real Congress.gov API validation
- Established patterns for mocking auth, services, and Prisma

---

## Path to 70% Coverage

### Priority 1: Low-Coverage Files (High Impact)

These files have the lowest coverage and should be prioritized:

| File | Current Coverage | Impact |
|------|------------------|--------|
| `src/app/routes/profile/profile.controller.ts` | ~30% | High - User profiles |
| `src/app/routes/profile/profile.service.ts` | ~35% | High - Profile logic |
| `src/app/routes/auth/auth.controller.ts` | ~40% | High - Authentication |
| `src/app/routes/auth/auth.service.ts` | ~45% | High - Auth logic |
| `src/app/services/sync/bill-sync.service.ts` | ~35% | Medium - Core sync |
| `src/app/services/sync/member-sync.service.ts` | ~38% | Medium - Member sync |
| `src/app/services/sync/hearing-sync.service.ts` | ~40% | Medium - Hearing sync |

### Priority 2: Partially Tested Files

| File | Current Coverage | Notes |
|------|------------------|-------|
| `src/app/routes/congress/congress.controller.ts` | ~55% | Need error handling tests |
| `src/app/routes/congress/congress.service.ts` | ~50% | Need edge case tests |
| `src/app/services/sync/error-handler.service.ts` | ~45% | Need error scenario tests |

### Estimated Effort to Reach 70%

Based on current coverage (61%) needing to reach 70%, approximately:
- **8-10 new test files** needed
- **150-200 additional tests** estimated
- **2-3 development sessions** (4-6 hours each)

---

## Recommendations for Future Work

### 1. Immediate Actions

#### Profile & Auth Tests (Highest Priority)
```typescript
// Create these files:
src/tests/integration/profile.integration.test.ts
src/tests/integration/auth.integration.test.ts
```

These should cover:
- User registration and login
- Profile CRUD operations
- Follow/unfollow users
- Password reset flows
- Token refresh

#### Sync Service Tests
```typescript
// Create these files:
src/tests/unit/services/bill-sync.service.test.ts
src/tests/unit/services/member-sync.service.test.ts
src/tests/unit/services/hearing-sync.service.test.ts
```

Use the patterns established in `orchestrator.service.test.ts` for mocking.

### 2. Test Infrastructure Enhancements

#### A. Test Database Management
Consider adding:
```typescript
// src/tests/helpers/database.ts
export async function resetTestDatabase() {
  // Truncate all tables between test suites
}

export async function seedTestData(scenario: string) {
  // Load predefined test scenarios
}
```

#### B. Shared Test Utilities
```typescript
// src/tests/helpers/auth.ts
export function createAuthenticatedRequest(userId: number) {
  // Return supertest agent with auth headers
}

export function mockPrismaClient() {
  // Standardized Prisma mock setup
}
```

#### C. Test Factories
```typescript
// src/tests/factories/index.ts
export const BillFactory = {
  create: (overrides = {}) => ({
    congress: 118,
    billType: 'hr',
    billNumber: Math.floor(Math.random() * 10000),
    title: 'Test Bill',
    ...overrides,
  }),
};
```

### 3. CI/CD Integration

#### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

#### Coverage Reporting
- Set up Codecov or similar for PR coverage diffs
- Add coverage badges to README
- Block PRs that decrease coverage

### 4. Testing Patterns to Adopt

#### Mock Service Pattern (Recommended)
```typescript
// For integration tests, mock at service level
jest.mock('../../app/routes/profile/profile.service', () => ({
  getProfile: jest.fn(),
  followUser: jest.fn(),
  // ...
}));
```

#### Auth Mock Pattern (Standardized)
```typescript
// Already established - use consistently
jest.mock('../../app/routes/auth/auth', () => ({
  __esModule: true,
  default: {
    required: (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.auth = { user: { id: 1 } };
      next();
    },
    optional: (req, res, next) => {
      // Parse auth if present
      next();
    },
  },
}));
```

#### Prisma Mock Pattern
```typescript
// For unit tests with database operations
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

const mockPrisma = mockDeep<PrismaClient>();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));
```

---

## File-by-File Test Plan

### Phase 3A: Authentication & Profiles (~2 hours)

1. **auth.integration.test.ts** (25-30 tests)
   - POST /api/users (registration)
   - POST /api/users/login
   - GET /api/user (current user)
   - PUT /api/user (update user)
   - Error handling (invalid credentials, duplicate email)

2. **profile.integration.test.ts** (20-25 tests)
   - GET /api/profiles/:username
   - POST /api/profiles/:username/follow
   - DELETE /api/profiles/:username/follow
   - Error handling (user not found)

### Phase 3B: Sync Services (~3 hours)

3. **bill-sync.service.test.ts** (30-35 tests)
   - syncBills() with various options
   - syncStale() for outdated records
   - Error handling and retries
   - Rate limiting behavior

4. **member-sync.service.test.ts** (25-30 tests)
   - syncMembers() with filters
   - syncAllCurrentMembers()
   - Member data transformation

5. **hearing-sync.service.test.ts** (25-30 tests)
   - syncUpcoming()
   - syncRecent()
   - syncHearings() with options

### Phase 3C: Error Handling & Edge Cases (~2 hours)

6. **error-handler.service.test.ts** (20-25 tests)
   - Error categorization
   - Alert thresholds
   - Error resolution tracking

7. **congress.controller.test.ts** (additional tests)
   - Error responses
   - Edge cases
   - Pagination limits

---

## Technical Debt & Known Issues

### 1. Test Isolation
Some tests may share state through singleton services. Consider:
- Resetting singleton instances between tests
- Using `jest.isolateModules()` for problematic tests

### 2. Database Cleanup
E2E tests create real database records. Ensure:
- Unique identifiers (timestamps) in test data
- Proper cleanup in `afterAll` hooks
- Consider transaction rollback pattern

### 3. Mock Consistency
Different tests mock the same services differently. Standardize:
- Create shared mock definitions
- Document expected mock behaviors
- Use consistent mock naming

### 4. Skipped Tests
9 tests are currently skipped (real API smoke tests). These:
- Require `CONGRESS_API_KEY` environment variable
- Should only run in CI with secrets configured
- Consider separate test command: `npm run test:smoke`

---

## Running Tests

### All Tests
```bash
npm test
```

### With Coverage
```bash
npm test -- --coverage
```

### Specific Test Files
```bash
npm test -- --testPathPattern="auth|profile"
```

### Watch Mode
```bash
npm test -- --watch
```

### Real API Smoke Tests
```bash
CONGRESS_API_KEY=your-key npm test -- --testPathPattern="smoke"
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest for API Testing](https://github.com/ladjs/supertest)
- [jest-mock-extended](https://github.com/marchaos/jest-mock-extended)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)

---

## Session Notes

### What Worked Well
- Mocking at service level for integration tests
- Using `@ts-nocheck` for complex mock setups
- Real database tests for E2E workflows
- Centralized test fixtures

### Challenges Encountered
- Prisma circular type issues with deep mocks
- Auth middleware mock complexity
- Singleton service state between tests
- Congress API rate limiting in tests

### Key Files to Reference
- `src/tests/integration/watchlist.integration.test.ts` - Good integration test pattern
- `src/tests/unit/services/orchestrator.service.test.ts` - Good unit test pattern
- `src/tests/e2e/watchlist-flow.e2e.test.ts` - Good E2E pattern
- `src/tests/fixtures/index.ts` - Centralized mock data

---

*Last Updated: November 2024*
*Phase 2 Complete - Ready for Phase 3*
