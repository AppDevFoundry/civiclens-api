/**
 * Cron Controller
 *
 * HTTP endpoints for Vercel cron jobs to trigger Congress data synchronization.
 * These endpoints are called by Vercel's cron scheduler on a regular basis.
 */

import { Router, Request, Response } from 'express';
import {
  getOrchestrator,
  SyncStrategy,
  ResourceType,
} from '../../services/sync';

const router = Router();

/**
 * Verify cron request is from Vercel
 * In production, you should verify the request comes from Vercel using headers
 */
function verifyCronRequest(req: Request): boolean {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // In development (no cron secret set), allow all requests
  if (!cronSecret || process.env.NODE_ENV !== 'production') {
    return true;
  }

  // In production, verify secret
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Fallback: Check if request is from Vercel
  const vercelHeader = req.headers['x-vercel-id'];
  return Boolean(vercelHeader);
}

/**
 * Health check endpoint for cron
 * GET /api/cron/health
 */
router.get('/cron/health', async (req: Request, res: Response) => {
  try {
    const orchestrator = getOrchestrator();
    const stats = await orchestrator.getSyncStats(24);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    console.error('[Cron] Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Sync bills (called hourly)
 * POST /api/cron/sync-bills
 */
router.post('/cron/sync-bills', async (req: Request, res: Response) => {
  console.log('[Cron] sync-bills triggered');

  // Verify request
  if (!verifyCronRequest(req)) {
    console.warn('[Cron] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();

    // Run incremental sync for bills
    const result = await orchestrator.sync({
      strategy: SyncStrategy.INCREMENTAL,
      resources: [ResourceType.BILLS],
      async: false, // Run synchronously for Vercel cron
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        duration: result.totalDuration,
        records: result.totalRecords,
        errors: result.totalErrors,
      },
    });
  } catch (error) {
    console.error('[Cron] sync-bills failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Sync members (called every 6 hours)
 * POST /api/cron/sync-members
 */
router.post('/cron/sync-members', async (req: Request, res: Response) => {
  console.log('[Cron] sync-members triggered');

  // Verify request
  if (!verifyCronRequest(req)) {
    console.warn('[Cron] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();

    // Run incremental sync for members
    const result = await orchestrator.sync({
      strategy: SyncStrategy.INCREMENTAL,
      resources: [ResourceType.MEMBERS],
      async: false,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        duration: result.totalDuration,
        records: result.totalRecords,
        errors: result.totalErrors,
      },
    });
  } catch (error) {
    console.error('[Cron] sync-members failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Sync hearings (called every 8 hours)
 * POST /api/cron/sync-hearings
 */
router.post('/cron/sync-hearings', async (req: Request, res: Response) => {
  console.log('[Cron] sync-hearings triggered');

  // Verify request
  if (!verifyCronRequest(req)) {
    console.warn('[Cron] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();

    // Run incremental sync for hearings
    const result = await orchestrator.sync({
      strategy: SyncStrategy.INCREMENTAL,
      resources: [ResourceType.HEARINGS],
      async: false,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        duration: result.totalDuration,
        records: result.totalRecords,
        errors: result.totalErrors,
      },
    });
  } catch (error) {
    console.error('[Cron] sync-hearings failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Sync stale data (called daily)
 * POST /api/cron/sync-stale
 */
router.post('/cron/sync-stale', async (req: Request, res: Response) => {
  console.log('[Cron] sync-stale triggered');

  // Verify request
  if (!verifyCronRequest(req)) {
    console.warn('[Cron] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();

    // Run stale sync for all resources
    const result = await orchestrator.sync({
      strategy: SyncStrategy.STALE,
      resources: [ResourceType.BILLS, ResourceType.HEARINGS],
      async: false,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        duration: result.totalDuration,
        records: result.totalRecords,
        errors: result.totalErrors,
      },
    });
  } catch (error) {
    console.error('[Cron] sync-stale failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Manual trigger for full sync (for admin use)
 * POST /api/cron/sync-full
 * Requires authentication
 */
router.post('/cron/sync-full', async (req: Request, res: Response) => {
  console.log('[Cron] sync-full triggered');

  // Verify request
  if (!verifyCronRequest(req)) {
    console.warn('[Cron] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orchestrator = getOrchestrator();

    // Run full sync (this might take a while!)
    const result = await orchestrator.sync({
      strategy: SyncStrategy.FULL,
      resources: [ResourceType.BILLS, ResourceType.MEMBERS, ResourceType.HEARINGS],
      async: false,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: {
        duration: result.totalDuration,
        records: result.totalRecords,
        errors: result.totalErrors,
      },
    });
  } catch (error) {
    console.error('[Cron] sync-full failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
