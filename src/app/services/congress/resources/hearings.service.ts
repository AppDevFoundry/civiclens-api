/**
 * Hearings Service
 *
 * Manages Congressional hearings data from Congress.gov API with database caching.
 */

import prisma from '../../../../prisma/prisma-client';
import congressApiClient from '../congress.client';
import {
  Hearing,
  HearingDetail,
  HearingsQueryParams,
  HearingsResponse
} from '../congress.types';

/**
 * List hearings with optional filtering and pagination
 */
export const listHearings = async (params: HearingsQueryParams = {}): Promise<HearingsResponse> => {
  try {
    const queryParams = {
      limit: params.limit || 20,
      offset: params.offset,
      congress: params.congress,
      chamber: params.chamber,
      fromDateTime: params.fromDateTime,
      toDateTime: params.toDateTime
    };

    const response = await congressApiClient.getCollection<Hearing>('/hearing', queryParams);

    // Cache hearings in database
    if (response.data && response.data.length > 0) {
      await cacheHearings(response.data);
    }

    return {
      hearings: response.data,
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific hearing by jacket number
 */
export const getHearingByJacket = async (
  congress: number,
  chamber: string,
  jacketNumber: string
): Promise<HearingDetail | null> => {
  try {
    const path = `/hearing/${congress}/${chamber}/${jacketNumber}`;
    const hearing = await congressApiClient.getDetail<HearingDetail>(path);

    if (hearing) {
      await cacheHearing(hearing);
    }

    return hearing;
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Search cached hearings in database
 */
export const searchCachedHearings = async (query: {
  congress?: number;
  chamber?: string;
  committeeSystemCode?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ hearings: any[]; total: number }> => {
  const where: any = {};

  if (query.congress) where.congress = query.congress;
  if (query.chamber) where.chamber = query.chamber;
  if (query.committeeSystemCode) where.committeeSystemCode = query.committeeSystemCode;

  // Date range filtering
  if (query.fromDate || query.toDate) {
    where.date = {};
    if (query.fromDate) where.date.gte = query.fromDate;
    if (query.toDate) where.date.lte = query.toDate;
  }

  const [hearings, total] = await Promise.all([
    prisma.hearing.findMany({
      where,
      include: {
        committee: true
      },
      orderBy: { date: 'desc' },
      take: query.limit || 20,
      skip: query.offset || 0
    }),
    prisma.hearing.count({ where })
  ]);

  return { hearings, total };
};

// ============================================================================
// Database Caching Helpers
// ============================================================================

async function cacheHearing(hearing: Hearing | HearingDetail): Promise<void> {
  try {
    // Extract primary committee system code
    const primaryCommittee = Array.isArray(hearing.committees) && hearing.committees.length > 0
      ? hearing.committees[0]
      : null;

    // Create a unique identifier for the hearing
    // Since jacket number might not always be unique across chambers/congresses,
    // we'll use a combination or generate a unique constraint
    const hearingData = {
      congress: hearing.congress,
      chamber: hearing.chamber,
      jacketNumber: hearing.jacketNumber || null,
      title: hearing.title,
      date: hearing.date ? new Date(hearing.date) : null,
      location: (hearing as HearingDetail).location || null,
      committeeCode: primaryCommittee?.systemCode || null,
      committeeSystemCode: primaryCommittee?.systemCode || null,
      congressGovUrl: hearing.url || null,
      apiResponseData: hearing as any
    };

    // Since hearings don't have a guaranteed unique identifier in all cases,
    // we'll use create and let duplicate handling occur naturally
    // or we could search for existing ones first
    const existing = await prisma.hearing.findFirst({
      where: {
        congress: hearing.congress,
        chamber: hearing.chamber,
        jacketNumber: hearing.jacketNumber || undefined,
        title: hearing.title
      }
    });

    if (existing) {
      await prisma.hearing.update({
        where: { id: existing.id },
        data: {
          ...hearingData,
          updatedAt: new Date()
        }
      });
    } else {
      await prisma.hearing.create({
        data: hearingData
      });
    }
  } catch (error) {
    console.error('Failed to cache hearing:', error);
  }
}

async function cacheHearings(hearings: Hearing[]): Promise<void> {
  try {
    await Promise.all(hearings.map(hearing => cacheHearing(hearing)));
  } catch (error) {
    console.error('Failed to cache hearings:', error);
  }
}

export default {
  listHearings,
  getHearingByJacket,
  searchCachedHearings
};
