/**
 * Push Notification Service
 *
 * Handles push notifications via Firebase Cloud Messaging (FCM)
 * for both iOS and Android devices.
 */

import * as admin from 'firebase-admin';
import prisma from '../../../prisma/prisma-client';
import fcmConfig from '../../config/fcm.config';
import * as fs from 'fs';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  imageUrl?: string;
  actionUrl?: string;
}

export interface SendPushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  invalidToken?: boolean;
}

/**
 * Push Notification Service
 */
class PushService {
  private initialized: boolean = false;
  private app?: admin.app.App;

  /**
   * Initialize Firebase Admin SDK
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!fcmConfig.enabled) {
      console.log('[Push Service] FCM is disabled. Push notifications will not be sent.');
      this.initialized = true;
      return;
    }

    try {
      // Check if already initialized
      if (admin.apps.length > 0) {
        this.app = admin.app();
        this.initialized = true;
        console.log('[Push Service] Using existing Firebase Admin instance');
        return;
      }

      // Load service account credentials
      let credential: admin.credential.Credential;

      if (fcmConfig.serviceAccountJson) {
        // Parse from JSON string environment variable
        const serviceAccount = JSON.parse(fcmConfig.serviceAccountJson);
        credential = admin.credential.cert(serviceAccount);
      } else if (fcmConfig.serviceAccountPath) {
        // Load from file path
        if (!fs.existsSync(fcmConfig.serviceAccountPath)) {
          throw new Error(`Service account file not found: ${fcmConfig.serviceAccountPath}`);
        }
        const serviceAccount = JSON.parse(fs.readFileSync(fcmConfig.serviceAccountPath, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
      } else {
        // Try to use application default credentials (for Google Cloud environments)
        credential = admin.credential.applicationDefault();
      }

      // Initialize Firebase Admin
      this.app = admin.initializeApp({
        credential,
        projectId: fcmConfig.projectId
      });

      this.initialized = true;
      console.log('[Push Service] Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('[Push Service] Failed to initialize Firebase Admin SDK:', error);
      this.initialized = true; // Mark as initialized to prevent repeated attempts
      throw error;
    }
  }

  /**
   * Send push notification to a single device
   */
  async sendToDevice(
    deviceToken: string,
    payload: PushNotificationPayload,
    userId?: number
  ): Promise<SendPushResult> {
    await this.initialize();

    if (!fcmConfig.enabled || fcmConfig.dryRun) {
      console.log('[Push Service] Dry run mode. Would send notification:', { deviceToken, payload });
      return { success: true, messageId: 'dry-run-' + Date.now() };
    }

    if (!this.app) {
      console.error('[Push Service] Firebase app not initialized');
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            sound: payload.sound || 'default',
            clickAction: payload.actionUrl,
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              badge: payload.badge,
              sound: payload.sound || 'default',
              contentAvailable: true
            }
          },
          headers: {
            'apns-priority': '10'
          }
        }
      };

      const messageId = await admin.messaging().send(message);

      console.log('[Push Service] Successfully sent message:', messageId);
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[Push Service] Error sending message:', error);

      // Check if token is invalid
      const invalidTokenCodes = [
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered'
      ];

      if (error.code && invalidTokenCodes.includes(error.code)) {
        console.log('[Push Service] Invalid token detected, marking device as inactive');

        if (userId) {
          await this.markDeviceInactive(deviceToken, userId);
        }

        return {
          success: false,
          error: error.message,
          invalidToken: true
        };
      }

      return {
        success: false,
        error: error.message || 'Unknown error',
        invalidToken: false
      };
    }
  }

  /**
   * Send push notification to multiple devices
   */
  async sendToDevices(
    deviceTokens: string[],
    payload: PushNotificationPayload,
    userId?: number
  ): Promise<{ successful: number; failed: number; results: SendPushResult[] }> {
    const results = await Promise.all(
      deviceTokens.map(token => this.sendToDevice(token, payload, userId))
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return { successful, failed, results };
  }

  /**
   * Send push notification to all devices for a user
   */
  async sendToUser(
    userId: number,
    payload: PushNotificationPayload
  ): Promise<{ successful: number; failed: number }> {
    // Get user's preferences
    const preferences = await prisma.pushNotificationPreference.findUnique({
      where: { userId }
    });

    // Check if push notifications are enabled
    if (!preferences || !preferences.pushEnabled) {
      console.log(`[Push Service] Push notifications disabled for user ${userId}`);
      return { successful: 0, failed: 0 };
    }

    // Check quiet hours
    if (await this.isQuietHours(userId)) {
      console.log(`[Push Service] User ${userId} is in quiet hours, skipping notification`);
      return { successful: 0, failed: 0 };
    }

    // Check rate limits
    if (await this.isRateLimited(userId)) {
      console.log(`[Push Service] User ${userId} has reached rate limit, skipping notification`);
      return { successful: 0, failed: 0 };
    }

    // Get active devices
    const devices = await prisma.userDevice.findMany({
      where: {
        userId,
        isActive: true
      }
    });

    if (devices.length === 0) {
      console.log(`[Push Service] No active devices for user ${userId}`);
      return { successful: 0, failed: 0 };
    }

    // Apply user preferences to payload
    const customizedPayload = { ...payload };
    if (!preferences.soundEnabled) {
      customizedPayload.sound = undefined;
    }

    // Send to all devices
    const deviceTokens = devices.map(d => d.deviceToken);
    const result = await this.sendToDevices(deviceTokens, customizedPayload, userId);

    // Update notification count
    await prisma.pushNotificationPreference.update({
      where: { userId },
      data: {
        totalNotificationsSent: { increment: result.successful },
        lastNotificationSentAt: new Date()
      }
    });

    return { successful: result.successful, failed: result.failed };
  }

  /**
   * Check if user is in quiet hours
   */
  async isQuietHours(userId: number): Promise<boolean> {
    const preferences = await prisma.pushNotificationPreference.findUnique({
      where: { userId }
    });

    if (!preferences || !preferences.quietHoursEnabled) {
      return false;
    }

    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const userTimezone = preferences.timezone || 'America/New_York';

    // Convert current time to user's timezone
    const userTime = new Date(
      now.toLocaleString('en-US', { timeZone: userTimezone })
    );

    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // Parse quiet hours
    const [startHour, startMinute] = preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = preferences.quietHoursEnd.split(':').map(Number);
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Handle quiet hours that span midnight
    if (startTimeInMinutes > endTimeInMinutes) {
      return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes;
    } else {
      return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes;
    }
  }

  /**
   * Check if user has reached rate limit
   */
  async isRateLimited(userId: number): Promise<boolean> {
    const preferences = await prisma.pushNotificationPreference.findUnique({
      where: { userId }
    });

    if (!preferences) {
      return false;
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Note: This would ideally use a separate notification history table
    // For now, we'll use a simplified check based on lastNotificationSentAt

    // If no notifications sent yet, not rate limited
    if (!preferences.lastNotificationSentAt) {
      return false;
    }

    // Check hourly limit
    const hourlyCount = preferences.totalNotificationsSent; // Simplified
    if (hourlyCount >= preferences.maxNotificationsPerHour) {
      if (preferences.lastNotificationSentAt > oneHourAgo) {
        return true;
      }
    }

    // Check daily limit
    const dailyCount = preferences.totalNotificationsSent; // Simplified
    if (dailyCount >= preferences.maxNotificationsPerDay) {
      if (preferences.lastNotificationSentAt > oneDayAgo) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mark a device as inactive (when token is invalid)
   */
  async markDeviceInactive(deviceToken: string, userId: number): Promise<void> {
    try {
      await prisma.userDevice.updateMany({
        where: {
          deviceToken,
          userId
        },
        data: {
          isActive: false
        }
      });
      console.log(`[Push Service] Marked device ${deviceToken} as inactive`);
    } catch (error) {
      console.error('[Push Service] Error marking device inactive:', error);
    }
  }

  /**
   * Update device badge count
   */
  async updateBadgeCount(deviceToken: string, userId: number, count: number): Promise<void> {
    try {
      await prisma.userDevice.updateMany({
        where: {
          deviceToken,
          userId,
          platform: 'ios' // Badge is iOS-only
        },
        data: {
          badgeCount: count
        }
      });
    } catch (error) {
      console.error('[Push Service] Error updating badge count:', error);
    }
  }

  /**
   * Increment device badge count
   */
  async incrementBadgeCount(deviceToken: string, userId: number): Promise<void> {
    try {
      const device = await prisma.userDevice.findFirst({
        where: {
          deviceToken,
          userId,
          platform: 'ios'
        }
      });

      if (device) {
        await prisma.userDevice.update({
          where: { id: device.id },
          data: {
            badgeCount: device.badgeCount + 1
          }
        });
      }
    } catch (error) {
      console.error('[Push Service] Error incrementing badge count:', error);
    }
  }

  /**
   * Clear badge count for user's devices
   */
  async clearBadgeCount(userId: number): Promise<void> {
    try {
      await prisma.userDevice.updateMany({
        where: {
          userId,
          platform: 'ios'
        },
        data: {
          badgeCount: 0
        }
      });
    } catch (error) {
      console.error('[Push Service] Error clearing badge count:', error);
    }
  }

  /**
   * Send notification to topic subscribers
   */
  async sendToTopic(topic: string, payload: PushNotificationPayload): Promise<SendPushResult> {
    await this.initialize();

    if (!fcmConfig.enabled || fcmConfig.dryRun) {
      console.log('[Push Service] Dry run mode. Would send to topic:', { topic, payload });
      return { success: true, messageId: 'dry-run-topic-' + Date.now() };
    }

    if (!this.app) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data
      };

      const messageId = await admin.messaging().send(message);
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[Push Service] Error sending to topic:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe device to a topic
   */
  async subscribeToTopic(deviceTokens: string[], topic: string): Promise<void> {
    await this.initialize();

    if (!fcmConfig.enabled || fcmConfig.dryRun) {
      console.log('[Push Service] Dry run mode. Would subscribe to topic:', { deviceTokens, topic });
      return;
    }

    if (!this.app) {
      throw new Error('Firebase not initialized');
    }

    try {
      await admin.messaging().subscribeToTopic(deviceTokens, topic);
      console.log(`[Push Service] Subscribed ${deviceTokens.length} devices to topic: ${topic}`);
    } catch (error) {
      console.error('[Push Service] Error subscribing to topic:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe device from a topic
   */
  async unsubscribeFromTopic(deviceTokens: string[], topic: string): Promise<void> {
    await this.initialize();

    if (!fcmConfig.enabled || fcmConfig.dryRun) {
      console.log('[Push Service] Dry run mode. Would unsubscribe from topic:', { deviceTokens, topic });
      return;
    }

    if (!this.app) {
      throw new Error('Firebase not initialized');
    }

    try {
      await admin.messaging().unsubscribeFromTopic(deviceTokens, topic);
      console.log(`[Push Service] Unsubscribed ${deviceTokens.length} devices from topic: ${topic}`);
    } catch (error) {
      console.error('[Push Service] Error unsubscribing from topic:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new PushService();
