/**
 * Notification Service
 *
 * Core notification system for sending alerts about bill changes,
 * member updates, and other events to users based on their watchlists.
 */

import { PrismaClient } from '@prisma/client';
import { getChangeDetectionService } from '../sync';

const prisma = new PrismaClient();

export interface NotificationOptions {
  userId: number;
  type: NotificationType;
  subject: string;
  body: string;
  billId?: number;
  memberId?: number;
  changeLogId?: number;
  deliveryMethod?: DeliveryMethod;
}

export enum NotificationType {
  BILL_CHANGE = 'bill_change',
  MEMBER_UPDATE = 'member_update',
  DIGEST = 'digest',
  WATCHLIST_UPDATE = 'watchlist_update',
}

export enum DeliveryMethod {
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export enum DigestFrequency {
  INSTANT = 'instant',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  NEVER = 'never',
}

export interface DigestOptions {
  frequency: DigestFrequency;
  startDate: Date;
  endDate: Date;
}

export class NotificationService {
  /**
   * Get or create notification preferences for a user
   */
  async getUserPreferences(userId: number) {
    let preferences = await prisma.userNotificationPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await prisma.userNotificationPreferences.create({
        data: {
          userId,
          emailEnabled: true,
          digestFrequency: DigestFrequency.DAILY,
          digestTime: '08:00',
          timezone: 'America/New_York',
          emailVerified: false,
        },
      });
    }

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId: number, updates: Partial<any>) {
    return await prisma.userNotificationPreferences.upsert({
      where: { userId },
      update: updates,
      create: {
        userId,
        ...updates,
      },
    });
  }

  /**
   * Create a notification
   */
  async createNotification(options: NotificationOptions) {
    const preferences = await this.getUserPreferences(options.userId);

    // Check if user has notifications enabled
    if (!preferences.emailEnabled || preferences.unsubscribedAt) {
      console.log(`[NotificationService] User ${options.userId} has notifications disabled`);
      return null;
    }

    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: options.userId },
      select: { email: true, username: true },
    });

    if (!user) {
      console.error(`[NotificationService] User ${options.userId} not found`);
      return null;
    }

    const recipientEmail = preferences.emailAddress || user.email;

    // Check digest mode
    if (preferences.digestFrequency !== DigestFrequency.INSTANT && options.type !== NotificationType.DIGEST) {
      console.log(`[NotificationService] User ${options.userId} is in ${preferences.digestFrequency} digest mode, queuing notification`);
      // For digest mode, still create the notification but don't send immediately
    }

    const notification = await prisma.notificationHistory.create({
      data: {
        userId: options.userId,
        notificationType: options.type,
        subject: options.subject,
        body: options.body,
        billId: options.billId,
        memberId: options.memberId,
        changeLogId: options.changeLogId,
        deliveryMethod: options.deliveryMethod || DeliveryMethod.EMAIL,
        recipientEmail,
        status: 'pending',
      },
    });

    console.log(`[NotificationService] Created notification ${notification.id} for user ${options.userId}`);
    return notification;
  }

  /**
   * Send pending notifications (to be called by email service)
   */
  async getPendingNotifications(limit = 100) {
    return await prisma.notificationHistory.findMany({
      where: {
        status: 'pending',
        deliveryMethod: DeliveryMethod.EMAIL,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            notificationPreferences: true,
          },
        },
        bill: {
          select: {
            id: true,
            title: true,
            congress: true,
            billType: true,
            billNumber: true,
          },
        },
        member: {
          select: {
            id: true,
            fullName: true,
            state: true,
            party: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Mark notification as sent
   */
  async markAsSent(notificationId: number) {
    return await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  /**
   * Mark notification as failed
   */
  async markAsFailed(notificationId: number, error: string) {
    return await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        error,
      },
    });
  }

  /**
   * Track notification open
   */
  async trackOpen(notificationId: number) {
    return await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: {
        opened: true,
        openedAt: new Date(),
      },
    });
  }

  /**
   * Track notification click
   */
  async trackClick(notificationId: number) {
    return await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: {
        clicked: true,
        clickedAt: new Date(),
      },
    });
  }

  /**
   * Unsubscribe user by token
   */
  async unsubscribeByToken(token: string) {
    const preferences = await prisma.userNotificationPreferences.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!preferences) {
      throw new Error('Invalid unsubscribe token');
    }

    return await prisma.userNotificationPreferences.update({
      where: { id: preferences.id },
      data: {
        emailEnabled: false,
        unsubscribedAt: new Date(),
      },
    });
  }

  /**
   * Get notifications for digest
   */
  async getNotificationsForDigest(userId: number, options: DigestOptions) {
    return await prisma.notificationHistory.findMany({
      where: {
        userId,
        status: 'pending',
        createdAt: {
          gte: options.startDate,
          lte: options.endDate,
        },
        notificationType: {
          not: NotificationType.DIGEST, // Don't include digests in digests
        },
      },
      include: {
        bill: {
          select: {
            id: true,
            title: true,
            congress: true,
            billType: true,
            billNumber: true,
            latestActionText: true,
            latestActionDate: true,
          },
        },
        member: {
          select: {
            id: true,
            fullName: true,
            state: true,
            party: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create digest notification from pending notifications
   */
  async createDigestNotification(userId: number, frequency: DigestFrequency) {
    const now = new Date();
    let startDate: Date;

    // Determine date range based on frequency
    if (frequency === DigestFrequency.DAILY) {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (frequency === DigestFrequency.WEEKLY) {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      return null;
    }

    const notifications = await this.getNotificationsForDigest(userId, {
      frequency,
      startDate,
      endDate: now,
    });

    if (notifications.length === 0) {
      console.log(`[NotificationService] No notifications to digest for user ${userId}`);
      return null;
    }

    // Group by type
    const billChanges = notifications.filter((n) => n.notificationType === NotificationType.BILL_CHANGE);
    const memberUpdates = notifications.filter((n) => n.notificationType === NotificationType.MEMBER_UPDATE);

    const subject = `Your ${frequency} Congress update: ${notifications.length} change${notifications.length > 1 ? 's' : ''}`;

    let body = `Here's your ${frequency} summary of Congressional activity:\n\n`;

    if (billChanges.length > 0) {
      body += `📜 Bill Changes (${billChanges.length}):\n`;
      billChanges.slice(0, 10).forEach((n) => {
        const billTitle = n.bill?.title || 'Unknown bill';
        body += `  • ${billTitle}\n    ${n.subject}\n\n`;
      });
      if (billChanges.length > 10) {
        body += `  ... and ${billChanges.length - 10} more bill changes\n\n`;
      }
    }

    if (memberUpdates.length > 0) {
      body += `👥 Member Updates (${memberUpdates.length}):\n`;
      memberUpdates.slice(0, 10).forEach((n) => {
        const memberName = n.member?.fullName || 'Unknown member';
        body += `  • ${memberName}\n    ${n.subject}\n\n`;
      });
      if (memberUpdates.length > 10) {
        body += `  ... and ${memberUpdates.length - 10} more member updates\n\n`;
      }
    }

    body += `\nView full details at: [Your App URL]\n`;

    // Create the digest notification
    const digestNotification = await this.createNotification({
      userId,
      type: NotificationType.DIGEST,
      subject,
      body,
      deliveryMethod: DeliveryMethod.EMAIL,
    });

    // Mark individual notifications as included in digest
    await prisma.notificationHistory.updateMany({
      where: {
        id: {
          in: notifications.map((n) => n.id),
        },
      },
      data: {
        status: 'sent', // Mark as sent since they're in the digest
        sentAt: now,
      },
    });

    return digestNotification;
  }

  /**
   * Process bill change notifications for all watchers
   */
  async notifyBillChange(billId: number, changeType: string, changeLogId?: number) {
    console.log(`[NotificationService] Processing bill change notifications for bill ${billId}`);

    // Get bill details
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
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
    });

    if (!bill) {
      console.error(`[NotificationService] Bill ${billId} not found`);
      return;
    }

    const billTitle = bill.title || `${bill.billType.toUpperCase()} ${bill.billNumber}`;

    // Create notifications for each user watching this bill
    for (const watchlist of bill.watchlists) {
      // Check if user wants notifications for this change type
      if (changeType === 'status' && !watchlist.notifyOnStatus) continue;
      if (changeType === 'action' && !watchlist.notifyOnActions) continue;
      if (changeType === 'cosponsors' && !watchlist.notifyOnCosponsors) continue;

      const subject = `Update: ${billTitle}`;
      const body = `There's been a ${changeType} change to ${billTitle}.\n\n` +
        `Latest action: ${bill.latestActionText || 'None'}\n` +
        `Date: ${bill.latestActionDate ? bill.latestActionDate.toLocaleDateString() : 'Unknown'}\n\n` +
        `View full details: [Bill URL]\n`;

      await this.createNotification({
        userId: watchlist.userId,
        type: NotificationType.BILL_CHANGE,
        subject,
        body,
        billId: bill.id,
        changeLogId,
      });
    }

    console.log(`[NotificationService] Created ${bill.watchlists.length} bill change notifications`);
  }

  /**
   * Get notification history for a user
   */
  async getHistory(userId: number, limit = 50) {
    return await prisma.notificationHistory.findMany({
      where: { userId },
      include: {
        bill: {
          select: {
            id: true,
            title: true,
            congress: true,
            billType: true,
            billNumber: true,
          },
        },
        member: {
          select: {
            id: true,
            fullName: true,
            state: true,
            party: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get notification statistics
   */
  async getStats(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [total, sent, failed, pending, opened, clicked] = await Promise.all([
      prisma.notificationHistory.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.notificationHistory.count({
        where: {
          createdAt: { gte: since },
          status: 'sent',
        },
      }),
      prisma.notificationHistory.count({
        where: {
          createdAt: { gte: since },
          status: 'failed',
        },
      }),
      prisma.notificationHistory.count({
        where: {
          createdAt: { gte: since },
          status: 'pending',
        },
      }),
      prisma.notificationHistory.count({
        where: {
          createdAt: { gte: since },
          opened: true,
        },
      }),
      prisma.notificationHistory.count({
        where: {
          createdAt: { gte: since },
          clicked: true,
        },
      }),
    ]);

    const byType = await prisma.notificationHistory.groupBy({
      by: ['notificationType'],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    return {
      total,
      sent,
      failed,
      pending,
      opened,
      clicked,
      byType: Object.fromEntries(
        byType.map((t) => [t.notificationType, t._count])
      ),
      openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) + '%' : '0%',
      clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(1) + '%' : '0%',
    };
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
