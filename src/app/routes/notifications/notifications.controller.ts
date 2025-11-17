/**
 * Notifications Controller
 *
 * API endpoints for managing user notification preferences and delivery.
 */

import { Router, Request, Response } from 'express';
import auth from '../auth/auth';
import { getNotificationService, getEmailService, pushService } from '../../services/notifications';
import prisma from '../../../prisma/prisma-client';

const router = Router();
const notificationService = getNotificationService();
const emailService = getEmailService();

/**
 * Get user's notification preferences
 * GET /api/notifications/preferences
 */
router.get('/notifications/preferences', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const preferences = await notificationService.getUserPreferences(userId);
    res.json({ preferences });
  } catch (error) {
    console.error('[Notifications] Get preferences error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get preferences',
    });
  }
});

/**
 * Update user's notification preferences
 * PUT /api/notifications/preferences
 */
router.put('/notifications/preferences', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const updates = req.body;

    // Validate updates (basic validation)
    const allowedFields = [
      'emailEnabled',
      'emailAddress',
      'digestFrequency',
      'digestTime',
      'timezone',
    ];

    const filteredUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    const preferences = await notificationService.updateUserPreferences(userId, filteredUpdates);

    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    console.error('[Notifications] Update preferences error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update preferences',
    });
  }
});

/**
 * Unsubscribe from notifications via token
 * GET /api/notifications/unsubscribe/:token
 */
router.get('/notifications/unsubscribe/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const preferences = await notificationService.unsubscribeByToken(token);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            }
            .success {
              background: #d4edda;
              border: 1px solid #c3e6cb;
              color: #155724;
              padding: 15px;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✓ You've been unsubscribed</h2>
            <p>You will no longer receive email notifications from Congress Tracker.</p>
            <p>You can re-enable notifications anytime from your account settings.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[Notifications] Unsubscribe error:', error);
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            }
            .error {
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              color: #721c24;
              padding: 15px;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Invalid unsubscribe link</h2>
            <p>This unsubscribe link is invalid or has expired.</p>
            <p>Please contact support if you continue to have issues.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * Track notification open (via tracking pixel)
 * GET /api/notifications/:id/track/open
 */
router.get('/notifications/:id/track/open', async (req: Request, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    await notificationService.trackOpen(notificationId);

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.end(pixel);
  } catch (error) {
    // Silently fail for tracking pixels
    res.status(200).end();
  }
});

/**
 * Track notification click
 * GET /api/notifications/:id/track/click
 */
router.get('/notifications/:id/track/click', async (req: Request, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const redirectUrl = req.query.url as string;

    await notificationService.trackClick(notificationId);

    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('[Notifications] Track click error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to track click',
    });
  }
});

/**
 * Get notification history for current user
 * GET /api/notifications/history
 */
router.get('/notifications/history', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const history = await notificationService.getHistory(userId, limit);

    res.json({ history });
  } catch (error) {
    console.error('[Notifications] Get history error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get history',
    });
  }
});

/**
 * Get notification statistics
 * GET /api/notifications/stats
 */
router.get('/notifications/stats', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
    const stats = await notificationService.getStats(hours);

    res.json({ stats });
  } catch (error) {
    console.error('[Notifications] Get stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

// ============================================================================
// Admin Endpoints
// ============================================================================

/**
 * Simple admin authentication check
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
 * Process pending notifications (admin)
 * POST /api/notifications/admin/process
 */
router.post('/notifications/admin/process', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const limit = req.body.limit || 100;

    await emailService.processPendingNotifications(limit);

    const stats = await notificationService.getStats(1);

    res.json({
      success: true,
      message: 'Processed pending notifications',
      stats,
    });
  } catch (error) {
    console.error('[Notifications] Process pending error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process notifications',
    });
  }
});

/**
 * Send digest emails (admin)
 * POST /api/notifications/admin/digest
 */
router.post('/notifications/admin/digest', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const frequency = req.body.frequency || 'daily';

    if (!['daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency. Must be "daily" or "weekly"' });
    }

    await emailService.sendDigests(frequency);

    res.json({
      success: true,
      message: `Sent ${frequency} digest emails`,
    });
  } catch (error) {
    console.error('[Notifications] Send digest error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send digests',
    });
  }
});

/**
 * Test email configuration (admin)
 * POST /api/notifications/admin/test-email
 */
router.post('/notifications/admin/test-email', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Email address required' });
    }

    const result = await emailService.testEmail(to);

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('[Notifications] Test email error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send test email',
    });
  }
});

// ============================================================================
// Push Notification Device Management
// ============================================================================

/**
 * Register a new device for push notifications
 * POST /api/devices
 * Body: { deviceToken, platform, deviceName?, deviceModel?, osVersion?, appVersion? }
 */
router.post('/devices', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { deviceToken, platform, deviceName, deviceModel, osVersion, appVersion } = req.body;

    if (!deviceToken || !platform) {
      return res.status(400).json({ error: 'deviceToken and platform are required' });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be "ios" or "android"' });
    }

    // Check if device already exists
    const existingDevice = await prisma.userDevice.findFirst({
      where: {
        userId,
        deviceToken
      }
    });

    let device;
    if (existingDevice) {
      // Update existing device
      device = await prisma.userDevice.update({
        where: { id: existingDevice.id },
        data: {
          platform,
          deviceName,
          deviceModel,
          osVersion,
          appVersion,
          isActive: true,
          lastActiveAt: new Date()
        }
      });
    } else {
      // Create new device
      device = await prisma.userDevice.create({
        data: {
          userId,
          deviceToken,
          platform,
          deviceName,
          deviceModel,
          osVersion,
          appVersion,
          isActive: true,
          lastActiveAt: new Date()
        }
      });
    }

    res.json({
      success: true,
      device: {
        id: device.id,
        deviceToken: device.deviceToken,
        platform: device.platform,
        deviceName: device.deviceName,
        isActive: device.isActive,
        createdAt: device.createdAt
      }
    });
  } catch (error) {
    console.error('[Push] Register device error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to register device'
    });
  }
});

/**
 * Get user's devices
 * GET /api/devices
 */
router.get('/devices', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const devices = await prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' }
    });

    res.json({
      devices: devices.map(d => ({
        id: d.id,
        platform: d.platform,
        deviceName: d.deviceName,
        deviceModel: d.deviceModel,
        osVersion: d.osVersion,
        isActive: d.isActive,
        badgeCount: d.badgeCount,
        lastActiveAt: d.lastActiveAt,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    console.error('[Push] Get devices error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get devices'
    });
  }
});

/**
 * Update device info
 * PUT /api/devices/:deviceToken
 * Body: { deviceName?, deviceModel?, osVersion?, appVersion? }
 */
router.put('/devices/:deviceToken', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;
  const { deviceToken } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { deviceName, deviceModel, osVersion, appVersion } = req.body;

    const device = await prisma.userDevice.findFirst({
      where: {
        userId,
        deviceToken
      }
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const updatedDevice = await prisma.userDevice.update({
      where: { id: device.id },
      data: {
        deviceName,
        deviceModel,
        osVersion,
        appVersion,
        lastActiveAt: new Date()
      }
    });

    res.json({
      success: true,
      device: {
        id: updatedDevice.id,
        deviceToken: updatedDevice.deviceToken,
        platform: updatedDevice.platform,
        deviceName: updatedDevice.deviceName,
        isActive: updatedDevice.isActive
      }
    });
  } catch (error) {
    console.error('[Push] Update device error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update device'
    });
  }
});

/**
 * Unregister a device
 * DELETE /api/devices/:deviceToken
 */
router.delete('/devices/:deviceToken', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;
  const { deviceToken } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const device = await prisma.userDevice.findFirst({
      where: {
        userId,
        deviceToken
      }
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await prisma.userDevice.delete({
      where: { id: device.id }
    });

    res.json({ success: true, message: 'Device unregistered successfully' });
  } catch (error) {
    console.error('[Push] Unregister device error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to unregister device'
    });
  }
});

/**
 * Update device badge count
 * PUT /api/devices/:deviceToken/badge
 * Body: { count: number }
 */
router.put('/devices/:deviceToken/badge', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;
  const { deviceToken } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { count } = req.body;

    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({ error: 'count must be a non-negative number' });
    }

    await pushService.updateBadgeCount(deviceToken, userId, count);

    res.json({ success: true, badgeCount: count });
  } catch (error) {
    console.error('[Push] Update badge error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update badge count'
    });
  }
});

// ============================================================================
// Push Notification Preferences
// ============================================================================

/**
 * Get user's push notification preferences
 * GET /api/push/preferences
 */
router.get('/push/preferences', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let preferences = await prisma.pushNotificationPreference.findUnique({
      where: { userId }
    });

    // Return default preferences if not set
    if (!preferences) {
      preferences = await prisma.pushNotificationPreference.create({
        data: { userId }
      });
    }

    res.json({ preferences });
  } catch (error) {
    console.error('[Push] Get preferences error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get preferences'
    });
  }
});

/**
 * Update user's push notification preferences
 * PUT /api/push/preferences
 * Body: { pushEnabled?, soundEnabled?, vibrationEnabled?, quietHoursEnabled?, ... }
 */
router.put('/push/preferences', auth.required, async (req: Request, res: Response) => {
  const userId = req.auth?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const updates = req.body;

    // Allowed fields for update
    const allowedFields = [
      'pushEnabled',
      'soundEnabled',
      'vibrationEnabled',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
      'timezone',
      'maxNotificationsPerDay',
      'maxNotificationsPerHour',
      'billCriteria',
      'memberCriteria',
      'keywordCriteria',
      'timingCriteria'
    ];

    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    // Upsert preferences
    const preferences = await prisma.pushNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...filteredUpdates
      },
      update: filteredUpdates
    });

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('[Push] Update preferences error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update preferences'
    });
  }
});

/**
 * Send test push notification (admin only)
 * POST /api/push/test
 * Body: { userId, title, body, data? }
 */
router.post('/push/test', async (req: Request, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'userId, title, and body are required' });
    }

    const result = await pushService.sendToUser(userId, {
      title,
      body,
      data
    });

    res.json({
      success: true,
      result: {
        successful: result.successful,
        failed: result.failed
      }
    });
  } catch (error) {
    console.error('[Push] Test push error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send test push'
    });
  }
});

export default router;
