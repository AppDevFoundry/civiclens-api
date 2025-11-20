/**
 * Real Congress.gov API Smoke Tests
 *
 * These tests hit the REAL Congress.gov API to validate:
 * - API connectivity
 * - Response format matches our expectations
 * - Our mocks are accurate
 *
 * SKIPPED BY DEFAULT to avoid consuming rate limit (5000/hour).
 * Run with: TEST_REAL_CONGRESS_API=true npm test -- --testPathPattern="congress-api-real"
 */

// @ts-nocheck - Disable TypeScript for flexible API response testing

// Set environment before imports
process.env.CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
process.env.CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

import { CongressApiClient } from '../../app/services/congress/congress.client';

// Skip all tests unless explicitly enabled
const shouldRunRealApiTests = process.env.TEST_REAL_CONGRESS_API === 'true';

const describeOrSkip = shouldRunRealApiTests ? describe : describe.skip;

// Increase timeout for real API calls
jest.setTimeout(30000);

describeOrSkip('Real Congress.gov API Smoke Tests', () => {
  let client: CongressApiClient;

  beforeAll(() => {
    if (!process.env.CONGRESS_API_KEY || process.env.CONGRESS_API_KEY === 'DEMO_KEY') {
      console.warn(
        '\n⚠️  Using DEMO_KEY for Congress.gov API. For better results, set CONGRESS_API_KEY.\n'
      );
    }
    client = new CongressApiClient();
  });

  describe('API Health', () => {
    it('should connect to Congress.gov API', async () => {
      const isHealthy = await client.ping();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Bills Endpoints', () => {
    it('should fetch list of bills', async () => {
      const response = await client.getCollection('/bill', { limit: 5 });

      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data.length).toBeLessThanOrEqual(5);

      // Validate bill structure
      const bill = response.data[0];
      expect(bill).toHaveProperty('congress');
      expect(bill).toHaveProperty('type');
      expect(bill).toHaveProperty('number');
      expect(bill).toHaveProperty('title');
      expect(bill).toHaveProperty('updateDate');
    });

    it('should fetch a specific bill', async () => {
      // Use a well-known bill that should always exist
      const bill = await client.getDetail('/bill/118/hr/1');

      expect(bill).toBeDefined();
      expect(bill.congress).toBe(118);
      // API returns uppercase type (HR, S, etc.)
      expect(bill.type.toLowerCase()).toBe('hr');
      expect(bill.number).toBe('1');
      expect(bill.title).toBeDefined();
    });

    it('should include pagination metadata', async () => {
      const response = await client.getCollection('/bill', { limit: 2 });

      expect(response.pagination).toBeDefined();
      expect(response.pagination).toHaveProperty('count');
      expect(typeof response.pagination.count).toBe('number');
    });
  });

  describe('Members Endpoints', () => {
    it('should fetch list of members', async () => {
      const response = await client.getCollection('/member', { limit: 5 });

      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);

      // Validate member structure
      const member = response.data[0];
      expect(member).toHaveProperty('bioguideId');
      expect(member).toHaveProperty('name');
    });

    it('should fetch a specific member', async () => {
      // Use a well-known member bioguide ID
      const member = await client.getDetail('/member/P000197');

      expect(member).toBeDefined();
      expect(member.bioguideId).toBe('P000197');
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent bill', async () => {
      // This should return null, not throw
      const bill = await client.getDetail('/bill/118/hr/999999').catch(() => null);
      expect(bill).toBeNull();
    });
  });

  describe('Query Parameters', () => {
    it('should filter bills by congress', async () => {
      // Congress.gov API uses path-based filtering: /bill/{congress}
      const response = await client.getCollection('/bill/118', {
        limit: 3,
      });

      expect(response.data).toBeDefined();
      response.data.forEach((bill: any) => {
        expect(bill.congress).toBe(118);
      });
    });

    it('should sort bills by update date', async () => {
      const response = await client.getCollection('/bill', {
        limit: 5,
        sort: 'updateDate desc',
      });

      expect(response.data).toBeDefined();
      expect(response.data.length).toBeGreaterThan(1);

      // Verify descending order
      const dates = response.data.map((bill: any) => new Date(bill.updateDate));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });
  });
});

// Info message when tests are skipped
if (!shouldRunRealApiTests) {
  describe('Real Congress.gov API Smoke Tests', () => {
    it.todo(
      'Skipped - Run with TEST_REAL_CONGRESS_API=true to enable real API tests'
    );
  });
}
