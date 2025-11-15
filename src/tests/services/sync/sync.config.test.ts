/**
 * Tests for Sync Configuration
 */

describe('Sync Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default configuration', () => {
    const { syncConfig } = require('../../../app/services/sync/sync.config');

    expect(syncConfig.billSyncWindowDays).toBe(14);
    expect(syncConfig.billSyncPageSize).toBe(250);
    expect(syncConfig.memberSyncPageSize).toBe(250);
    expect(syncConfig.maxRequestsPerHour).toBe(5000);
    expect(syncConfig.requestThreshold).toBe(500);
    expect(syncConfig.syncEnabled).toBe(true);
    expect(syncConfig.cronSchedule).toBe('0 * * * *');
  });

  it('should respect environment variable overrides', () => {
    process.env.CONGRESS_SYNC_WINDOW_DAYS = '7';
    process.env.CONGRESS_SYNC_PAGE_SIZE = '100';
    process.env.CONGRESS_SYNC_ENABLED = 'false';
    process.env.CRON_SECRET = 'test-secret';

    const { syncConfig } = require('../../../app/services/sync/sync.config');

    expect(syncConfig.billSyncWindowDays).toBe(7);
    expect(syncConfig.billSyncPageSize).toBe(100);
    expect(syncConfig.syncEnabled).toBe(false);
    expect(syncConfig.cronSecret).toBe('test-secret');
  });
});
