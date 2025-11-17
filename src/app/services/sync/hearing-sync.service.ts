/**
 * Hearing Sync Service
 *
 * Handles synchronization of committee hearings from Congress.gov API.
 * Hearings are time-sensitive and should be synced frequently.
 */

import { PrismaClient, Hearing } from '@prisma/client';
import { CongressApi } from '../congress';

const prisma = new PrismaClient();

/**
 * Sync options for hearing synchronization
 */
export interface HearingSyncOptions {
  congress?: number;
  chamber?: 'House' | 'Senate' | 'Joint';
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Sync result statistics
 */
export interface HearingSyncResult {
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  errors: Array<{ hearingId?: string; error: string }>;
  duration: number;
}

/**
 * HearingSyncService - Synchronizes hearings from Congress.gov API
 */
export class HearingSyncService {
  /**
   * Sync hearings based on options
   */
  async syncHearings(options: HearingSyncOptions = {}): Promise<HearingSyncResult> {
    const startTime = Date.now();
    const result: HearingSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      errors: [],
      duration: 0,
    };

    console.log('[HearingSync] Starting sync with options:', options);

    try {
      // Default to current congress if not specified
      const congress = options.congress || 118;

      // Default date range: last 30 days to 30 days ahead
      const dateFrom = options.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = options.dateTo || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Fetch hearings from Congress API
      const apiResponse = await CongressApi.hearings.listHearings({
        congress,
        chamber: options.chamber,
        fromDateTime: dateFrom.toISOString(),
        toDateTime: dateTo.toISOString(),
        limit: options.limit || 100,
        offset: options.offset || 0,
      });

      const hearings = apiResponse.hearings || [];
      result.recordsFetched = hearings.length;

      console.log(`[HearingSync] Fetched ${hearings.length} hearings from API`);

      // Process each hearing
      for (const apiHearing of hearings) {
        try {
          await this.processHearing(apiHearing, result);
        } catch (error) {
          console.error(
            `[HearingSync] Error processing hearing ${apiHearing.jacketNumber}:`,
            error
          );
          result.errors.push({
            hearingId: apiHearing.jacketNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.duration = Date.now() - startTime;
      console.log('[HearingSync] Sync completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[HearingSync] Sync failed:', error);
      result.errors.push({
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Sync upcoming hearings (next 14 days)
   */
  async syncUpcoming(): Promise<HearingSyncResult> {
    console.log('[HearingSync] Syncing upcoming hearings');

    return this.syncHearings({
      dateFrom: new Date(),
      dateTo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      limit: 200,
    });
  }

  /**
   * Sync recent hearings (last 7 days)
   */
  async syncRecent(): Promise<HearingSyncResult> {
    console.log('[HearingSync] Syncing recent hearings');

    return this.syncHearings({
      dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dateTo: new Date(),
      limit: 200,
    });
  }

  /**
   * Process a single hearing from API response
   */
  private async processHearing(apiHearing: any, result: HearingSyncResult): Promise<void> {
    const hearingData = this.mapApiHearingToModel(apiHearing);

    // Find existing hearing by jacket number and congress
    const existingHearing = await prisma.hearing.findFirst({
      where: {
        jacketNumber: apiHearing.jacketNumber,
        congress: apiHearing.congress,
      },
    });

    // Check if data actually changed
    const hasChanges = existingHearing
      ? this.hasSignificantChanges(existingHearing, hearingData)
      : true;

    if (hasChanges) {
      // Upsert hearing
      if (existingHearing) {
        await prisma.hearing.update({
          where: { id: existingHearing.id },
          data: hearingData,
        });
        result.recordsUpdated++;
        console.log(`[HearingSync] Updated hearing: ${apiHearing.jacketNumber}`);
      } else {
        await prisma.hearing.create({
          data: hearingData,
        });
        result.recordsCreated++;
        console.log(`[HearingSync] Created hearing: ${apiHearing.jacketNumber}`);
      }
    } else {
      result.recordsUnchanged++;
    }
  }

  /**
   * Map API hearing response to Prisma model
   */
  private mapApiHearingToModel(apiHearing: any): any {
    return {
      congress: apiHearing.congress,
      chamber: apiHearing.chamber,
      jacketNumber: apiHearing.jacketNumber,
      title: apiHearing.title,
      date: apiHearing.date ? new Date(apiHearing.date) : null,
      location: apiHearing.location,
      committeeCode: apiHearing.committeeCode,
      committeeSystemCode: apiHearing.committees?.[0]?.systemCode,
      congressGovUrl: apiHearing.url,
      apiResponseData: apiHearing,
    };
  }

  /**
   * Check if hearing data has significant changes
   */
  private hasSignificantChanges(existing: Hearing, updated: Partial<Hearing>): boolean {
    // Compare key fields that would warrant an update
    const significantFields: (keyof Hearing)[] = ['title', 'date', 'location', 'committeeCode'];

    for (const field of significantFields) {
      const existingValue = existing[field];
      const updatedValue = updated[field];

      // Handle Date comparison
      if (existingValue instanceof Date && updatedValue instanceof Date) {
        if (existingValue.getTime() !== updatedValue.getTime()) {
          return true;
        }
      } else if (existingValue !== updatedValue) {
        return true;
      }
    }

    return false;
  }
}

// Singleton instance
let hearingSyncService: HearingSyncService | null = null;

/**
 * Get the HearingSyncService singleton instance
 */
export function getHearingSyncService(): HearingSyncService {
  if (!hearingSyncService) {
    hearingSyncService = new HearingSyncService();
  }
  return hearingSyncService;
}
