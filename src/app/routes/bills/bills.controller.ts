/**
 * Bills Controller
 *
 * REST API endpoints for accessing synced Congressional bills.
 */

import { Router, Request, Response } from 'express';
import {
  listBills,
  getBillBySlug,
  getBillActions,
  getBillCosponsors,
} from './bills.service';

const router = Router();

/**
 * GET /api/bills
 * List bills with filtering and pagination
 *
 * Query params:
 * - cursor: Pagination cursor (bill ID)
 * - limit: Number of results (default 20, max 100)
 * - congress: Filter by congress number (e.g., 118)
 * - type: Filter by bill type (hr, s, hjres, etc.)
 * - topic: Filter by subject/topic name
 * - member: Filter by sponsor/cosponsor bioguide ID
 * - search: Search in title and subjects
 * - isLaw: Filter to only show bills that became law
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = {
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      congress: req.query.congress ? parseInt(req.query.congress as string, 10) : undefined,
      billType: req.query.type as string | undefined,
      topic: req.query.topic as string | undefined,
      member: req.query.member as string | undefined,
      search: req.query.search as string | undefined,
      isLaw: req.query.isLaw === 'true' ? true : req.query.isLaw === 'false' ? false : undefined,
    };

    const result = await listBills(params);

    res.json({
      bills: result.bills,
      pagination: {
        total: result.total,
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
    });
  } catch (error) {
    console.error('[bills] List error:', error);
    res.status(500).json({
      error: 'Failed to list bills',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/bills/:slug
 * Get a single bill with full details
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const bill = await getBillBySlug(slug);

    if (!bill) {
      return res.status(404).json({
        error: 'Bill not found',
        message: `No bill found with slug: ${slug}`,
      });
    }

    res.json({ bill });
  } catch (error) {
    console.error('[bills] Get by slug error:', error);
    res.status(500).json({
      error: 'Failed to get bill',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/bills/:slug/actions
 * Get paginated actions for a bill
 */
router.get('/:slug/actions', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const params = {
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await getBillActions(slug, params);

    if (!result) {
      return res.status(404).json({
        error: 'Bill not found',
        message: `No bill found with slug: ${slug}`,
      });
    }

    res.json({
      actions: result.actions,
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
    });
  } catch (error) {
    console.error('[bills] Get actions error:', error);
    res.status(500).json({
      error: 'Failed to get bill actions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/bills/:slug/cosponsors
 * Get all cosponsors for a bill
 */
router.get('/:slug/cosponsors', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const params = {
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await getBillCosponsors(slug, params);

    if (!result) {
      return res.status(404).json({
        error: 'Bill not found',
        message: `No bill found with slug: ${slug}`,
      });
    }

    res.json({
      cosponsors: result.cosponsors,
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
    });
  } catch (error) {
    console.error('[bills] Get cosponsors error:', error);
    res.status(500).json({
      error: 'Failed to get bill cosponsors',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
