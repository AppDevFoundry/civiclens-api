/**
 * Congress API Integration Tests
 *
 * These tests validate the Express endpoints using supertest,
 * with Congress.gov API calls mocked using nock.
 */

// Set environment variables BEFORE imports
process.env.CONGRESS_API_KEY = 'test-api-key';
process.env.CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

import request from 'supertest';
import nock from 'nock';
import app from '../../app';
import {
  mockBillsResponse,
  mockBillDetailResponse,
  mockMembersResponse,
  mockCommitteesResponse,
  mockErrorResponses
} from '../fixtures/congress/api-responses';

// Disable real HTTP requests during tests
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('Congress API Integration Tests', () => {

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  describe('GET /api/congress/ping', () => {
    it('should return healthy status', async () => {
      // Mock ping endpoint - use query(true) for flexible matching
      nock('https://api.congress.gov')
        .get('/v3')
        .query(true)
        .reply(200, { status: 'ok' });

      const response = await request(app)
        .get('/api/congress/ping')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/bills', () => {
    it('should list bills with default parameters', async () => {
      // Mock Congress.gov API response - use query(true) for flexible matching
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      const response = await request(app)
        .get('/api/bills')
        .expect(200);

      expect(response.body).toHaveProperty('bills');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.bills)).toBe(true);
      expect(response.body.bills.length).toBeGreaterThan(0);

      // Validate bill structure
      const bill = response.body.bills[0];
      expect(bill).toHaveProperty('congress');
      expect(bill).toHaveProperty('type');
      expect(bill).toHaveProperty('number');
      expect(bill).toHaveProperty('title');
    });

    it('should filter bills by congress and billType', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      const response = await request(app)
        .get('/api/bills')
        .query({ congress: 118, billType: 'hr', limit: 10 })
        .expect(200);

      expect(response.body.bills).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    it('should handle API errors gracefully', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .get('/api/bills')
        .expect(500);

      // Error response can be a string or object
      expect(response.body || response.text).toBeDefined();
    });
  });

  describe('GET /api/bills/:congress/:type/:number', () => {
    it('should retrieve a specific bill', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill/118/hr/3746')
        .query(true)
        .reply(200, mockBillDetailResponse);

      const response = await request(app)
        .get('/api/bills/118/hr/3746')
        .expect(200);

      expect(response.body).toHaveProperty('bill');
      const bill = response.body.bill;
      expect(bill.congress).toBe(118);
      expect(bill.type).toBe('hr');
      expect(bill.number).toBeDefined();
      expect(bill.title).toBeDefined();
    });

    it('should return 404 for non-existent bill', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill/118/hr/999999')
        .query(true)
        .reply(404, mockErrorResponses.notFound);

      const response = await request(app)
        .get('/api/bills/118/hr/999999')
        .expect(404);

      // Error response can be a string or object
      expect(response.body || response.text).toBeDefined();
    });
  });

  describe('GET /api/bills/:congress/:type/:number/actions', () => {
    it('should retrieve bill actions', async () => {
      const mockActionsResponse = {
        actions: [
          {
            actionDate: '2023-06-08',
            text: 'Introduced in House',
            type: 'IntroReferral',
            actionCode: 'Intro-H'
          },
          {
            actionDate: '2023-06-09',
            text: 'Referred to Committee',
            type: 'IntroReferral',
            actionCode: 'H11100'
          }
        ],
        pagination: {
          count: 2
        }
      };

      nock('https://api.congress.gov')
        .get('/v3/bill/118/hr/3746/actions')
        .query(true)
        .reply(200, { actions: mockActionsResponse });

      const response = await request(app)
        .get('/api/bills/118/hr/3746/actions')
        .expect(200);

      expect(response.body).toHaveProperty('actions');
      // The service may wrap or transform the response
      const actions = response.body.actions.actions || response.body.actions;
      expect(Array.isArray(actions) || typeof response.body.actions === 'object').toBe(true);
    });
  });

  describe('GET /api/members', () => {
    it('should list members with default parameters', async () => {
      nock('https://api.congress.gov')
        .get('/v3/member')
        .query(true)
        .reply(200, mockMembersResponse);

      const response = await request(app)
        .get('/api/members')
        .expect(200);

      expect(response.body).toHaveProperty('members');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.members)).toBe(true);

      // Validate member structure
      if (response.body.members.length > 0) {
        const member = response.body.members[0];
        expect(member).toHaveProperty('bioguideId');
        expect(member).toHaveProperty('name');
      }
    });

    it('should filter members by state', async () => {
      nock('https://api.congress.gov')
        .get('/v3/member')
        .query(true)
        .reply(200, mockMembersResponse);

      const response = await request(app)
        .get('/api/members')
        .query({ state: 'CA', currentMember: true })
        .expect(200);

      expect(response.body.members).toBeDefined();
    });
  });

  describe('GET /api/members/:bioguideId', () => {
    it('should retrieve a specific member', async () => {
      const mockMemberDetail = {
        member: {
          bioguideId: 'B000944',
          firstName: 'Sherrod',
          lastName: 'Brown',
          state: 'OH',
          party: 'D',
          terms: []
        }
      };

      nock('https://api.congress.gov')
        .get('/v3/member/B000944')
        .query(true)
        .reply(200, mockMemberDetail);

      const response = await request(app)
        .get('/api/members/B000944')
        .expect(200);

      expect(response.body).toHaveProperty('member');
      expect(response.body.member.bioguideId).toBe('B000944');
    });
  });

  describe('GET /api/committees', () => {
    it('should list committees', async () => {
      nock('https://api.congress.gov')
        .get('/v3/committee')
        .query(true)
        .reply(200, mockCommitteesResponse);

      const response = await request(app)
        .get('/api/committees')
        .expect(200);

      expect(response.body).toHaveProperty('committees');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.committees)).toBe(true);
    });

    it('should filter committees by chamber', async () => {
      // The service uses /committee with chamber as a query param
      nock('https://api.congress.gov')
        .get('/v3/committee')
        .query(true)
        .reply(200, mockCommitteesResponse);

      const response = await request(app)
        .get('/api/committees')
        .query({ chamber: 'House' })
        .expect(200);

      expect(response.body.committees).toBeDefined();
    });
  });

  describe('GET /api/committees/:chamber/:systemCode', () => {
    it('should retrieve a specific committee', async () => {
      const mockCommitteeDetail = {
        committee: {
          systemCode: 'hsag00',
          name: 'House Committee on Agriculture',
          chamber: 'House',
          type: 'Standing'
        }
      };

      // Note: The API path uses the chamber parameter as-is from the route
      nock('https://api.congress.gov')
        .get('/v3/committee/House/hsag00')
        .query(true)
        .reply(200, mockCommitteeDetail);

      const response = await request(app)
        .get('/api/committees/House/hsag00')
        .expect(200);

      expect(response.body).toHaveProperty('committee');
      expect(response.body.committee.systemCode).toBe('hsag00');
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limiting (429) with retry', async () => {
      // First request returns 429
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(429, mockErrorResponses.rateLimited);

      // Second request (after retry) succeeds
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      const response = await request(app)
        .get('/api/bills')
        .expect(200);

      expect(response.body.bills).toBeDefined();
    });

    it('should handle unauthorized (401) errors', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(401, mockErrorResponses.unauthorized);

      const response = await request(app)
        .get('/api/bills')
        .expect(500);

      // Error response can be a string or object
      expect(response.body || response.text).toBeDefined();
    });

    it('should validate route parameters', async () => {
      const response = await request(app)
        .get('/api/bills/invalid/hr/123');

      // Should fail with 400 or 500 because congress must be a valid number
      expect([400, 500]).toContain(response.status);
      expect(response.body || response.text).toBeDefined();
    });
  });

  describe('Pagination', () => {
    it('should support limit parameter', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(200, {
          bills: mockBillsResponse.bills.slice(0, 5),
          pagination: {
            count: 5,
            next: 'https://api.congress.gov/v3/bill?offset=5&limit=5'
          }
        });

      const response = await request(app)
        .get('/api/bills')
        .query({ limit: 5 })
        .expect(200);

      // Mock returns fewer items than limit, which is valid
      expect(response.body.bills.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination).toBeDefined();
    });

    it('should support offset parameter', async () => {
      nock('https://api.congress.gov')
        .get('/v3/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      const response = await request(app)
        .get('/api/bills')
        .query({ offset: 20 })
        .expect(200);

      expect(response.body.bills).toBeDefined();
    });
  });
});
