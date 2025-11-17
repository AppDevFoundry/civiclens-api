/**
 * Admin Dashboard Controller
 *
 * API endpoints for monitoring sync health, queue status, and triggering operations.
 * These endpoints provide observability into the Congress data synchronization system.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  getOrchestrator,
  getQueueService,
  getChangeDetectionService,
  getErrorHandler,
  SyncStrategy,
  ResourceType,
} from '../../services/sync';

const prisma = new PrismaClient();
const router = Router();

/**
 * Simple authentication check for admin endpoints
 * In production, use proper authentication middleware
 */
function isAdmin(req: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;

  // In development (no admin secret set), allow all requests
  if (!adminSecret || process.env.NODE_ENV !== 'production') {
    return true;
  }

  // In production, check for admin secret in header
  const authHeader = req.headers.authorization;
  return Boolean(authHeader === `Bearer ${adminSecret}`);
}

/**
 * Admin dashboard overview
 * GET /api/admin/dashboard
 */
router.get('/admin/dashboard', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();
    const queueService = getQueueService();
    const changeDetection = getChangeDetectionService();

    // Get sync stats
    const syncStats = await orchestrator.getSyncStats(24);

    // Get queue stats
    const queueStats = await queueService.getQueueStats();

    // Get change stats
    const changeStats = await changeDetection.getChangeStats(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date()
    );

    // Get database counts
    const [billCount, memberCount, hearingCount] = await Promise.all([
      prisma.bill.count(),
      prisma.member.count(),
      prisma.hearing.count(),
    ]);

    // Get recent sync runs
    const recentSyncs = await prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    res.json({
      timestamp: new Date().toISOString(),
      sync: syncStats,
      queue: queueStats,
      changes: changeStats,
      coverage: {
        bills: billCount,
        members: memberCount,
        hearings: hearingCount,
      },
      recentSyncs,
    });
  } catch (error) {
    console.error('[Admin] Dashboard error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get dashboard data',
    });
  }
});

/**
 * Sync status endpoint
 * GET /api/admin/sync-status
 */
router.get('/admin/sync-status', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;

    const orchestrator = getOrchestrator();
    const stats = await orchestrator.getSyncStats(hours);

    // Get latest sync run for each resource
    const latestSyncs = await prisma.syncRun.groupBy({
      by: ['resourceType'],
      _max: {
        startedAt: true,
      },
    });

    res.json({
      stats,
      latestSyncs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Sync status error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get sync status',
    });
  }
});

/**
 * Coverage metrics endpoint
 * GET /api/admin/coverage
 */
router.get('/admin/coverage', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get bill coverage by congress
    const billsByCongress = await prisma.bill.groupBy({
      by: ['congress'],
      _count: true,
      orderBy: {
        congress: 'desc',
      },
    });

    // Get bills by type
    const billsByType = await prisma.bill.groupBy({
      by: ['billType'],
      _count: true,
    });

    // Get bills by month (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const billsByMonth = await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "introducedDate"), 'YYYY-MM') as month,
        COUNT(*) as count
      FROM "Bill"
      WHERE "introducedDate" >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', "introducedDate")
      ORDER BY month DESC
    `;

    // Get date range coverage
    const [oldestBill, newestBill] = await Promise.all([
      prisma.bill.findFirst({
        orderBy: { introducedDate: 'asc' },
        select: { introducedDate: true },
      }),
      prisma.bill.findFirst({
        orderBy: { introducedDate: 'desc' },
        select: { introducedDate: true },
      }),
    ]);

    // Get members by chamber/party
    const membersByParty = await prisma.member.groupBy({
      by: ['chamber', 'party'],
      where: { isCurrent: true },
      _count: true,
    });

    res.json({
      bills: {
        total: await prisma.bill.count(),
        byCongress: billsByCongress,
        byType: billsByType,
        byMonth: billsByMonth.map((row) => ({
          month: row.month,
          count: Number(row.count),
        })),
        dateRange: {
          oldest: oldestBill?.introducedDate,
          newest: newestBill?.introducedDate,
        },
      },
      members: {
        total: await prisma.member.count({ where: { isCurrent: true } }),
        byParty: membersByParty,
      },
      hearings: {
        total: await prisma.hearing.count(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Coverage error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get coverage data',
    });
  }
});

/**
 * Error logs endpoint
 * GET /api/admin/errors
 */
router.get('/admin/errors', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    // Get failed sync runs
    const failedSyncs = await prisma.syncRun.findMany({
      where: {
        OR: [
          { status: 'failed' },
          { status: 'partial' },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    // Get failed jobs
    const failedJobs = await prisma.syncJob.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      failedSyncs,
      failedJobs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Errors endpoint error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get error logs',
    });
  }
});

/**
 * Trigger manual sync
 * POST /api/admin/trigger-sync
 * Body: { strategy: "incremental" | "stale" | "priority" | "full", resources?: string[] }
 */
router.post('/admin/trigger-sync', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { strategy = 'incremental', resources } = req.body;

    // Validate strategy
    const validStrategies = Object.values(SyncStrategy);
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({
        error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`,
      });
    }

    const orchestrator = getOrchestrator();

    // Trigger sync (async via queue to avoid timeout)
    const result = await orchestrator.sync({
      strategy: strategy as SyncStrategy,
      resources: resources || [ResourceType.BILLS, ResourceType.MEMBERS, ResourceType.HEARINGS],
      async: false, // Run synchronously for immediate feedback
    });

    res.json({
      success: true,
      message: 'Sync triggered',
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Trigger sync error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to trigger sync',
    });
  }
});

/**
 * Queue status endpoint
 * GET /api/admin/queue
 */
router.get('/admin/queue', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const queueService = getQueueService();
    const stats = await queueService.getQueueStats();
    const recentJobs = await queueService.getRecentJobs(50);

    res.json({
      stats,
      recentJobs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Queue status error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get queue status',
    });
  }
});

/**
 * Changes overview endpoint
 * GET /api/admin/changes
 */
router.get('/admin/changes', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
    const changeDetection = getChangeDetectionService();

    const stats = await changeDetection.getChangeStats(
      new Date(Date.now() - hours * 60 * 60 * 1000),
      new Date()
    );

    const recentChanges = await changeDetection.getBillsWithRecentChanges(hours, 50);

    res.json({
      stats,
      recentChanges,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Changes error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get changes data',
    });
  }
});

/**
 * Error monitoring endpoint
 * GET /api/admin/errors
 */
router.get('/admin/errors', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const errorHandler = getErrorHandler();
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
    const onlyCritical = req.query.critical === 'true';

    const [stats, recentErrors, metrics] = await Promise.all([
      errorHandler.getErrorStats(hours),
      errorHandler.getRecentErrors(50, onlyCritical),
      Promise.resolve(errorHandler.getMetrics()),
    ]);

    res.json({
      stats,
      recentErrors,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Errors endpoint error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get error data',
    });
  }
});

/**
 * Error alerts endpoint - check if alerts should be triggered
 * GET /api/admin/errors/alerts
 */
router.get('/admin/errors/alerts', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const errorHandler = getErrorHandler();
    const shouldAlert = await errorHandler.shouldAlert();
    const stats = await errorHandler.getErrorStats(1); // Last hour

    res.json({
      shouldAlert,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Alerts endpoint error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to check alerts',
    });
  }
});

/**
 * Resolve error endpoint
 * POST /api/admin/errors/:id/resolve
 */
router.post('/admin/errors/:id/resolve', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const errorId = parseInt(req.params.id, 10);
    const { notes, resolvedBy } = req.body;

    const updatedError = await prisma.syncError.update({
      where: { id: errorId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: resolvedBy || 'admin',
        notes,
      },
    });

    res.json({
      success: true,
      error: updatedError,
    });
  } catch (error) {
    console.error('[Admin] Resolve error failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to resolve error',
    });
  }
});

export default router;
