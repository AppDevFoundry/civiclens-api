/**
 * Committees Service
 *
 * Manages Congressional committees data from Congress.gov API with database caching.
 */

import prisma from '../../../../prisma/prisma-client';
import congressApiClient from '../congress.client';
import {
  Committee,
  CommitteeDetail,
  CommitteesQueryParams,
  CommitteesResponse,
  CommitteeIdentifier
} from '../congress.types';

/**
 * List committees with optional filtering and pagination
 */
export const listCommittees = async (params: CommitteesQueryParams = {}): Promise<CommitteesResponse> => {
  try {
    const queryParams = {
      limit: params.limit || 20,
      offset: params.offset,
      chamber: params.chamber,
      committeeType: params.committeeType,
      currentCommittee: params.currentCommittee
    };

    const response = await congressApiClient.getCollection<Committee>('/committee', queryParams);

    // Cache committees in database
    if (response.data && response.data.length > 0) {
      await cacheCommittees(response.data);
    }

    return {
      committees: response.data,
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific committee by identifier
 */
export const getCommitteeById = async (identifier: CommitteeIdentifier): Promise<CommitteeDetail | null> => {
  const { chamber, systemCode } = identifier;

  try {
    const path = `/committee/${chamber}/${systemCode}`;
    const committee = await congressApiClient.getDetail<CommitteeDetail>(path);

    if (committee) {
      await cacheCommittee(committee);
    }

    return committee;
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Get committee bills
 */
export const getCommitteeBills = async (identifier: CommitteeIdentifier): Promise<any> => {
  const { chamber, systemCode } = identifier;

  try {
    const path = `/committee/${chamber}/${systemCode}/bills`;
    const response = await congressApiClient.request<any>(path);

    return {
      bills: response.data.bills || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get committee reports
 */
export const getCommitteeReports = async (identifier: CommitteeIdentifier): Promise<any> => {
  const { chamber, systemCode } = identifier;

  try {
    const path = `/committee/${chamber}/${systemCode}/reports`;
    const response = await congressApiClient.request<any>(path);

    return {
      reports: response.data.reports || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Search cached committees in database
 */
export const searchCachedCommittees = async (query: {
  chamber?: string;
  isCurrent?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ committees: any[]; total: number }> => {
  const where: any = {};

  if (query.chamber) where.chamber = query.chamber;
  if (query.isCurrent !== undefined) where.isCurrent = query.isCurrent;

  const [committees, total] = await Promise.all([
    prisma.committee.findMany({
      where,
      orderBy: { name: 'asc' },
      take: query.limit || 20,
      skip: query.offset || 0
    }),
    prisma.committee.count({ where })
  ]);

  return { committees, total };
};

// ============================================================================
// Database Caching Helpers
// ============================================================================

async function cacheCommittee(committee: Committee | CommitteeDetail): Promise<void> {
  try {
    await prisma.committee.upsert({
      where: {
        systemCode: committee.systemCode
      },
      update: {
        committeeCode: (committee as CommitteeDetail).committeeCode || null,
        name: committee.name,
        type: committee.committeeTypeCode || null,
        chamber: committee.chamber || null,
        isCurrent: committee.isCurrent !== undefined ? committee.isCurrent : true,
        parentSystemCode: committee.parent?.systemCode || null,
        subcommittees: committee.subcommittees ? (committee.subcommittees as any) : null,
        congressGovUrl: committee.url || null,
        apiResponseData: committee as any,
        updatedAt: new Date()
      },
      create: {
        systemCode: committee.systemCode,
        committeeCode: (committee as CommitteeDetail).committeeCode || null,
        name: committee.name,
        type: committee.committeeTypeCode || null,
        chamber: committee.chamber || null,
        isCurrent: committee.isCurrent !== undefined ? committee.isCurrent : true,
        parentSystemCode: committee.parent?.systemCode || null,
        subcommittees: committee.subcommittees ? (committee.subcommittees as any) : null,
        congressGovUrl: committee.url || null,
        apiResponseData: committee as any
      }
    });
  } catch (error) {
    console.error('Failed to cache committee:', error);
  }
}

async function cacheCommittees(committees: Committee[]): Promise<void> {
  try {
    await Promise.all(committees.map(committee => cacheCommittee(committee)));
  } catch (error) {
    console.error('Failed to cache committees:', error);
  }
}

export default {
  listCommittees,
  getCommitteeById,
  getCommitteeBills,
  getCommitteeReports,
  searchCachedCommittees
};
