/**
 * Bills Controller Tests
 *
 * Tests for the Bills API endpoints that query our database.
 */

// Set environment variables BEFORE importing modules
process.env.CONGRESS_API_KEY = 'test-api-key';

import request from 'supertest';
import app from '../../app';
import prismaMock from '../prisma-mock';

// Mock Prisma
jest.mock('../../prisma/prisma-client', () => ({
  __esModule: true,
  default: prismaMock,
}));

describe('Bills Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/bills', () => {
    it('should return a list of bills', async () => {
      const mockBills = [
        {
          id: 1,
          slug: '118-hr-1234',
          congress: 118,
          billType: 'hr',
          billNumber: 1234,
          title: 'Test Bill',
          introducedDate: new Date('2024-01-01'),
          updateDate: new Date('2024-01-15'),
          latestActionDate: new Date('2024-01-15'),
          latestActionText: 'Referred to committee',
          policyArea: 'Healthcare',
          isLaw: false,
          sponsorBioguideId: 'A000001',
          sponsorFullName: 'John Smith',
          sponsorParty: 'D',
          sponsorState: 'CA',
          congressGovUrl: 'https://congress.gov/bill/118th/hr/1234',
          subjects: [{ name: 'Healthcare', isPolicyArea: true }],
          _count: { cosponsors: 5, actions: 10 },
        },
      ];

      prismaMock.bill.count.mockResolvedValue(1);
      prismaMock.bill.findMany.mockResolvedValue(mockBills as any);

      const response = await request(app)
        .get('/api/bills')
        .expect(200);

      expect(response.body.bills).toHaveLength(1);
      expect(response.body.bills[0].slug).toBe('118-hr-1234');
      expect(response.body.bills[0].sponsor.name).toBe('John Smith');
      expect(response.body.pagination.total).toBe(1);
    });

    it('should filter by congress', async () => {
      prismaMock.bill.count.mockResolvedValue(0);
      prismaMock.bill.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/bills?congress=118')
        .expect(200);

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            congress: 118,
          }),
        })
      );
    });

    it('should filter by topic', async () => {
      prismaMock.bill.count.mockResolvedValue(0);
      prismaMock.bill.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/bills?topic=Healthcare')
        .expect(200);

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subjects: expect.any(Object),
          }),
        })
      );
    });

    it('should search bills', async () => {
      prismaMock.bill.count.mockResolvedValue(0);
      prismaMock.bill.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/bills?search=infrastructure')
        .expect(200);

      expect(prismaMock.bill.findMany).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      prismaMock.bill.count.mockResolvedValue(0);
      prismaMock.bill.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/bills?limit=50')
        .expect(200);

      expect(prismaMock.bill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51, // limit + 1 for hasMore check
        })
      );
    });
  });

  describe('GET /api/bills/:slug', () => {
    it('should return bill details', async () => {
      const mockBill = {
        id: 1,
        slug: '118-hr-1234',
        congress: 118,
        billType: 'hr',
        billNumber: 1234,
        title: 'Test Healthcare Act',
        introducedDate: new Date('2024-01-01'),
        updateDate: new Date('2024-01-15'),
        latestActionDate: new Date('2024-01-15'),
        latestActionText: 'Passed House',
        policyArea: 'Healthcare',
        isLaw: false,
        lawNumber: null,
        sponsorBioguideId: 'A000001',
        sponsorFirstName: 'John',
        sponsorLastName: 'Smith',
        sponsorFullName: 'John Smith',
        sponsorParty: 'D',
        sponsorState: 'CA',
        congressGovUrl: 'https://congress.gov/bill/118th/hr/1234',
        pdfUrl: 'https://...',
        textUrl: null,
        xmlUrl: null,
        subjects: [
          { name: 'Healthcare', isPolicyArea: true },
        ],
        summaries: [
          {
            text: 'This bill improves healthcare.',
            versionCode: '00',
            actionDate: new Date('2024-01-01'),
            actionDesc: 'Introduced in House',
          },
        ],
        actions: [],
        cosponsors: [],
        textVersions: [],
        insights: [],
        _count: { cosponsors: 0, actions: 0 },
      };

      prismaMock.bill.findUnique.mockResolvedValue(mockBill as any);

      const response = await request(app)
        .get('/api/bills/118-hr-1234')
        .expect(200);

      expect(response.body.bill.slug).toBe('118-hr-1234');
      expect(response.body.bill.title).toBe('Test Healthcare Act');
      expect(response.body.bill.officialSummary).toBe('This bill improves healthcare.');
    });

    it('should return 404 for non-existent bill', async () => {
      prismaMock.bill.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/bills/999-xx-0000')
        .expect(404);

      expect(response.body.error).toBe('Bill not found');
    });
  });

  describe('GET /api/bills/:slug/actions', () => {
    it('should return paginated actions', async () => {
      prismaMock.bill.findUnique.mockResolvedValue({ id: 1 } as any);

      const mockActions = [
        {
          id: 1,
          billId: 1,
          actionCode: 'H11100',
          actionDate: new Date('2024-01-15'),
          text: 'Passed House',
          type: 'Floor',
          chamber: 'House',
        },
      ];

      prismaMock.billAction.findMany.mockResolvedValue(mockActions as any);

      const response = await request(app)
        .get('/api/bills/118-hr-1234/actions')
        .expect(200);

      expect(response.body.actions).toHaveLength(1);
      expect(response.body.actions[0].text).toBe('Passed House');
    });

    it('should return 404 for non-existent bill', async () => {
      prismaMock.bill.findUnique.mockResolvedValue(null);

      await request(app)
        .get('/api/bills/999-xx-0000/actions')
        .expect(404);
    });
  });
});
