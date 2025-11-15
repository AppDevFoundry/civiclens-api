/**
 * Member Sync Service
 *
 * Syncs all current members of Congress from Congress.gov API to the database.
 * This should be run before bill sync to ensure member references are valid.
 */

import prisma from '../../../prisma/prisma-client';
import { listMembers } from '../congress/resources/members.service';
import { syncConfig } from './sync.config';
import { SyncJob } from '@prisma/client';

export interface MemberSyncResult {
  success: boolean;
  jobId: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  apiRequestsMade: number;
  duration: number;
  error?: string;
}

/**
 * Sync all current members of Congress
 *
 * Fetches all current members using pagination and upserts them into the database.
 * Tracks progress via SyncJob table.
 */
export async function syncMembers(): Promise<MemberSyncResult> {
  const startTime = Date.now();

  // Create sync job record
  const job = await prisma.syncJob.create({
    data: {
      jobType: 'MEMBER_SYNC',
      status: 'RUNNING',
    },
  });

  console.info(`[member-sync] Starting sync job ${job.id}`);

  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let apiRequestsMade = 0;

  try {
    // Count existing members before sync for created/updated calculation
    const existingBioguideIds = new Set(
      (await prisma.member.findMany({ select: { bioguideId: true } }))
        .map(m => m.bioguideId)
    );

    // Fetch all current members with pagination
    let offset = 0;
    const pageSize = syncConfig.memberSyncPageSize;
    let hasMore = true;

    while (hasMore) {
      console.info(`[member-sync] Fetching members offset=${offset}, limit=${pageSize}`);

      const response = await listMembers({
        currentMember: true,
        limit: pageSize,
        offset,
      });

      apiRequestsMade++;

      const members = response.members || [];
      recordsProcessed += members.length;

      // Count created vs updated
      for (const member of members) {
        if (existingBioguideIds.has(member.bioguideId)) {
          recordsUpdated++;
        } else {
          recordsCreated++;
          existingBioguideIds.add(member.bioguideId);
        }
      }

      console.info(`[member-sync] Processed ${members.length} members (total: ${recordsProcessed})`);

      // Check if there are more pages
      if (!response.pagination?.next || members.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }

      // Rate limit protection
      if (apiRequestsMade >= syncConfig.maxRequestsPerHour - syncConfig.requestThreshold) {
        console.warn(`[member-sync] Approaching rate limit, stopping at ${apiRequestsMade} requests`);
        break;
      }
    }

    // Mark all non-fetched members as non-current
    // This handles members who are no longer serving
    const syncedBioguideIds = Array.from(existingBioguideIds);
    await prisma.member.updateMany({
      where: {
        bioguideId: { notIn: syncedBioguideIds },
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });

    // Update job as completed
    const duration = Date.now() - startTime;
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        apiRequestsMade,
        completedAt: new Date(),
      },
    });

    console.info(`[member-sync] Completed job ${job.id} in ${duration}ms: ${recordsProcessed} members processed (${recordsCreated} created, ${recordsUpdated} updated)`);

    return {
      success: true,
      jobId: job.id,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      apiRequestsMade,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    console.error(`[member-sync] Failed job ${job.id}:`, error);

    // Update job as failed
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        apiRequestsMade,
        completedAt: new Date(),
        errorMessage,
        errorDetails: error instanceof Error ? { stack: error.stack } : null,
      },
    });

    return {
      success: false,
      jobId: job.id,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      apiRequestsMade,
      duration,
      error: errorMessage,
    };
  }
}

/**
 * Get the most recent member sync job
 */
export async function getLatestMemberSyncJob(): Promise<SyncJob | null> {
  return prisma.syncJob.findFirst({
    where: { jobType: 'MEMBER_SYNC' },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Get member sync statistics
 */
export async function getMemberSyncStats(): Promise<{
  totalMembers: number;
  currentMembers: number;
  lastSync: Date | null;
  lastSyncStatus: string | null;
}> {
  const [totalMembers, currentMembers, lastJob] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { isCurrent: true } }),
    getLatestMemberSyncJob(),
  ]);

  return {
    totalMembers,
    currentMembers,
    lastSync: lastJob?.completedAt || lastJob?.startedAt || null,
    lastSyncStatus: lastJob?.status || null,
  };
}

export default {
  syncMembers,
  getLatestMemberSyncJob,
  getMemberSyncStats,
};
