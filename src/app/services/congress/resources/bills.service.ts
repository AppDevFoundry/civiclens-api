/**
 * Bills Service
 *
 * Manages Congressional bills data from Congress.gov API with database caching.
 */

import prisma from '../../../../prisma/prisma-client';
import congressApiClient from '../congress.client';
import {
  Bill,
  BillDetail,
  BillsQueryParams,
  BillIdentifier,
  ApiResponse,
  BillsResponse
} from '../congress.types';

/**
 * List bills with optional filtering and pagination
 */
export const listBills = async (params: BillsQueryParams = {}): Promise<BillsResponse> => {
  try {
    // Set default limit if not provided
    const queryParams = {
      limit: params.limit || 20,
      offset: params.offset,
      congress: params.congress,
      billType: params.billType,
      fromDateTime: params.fromDateTime,
      toDateTime: params.toDateTime,
      sort: params.sort || 'updateDate desc'
    };

    // Fetch from Congress.gov API
    const response = await congressApiClient.getCollection<Bill>('/bill', queryParams);

    // Cache bills in database
    if (response.data && response.data.length > 0) {
      await cacheBills(response.data);
    }

    return {
      bills: response.data,
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific bill by identifier
 */
export const getBillById = async (identifier: BillIdentifier): Promise<BillDetail | null> => {
  const { congress, billType, billNumber } = identifier;

  try {
    // Construct API path: /bill/{congress}/{type}/{number}
    const path = `/bill/${congress}/${billType}/${billNumber}`;

    // Fetch from Congress.gov API
    const bill = await congressApiClient.getDetail<BillDetail>(path);

    // Cache the bill in database
    if (bill) {
      await cacheBill(bill);
    }

    return bill;
  } catch (error) {
    // If 404, return null instead of throwing
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Get bill actions (legislative history)
 */
export const getBillActions = async (identifier: BillIdentifier): Promise<any> => {
  const { congress, billType, billNumber } = identifier;

  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/actions`;
    const response = await congressApiClient.request<any>(path);

    return {
      actions: response.data.actions || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get bill subjects/policy areas
 */
export const getBillSubjects = async (identifier: BillIdentifier): Promise<any> => {
  const { congress, billType, billNumber } = identifier;

  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/subjects`;
    const response = await congressApiClient.request<any>(path);

    return {
      subjects: response.data.subjects?.legislativeSubjects || [],
      policyArea: response.data.subjects?.policyArea
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get bill cosponsors
 */
export const getBillCosponsors = async (identifier: BillIdentifier): Promise<any> => {
  const { congress, billType, billNumber } = identifier;

  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/cosponsors`;
    const response = await congressApiClient.request<any>(path);

    return {
      cosponsors: response.data.cosponsors || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get bill amendments
 */
export const getBillAmendments = async (identifier: BillIdentifier): Promise<any> => {
  const { congress, billType, billNumber } = identifier;

  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/amendments`;
    const response = await congressApiClient.request<any>(path);

    return {
      amendments: response.data.amendments || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get bill summaries
 */
export const getBillSummaries = async (identifier: BillIdentifier): Promise<any> => {
  const { congress, billType, billNumber } = identifier;

  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/summaries`;
    const response = await congressApiClient.request<any>(path);

    return {
      summaries: response.data.summaries || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Search cached bills in database
 */
export const searchCachedBills = async (query: {
  congress?: number;
  billType?: string;
  sponsorBioguideId?: string;
  policyArea?: string;
  isLaw?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ bills: any[]; total: number }> => {
  const where: any = {};

  if (query.congress) where.congress = query.congress;
  if (query.billType) where.billType = query.billType;
  if (query.sponsorBioguideId) where.sponsorBioguideId = query.sponsorBioguideId;
  if (query.policyArea) where.policyArea = { contains: query.policyArea, mode: 'insensitive' };
  if (query.isLaw !== undefined) where.isLaw = query.isLaw;

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: { updateDate: 'desc' },
      take: query.limit || 20,
      skip: query.offset || 0
    }),
    prisma.bill.count({ where })
  ]);

  return { bills, total };
};

// ============================================================================
// Database Caching Helpers
// ============================================================================

/**
 * Cache a single bill in the database (upsert)
 */
async function cacheBill(bill: Bill | BillDetail): Promise<void> {
  try {
    // Extract sponsor information
    const sponsor = Array.isArray(bill.sponsors) && bill.sponsors.length > 0
      ? bill.sponsors[0]
      : null;

    // Determine if it's a law
    const isLaw = Boolean(bill.laws && bill.laws.length > 0);
    const lawNumber = isLaw && bill.laws ? bill.laws[0].number : null;

    await prisma.bill.upsert({
      where: {
        congress_billType_billNumber: {
          congress: bill.congress,
          billType: bill.type,
          billNumber: typeof bill.number === 'string' ? parseInt(bill.number, 10) : bill.number
        }
      },
      update: {
        title: bill.title || null,
        originChamber: bill.originChamber || null,
        originChamberCode: bill.originChamberCode || null,
        updateDate: bill.updateDate ? new Date(bill.updateDate) : null,
        updateDateIncludingText: bill.updateDateIncludingText ? new Date(bill.updateDateIncludingText) : null,
        introducedDate: bill.introducedDate ? new Date(bill.introducedDate) : null,
        latestActionDate: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate) : null,
        latestActionText: bill.latestAction?.text || null,
        policyArea: bill.policyArea?.name || null,
        sponsorBioguideId: sponsor?.bioguideId || null,
        sponsorFirstName: sponsor?.firstName || null,
        sponsorLastName: sponsor?.lastName || null,
        sponsorFullName: sponsor?.fullName || null,
        sponsorState: sponsor?.state || null,
        sponsorParty: sponsor?.party || null,
        lawNumber: lawNumber,
        isLaw: isLaw,
        congressGovUrl: bill.url || null,
        apiResponseData: bill as any, // Store full response
        updatedAt: new Date()
      },
      create: {
        congress: bill.congress,
        billType: bill.type,
        billNumber: typeof bill.number === 'string' ? parseInt(bill.number, 10) : bill.number,
        title: bill.title || null,
        originChamber: bill.originChamber || null,
        originChamberCode: bill.originChamberCode || null,
        updateDate: bill.updateDate ? new Date(bill.updateDate) : null,
        updateDateIncludingText: bill.updateDateIncludingText ? new Date(bill.updateDateIncludingText) : null,
        introducedDate: bill.introducedDate ? new Date(bill.introducedDate) : null,
        latestActionDate: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate) : null,
        latestActionText: bill.latestAction?.text || null,
        policyArea: bill.policyArea?.name || null,
        sponsorBioguideId: sponsor?.bioguideId || null,
        sponsorFirstName: sponsor?.firstName || null,
        sponsorLastName: sponsor?.lastName || null,
        sponsorFullName: sponsor?.fullName || null,
        sponsorState: sponsor?.state || null,
        sponsorParty: sponsor?.party || null,
        lawNumber: lawNumber,
        isLaw: isLaw,
        congressGovUrl: bill.url || null,
        apiResponseData: bill as any
      }
    });
  } catch (error) {
    // Log error but don't fail the request if caching fails
    console.error('Failed to cache bill:', error);
  }
}

/**
 * Cache multiple bills in the database
 */
async function cacheBills(bills: Bill[]): Promise<void> {
  try {
    await Promise.all(bills.map(bill => cacheBill(bill)));
  } catch (error) {
    console.error('Failed to cache bills:', error);
  }
}

export default {
  listBills,
  getBillById,
  getBillActions,
  getBillSubjects,
  getBillCosponsors,
  getBillAmendments,
  getBillSummaries,
  searchCachedBills
};
