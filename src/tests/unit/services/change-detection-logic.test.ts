/**
 * Change Detection Logic Tests
 *
 * Tests for the core change detection algorithms (no database operations).
 * Focuses on the detectBillChanges logic which is pure business logic.
 */

import { ChangeDetectionService, ChangeType } from '../../../app/services/sync/change-detection.service';
import { Bill } from '@prisma/client';

describe('ChangeDetectionService - Detection Logic', () => {
  let service: ChangeDetectionService;

  beforeEach(() => {
    service = new ChangeDetectionService();
  });

  const createMockBill = (overrides?: Partial<Bill>): Bill => {
    return {
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
    } as Bill;
  };

  describe('detectBillChanges', () => {
    test('should detect new bill as a status change', async () => {
      // Arrange
      const newBill = createMockBill();

      // Act
      const changes = await service.detectBillChanges(null, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.STATUS,
        previousValue: null,
        newValue: 'introduced',
        significance: 'high',
      });
    });

    test('should detect law number change (bill becomes law)', async () => {
      // Arrange
      const oldBill = createMockBill({ lawNumber: null, isLaw: false });
      const newBill = createMockBill({ lawNumber: 'PL-118-1', isLaw: true });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.LAW,
        previousValue: null,
        newValue: 'PL-118-1',
        significance: 'high',
      });
    });

    test('should detect title change', async () => {
      // Arrange
      const oldBill = createMockBill({ title: 'Original Title' });
      const newBill = createMockBill({ title: 'Updated Title' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.TITLE,
        previousValue: 'Original Title',
        newValue: 'Updated Title',
        significance: 'medium',
      });
    });

    test('should detect latest action date change', async () => {
      // Arrange
      const oldDate = new Date('2023-01-15');
      const newDate = new Date('2023-02-01');
      const oldBill = createMockBill({
        latestActionDate: oldDate,
        latestActionText: 'Introduced in House',
      });
      const newBill = createMockBill({
        latestActionDate: newDate,
        latestActionText: 'Passed House',
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.ACTION);
      expect(changes[0].significance).toBe('high');
      expect(changes[0].previousValue).toMatchObject({
        date: oldDate,
        text: 'Introduced in House',
      });
      expect(changes[0].newValue).toMatchObject({
        date: newDate,
        text: 'Passed House',
      });
    });

    test('should detect latest action text change only', async () => {
      // Arrange
      const actionDate = new Date('2023-01-15');
      const oldBill = createMockBill({
        latestActionDate: actionDate,
        latestActionText: 'Introduced in House',
      });
      const newBill = createMockBill({
        latestActionDate: actionDate, // Same date
        latestActionText: 'Referred to Committee',
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.ACTION);
    });

    test('should detect policy area change', async () => {
      // Arrange
      const oldBill = createMockBill({ policyArea: 'Healthcare' });
      const newBill = createMockBill({ policyArea: 'Education' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.POLICY_AREA,
        previousValue: 'Healthcare',
        newValue: 'Education',
        significance: 'low',
      });
    });

    test('should detect cosponsor count increase (medium significance)', async () => {
      // Arrange
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: { count: 5 } },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: { count: 10 } },
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.COSPONSORS,
        previousValue: { count: 5 },
        newValue: { count: 10 },
        significance: 'medium', // Increase = medium
      });
    });

    test('should detect cosponsor count decrease (low significance)', async () => {
      // Arrange
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: { count: 10 } },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: { count: 8 } },
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: ChangeType.COSPONSORS,
        previousValue: { count: 10 },
        newValue: { count: 8 },
        significance: 'low', // Decrease = low
      });
    });

    test('should detect cosponsors from array format', async () => {
      // Arrange
      const oldBill = createMockBill({
        apiResponseData: { cosponsors: ['S001', 'S002', 'S003'] },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: ['S001', 'S002', 'S003', 'S004', 'S005'] },
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.COSPONSORS);
      expect(changes[0].previousValue).toEqual({ count: 3 });
      expect(changes[0].newValue).toEqual({ count: 5 });
    });

    test('should detect cosponsors from cosponsorsCount field', async () => {
      // Arrange
      const oldBill = createMockBill({
        apiResponseData: { cosponsorsCount: 5 },
      });
      const newBill = createMockBill({
        apiResponseData: { cosponsorsCount: 8 },
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.COSPONSORS);
      expect(changes[0].previousValue).toEqual({ count: 5 });
      expect(changes[0].newValue).toEqual({ count: 8 });
    });

    test('should detect multiple changes at once', async () => {
      // Arrange
      const oldBill = createMockBill({
        title: 'Original Title',
        policyArea: 'Healthcare',
        latestActionText: 'Introduced',
        lawNumber: null,
      });
      const newBill = createMockBill({
        title: 'New Title',
        policyArea: 'Education',
        latestActionText: 'Passed House',
        lawNumber: 'PL-118-1',
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(4); // title, policy area, action, law
      const changeTypes = changes.map(c => c.changeType).sort();
      expect(changeTypes).toEqual([
        ChangeType.TITLE,
        ChangeType.ACTION,
        ChangeType.POLICY_AREA,
        ChangeType.LAW,
      ].sort());
    });

    test('should return empty array when no changes detected', async () => {
      // Arrange
      const oldBill = createMockBill();
      const newBill = createMockBill();

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(0);
    });

    test('should handle missing cosponsor data gracefully', async () => {
      // Arrange
      const oldBill = createMockBill({ apiResponseData: null });
      const newBill = createMockBill({ apiResponseData: null });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(0);
    });

    test('should handle partial cosponsor data', async () => {
      // Arrange
      const oldBill = createMockBill({ apiResponseData: null });
      const newBill = createMockBill({
        apiResponseData: { cosponsors: { count: 10 } },
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      // Should not detect cosponsor change if old data is missing
      const cosponsorChanges = changes.filter(c => c.changeType === ChangeType.COSPONSORS);
      expect(cosponsorChanges).toHaveLength(0);
    });

    test('should ignore insignificant differences in dates', async () => {
      // Arrange - Same dates
      const actionDate = new Date('2023-01-15T10:30:00Z');
      const oldBill = createMockBill({
        latestActionDate: actionDate,
        latestActionText: 'Introduced',
      });
      const newBill = createMockBill({
        latestActionDate: actionDate, // Exact same date object
        latestActionText: 'Introduced',
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(0);
    });

    test('should detect action change even with only text difference', async () => {
      // Arrange
      const oldBill = createMockBill({
        latestActionDate: null,
        latestActionText: null,
      });
      const newBill = createMockBill({
        latestActionDate: null, // Still null
        latestActionText: 'Introduced in House',
      });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(ChangeType.ACTION);
    });

    test('should classify law change as high significance', async () => {
      // Arrange
      const oldBill = createMockBill({ lawNumber: null });
      const newBill = createMockBill({ lawNumber: 'PL-118-1' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes[0].significance).toBe('high');
    });

    test('should classify action change as high significance', async () => {
      // Arrange
      const oldBill = createMockBill({ latestActionText: 'Introduced' });
      const newBill = createMockBill({ latestActionText: 'Passed' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes[0].significance).toBe('high');
    });

    test('should classify title change as medium significance', async () => {
      // Arrange
      const oldBill = createMockBill({ title: 'Old' });
      const newBill = createMockBill({ title: 'New' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes[0].significance).toBe('medium');
    });

    test('should classify policy area change as low significance', async () => {
      // Arrange
      const oldBill = createMockBill({ policyArea: 'Healthcare' });
      const newBill = createMockBill({ policyArea: 'Education' });

      // Act
      const changes = await service.detectBillChanges(oldBill, newBill);

      // Assert
      expect(changes[0].significance).toBe('low');
    });
  });
});
