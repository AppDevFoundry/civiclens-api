/**
 * Change Detection Service
 *
 * Detects and logs changes to bills for notification purposes.
 * Compares previous vs current bill data and creates change log entries.
 * Triggers notifications for users watching the changed bills.
 */

import { PrismaClient, Bill, BillChangeLog } from '@prisma/client';

const prisma = new PrismaClient();

// Import notification service (lazy to avoid circular dependencies)
let notificationService: any = null;
function getNotificationServiceLazy() {
  if (!notificationService) {
    const { getNotificationService } = require('../notifications');
    notificationService = getNotificationService();
  }
  return notificationService;
}

/**
 * Change types that we track
 */
export enum ChangeType {
  STATUS = 'status',
  TITLE = 'title',
  ACTION = 'action',
  COSPONSORS = 'cosponsors',
  SUMMARY = 'summary',
  POLICY_AREA = 'policy_area',
  LAW = 'law',
}

/**
 * Detected change object
 */
export interface DetectedChange {
  changeType: ChangeType;
  previousValue: any;
  newValue: any;
  significance: 'low' | 'medium' | 'high'; // For prioritizing notifications
}

/**
 * ChangeDetectionService - Tracks and logs changes to bills
 */
export class ChangeDetectionService {
  /**
   * Detect changes between old and new bill data
   */
  async detectBillChanges(
    oldBill: Bill | null,
    newBill: Bill
  ): Promise<DetectedChange[]> {
    const changes: DetectedChange[] = [];

    // If no old bill, this is a new bill (all fields are "changes")
    if (!oldBill) {
      changes.push({
        changeType: ChangeType.STATUS,
        previousValue: null,
        newValue: 'introduced',
        significance: 'high',
      });
      return changes;
    }

    // Check for status changes (based on latest action or lawNumber)
    if (oldBill.lawNumber !== newBill.lawNumber && newBill.lawNumber) {
      changes.push({
        changeType: ChangeType.LAW,
        previousValue: oldBill.lawNumber,
        newValue: newBill.lawNumber,
        significance: 'high',
      });
    }

    // Check for title changes
    if (oldBill.title !== newBill.title) {
      changes.push({
        changeType: ChangeType.TITLE,
        previousValue: oldBill.title,
        newValue: newBill.title,
        significance: 'medium',
      });
    }

    // Check for latest action changes
    if (
      oldBill.latestActionDate?.getTime() !== newBill.latestActionDate?.getTime() ||
      oldBill.latestActionText !== newBill.latestActionText
    ) {
      changes.push({
        changeType: ChangeType.ACTION,
        previousValue: {
          date: oldBill.latestActionDate,
          text: oldBill.latestActionText,
        },
        newValue: {
          date: newBill.latestActionDate,
          text: newBill.latestActionText,
        },
        significance: 'high',
      });
    }

    // Check for policy area changes
    if (oldBill.policyArea !== newBill.policyArea) {
      changes.push({
        changeType: ChangeType.POLICY_AREA,
        previousValue: oldBill.policyArea,
        newValue: newBill.policyArea,
        significance: 'low',
      });
    }

    // Check for cosponsor changes (if we have the data in apiResponseData)
    const oldCosponsors = this.extractCosponsorCount(oldBill);
    const newCosponsors = this.extractCosponsorCount(newBill);

    if (oldCosponsors !== null && newCosponsors !== null && oldCosponsors !== newCosponsors) {
      const significance = newCosponsors > oldCosponsors ? 'medium' : 'low';
      changes.push({
        changeType: ChangeType.COSPONSORS,
        previousValue: { count: oldCosponsors },
        newValue: { count: newCosponsors },
        significance,
      });
    }

    return changes;
  }

  /**
   * Log detected changes to the database
   */
  async logChanges(billId: number, changes: DetectedChange[]): Promise<BillChangeLog[]> {
    if (changes.length === 0) {
      return [];
    }

    const changeLogs = await Promise.all(
      changes.map((change) =>
        prisma.billChangeLog.create({
          data: {
            billId,
            changeType: change.changeType,
            previousValue: change.previousValue,
            newValue: change.newValue,
            notified: false,
          },
        })
      )
    );

    console.log(`[ChangeDetection] Logged ${changes.length} changes for bill ${billId}`);
    return changeLogs;
  }

  /**
   * Get recent unnotified changes for a user's watchlist
   */
  async getUnnotifiedChanges(userId: number): Promise<
    Array<{
      bill: Bill;
      changes: BillChangeLog[];
    }>
  > {
    // Get user's watched bills
    const watchlist = await prisma.userWatchlist.findMany({
      where: {
        userId,
        billId: { not: null },
      },
      include: {
        bill: true,
      },
    });

    if (watchlist.length === 0) {
      return [];
    }

    const billIds = watchlist.map((w) => w.billId).filter((id): id is number => id !== null);

    // Get unnotified changes for those bills
    const changes = await prisma.billChangeLog.findMany({
      where: {
        billId: { in: billIds },
        notified: false,
      },
      include: {
        bill: true,
      },
      orderBy: {
        detectedAt: 'desc',
      },
    });

    // Group by bill
    const changesByBill = changes.reduce((acc, change) => {
      const billId = change.billId;
      if (!acc[billId]) {
        acc[billId] = {
          bill: change.bill,
          changes: [],
        };
      }
      acc[billId].changes.push(change);
      return acc;
    }, {} as Record<number, { bill: Bill; changes: BillChangeLog[] }>);

    return Object.values(changesByBill);
  }

  /**
   * Mark changes as notified
   */
  async markAsNotified(changeLogIds: number[]): Promise<void> {
    if (changeLogIds.length === 0) {
      return;
    }

    await prisma.billChangeLog.updateMany({
      where: {
        id: { in: changeLogIds },
      },
      data: {
        notified: true,
      },
    });

    console.log(`[ChangeDetection] Marked ${changeLogIds.length} changes as notified`);
  }

  /**
   * Get change statistics
   */
  async getChangeStats(dateFrom?: Date, dateTo?: Date): Promise<{
    totalChanges: number;
    byType: Record<string, number>;
    unnotified: number;
  }> {
    const where: any = {};

    if (dateFrom || dateTo) {
      where.detectedAt = {};
      if (dateFrom) where.detectedAt.gte = dateFrom;
      if (dateTo) where.detectedAt.lte = dateTo;
    }

    const [totalChanges, byType, unnotified] = await Promise.all([
      prisma.billChangeLog.count({ where }),
      prisma.billChangeLog.groupBy({
        by: ['changeType'],
        where,
        _count: true,
      }),
      prisma.billChangeLog.count({
        where: {
          ...where,
          notified: false,
        },
      }),
    ]);

    const byTypeMap = byType.reduce((acc, item) => {
      acc[item.changeType] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalChanges,
      byType: byTypeMap,
      unnotified,
    };
  }

  /**
   * Extract cosponsor count from API response data
   */
  private extractCosponsorCount(bill: Bill): number | null {
    if (!bill.apiResponseData || typeof bill.apiResponseData !== 'object') {
      return null;
    }

    const data = bill.apiResponseData as any;

    // Try different possible locations in the API response
    if (data.cosponsors && typeof data.cosponsors.count === 'number') {
      return data.cosponsors.count;
    }

    if (data.cosponsors && Array.isArray(data.cosponsors)) {
      return data.cosponsors.length;
    }

    if (typeof data.cosponsorsCount === 'number') {
      return data.cosponsorsCount;
    }

    return null;
  }

  /**
   * Get recent changes for a specific bill
   */
  async getBillChanges(billId: number, limit = 10): Promise<BillChangeLog[]> {
    return prisma.billChangeLog.findMany({
      where: { billId },
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get bills with recent changes
   */
  async getBillsWithRecentChanges(
    hours = 24,
    limit = 50
  ): Promise<
    Array<{
      bill: Bill;
      changeCount: number;
      latestChange: Date;
    }>
  > {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const changes = await prisma.billChangeLog.findMany({
      where: {
        detectedAt: { gte: since },
      },
      include: {
        bill: true,
      },
      orderBy: {
        detectedAt: 'desc',
      },
    });

    // Group by bill and count
    const billChanges = changes.reduce((acc, change) => {
      const billId = change.billId;
      if (!acc[billId]) {
        acc[billId] = {
          bill: change.bill,
          changeCount: 0,
          latestChange: change.detectedAt,
        };
      }
      acc[billId].changeCount++;
      return acc;
    }, {} as Record<number, { bill: Bill; changeCount: number; latestChange: Date }>);

    return Object.values(billChanges)
      .sort((a, b) => b.latestChange.getTime() - a.latestChange.getTime())
      .slice(0, limit);
  }

  /**
   * Process unnotified changes and trigger notifications
   * This should be called after sync runs or periodically
   */
  async processUnnotifiedChanges(options?: { autoNotify?: boolean }): Promise<{
    processed: number;
    notificationsSent: number;
  }> {
    const autoNotify = options?.autoNotify !== false; // Default true

    console.log('[ChangeDetection] Processing unnotified changes...');

    // Get all unnotified changes
    const unnotifiedChanges = await prisma.billChangeLog.findMany({
      where: {
        notified: false,
      },
      include: {
        bill: {
          include: {
            watchlists: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        detectedAt: 'asc',
      },
    });

    if (unnotifiedChanges.length === 0) {
      console.log('[ChangeDetection] No unnotified changes to process');
      return { processed: 0, notificationsSent: 0 };
    }

    console.log(`[ChangeDetection] Found ${unnotifiedChanges.length} unnotified changes`);

    let notificationsSent = 0;

    if (autoNotify) {
      const notifService = getNotificationServiceLazy();

      // Group changes by bill
      const changesByBill = unnotifiedChanges.reduce((acc, change) => {
        if (!acc[change.billId]) {
          acc[change.billId] = [];
        }
        acc[change.billId].push(change);
        return acc;
      }, {} as Record<number, typeof unnotifiedChanges>);

      // Process each bill's changes
      for (const [billIdStr, billChanges] of Object.entries(changesByBill)) {
        const billId = parseInt(billIdStr, 10);
        const bill = billChanges[0].bill;

        // Determine the most significant change type
        const changeTypes = billChanges.map((c) => c.changeType);
        const mostSignificant = this.getMostSignificantChangeType(changeTypes);

        try {
          // Trigger notification for each watcher
          await notifService.notifyBillChange(billId, mostSignificant, billChanges[0].id);
          notificationsSent += bill.watchlists.length;

          // Mark changes as notified
          await this.markAsNotified(billChanges.map((c) => c.id));
        } catch (error) {
          console.error(`[ChangeDetection] Failed to notify for bill ${billId}:`, error);
        }
      }
    }

    console.log(`[ChangeDetection] Processed ${unnotifiedChanges.length} changes, sent ${notificationsSent} notifications`);

    return {
      processed: unnotifiedChanges.length,
      notificationsSent,
    };
  }

  /**
   * Determine the most significant change type from a list
   * Used for notification prioritization
   */
  private getMostSignificantChangeType(changeTypes: string[]): string {
    // Priority order (higher = more important)
    const priority: Record<string, number> = {
      [ChangeType.LAW]: 5,
      [ChangeType.ACTION]: 4,
      [ChangeType.STATUS]: 4,
      [ChangeType.COSPONSORS]: 3,
      [ChangeType.TITLE]: 2,
      [ChangeType.SUMMARY]: 2,
      [ChangeType.POLICY_AREA]: 1,
    };

    let mostSignificant = changeTypes[0];
    let highestPriority = priority[mostSignificant] || 0;

    for (const changeType of changeTypes) {
      const typePriority = priority[changeType] || 0;
      if (typePriority > highestPriority) {
        mostSignificant = changeType;
        highestPriority = typePriority;
      }
    }

    return mostSignificant;
  }
}

// Singleton instance
let changeDetectionService: ChangeDetectionService | null = null;

/**
 * Get the ChangeDetectionService singleton instance
 */
export function getChangeDetectionService(): ChangeDetectionService {
  if (!changeDetectionService) {
    changeDetectionService = new ChangeDetectionService();
  }
  return changeDetectionService;
}
