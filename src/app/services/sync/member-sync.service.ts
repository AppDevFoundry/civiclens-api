/**
 * Member Sync Service
 *
 * Handles synchronization of Congressional members from Congress.gov API.
 * Members change less frequently than bills, so sync is simpler.
 */

import { PrismaClient, Member } from '@prisma/client';
import { CongressApi } from '../congress';

const prisma = new PrismaClient();

/**
 * Sync options for member synchronization
 */
export interface MemberSyncOptions {
  bioguideId?: string; // Sync specific member
  currentMember?: boolean; // Only current members
  state?: string;
  party?: string;
  chamber?: 'House' | 'Senate';
  limit?: number;
  offset?: number;
}

/**
 * Sync result statistics
 */
export interface MemberSyncResult {
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  errors: Array<{ memberId?: string; error: string }>;
  duration: number;
}

/**
 * MemberSyncService - Synchronizes members from Congress.gov API
 */
export class MemberSyncService {
  /**
   * Sync members based on options
   */
  async syncMembers(options: MemberSyncOptions = {}): Promise<MemberSyncResult> {
    const startTime = Date.now();
    const result: MemberSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      errors: [],
      duration: 0,
    };

    console.log('[MemberSync] Starting sync with options:', options);

    try {
      // If syncing specific member
      if (options.bioguideId) {
        const member = await CongressApi.members.getMemberById(options.bioguideId);
        if (member) {
          result.recordsFetched = 1;
          await this.processMember(member, result);
        }
      } else {
        // Sync list of members
        const apiResponse = await CongressApi.members.listMembers({
          currentMember: options.currentMember,
          state: options.state,
          limit: options.limit || 100,
          offset: options.offset || 0,
        });

        const members = apiResponse.members || [];
        result.recordsFetched = members.length;

        console.log(`[MemberSync] Fetched ${members.length} members from API`);

        for (const apiMember of members) {
          try {
            await this.processMember(apiMember, result);
          } catch (error) {
            console.error(`[MemberSync] Error processing member ${apiMember.bioguideId}:`, error);
            result.errors.push({
              memberId: apiMember.bioguideId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      result.duration = Date.now() - startTime;
      console.log('[MemberSync] Sync completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[MemberSync] Sync failed:', error);
      result.errors.push({
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Sync all current members (typically run less frequently)
   */
  async syncAllCurrentMembers(): Promise<MemberSyncResult> {
    console.log('[MemberSync] Syncing all current members');

    return this.syncMembers({
      currentMember: true,
      limit: 600, // ~535 members in Congress
    });
  }

  /**
   * Process a single member from API response
   */
  private async processMember(apiMember: any, result: MemberSyncResult): Promise<void> {
    const memberData = this.mapApiMemberToModel(apiMember);

    // Find existing member
    const existingMember = await prisma.member.findUnique({
      where: { bioguideId: apiMember.bioguideId },
    });

    // Check if data actually changed (avoid unnecessary updates)
    const hasChanges = existingMember
      ? this.hasSignificantChanges(existingMember, memberData)
      : true;

    if (hasChanges) {
      // Upsert member
      await prisma.member.upsert({
        where: { bioguideId: apiMember.bioguideId },
        create: memberData,
        update: memberData,
      });

      if (!existingMember) {
        result.recordsCreated++;
        console.log(`[MemberSync] Created member: ${apiMember.bioguideId}`);
      } else {
        result.recordsUpdated++;
        console.log(`[MemberSync] Updated member: ${apiMember.bioguideId}`);
      }
    } else {
      result.recordsUnchanged++;
    }
  }

  /**
   * Map API member response to Prisma model
   */
  private mapApiMemberToModel(apiMember: any): any {
    // Construct fullName with proper null handling
    let fullName = apiMember.name || null;
    if (!fullName && (apiMember.firstName || apiMember.lastName)) {
      const parts = [apiMember.firstName, apiMember.middleName, apiMember.lastName].filter(Boolean);
      fullName = parts.length > 0 ? parts.join(' ') : null;
    }

    return {
      bioguideId: apiMember.bioguideId,
      firstName: apiMember.firstName || null,
      middleName: apiMember.middleName || null,
      lastName: apiMember.lastName || null,
      fullName: fullName,
      nickName: apiMember.nickName || null,
      suffix: apiMember.suffix || null,
      state: apiMember.state,
      district: apiMember.district ? parseInt(apiMember.district, 10) : null,
      party: apiMember.partyName?.[0] || apiMember.party,
      partyName: apiMember.partyName,
      chamber: apiMember.chamber,
      isCurrent: Array.isArray(apiMember.terms)
        ? apiMember.terms.some((t: any) => !t.endYear || t.endYear >= new Date().getFullYear())
        : true,
      officialWebsiteUrl: apiMember.officialWebsiteUrl || null,
      imageUrl: apiMember.depiction?.imageUrl,
      birthYear: apiMember.birthYear ? parseInt(apiMember.birthYear, 10) : null,
      terms: apiMember.terms || null,
      apiResponseData: apiMember,
    };
  }

  /**
   * Check if member data has significant changes
   */
  private hasSignificantChanges(existing: Member, updated: Partial<Member>): boolean {
    // Compare key fields that would warrant an update
    const significantFields: (keyof Member)[] = [
      'fullName',
      'party',
      'state',
      'district',
      'chamber',
      'isCurrent',
      'officialWebsiteUrl',
    ];

    for (const field of significantFields) {
      if (existing[field] !== updated[field]) {
        return true;
      }
    }

    return false;
  }
}

// Singleton instance
let memberSyncService: MemberSyncService | null = null;

/**
 * Get the MemberSyncService singleton instance
 */
export function getMemberSyncService(): MemberSyncService {
  if (!memberSyncService) {
    memberSyncService = new MemberSyncService();
  }
  return memberSyncService;
}
