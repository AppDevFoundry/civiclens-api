/**
 * Bill Enrichment Service Unit Tests
 *
 * Tests for the enrichment service that fetches full bill details.
 */

// @ts-nocheck - Disable TypeScript for this file due to Prisma mock typing issues
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Create mock before importing services
const prismaMock = mockDeep<PrismaClient>();

// Mock the PrismaClient constructor
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock),
}));

// Mock the Congress API
jest.mock('../../../app/services/congress', () => ({
  CongressApi: {
    bills: {
      getBillById: jest.fn(),
    },
  },
}));

import { BillEnrichmentService, getEnrichmentService } from '../../../app/services/sync/enrichment.service';
import { mockBills } from '../../fixtures/watchlist/mock-data';
import { CongressApi } from '../../../app/services/congress';

const mockGetBillById = CongressApi.bills.getBillById as jest.Mock;

describe('BillEnrichmentService', () => {
  let service: BillEnrichmentService;

  beforeEach(() => {
    mockReset(prismaMock);
    jest.clearAllMocks();
    service = new BillEnrichmentService();
    // Mock the delay function to speed up tests
    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
  });

  describe('enrichBills', () => {
    it('should enrich bills successfully', async () => {
      // Mock bills needing enrichment
      const billsToEnrich = [
        {
          ...mockBills.bill1,
          sponsorFullName: null, // Missing sponsor data
          lastEnrichedAt: null,
          enrichmentAttempts: 0,
        },
      ];

      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      // Mock API response with full bill details
      const fullBillResponse = {
        congress: 118,
        type: 'hr',
        number: 1234,
        title: 'Infrastructure Investment and Jobs Act',
        sponsors: [
          {
            bioguideId: 'S000001',
            firstName: 'John',
            lastName: 'Smith',
            fullName: 'John Smith',
            state: 'CA',
            party: 'D',
          },
        ],
        constitutionalAuthorityStatementText: 'Article I, Section 8',
      };

      mockGetBillById.mockResolvedValue(fullBillResponse);
      prismaMock.bill.update.mockResolvedValue({
        ...billsToEnrich[0],
        sponsorFullName: 'John Smith',
        lastEnrichedAt: new Date(),
      } as any);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(1);
      expect(result.billsEnriched).toBe(1);
      expect(result.billsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify API was called with correct parameters
      expect(mockGetBillById).toHaveBeenCalledWith({
        congress: billsToEnrich[0].congress,
        billType: billsToEnrich[0].billType,
        billNumber: billsToEnrich[0].billNumber,
      });

      // Verify database was updated
      expect(prismaMock.bill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: billsToEnrich[0].id },
          data: expect.objectContaining({
            sponsorBioguideId: 'S000001',
            sponsorFullName: 'John Smith',
            lastEnrichedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should skip bills that do not need enrichment', async () => {
      // Bill with all data already present
      const billsToEnrich = [
        {
          ...mockBills.bill1,
          sponsorFullName: 'John Smith',
          lastEnrichedAt: new Date(), // Recently enriched
        },
      ];

      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      // API returns same data
      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith' }],
      });

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(1);
      expect(result.billsEnriched).toBe(0);
      expect(result.billsSkipped).toBe(1);
      expect(prismaMock.bill.update).not.toHaveBeenCalled();
    });

    it('should skip bills when API returns null', async () => {
      const billsToEnrich = [mockBills.bill1];
      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      mockGetBillById.mockResolvedValue(null);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsSkipped).toBe(1);
      expect(result.billsEnriched).toBe(0);
      expect(prismaMock.bill.update).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const billsToEnrich = [mockBills.bill1, mockBills.bill2];
      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      // First call fails, second succeeds
      mockGetBillById
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValueOnce({
          sponsors: [{ fullName: 'Jane Johnson', bioguideId: 'J000002' }],
        });

      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].billId).toBe(mockBills.bill1.id);
      expect(result.errors[0].error).toContain('API rate limit exceeded');
    });

    it('should handle database errors', async () => {
      // Bill needs enrichment (missing sponsor data)
      const billsToEnrich = [{
        ...mockBills.bill1,
        sponsorFullName: null,
        lastEnrichedAt: null,
      }];
      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith', bioguideId: 'S000001' }],
      });

      prismaMock.bill.update.mockRejectedValue(new Error('Database connection lost'));

      const result = await service.enrichBills({ limit: 10 });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Database connection lost');
    });

    it('should handle findMany failure', async () => {
      prismaMock.bill.findMany.mockRejectedValue(new Error('Query failed'));

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].billId).toBe(0);
      expect(result.errors[0].error).toContain('Query failed');
    });

    it('should process multiple bills', async () => {
      const billsToEnrich = [
        { ...mockBills.bill1, sponsorFullName: null, lastEnrichedAt: null },
        { ...mockBills.bill2, sponsorFullName: null, lastEnrichedAt: null },
        { ...mockBills.bill3, sponsorFullName: null, lastEnrichedAt: null },
      ];

      prismaMock.bill.findMany.mockResolvedValue(billsToEnrich as any);

      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'Test Sponsor', bioguideId: 'T000001' }],
      });

      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(3);
      expect(result.billsEnriched).toBe(3);
      expect(mockGetBillById).toHaveBeenCalledTimes(3);
      expect(prismaMock.bill.update).toHaveBeenCalledTimes(3);
    });

    it('should return empty result when no bills need enrichment', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(0);
      expect(result.billsEnriched).toBe(0);
      expect(result.billsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should use correct query for specific bill IDs', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      await service.enrichBills({ billIds: [1, 2, 3] });

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [1, 2, 3] },
          }),
        })
      );
    });

    it('should use correct query for watchlisted only', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      await service.enrichBills({ watchlistedOnly: true });

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            watchedBy: { some: {} },
          }),
        })
      );
    });

    it('should use correct query for daysOld option', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      await service.enrichBills({ daysOld: 7 });

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { lastEnrichedAt: null },
              { lastEnrichedAt: expect.any(Object) },
            ]),
          }),
        })
      );
    });
  });

  describe('enrichWatchlistedBills', () => {
    it('should call enrichBills with watchlistedOnly option', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const enrichBillsSpy = jest.spyOn(service, 'enrichBills');

      await service.enrichWatchlistedBills(50);

      expect(enrichBillsSpy).toHaveBeenCalledWith({
        watchlistedOnly: true,
        limit: 50,
      });
    });

    it('should use default limit of 100', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const enrichBillsSpy = jest.spyOn(service, 'enrichBills');

      await service.enrichWatchlistedBills();

      expect(enrichBillsSpy).toHaveBeenCalledWith({
        watchlistedOnly: true,
        limit: 100,
      });
    });
  });

  describe('enrichBillsMissingSponsor', () => {
    it('should call enrichBills with missingSponsorsOnly option', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const enrichBillsSpy = jest.spyOn(service, 'enrichBills');

      await service.enrichBillsMissingSponsor(25);

      expect(enrichBillsSpy).toHaveBeenCalledWith({
        missingSponsorsOnly: true,
        limit: 25,
      });
    });

    it('should use default limit of 100', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const enrichBillsSpy = jest.spyOn(service, 'enrichBills');

      await service.enrichBillsMissingSponsor();

      expect(enrichBillsSpy).toHaveBeenCalledWith({
        missingSponsorsOnly: true,
        limit: 100,
      });
    });
  });

  describe('doesBillNeedEnrichment (via enrichBills)', () => {
    beforeEach(() => {
      // Reset the delay mock for these tests
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
    });

    it('should enrich bill missing sponsor data', async () => {
      const bill = {
        ...mockBills.bill1,
        sponsorFullName: null,
        lastEnrichedAt: new Date(),
      };

      prismaMock.bill.findMany.mockResolvedValue([bill] as any);
      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith', bioguideId: 'S000001' }],
      });
      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 1 });

      expect(result.billsEnriched).toBe(1);
    });

    it('should enrich bill missing constitutional authority', async () => {
      const bill = {
        ...mockBills.bill1,
        sponsorFullName: 'John Smith',
        constitutionalAuthorityStatementText: null,
        lastEnrichedAt: new Date(),
      };

      prismaMock.bill.findMany.mockResolvedValue([bill] as any);
      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith' }],
        constitutionalAuthorityStatementText: 'Article I',
      });
      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 1 });

      expect(result.billsEnriched).toBe(1);
    });

    it('should enrich bill never enriched before', async () => {
      const bill = {
        ...mockBills.bill1,
        sponsorFullName: 'John Smith',
        lastEnrichedAt: null,
      };

      prismaMock.bill.findMany.mockResolvedValue([bill] as any);
      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith' }],
      });
      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 1 });

      expect(result.billsEnriched).toBe(1);
    });

    it('should enrich bill enriched more than 7 days ago', async () => {
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      const bill = {
        ...mockBills.bill1,
        sponsorFullName: 'John Smith',
        lastEnrichedAt: eightDaysAgo,
      };

      prismaMock.bill.findMany.mockResolvedValue([bill] as any);
      mockGetBillById.mockResolvedValue({
        sponsors: [{ fullName: 'John Smith' }],
      });
      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 1 });

      expect(result.billsEnriched).toBe(1);
    });
  });

  describe('getEnrichmentService', () => {
    it('should return singleton instance', () => {
      const service1 = getEnrichmentService();
      const service2 = getEnrichmentService();

      expect(service1).toBe(service2);
      expect(service1).toBeInstanceOf(BillEnrichmentService);
    });
  });

  describe('EnrichmentResult', () => {
    it('should track duration correctly', async () => {
      prismaMock.bill.findMany.mockResolvedValue([]);

      const result = await service.enrichBills({});

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should track all metrics', async () => {
      const bills = [
        { ...mockBills.bill1, sponsorFullName: null, lastEnrichedAt: null },
        { ...mockBills.bill2, sponsorFullName: 'Jane', lastEnrichedAt: new Date() },
      ];

      prismaMock.bill.findMany.mockResolvedValue(bills as any);

      mockGetBillById
        .mockResolvedValueOnce({
          sponsors: [{ fullName: 'John Smith' }],
        })
        .mockResolvedValueOnce({
          sponsors: [{ fullName: 'Jane' }], // Same as existing
        });

      prismaMock.bill.update.mockResolvedValue({} as any);

      const result = await service.enrichBills({ limit: 10 });

      expect(result.billsProcessed).toBe(2);
      expect(result.billsEnriched).toBe(1);
      expect(result.billsSkipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
