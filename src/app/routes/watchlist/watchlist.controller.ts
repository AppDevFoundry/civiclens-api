/**
 * Watchlist Controller
 *
 * API endpoints for users to manage their watchlists of bills, members, and topics.
 * Provides CRUD operations and integration with change detection for notifications.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import auth from '../auth/auth';
import { getChangeDetectionService } from '../../services/sync';

const prisma = new PrismaClient();
const router = Router();
const changeDetection = getChangeDetectionService();

/**
 * Get user's watchlist with recent changes
 * GET /api/watchlist
 * Requires authentication
 */
router.get('/watchlist', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse query parameters
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    // Build where clause
    const where: any = { userId };

    // Filter by type
    if (type === 'bill') {
      where.billId = { not: null };
    } else if (type === 'member') {
      where.memberId = { not: null };
    } else if (type === 'topic') {
      where.topicKeyword = { not: null };
    }

    // Get total count for pagination
    const totalCount = await prisma.userWatchlist.count({ where });

    // Get watchlist items with pagination
    const watchlist = await prisma.userWatchlist.findMany({
      where,
      include: {
        bill: {
          include: {
            changeLogs: {
              where: { notified: false },
              orderBy: { detectedAt: 'desc' },
              take: 10,
            },
          },
        },
        member: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Transform to include unread change counts
    const watchlistWithChanges = watchlist.map((item) => ({
      id: item.id,
      userId: item.userId,
      type: item.billId ? 'bill' : item.memberId ? 'member' : 'topic',
      billId: item.billId,
      memberId: item.memberId,
      bill: item.bill,
      member: item.member,
      topicKeyword: item.topicKeyword,
      unreadChanges: item.bill?.changeLogs?.length || 0,
      notificationPreferences: {
        notifyOnStatus: item.notifyOnStatus,
        notifyOnActions: item.notifyOnActions,
        notifyOnCosponsors: item.notifyOnCosponsors,
        digestMode: item.digestMode,
      },
      notifyOnStatus: item.notifyOnStatus,
      notifyOnActions: item.notifyOnActions,
      notifyOnCosponsors: item.notifyOnCosponsors,
      digestMode: item.digestMode,
      createdAt: item.createdAt,
      lastNotifiedAt: item.lastNotifiedAt,
    }));

    res.json({
      watchlist: watchlistWithChanges,
      totalItems: watchlist.length,
      totalUnreadChanges: watchlistWithChanges.reduce(
        (sum, item) => sum + item.unreadChanges,
        0
      ),
      pagination: {
        total: totalCount,
        offset,
        limit: limit || totalCount,
      },
    });
  } catch (error) {
    console.error('[Watchlist] Error getting watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get watchlist',
    });
  }
});

/**
 * Add bill to watchlist
 * POST /api/watchlist/bill/:billId
 * Requires authentication
 */
router.post('/watchlist/bill/:billId', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const billId = parseInt(req.params.billId, 10);

    if (isNaN(billId)) {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }

    // Check if bill exists
    const bill = await prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Check if already in watchlist
    const existing = await prisma.userWatchlist.findUnique({
      where: {
        userId_billId: { userId, billId },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Bill already in watchlist',
        watchlist: existing,
      });
    }

    // Add to watchlist
    const watchlistItem = await prisma.userWatchlist.create({
      data: {
        userId,
        billId,
        ...req.body, // Allow setting notification preferences
      },
      include: {
        bill: true,
      },
    });

    res.status(201).json({
      success: true,
      watchlist: watchlistItem,
    });
  } catch (error) {
    console.error('[Watchlist] Error adding bill to watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add bill to watchlist',
    });
  }
});

/**
 * Add member to watchlist
 * POST /api/watchlist/member/:memberId
 * Requires authentication
 */
router.post('/watchlist/member/:memberId', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const memberId = parseInt(req.params.memberId, 10);

    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if already in watchlist
    const existing = await prisma.userWatchlist.findUnique({
      where: {
        userId_memberId: { userId, memberId },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Member already in watchlist',
        watchlist: existing,
      });
    }

    // Add to watchlist
    const watchlistItem = await prisma.userWatchlist.create({
      data: {
        userId,
        memberId,
        ...req.body,
      },
      include: {
        member: true,
      },
    });

    res.status(201).json({
      success: true,
      watchlist: watchlistItem,
    });
  } catch (error) {
    console.error('[Watchlist] Error adding member to watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add member to watchlist',
    });
  }
});

/**
 * Add topic keyword to watchlist
 * POST /api/watchlist/topic
 * Body: { keyword: string, ...notificationPreferences }
 * Requires authentication
 */
router.post('/watchlist/topic', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { keyword, ...preferences } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    // Check if already watching this topic
    const existing = await prisma.userWatchlist.findFirst({
      where: {
        userId,
        topicKeyword: keyword.toLowerCase(),
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Topic already in watchlist',
        watchlist: existing,
      });
    }

    // Add to watchlist
    const watchlistItem = await prisma.userWatchlist.create({
      data: {
        userId,
        topicKeyword: keyword.toLowerCase(),
        ...preferences,
      },
    });

    res.status(201).json({
      success: true,
      watchlist: watchlistItem,
    });
  } catch (error) {
    console.error('[Watchlist] Error adding topic to watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add topic to watchlist',
    });
  }
});

/**
 * Remove from watchlist
 * DELETE /api/watchlist/:id
 * Requires authentication
 */
router.delete('/watchlist/:id', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const watchlistId = parseInt(req.params.id, 10);

    if (isNaN(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist ID' });
    }

    // Verify ownership
    const watchlistItem = await prisma.userWatchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlistItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    if (watchlistItem.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete
    await prisma.userWatchlist.delete({
      where: { id: watchlistId },
    });

    res.json({
      success: true,
      message: 'Removed from watchlist',
    });
  } catch (error) {
    console.error('[Watchlist] Error removing from watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to remove from watchlist',
    });
  }
});

/**
 * Update watchlist item notification preferences
 * PUT/PATCH /api/watchlist/:id
 * Body: { notifyOnStatus?, notifyOnActions?, notifyOnCosponsors?, digestMode? }
 * Requires authentication
 */
const updateWatchlistHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const watchlistId = parseInt(req.params.id, 10);

    if (isNaN(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist ID' });
    }

    // Verify ownership
    const watchlistItem = await prisma.userWatchlist.findUnique({
      where: { id: watchlistId },
    });

    if (!watchlistItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    if (watchlistItem.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update preferences
    const {
      notifyOnStatus,
      notifyOnActions,
      notifyOnCosponsors,
      digestMode,
    } = req.body;

    const updated = await prisma.userWatchlist.update({
      where: { id: watchlistId },
      data: {
        notifyOnStatus: notifyOnStatus !== undefined ? notifyOnStatus : watchlistItem.notifyOnStatus,
        notifyOnActions: notifyOnActions !== undefined ? notifyOnActions : watchlistItem.notifyOnActions,
        notifyOnCosponsors:
          notifyOnCosponsors !== undefined ? notifyOnCosponsors : watchlistItem.notifyOnCosponsors,
        digestMode: digestMode !== undefined ? digestMode : watchlistItem.digestMode,
      },
      include: {
        bill: true,
        member: true,
      },
    });

    res.json({
      success: true,
      watchlist: updated,
    });
  } catch (error) {
    console.error('[Watchlist] Error updating watchlist:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update watchlist',
    });
  }
};

router.put('/watchlist/:id', auth.required, updateWatchlistHandler);
router.patch('/watchlist/:id', auth.required, updateWatchlistHandler);

/**
 * Mark watchlist changes as read
 * POST /api/watchlist/:id/mark-read
 * Requires authentication
 */
router.post('/watchlist/:id/mark-read', auth.required, async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const watchlistId = parseInt(req.params.id, 10);

    if (isNaN(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist ID' });
    }

    // Verify ownership
    const watchlistItem = await prisma.userWatchlist.findUnique({
      where: { id: watchlistId },
      include: {
        bill: {
          include: {
            changeLogs: {
              where: { notified: false },
            },
          },
        },
      },
    });

    if (!watchlistItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    if (watchlistItem.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Mark changes as notified
    if (watchlistItem.billId && watchlistItem.bill?.changeLogs) {
      const changeLogIds = watchlistItem.bill.changeLogs.map((cl) => cl.id);
      await changeDetection.markAsNotified(changeLogIds);
    }

    // Update last notified timestamp
    await prisma.userWatchlist.update({
      where: { id: watchlistId },
      data: {
        lastNotifiedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Marked as read',
    });
  } catch (error) {
    console.error('[Watchlist] Error marking as read:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to mark as read',
    });
  }
});

/**
 * Get watchlist statistics
 * GET /api/watchlist/stats
 */
router.get('/watchlist/stats', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const watchlistItems = await prisma.userWatchlist.findMany({
      where: { userId },
    });

    const stats = {
      totalWatchlistItems: watchlistItems.length,
      billsWatched: watchlistItems.filter((item) => item.billId !== null).length,
      membersWatched: watchlistItems.filter((item) => item.memberId !== null).length,
      topicsWatched: watchlistItems.filter((item) => item.topicKeyword !== null).length,
    };

    res.json({ stats });
  } catch (error) {
    console.error('[Watchlist] Error getting stats:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

/**
 * Bulk add bills to watchlist
 * POST /api/watchlist/bulk
 */
router.post('/watchlist/bulk', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { billIds, memberId, notifyOnStatus, notifyOnActions, notifyOnCosponsors, digestMode } = req.body;

    if (!billIds || !Array.isArray(billIds)) {
      return res.status(400).json({ error: 'billIds array is required' });
    }

    const watchlists = [];

    for (const billId of billIds) {
      // Check if already exists
      const existing = await prisma.userWatchlist.findUnique({
        where: {
          userId_billId: {
            userId,
            billId,
          },
        },
      });

      if (!existing) {
        const watchlist = await prisma.userWatchlist.create({
          data: {
            userId,
            billId,
            notifyOnStatus: notifyOnStatus !== undefined ? notifyOnStatus : true,
            notifyOnActions: notifyOnActions !== undefined ? notifyOnActions : true,
            notifyOnCosponsors: notifyOnCosponsors !== undefined ? notifyOnCosponsors : false,
            digestMode: digestMode !== undefined ? digestMode : false,
          },
          include: {
            bill: true,
          },
        });

        watchlists.push(watchlist);
      }
    }

    res.status(201).json({
      success: true,
      added: watchlists.length,
      watchlists,
    });
  } catch (error) {
    console.error('[Watchlist] Error bulk adding:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to bulk add',
    });
  }
});

/**
 * Bulk delete watchlist items
 * POST /api/watchlist/bulk-delete
 */
router.post('/watchlist/bulk-delete', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { watchlistIds } = req.body;

    if (!watchlistIds || !Array.isArray(watchlistIds)) {
      return res.status(400).json({ error: 'watchlistIds array is required' });
    }

    // Delete only user's own watchlist items
    const result = await prisma.userWatchlist.deleteMany({
      where: {
        id: { in: watchlistIds },
        userId,
      },
    });

    res.json({
      success: true,
      deleted: result.count,
    });
  } catch (error) {
    console.error('[Watchlist] Error bulk deleting:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to bulk delete',
    });
  }
});

export default router;
