/**
 * Nominations Service
 *
 * Manages Presidential nominations data from Congress.gov API with database caching.
 */

import prisma from '../../../../prisma/prisma-client';
import congressApiClient from '../congress.client';
import {
  Nomination,
  NominationDetail,
  NominationsQueryParams,
  NominationsResponse,
  NominationIdentifier
} from '../congress.types';

/**
 * List nominations with optional filtering and pagination
 */
export const listNominations = async (params: NominationsQueryParams = {}): Promise<NominationsResponse> => {
  try {
    const queryParams = {
      limit: params.limit || 20,
      offset: params.offset,
      congress: params.congress,
      sort: params.sort || 'updateDate desc'
    };

    const response = await congressApiClient.getCollection<Nomination>('/nomination', queryParams);

    // Cache nominations in database
    if (response.data && response.data.length > 0) {
      await cacheNominations(response.data);
    }

    return {
      nominations: response.data,
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific nomination by identifier
 */
export const getNominationById = async (identifier: NominationIdentifier): Promise<NominationDetail | null> => {
  const { congress, nominationNumber } = identifier;

  try {
    const path = `/nomination/${congress}/${nominationNumber}`;
    const nomination = await congressApiClient.getDetail<NominationDetail>(path);

    if (nomination) {
      await cacheNomination(nomination);
    }

    return nomination;
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Get nomination actions
 */
export const getNominationActions = async (identifier: NominationIdentifier): Promise<any> => {
  const { congress, nominationNumber } = identifier;

  try {
    const path = `/nomination/${congress}/${nominationNumber}/actions`;
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
 * Get nomination hearings
 */
export const getNominationHearings = async (identifier: NominationIdentifier): Promise<any> => {
  const { congress, nominationNumber } = identifier;

  try {
    const path = `/nomination/${congress}/${nominationNumber}/hearings`;
    const response = await congressApiClient.request<any>(path);

    return {
      hearings: response.data.hearings || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Search cached nominations in database
 */
export const searchCachedNominations = async (query: {
  congress?: number;
  organization?: string;
  limit?: number;
  offset?: number;
}): Promise<{ nominations: any[]; total: number }> => {
  const where: any = {};

  if (query.congress) where.congress = query.congress;
  if (query.organization) where.organization = { contains: query.organization, mode: 'insensitive' };

  const [nominations, total] = await Promise.all([
    prisma.nomination.findMany({
      where,
      orderBy: { receivedDate: 'desc' },
      take: query.limit || 20,
      skip: query.offset || 0
    }),
    prisma.nomination.count({ where })
  ]);

  return { nominations, total };
};

// ============================================================================
// Database Caching Helpers
// ============================================================================

async function cacheNomination(nomination: Nomination | NominationDetail): Promise<void> {
  try {
    await prisma.nomination.upsert({
      where: {
        congress_nominationNumber: {
          congress: nomination.congress,
          nominationNumber: nomination.number
        }
      },
      update: {
        partNumber: nomination.partNumber || null,
        citation: nomination.citation || null,
        description: nomination.description || null,
        organization: nomination.organization || null,
        latestActionDate: nomination.latestAction?.actionDate ? new Date(nomination.latestAction.actionDate) : null,
        latestActionText: nomination.latestAction?.text || null,
        receivedDate: nomination.receivedDate ? new Date(nomination.receivedDate) : null,
        congressGovUrl: nomination.url || null,
        apiResponseData: nomination as any,
        updatedAt: new Date()
      },
      create: {
        congress: nomination.congress,
        nominationNumber: nomination.number,
        partNumber: nomination.partNumber || null,
        citation: nomination.citation || null,
        description: nomination.description || null,
        organization: nomination.organization || null,
        latestActionDate: nomination.latestAction?.actionDate ? new Date(nomination.latestAction.actionDate) : null,
        latestActionText: nomination.latestAction?.text || null,
        receivedDate: nomination.receivedDate ? new Date(nomination.receivedDate) : null,
        congressGovUrl: nomination.url || null,
        apiResponseData: nomination as any
      }
    });
  } catch (error) {
    console.error('Failed to cache nomination:', error);
  }
}

async function cacheNominations(nominations: Nomination[]): Promise<void> {
  try {
    await Promise.all(nominations.map(nomination => cacheNomination(nomination)));
  } catch (error) {
    console.error('Failed to cache nominations:', error);
  }
}

export default {
  listNominations,
  getNominationById,
  getNominationActions,
  getNominationHearings,
  searchCachedNominations
};
