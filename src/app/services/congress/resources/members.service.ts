/**
 * Members Service
 *
 * Manages Congressional members data from Congress.gov API with database caching.
 */

import prisma from '../../../../prisma/prisma-client';
import congressApiClient from '../congress.client';
import {
  Member,
  MemberDetail,
  MembersQueryParams,
  MembersResponse
} from '../congress.types';

/**
 * List members with optional filtering and pagination
 */
export const listMembers = async (params: MembersQueryParams = {}): Promise<MembersResponse> => {
  try {
    const queryParams = {
      limit: params.limit || 20,
      offset: params.offset,
      currentMember: params.currentMember,
      state: params.state,
      district: params.district,
      party: params.party,
      chamber: params.chamber
    };

    const response = await congressApiClient.getCollection<Member>('/member', queryParams);

    // Cache members in database
    if (response.data && response.data.length > 0) {
      await cacheMembers(response.data);
    }

    return {
      members: response.data,
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific member by bioguide ID
 */
export const getMemberById = async (bioguideId: string): Promise<MemberDetail | null> => {
  try {
    const path = `/member/${bioguideId}`;
    const member = await congressApiClient.getDetail<MemberDetail>(path);

    if (member) {
      await cacheMember(member);
    }

    return member;
  } catch (error) {
    if ((error as any).status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Get member's sponsored legislation
 */
export const getMemberSponsorship = async (bioguideId: string): Promise<any> => {
  try {
    const path = `/member/${bioguideId}/sponsored-legislation`;
    const response = await congressApiClient.request<any>(path);

    return {
      sponsoredLegislation: response.data.sponsoredLegislation || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get member's cosponsored legislation
 */
export const getMemberCosponsorship = async (bioguideId: string): Promise<any> => {
  try {
    const path = `/member/${bioguideId}/cosponsored-legislation`;
    const response = await congressApiClient.request<any>(path);

    return {
      cosponsoredLegislation: response.data.cosponsoredLegislation || [],
      pagination: response.pagination
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Search cached members in database
 */
export const searchCachedMembers = async (query: {
  state?: string;
  party?: string;
  chamber?: string;
  isCurrent?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ members: any[]; total: number }> => {
  const where: any = {};

  if (query.state) where.state = query.state;
  if (query.party) where.party = query.party;
  if (query.chamber) where.chamber = query.chamber;
  if (query.isCurrent !== undefined) where.isCurrent = query.isCurrent;

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: { fullName: 'asc' },
      take: query.limit || 20,
      skip: query.offset || 0
    }),
    prisma.member.count({ where })
  ]);

  return { members, total };
};

// ============================================================================
// Database Caching Helpers
// ============================================================================

async function cacheMember(member: Member | MemberDetail): Promise<void> {
  try {
    await prisma.member.upsert({
      where: {
        bioguideId: member.bioguideId
      },
      update: {
        firstName: member.firstName || null,
        middleName: member.middleName || null,
        lastName: member.lastName || null,
        fullName: member.name || member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : null,
        nickName: member.nickName || null,
        suffix: member.suffix || null,
        state: member.state || null,
        district: member.district || null,
        party: member.party || null,
        partyName: member.partyHistory?.[0]?.partyName || null,
        chamber: member.chamber || null,
        isCurrent: true,
        officialWebsiteUrl: member.officialWebsiteUrl || null,
        imageUrl: member.depictionImageUrl || null,
        birthYear: (member as MemberDetail).birthYear ? parseInt((member as MemberDetail).birthYear!) : null,
        terms: member.terms ? (member.terms as any) : null,
        apiResponseData: member as any,
        updatedAt: new Date()
      },
      create: {
        bioguideId: member.bioguideId,
        firstName: member.firstName || null,
        middleName: member.middleName || null,
        lastName: member.lastName || null,
        fullName: member.name || member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : null,
        nickName: member.nickName || null,
        suffix: member.suffix || null,
        state: member.state || null,
        district: member.district || null,
        party: member.party || null,
        partyName: member.partyHistory?.[0]?.partyName || null,
        chamber: member.chamber || null,
        isCurrent: true,
        officialWebsiteUrl: member.officialWebsiteUrl || null,
        imageUrl: member.depictionImageUrl || null,
        birthYear: (member as MemberDetail).birthYear ? parseInt((member as MemberDetail).birthYear!) : null,
        terms: member.terms ? (member.terms as any) : null,
        apiResponseData: member as any
      }
    });
  } catch (error) {
    console.error('Failed to cache member:', error);
  }
}

async function cacheMembers(members: Member[]): Promise<void> {
  try {
    await Promise.all(members.map(member => cacheMember(member)));
  } catch (error) {
    console.error('Failed to cache members:', error);
  }
}

export default {
  listMembers,
  getMemberById,
  getMemberSponsorship,
  getMemberCosponsorship,
  searchCachedMembers
};
