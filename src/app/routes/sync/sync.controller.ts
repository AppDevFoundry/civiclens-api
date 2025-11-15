/**
 * Sync Controller
 *
 * Endpoints for triggering and monitoring Congress data sync jobs.
 * These endpoints are called by Vercel cron or manually for testing.
 */

import { Router, Request, Response } from 'express';
import {
  syncMembers,
  syncBills,
  getMemberSyncStats,
  getBillSyncStats,
  getLatestMemberSyncJob,
  getLatestBillSyncJob,
  syncConfig,
} from '../../services/sync';
import prisma from '../../../prisma/prisma-client';
import { getMemberById } from '../../services/congress/resources/members.service';

const router = Router();

/**
 * Middleware to verify cron secret for sync endpoints
 * Vercel cron passes the secret in the Authorization header
 */
const verifyCronSecret = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;

  // Skip auth check if no secret is configured (development mode)
  if (!syncConfig.cronSecret) {
    console.warn('[sync] No CRON_SECRET configured, allowing request');
    return next();
  }

  // Check for Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === syncConfig.cronSecret) {
      return next();
    }
  }

  // Also check for x-cron-secret header (alternative method)
  const cronSecretHeader = req.headers['x-cron-secret'];
  if (cronSecretHeader === syncConfig.cronSecret) {
    return next();
  }

  console.warn('[sync] Unauthorized sync request');
  res.status(401).json({ error: 'Unauthorized' });
};

/**
 * POST /api/sync/members
 * Trigger a member sync job
 */
router.post('/members', verifyCronSecret, async (req: Request, res: Response) => {
  console.info('[sync] Received member sync request');

  try {
    if (!syncConfig.syncEnabled) {
      return res.status(503).json({
        error: 'Sync disabled',
        message: 'Congress sync is currently disabled via CONGRESS_SYNC_ENABLED',
      });
    }

    const result = await syncMembers();

    if (result.success) {
      res.json({
        success: true,
        message: 'Member sync completed',
        ...result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Member sync failed',
        ...result,
      });
    }
  } catch (error) {
    console.error('[sync] Member sync endpoint error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/sync/members/fix-broken
 * Fix member records with missing or invalid data by re-fetching from Congress API
 */
router.post('/members/fix-broken', verifyCronSecret, async (req: Request, res: Response) => {
  console.info('[sync] Received fix-broken-members request');

  try {
    // Find members with broken fullName (null or contains "undefined")
    const brokenMembers = await prisma.member.findMany({
      where: {
        OR: [
          { fullName: null },
          { fullName: { contains: 'undefined' } },
          { firstName: null, lastName: null },
        ],
      },
      select: { bioguideId: true, fullName: true },
    });

    if (brokenMembers.length === 0) {
      return res.json({
        success: true,
        message: 'No broken member records found',
        fixed: 0,
        failed: 0,
      });
    }

    console.info(`[sync] Found ${brokenMembers.length} broken member records to fix`);

    const results = {
      fixed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Fetch each broken member from Congress API
    for (const member of brokenMembers) {
      try {
        console.info(`[sync] Fetching member ${member.bioguideId} from Congress API...`);
        const fetchedMember = await getMemberById(member.bioguideId);

        if (fetchedMember) {
          results.fixed++;
          console.info(`[sync] Fixed member ${member.bioguideId}`);
        } else {
          results.failed++;
          results.errors.push(`${member.bioguideId}: Member not found in Congress API`);
          console.warn(`[sync] Member ${member.bioguideId} not found in Congress API`);
        }
      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${member.bioguideId}: ${errorMsg}`);
        console.error(`[sync] Failed to fix member ${member.bioguideId}:`, error);
      }
    }

    res.json({
      success: results.failed === 0,
      message: `Fixed ${results.fixed} of ${brokenMembers.length} broken member records`,
      ...results,
    });
  } catch (error) {
    console.error('[sync] Fix broken members endpoint error:', error);
    res.status(500).json({
      error: 'Fix failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/sync/bills
 * Trigger a bill sync job (main cron endpoint)
 */
router.post('/bills', verifyCronSecret, async (req: Request, res: Response) => {
  console.info('[sync] Received bill sync request');

  try {
    if (!syncConfig.syncEnabled) {
      return res.status(503).json({
        error: 'Sync disabled',
        message: 'Congress sync is currently disabled via CONGRESS_SYNC_ENABLED',
      });
    }

    const result = await syncBills();

    if (result.success) {
      res.json({
        success: true,
        message: 'Bill sync completed',
        ...result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Bill sync failed',
        ...result,
      });
    }
  } catch (error) {
    console.error('[sync] Bill sync endpoint error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sync/status
 * Get current sync status and statistics
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const [memberStats, billStats, lastMemberJob, lastBillJob] = await Promise.all([
      getMemberSyncStats(),
      getBillSyncStats(),
      getLatestMemberSyncJob(),
      getLatestBillSyncJob(),
    ]);

    // Get additional database stats
    const [
      totalMembers,
      totalBills,
      membersByParty,
      membersByChamber,
      billsByPolicyArea,
      brokenMembers
    ] = await Promise.all([
      prisma.member.count(),
      prisma.bill.count(),
      prisma.member.groupBy({ by: ['party'], _count: true, where: { isCurrent: true } }),
      prisma.member.groupBy({ by: ['chamber'], _count: true, where: { isCurrent: true } }),
      prisma.bill.groupBy({ by: ['policyArea'], _count: true, orderBy: { _count: { policyArea: 'desc' } }, take: 10 }),
      prisma.member.count({ where: { OR: [{ fullName: null }, { fullName: { contains: 'undefined' } }] } })
    ]);

    // Get bill type counts
    const billTypeData = await prisma.$queryRaw<Array<{ billType: string; count: bigint }>>`
      SELECT "billType", COUNT(*) as count FROM "Bill" GROUP BY "billType"
    `;
    const billsByType = billTypeData.reduce((acc, t) => ({ ...acc, [t.billType]: Number(t.count) }), {} as Record<string, number>);

    res.json({
      enabled: syncConfig.syncEnabled,
      database: {
        totalMembers,
        totalBills,
        brokenMembers,
        membersByParty: membersByParty.reduce((acc: Record<string, number>, p: any) => ({ ...acc, [p.party || 'Unknown']: p._count }), {}),
        membersByChamber: membersByChamber.reduce((acc: Record<string, number>, c: any) => ({ ...acc, [c.chamber || 'Unknown']: c._count }), {}),
        billsByType,
        topPolicyAreas: billsByPolicyArea.map((p: any) => ({ area: p.policyArea || 'Unknown', count: p._count })),
      },
      members: {
        ...memberStats,
        lastJob: lastMemberJob ? {
          id: lastMemberJob.id,
          status: lastMemberJob.status,
          startedAt: lastMemberJob.startedAt,
          completedAt: lastMemberJob.completedAt,
          recordsProcessed: lastMemberJob.recordsProcessed,
          apiRequestsMade: lastMemberJob.apiRequestsMade,
          errorMessage: lastMemberJob.errorMessage,
        } : null,
      },
      bills: {
        ...billStats,
        lastJob: lastBillJob ? {
          id: lastBillJob.id,
          status: lastBillJob.status,
          startedAt: lastBillJob.startedAt,
          completedAt: lastBillJob.completedAt,
          recordsProcessed: lastBillJob.recordsProcessed,
          apiRequestsMade: lastBillJob.apiRequestsMade,
          errorMessage: lastBillJob.errorMessage,
        } : null,
      },
      config: {
        billSyncWindowDays: syncConfig.billSyncWindowDays,
        cronSchedule: syncConfig.cronSchedule,
      },
    });
  } catch (error) {
    console.error('[sync] Status endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get sync status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sync/jobs
 * Get recent sync job history
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const jobType = req.query.type as string | undefined;

    const where: any = {};
    if (jobType) {
      where.jobType = jobType;
    }

    const jobs = await prisma.syncJob.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        jobType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        recordsProcessed: true,
        apiRequestsMade: true,
        errorMessage: true,
      },
    });

    res.json({ jobs });
  } catch (error) {
    console.error('[sync] Jobs endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get sync jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sync/health
 * Simple health check for the sync system
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    syncEnabled: syncConfig.syncEnabled,
    timestamp: new Date().toISOString(),
  });
});

export default router;
