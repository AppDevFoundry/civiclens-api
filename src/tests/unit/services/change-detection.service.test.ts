/**
 * Change Detection Service Tests
 *
 * Tests for detecting and logging bill changes.
 */

// @ts-nocheck - Disable TypeScript for Prisma mock circular type issues

import { Bill } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create mock before jest.mock is called
const mockPrisma = mockDeep<PrismaClient>();

// Mock @prisma/client - must be before importing the service
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    __esModule: true,
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  };
});

// Import service after mock is set up
import { ChangeDetectionService, ChangeType, DetectedChange } from '../../../app/services/sync/change-detection.service';

describe('ChangeDetectionService', () => {
  let service: ChangeDetectionService;

  beforeEach(() => {
    mockReset(mockPrisma);
    service = new ChangeDetectionService();
  });

  describe('detectBillChanges', () => {
    const createMockBill = (overrides?: Partial<Bill>): Bill => ({
      id: 1,
      congress: 118,
      billType: 'hr',
      billNumber: 1234,
      title: 'Test Bill',
      introducedDate: new Date('2023-01-01'),
      updateDate: new Date('2023-01-15'),
      updateDateIncludingText: new Date('2023-01-15'),
      originChamber: 'House',
      originChamberCode: 'H',
      latestActionDate: new Date('2023-01-15'),
      latestActionText: 'Introduced in House',
      sponsorBioguideId: 'S000001',
      sponsorFirstName: 'John',
      sponsorLastName: 'Smith',
      sponsorFullName: 'John Smith',
      sponsorParty: 'D',
      sponsorState: 'CA',
      policyArea: 'Healthcare',
      constitutionalAuthorityStatementText: null,
      lawNumber: null,
      isLaw: false,
      lastSyncedAt: new Date(),
      syncAttempts: 0,
      lastEnrichedAt: null,
      enrichmentAttempts: 0,
      priority: 1,
      apiResponseData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Bill);

    test('should detect new bill as a status change', async () => {
      // Arrange: No old bill (new bill scenario)
      const newBill = createMockBill();

      // Act: Detect changes
      const changes = await service.detectBillChanges(null, newBill);

      // Assert: Should detect as new bill
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.STATUS,
        previousValue: null,
        newValue: 'introduced',
        significance: 'high',
      });
    });

    test('should detect law number change', async () => {
      // Arrange: Bill becomes law
      const oldBill = createMockBill({ lawNumber: null });
      const newBill = createMockBill({ lawNumber: 'PL-118-1' });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect law change
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.LAW,
        previousValue: null,
        newValue: 'PL-118-1',
        significance: 'high',
      });
    });

    test('should detect title change', async () => {
      // Arrange: Title changes
      const oldBill = createMockBill({ title: 'Original Title' });
      const newBill = createMockBill({ title: 'Updated Title' });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect title change
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.TITLE,
        previousValue: 'Original Title',
        newValue: 'Updated Title',
        significance: 'medium',
      });
    });

    test('should detect latest action change', async () => {
      // Arrange: Latest action changes
      const oldBill = createMockBill({
        latestActionDate: new Date('2023-01-15'),
        latestActionText: 'Introduced in House',
      });
      const newBill = createMockBill({
        latestActionDate: new Date('2023-02-01'),
        latestActionText: 'Passed House',
      });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect action change
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.ACTION,
        previousValue: {
          date: oldBill.latestActionDate,
          text: 'Introduced in House',
        },
        newValue: {
          date: newBill.latestActionDate,
          text: 'Passed House',
        },
        significance: 'high',
      });
    });

    test('should detect policy area change', async () => {
      // Arrange: Policy area changes
      const oldBill = createMockBill({ policyArea: 'Healthcare' });
      const newBill = createMockBill({ policyArea: 'Education' });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect policy area change
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.POLICY_AREA,
        previousValue: 'Healthcare',
        newValue: 'Education',
        significance: 'low',
      });
    });

    test('should detect cosponsor count increase', async () => {
      // Arrange: Cosponsors increase
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: { count: 5 } },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: { count: 10 } },
      });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect cosponsor change with medium significance
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.COSPONSORS,
        previousValue: { count: 5 },
        newValue: { count: 10 },
        significance: 'medium', // Increase = medium
      });
    });

    test('should detect cosponsor count decrease', async () => {
      // Arrange: Cosponsors decrease
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: { count: 10 } },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: { count: 8 } },
      });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect cosponsor change with low significance
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.COSPONSORS,
        previousValue: { count: 10 },
        newValue: { count: 8 },
        significance: 'low', // Decrease = low
      });
    });

    test('should detect multiple changes at once', async () => {
      // Arrange: Multiple fields change
      const oldBill = createMockBill({
        title: 'Original Title',
        policyArea: 'Healthcare',
        latestActionText: 'Introduced',
      });
      const newBill = createMockBill({
        title: 'New Title',
        policyArea: 'Education',
        latestActionText: 'Passed House',
      });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect all changes
      expect(changes).toHaveLength(3);
      expect(changes.map(c => c.changeType).sort()).toEqual([
        ChangeType.TITLE,
        ChangeType.ACTION,
        ChangeType.POLICY_AREA,
      ].sort());
    });

    test('should return empty array when no changes detected', async () => {
      // Arrange: Same bill data
      const oldBill = createMockBill();
      const newBill = createMockBill();

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should be empty
      expect(changes).toHaveLength(0);
    });

    test('should handle cosponsor data from array format', async () => {
      // Arrange: Cosponsors as array
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: ['S001', 'S002', 'S003'] },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: ['S001', 'S002', 'S003', 'S004', 'S005'] },
      });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should detect cosponsor change
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.COSPONSORS);
      expect(changes[0].previousValue.count).toBe(3);
      expect(changes[0].newValue.count).toBe(5);
    });

    test('should handle missing cosponsor data gracefully', async () => {
      // Arrange: No cosponsor data
      const oldBill = createMockBill({ apiResponseData: null });
      const newBill = createMockBill({ apiResponseData: null });

      // Act: Detect changes
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert: Should not include cosponsor changes
      expect(changes).toHaveLength(0);
    });
  });

  describe('logChanges', () => {
    test('should log changes to database', async () => {
      // Arrange: Mock Prisma create
      const mockChangeLog = { id: 1, billId: 5, changeType: 'title' };
      (mockPrisma.billChangeLog.create as any).mockResolvedValue(mockChangeLog);

      const changes: DetectedChange[] = [
        {
          changeType: ChangeType.TITLE,
          previousValue: 'Old',
          newValue: 'New',
          significance: 'medium',
        },
      ];

      // Act: Log changes
      const result = await service.logChanges(5, changes);

      // Assert: Should call Prisma create
      expect(mockPrisma.billChangeLog.create).toHaveBeenCalledWith({
        data: {
          billId: 5,
          changeType: 'title',
          previousValue: 'Old',
          newValue: 'New',
          notified: false,
        },
      });
      expect(result).toHaveLength(1);
    });

    test('should log multiple changes', async () => {
      // Arrange: Multiple changes
      const mockChangeLog = { id: 1 };
      (mockPrisma.billChangeLog.create as any).mockResolvedValue(mockChangeLog);

      const changes: DetectedChange[] = [
        {
          changeType: ChangeType.TITLE,
          previousValue: 'Old',
          newValue: 'New',
          significance: 'medium',
        },
        {
          changeType: ChangeType.ACTION,
          previousValue: { text: 'Intro' },
          newValue: { text: 'Passed' },
          significance: 'high',
        },
      ];

      // Act: Log changes
      const result = await service.logChanges(5, changes);

      // Assert: Should call create twice
      expect(mockPrisma.billChangeLog.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    test('should return empty array for no changes', async () => {
      // Act: Log empty changes
      const result = await service.logChanges(5, []);

      // Assert: Should not call Prisma
      expect(mockPrisma.billChangeLog.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('getUnnotifiedChanges', () => {
    test('should get unnotified changes for user watchlist', async () => {
      // Arrange: Mock watchlist and changes
      const mockWatchlist = [
        { userId: 1, billId: 5, bill: { id: 5, title: 'Bill 1' } },
        { userId: 1, billId: 6, bill: { id: 6, title: 'Bill 2' } },
      ];
      const mockChanges = [
        { id: 1, billId: 5, changeType: 'title', notified: false, bill: { id: 5, title: 'Bill 1' } },
        { id: 2, billId: 5, changeType: 'action', notified: false, bill: { id: 5, title: 'Bill 1' } },
        { id: 3, billId: 6, changeType: 'law', notified: false, bill: { id: 6, title: 'Bill 2' } },
      ];

      (mockPrisma.userWatchlist.findMany as any).mockResolvedValue(mockWatchlist);
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue(mockChanges);

      // Act: Get unnotified changes
      const result = await service.getUnnotifiedChanges(1);

      // Assert: Should group by bill
      expect(result).toHaveLength(2); // 2 bills
      expect(result[0].changes).toHaveLength(2); // Bill 5 has 2 changes
      expect(result[1].changes).toHaveLength(1); // Bill 6 has 1 change
    });

    test('should return empty array when no watchlist', async () => {
      // Arrange: Empty watchlist
      (mockPrisma.userWatchlist.findMany as any).mockResolvedValue([]);

      // Act: Get unnotified changes
      const result = await service.getUnnotifiedChanges(1);

      // Assert: Should be empty
      expect(result).toHaveLength(0);
      expect(mockPrisma.billChangeLog.findMany).not.toHaveBeenCalled();
    });

    test('should filter out null billIds', async () => {
      // Arrange: Watchlist with null billId (member watchlist)
      const mockWatchlist = [
        { userId: 1, billId: 5, bill: { id: 5 } },
        { userId: 1, billId: null, member: { id: 'M001' } },
      ];
      (mockPrisma.userWatchlist.findMany as any).mockResolvedValue(mockWatchlist);
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue([]);

      // Act: Get unnotified changes
      await service.getUnnotifiedChanges(1);

      // Assert: Should only query for billId 5
      expect(mockPrisma.billChangeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            billId: { in: [5] },
          }),
        })
      );
    });
  });

  describe('markAsNotified', () => {
    test('should mark changes as notified', async () => {
      // Arrange: Mock updateMany
      (mockPrisma.billChangeLog.updateMany as any).mockResolvedValue({ count: 3 });

      // Act: Mark as notified
      await service.markAsNotified([1, 2, 3]);

      // Assert: Should call updateMany
      expect(mockPrisma.billChangeLog.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] } },
        data: { notified: true },
      });
    });

    test('should handle empty array', async () => {
      // Act: Mark empty array
      await service.markAsNotified([]);

      // Assert: Should not call Prisma
      expect(mockPrisma.billChangeLog.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getChangeStats', () => {
    test('should return change statistics', async () => {
      // Arrange: Mock stats queries
      (mockPrisma.billChangeLog.count as any)
        .mockResolvedValueOnce(100) // Total
        .mockResolvedValueOnce(20); // Unnotified

      (mockPrisma.billChangeLog.groupBy as any).mockResolvedValue([
        { changeType: 'title', _count: 30 },
        { changeType: 'action', _count: 50 },
        { changeType: 'law', _count: 20 },
      ]);

      // Act: Get stats
      const stats = await service.getChangeStats();

      // Assert: Should return formatted stats
      expect(stats).toEqual({
        totalChanges: 100,
        byType: {
          title: 30,
          action: 50,
          law: 20,
        },
        unnotified: 20,
      });
    });

    test('should filter by date range', async () => {
      // Arrange: Date range
      const dateFrom = new Date('2023-01-01');
      const dateTo = new Date('2023-12-31');

      (mockPrisma.billChangeLog.count as any).mockResolvedValue(50);
      (mockPrisma.billChangeLog.groupBy as any).mockResolvedValue([]);

      // Act: Get stats with date filter
      await service.getChangeStats(dateFrom, dateTo);

      // Assert: Should include date filter
      expect(mockPrisma.billChangeLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            detectedAt: {
              gte: dateFrom,
              lte: dateTo,
            },
          }),
        })
      );
    });
  });

  describe('getBillChanges', () => {
    test('should get changes for a specific bill', async () => {
      // Arrange: Mock changes
      const mockChanges = [
        { id: 1, billId: 5, changeType: 'title' },
        { id: 2, billId: 5, changeType: 'action' },
      ];
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue(mockChanges);

      // Act: Get bill changes
      const result = await service.getBillChanges(5);

      // Assert: Should return changes
      expect(result).toHaveLength(2);
      expect(mockPrisma.billChangeLog.findMany).toHaveBeenCalledWith({
        where: { billId: 5 },
        orderBy: { detectedAt: 'desc' },
        take: 10,
      });
    });

    test('should respect limit parameter', async () => {
      // Arrange: Mock changes
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue([]);

      // Act: Get with custom limit
      await service.getBillChanges(5, 20);

      // Assert: Should use custom limit
      expect(mockPrisma.billChangeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
        })
      );
    });
  });

  describe('getBillsWithRecentChanges', () => {
    test('should get bills with recent changes', async () => {
      // Arrange: Mock recent changes
      const mockChanges = [
        {
          id: 1,
          billId: 5,
          detectedAt: new Date('2023-02-01'),
          bill: { id: 5, title: 'Bill 1' },
        },
        {
          id: 2,
          billId: 5,
          detectedAt: new Date('2023-02-02'),
          bill: { id: 5, title: 'Bill 1' },
        },
        {
          id: 3,
          billId: 6,
          detectedAt: new Date('2023-02-03'),
          bill: { id: 6, title: 'Bill 2' },
        },
      ];
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue(mockChanges);

      // Act: Get bills with recent changes
      const result = await service.getBillsWithRecentChanges(24, 10);

      // Assert: Should group and count
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        changeCount: 1,
      });
      expect(result[1]).toMatchObject({
        changeCount: 2,
      });
    });

    test('should sort by latest change', async () => {
      // Arrange: Mock changes with different dates
      const mockChanges = [
        {
          id: 1,
          billId: 5,
          detectedAt: new Date('2023-02-01'),
          bill: { id: 5, title: 'Bill 1' },
        },
        {
          id: 2,
          billId: 6,
          detectedAt: new Date('2023-02-03'),
          bill: { id: 6, title: 'Bill 2' },
        },
      ];
      (mockPrisma.billChangeLog.findMany as any).mockResolvedValue(mockChanges);

      // Act: Get bills
      const result = await service.getBillsWithRecentChanges();

      // Assert: Should be sorted with latest first
      expect(result[0].bill.id).toBe(6); // Latest change
      expect(result[1].bill.id).toBe(5);
    });
  });
});
