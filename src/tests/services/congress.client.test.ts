/**
 * Congress API Client Tests
 *
 * Tests for HTTP client functionality using nock to mock API responses.
 */

// Set environment variables BEFORE importing modules
process.env.CONGRESS_API_KEY = 'test-api-key';
process.env.CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

import nock from 'nock';
import { CongressApiClient } from '../../app/services/congress/congress.client';
import { CongressApiException } from '../../app/services/congress/congress.types';

describe('CongressApiClient', () => {
  let client: CongressApiClient;
  const baseUrl = 'https://api.congress.gov/v3';
  const apiKey = 'test-api-key';

  beforeAll(() => {
    // Environment variables already set at module level
  });

  beforeEach(() => {
    // Create new client instance for each test
    client = new CongressApiClient();

    // Clean all HTTP mocks
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('API Key Injection', () => {
    test('should add API key to all requests', async () => {
      // Given: Mock endpoint
      const scope = nock(baseUrl)
        .get('/bill')
        .query({ api_key: apiKey, format: 'json', limit: 1 })
        .reply(200, { bills: [] });

      // When: Request is made
      await client.request('/bill', { limit: 1 });

      // Then: Request should include API key
      expect(scope.isDone()).toBe(true);
    });

    test('should add format=json by default', async () => {
      // Given: Mock endpoint
      const scope = nock(baseUrl)
        .get('/bill')
        .query({ api_key: apiKey, format: 'json' })
        .reply(200, { bills: [] });

      // When: Request is made
      await client.request('/bill');

      // Then: Request should include format parameter
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Response Handling', () => {
    test('should return normalized response with data', async () => {
      // Given: Mock successful response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, {
          bills: [{ congress: 118, type: 'hr', number: 1 }],
          pagination: { count: 1 }
        });

      // When: Request is made
      const response = await client.request('/bill');

      // Then: Response should be normalized
      expect(response.data).toBeDefined();
      expect(response.pagination).toEqual({ count: 1 });
    });

    test('should extract collection array from response', async () => {
      // Given: Mock response with bills array
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, {
          bills: [
            { congress: 118, type: 'hr', number: 1 },
            { congress: 118, type: 's', number: 2 }
          ]
        });

      // When: Collection request is made
      const response = await client.getCollection('/bill');

      // Then: Should extract bills array
      expect(response.data).toHaveLength(2);
      expect(response.data[0]).toEqual({ congress: 118, type: 'hr', number: 1 });
    });

    test('should extract detail object from response', async () => {
      // Given: Mock response with single bill
      nock(baseUrl)
        .get('/bill/118/hr/1')
        .query(true)
        .reply(200, {
          bill: { congress: 118, type: 'hr', number: 1, title: 'Test Bill' }
        });

      // When: Detail request is made
      const bill = await client.getDetail('/bill/118/hr/1');

      // Then: Should extract bill object
      expect(bill).toEqual({
        congress: 118,
        type: 'hr',
        number: 1,
        title: 'Test Bill'
      });
    });
  });

  describe('Error Handling', () => {
    test('should convert 404 to CongressApiException', async () => {
      // Given: Mock 404 response
      nock(baseUrl)
        .get('/bill/118/hr/99999')
        .query(true)
        .reply(404, { error: 'Not Found' });

      // When/Then: Request should throw CongressApiException with correct properties
      const promise = client.request('/bill/118/hr/99999');
      await expect(promise).rejects.toThrow(CongressApiException);
      await expect(promise).rejects.toMatchObject({
        status: 404,
        message: 'Resource not found'
      });
    });

    test('should convert 401 to CongressApiException with appropriate message', async () => {
      // Given: Mock 401 response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(401, { error: 'Unauthorized' });

      // When/Then: Request should throw with auth error
      await expect(client.request('/bill')).rejects.toMatchObject({
        status: 401,
        message: 'Unauthorized: Invalid or missing API key'
      });
    });

    test('should convert 500 to CongressApiException', async () => {
      // Given: Mock 500 response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(500, { error: 'Internal Server Error' });

      // When/Then: Request should throw with server error
      await expect(client.request('/bill')).rejects.toMatchObject({
        status: 500,
        message: 'Congress.gov API server error'
      });
    });

    test('should handle network errors', async () => {
      // Given: Mock network error
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .replyWithError('Network error');

      // When/Then: Request should throw with network error
      await expect(client.request('/bill')).rejects.toMatchObject({
        status: 0,
        message: 'No response from Congress.gov API'
      });
    });
  });

  describe('Retry Logic for Rate Limiting', () => {
    test('should retry on 429 with exponential backoff', async () => {
      // Given: Mock 429 followed by success
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(429, { error: 'Too Many Requests' })
        .get('/bill')
        .query(true)
        .reply(200, { bills: [] });

      // When: Request is made
      const response = await client.request('/bill');

      // Then: Request should eventually succeed
      expect(response.data).toBeDefined();
    }, 10000); // Increase timeout for retry delays

    test('should throw after max retries on persistent 429', async () => {
      // Given: Mock persistent 429 responses
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .times(4) // Initial + 3 retries
        .reply(429, { error: 'Too Many Requests' });

      // When/Then: Request should eventually throw
      await expect(client.request('/bill')).rejects.toMatchObject({
        status: 429,
        message: 'Rate limit exceeded'
      });
    }, 30000); // Increase timeout for multiple retries
  });

  describe('Pagination Helpers', () => {
    test('should extract pagination metadata', async () => {
      // Given: Mock response with pagination
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, {
          bills: [],
          pagination: {
            count: 100,
            next: `${baseUrl}/bill?offset=20&limit=20`,
            prev: null
          }
        });

      // When: Request is made
      const response = await client.request('/bill');

      // Then: Pagination should be extracted
      expect(response.pagination).toEqual({
        count: 100,
        next: `${baseUrl}/bill?offset=20&limit=20`,
        previous: undefined
      });
    });

    test('should build next page params from pagination', () => {
      // Given: Pagination with next URL
      const pagination = {
        count: 100,
        next: `${baseUrl}/bill?offset=20&limit=20`
      };

      // When: Next page params are built
      const params = client.buildNextPageParams(pagination, { limit: 20 });

      // Then: Should extract offset and limit
      expect(params).toEqual({
        offset: 20,
        limit: 20
      });
    });

    test('should return null when no next page', () => {
      // Given: Pagination without next URL
      const pagination = {
        count: 10,
        next: undefined
      };

      // When: Next page params are requested
      const params = client.buildNextPageParams(pagination);

      // Then: Should return null
      expect(params).toBeNull();
    });
  });

  describe('Utility Methods', () => {
    test('should format dates for API', () => {
      // Given: A date object
      const date = new Date('2023-01-15T12:00:00Z');

      // When: Date is formatted
      const formatted = client.formatApiDate(date);

      // Then: Should be in ISO format
      expect(formatted).toBe('2023-01-15T12:00:00.000Z');
    });

    test('should build date range params', () => {
      // Given: From and to dates
      const fromDate = new Date('2023-01-01');
      const toDate = new Date('2023-12-31');

      // When: Date range is built
      const range = client.buildDateRange(fromDate, toDate);

      // Then: Should have formatted dates
      expect(range).toHaveProperty('fromDateTime');
      expect(range).toHaveProperty('toDateTime');
      expect(range.fromDateTime).toContain('2023-01-01');
      expect(range.toDateTime).toContain('2023-12-31');
    });
  });

  describe('Health Check', () => {
    test('should return true when API is accessible', async () => {
      // Given: Mock successful response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, { bills: [] });

      // When: Ping is called
      const isHealthy = await client.ping();

      // Then: Should return true
      expect(isHealthy).toBe(true);
    });

    test('should return false when API is not accessible', async () => {
      // Given: Mock error response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(500);

      // When: Ping is called
      const isHealthy = await client.ping();

      // Then: Should return false
      expect(isHealthy).toBe(false);
    });
  });
});
