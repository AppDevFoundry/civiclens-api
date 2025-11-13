/**
 * Bills Service Tests
 *
 * Tests for bills service functionality with mocked HTTP and database calls.
 */

// Set environment variables BEFORE importing modules
process.env.CONGRESS_API_KEY = 'test-api-key';
process.env.CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

import nock from 'nock';
import prismaMock from '../prisma-mock';
import { listBills, getBillById } from '../../app/services/congress/resources/bills.service';
import { mockBillsResponse, mockBillDetailResponse } from '../fixtures/congress/api-responses';

describe('Bills Service', () => {
  const baseUrl = 'https://api.congress.gov/v3';
  const apiKey = 'test-api-key';

  beforeAll(() => {
    // Environment variables already set at module level
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('listBills', () => {
    test('should fetch bills from Congress.gov API', async () => {
      // Given: Mock API response
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      // Mock Prisma upsert
      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: List bills is called
      const result = await listBills({ limit: 20 });

      // Then: Should return bills
      expect(result.bills).toHaveLength(2);
      expect(result.bills[0]).toMatchObject({
        congress: 118,
        type: 'hr',
        number: 1234
      });
      expect(result.pagination).toEqual({
        count: 2,
        next: null,
        prev: null
      });
    });

    test('should apply query filters', async () => {
      // Given: Mock API with specific query params
      const scope = nock(baseUrl)
        .get('/bill')
        .query({
          api_key: apiKey,
          format: 'json',
          limit: 10,
          offset: 0,
          congress: 118,
          billType: 'hr',
          sort: 'updateDate desc'
        })
        .reply(200, mockBillsResponse);

      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: List bills is called with filters
      await listBills({
        congress: 118,
        billType: 'hr',
        limit: 10,
        offset: 0
      });

      // Then: Should make request with correct params
      expect(scope.isDone()).toBe(true);
    });

    test('should cache bills in database', async () => {
      // Given: Mock API response with bills
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      // Mock Prisma upsert
      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: List bills is called
      await listBills();

      // Then: Should upsert bills to database
      expect(prismaMock.bill.upsert).toHaveBeenCalledTimes(2);
      expect(prismaMock.bill.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            congress_billType_billNumber: {
              congress: 118,
              billType: 'hr',
              billNumber: 1234
            }
          })
        })
      );
    });

    test('should handle API errors gracefully', async () => {
      // Given: Mock API error
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(500, { error: 'Internal Server Error' });

      // When/Then: Should throw error
      await expect(listBills()).rejects.toThrow();
    });
  });

  describe('getBillById', () => {
    test('should fetch specific bill by identifier', async () => {
      // Given: Mock API response for specific bill
      nock(baseUrl)
        .get('/bill/118/hr/1234')
        .query(true)
        .reply(200, mockBillDetailResponse);

      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: Get bill by ID is called
      const bill = await getBillById({
        congress: 118,
        billType: 'hr',
        billNumber: 1234
      });

      // Then: Should return bill details
      expect(bill).toBeDefined();
      expect(bill).toMatchObject({
        congress: 118,
        type: 'hr',
        number: 1234,
        title: 'Infrastructure Investment and Jobs Act'
      });
    });

    test('should cache bill detail in database', async () => {
      // Given: Mock API response
      nock(baseUrl)
        .get('/bill/118/hr/1234')
        .query(true)
        .reply(200, mockBillDetailResponse);

      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: Get bill by ID is called
      await getBillById({
        congress: 118,
        billType: 'hr',
        billNumber: 1234
      });

      // Then: Should upsert bill to database
      expect(prismaMock.bill.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            congress_billType_billNumber: {
              congress: 118,
              billType: 'hr',
              billNumber: 1234
            }
          },
          create: expect.objectContaining({
            congress: 118,
            billType: 'hr',
            billNumber: 1234,
            title: 'Infrastructure Investment and Jobs Act'
          }),
          update: expect.objectContaining({
            title: 'Infrastructure Investment and Jobs Act'
          })
        })
      );
    });

    test('should return null for non-existent bill', async () => {
      // Given: Mock 404 response
      nock(baseUrl)
        .get('/bill/118/hr/99999')
        .query(true)
        .reply(404, { error: 'Not Found' });

      // When: Get non-existent bill
      const bill = await getBillById({
        congress: 118,
        billType: 'hr',
        billNumber: 99999
      });

      // Then: Should return null
      expect(bill).toBeNull();
    });

    test('should extract sponsor information', async () => {
      // Given: Mock API response with sponsor
      nock(baseUrl)
        .get('/bill/118/hr/1234')
        .query(true)
        .reply(200, mockBillDetailResponse);

      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: Get bill by ID is called
      await getBillById({
        congress: 118,
        billType: 'hr',
        billNumber: 1234
      });

      // Then: Should store sponsor information
      expect(prismaMock.bill.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sponsorBioguideId: 'S000001',
            sponsorFullName: 'John Smith',
            sponsorParty: 'D',
            sponsorState: 'CA'
          })
        })
      );
    });

    test('should handle bills that became laws', async () => {
      // Given: Mock response with law information
      const billWithLaw = {
        ...mockBillDetailResponse,
        bill: {
          ...mockBillDetailResponse.bill,
          laws: [{ type: 'Public Law', number: '118-1' }]
        }
      };

      nock(baseUrl)
        .get('/bill/118/hr/1234')
        .query(true)
        .reply(200, billWithLaw);

      prismaMock.bill.upsert.mockResolvedValue({} as any);

      // When: Get bill by ID is called
      await getBillById({
        congress: 118,
        billType: 'hr',
        billNumber: 1234
      });

      // Then: Should mark as law
      expect(prismaMock.bill.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isLaw: true,
            lawNumber: '118-1'
          })
        })
      );
    });
  });

  describe('Database Caching Resilience', () => {
    test('should not fail request if database caching fails', async () => {
      // Given: Mock successful API but failing database
      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      prismaMock.bill.upsert.mockRejectedValue(new Error('Database error'));

      // When: List bills is called
      const result = await listBills();

      // Then: Should still return bills even if caching fails
      expect(result.bills).toHaveLength(2);
    });

    test('should log error when caching fails', async () => {
      // Given: Mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      nock(baseUrl)
        .get('/bill')
        .query(true)
        .reply(200, mockBillsResponse);

      prismaMock.bill.upsert.mockRejectedValue(new Error('Database error'));

      // When: List bills is called
      await listBills();

      // Then: Should log the error
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
