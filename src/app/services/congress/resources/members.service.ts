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

/**
 * Parse member name in "Last, First Middle Suffix" format
 */
function parseMemberName(name: string | undefined): {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  suffix: string | null;
  fullName: string | null;
} {
  if (!name) {
    return { firstName: null, lastName: null, middleName: null, suffix: null, fullName: null };
  }

  // Handle "Last, First Middle Suffix" format
  const parts = name.split(',').map(s => s.trim());
  const lastName = parts[0] || null;

  let firstName: string | null = null;
  let middleName: string | null = null;
  let suffix: string | null = null;

  if (parts[1]) {
    const nameParts = parts[1].split(' ').filter(Boolean);
    firstName = nameParts[0] || null;

    // Check if last part is a suffix
    const lastPart = nameParts[nameParts.length - 1];
    const suffixes = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
    if (nameParts.length > 1 && suffixes.some(s => lastPart?.includes(s))) {
      suffix = lastPart;
      middleName = nameParts.slice(1, -1).join(' ') || null;
    } else if (nameParts.length > 1) {
      middleName = nameParts.slice(1).join(' ') || null;
    }
  }

  // Construct readable full name (First Last)
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : name;

  return { firstName, lastName, middleName, suffix, fullName };
}

/**
 * Map party abbreviation from party name
 */
function getPartyAbbreviation(partyName: string | undefined): string | null {
  if (!partyName) return null;
  const lower = partyName.toLowerCase();
  if (lower.includes('democratic')) return 'D';
  if (lower.includes('republican')) return 'R';
  if (lower.includes('independent')) return 'I';
  return partyName.charAt(0).toUpperCase();
}

async function cacheMember(member: Member | MemberDetail): Promise<void> {
  try {
    // Parse name from "Last, First" format (list API returns this in .name)
    // Detail API returns .directOrderName in "First Last" format
    const parsedName = parseMemberName((member as any).name);

    // Helper to title case names (API sometimes returns UPPERCASE)
    const titleCase = (str: string | null | undefined): string | null => {
      if (!str) return null;
      return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    };

    // Extract fields that might be in different locations
    const imageUrl = (member as any).depiction?.imageUrl || member.depictionImageUrl || null;
    const partyName = (member as any).partyName || member.partyHistory?.[0]?.partyName || null;
    const party = member.party || getPartyAbbreviation(partyName);

    // Get names - prefer existing firstName/lastName if available (detail API)
    // Otherwise use parsed name from "Last, First" format (list API)
    const firstName = titleCase(member.firstName) || parsedName.firstName;
    const lastName = titleCase(member.lastName) || parsedName.lastName;
    const middleName = titleCase(member.middleName) || parsedName.middleName;
    const suffix = member.suffix || parsedName.suffix;

    // Build full name from best available source
    let fullName: string | null = null;
    if (firstName && lastName) {
      fullName = `${firstName} ${lastName}`;
    } else if ((member as any).directOrderName) {
      fullName = (member as any).directOrderName;
    } else if ((member as any).name) {
      fullName = parsedName.fullName;
    }

    // Get chamber from terms if not directly available
    let chamber = member.chamber || null;
    if (!chamber && (member as any).terms?.item?.[0]?.chamber) {
      const chamberFull = (member as any).terms.item[0].chamber;
      if (chamberFull.includes('House')) chamber = 'House';
      else if (chamberFull.includes('Senate')) chamber = 'Senate';
    }

    // Handle district - store as integer
    const district = member.district ? parseInt(String(member.district), 10) : null;

    const memberData = {
      firstName,
      middleName,
      lastName,
      fullName,
      nickName: member.nickName || null,
      suffix,
      state: member.state || null,
      district,
      party,
      partyName,
      chamber,
      isCurrent: true,
      officialWebsiteUrl: member.officialWebsiteUrl || null,
      imageUrl,
      birthYear: (member as MemberDetail).birthYear ? parseInt((member as MemberDetail).birthYear!) : null,
      terms: member.terms ? (member.terms as any) : null,
      apiResponseData: member as any,
    };

    await prisma.member.upsert({
      where: {
        bioguideId: member.bioguideId
      },
      update: {
        ...memberData,
        updatedAt: new Date()
      },
      create: {
        bioguideId: member.bioguideId,
        ...memberData
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
