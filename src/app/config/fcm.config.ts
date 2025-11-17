/**
 * Firebase Cloud Messaging (FCM) Configuration
 *
 * Handles configuration for push notifications via Firebase Admin SDK.
 */

export interface FcmConfig {
  enabled: boolean;
  serviceAccountPath?: string;
  serviceAccountJson?: string;
  projectId?: string;
  dryRun: boolean;
}

/**
 * Load FCM configuration from environment variables
 */
const fcmConfig: FcmConfig = {
  enabled: process.env.FCM_ENABLED === 'true',
  serviceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH,
  serviceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON,
  projectId: process.env.FCM_PROJECT_ID,
  dryRun: process.env.FCM_DRY_RUN === 'true' || process.env.NODE_ENV === 'test'
};

// Validate configuration in production
if (fcmConfig.enabled && process.env.NODE_ENV === 'production') {
  if (!fcmConfig.serviceAccountPath && !fcmConfig.serviceAccountJson) {
    console.warn(
      '[FCM Config] Warning: FCM_ENABLED is true but no service account credentials provided. ' +
      'Set FCM_SERVICE_ACCOUNT_PATH or FCM_SERVICE_ACCOUNT_JSON environment variable.'
    );
  }

  if (!fcmConfig.projectId) {
    console.warn(
      '[FCM Config] Warning: FCM_PROJECT_ID is not set. This may cause issues with FCM initialization.'
    );
  }
}

export default fcmConfig;
