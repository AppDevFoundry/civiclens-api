/**
 * Sync Service Configuration
 *
 * Configuration for Congress data sync jobs.
 */

export interface SyncConfig {
  // Bill sync settings
  billSyncWindowDays: number;     // Default days to look back for bill updates
  billSyncPageSize: number;       // Bills per API page

  // Member sync settings
  memberSyncPageSize: number;     // Members per API page

  // Rate limiting
  maxRequestsPerHour: number;     // Congress.gov rate limit
  requestThreshold: number;       // Stop sync when this many requests remain

  // Sync control
  syncEnabled: boolean;           // Master enable/disable

  // Cron settings
  cronSchedule: string;           // Cron expression for scheduled syncs
  cronSecret: string | undefined; // Secret for authenticating cron requests
}

/**
 * Load sync configuration from environment variables
 */
function loadSyncConfig(): SyncConfig {
  return {
    // Bill sync
    billSyncWindowDays: parseInt(process.env.CONGRESS_SYNC_WINDOW_DAYS || '14', 10),
    billSyncPageSize: parseInt(process.env.CONGRESS_SYNC_PAGE_SIZE || '250', 10),

    // Member sync
    memberSyncPageSize: parseInt(process.env.CONGRESS_SYNC_MEMBER_PAGE_SIZE || '250', 10),

    // Rate limiting (Congress.gov allows 5000 requests/hour)
    maxRequestsPerHour: 5000,
    requestThreshold: parseInt(process.env.CONGRESS_SYNC_REQUEST_THRESHOLD || '500', 10),

    // Control
    syncEnabled: process.env.CONGRESS_SYNC_ENABLED !== 'false',

    // Cron
    cronSchedule: process.env.CONGRESS_SYNC_CRON || '0 * * * *', // Hourly default
    cronSecret: process.env.CRON_SECRET,
  };
}

export const syncConfig = loadSyncConfig();

export default syncConfig;
