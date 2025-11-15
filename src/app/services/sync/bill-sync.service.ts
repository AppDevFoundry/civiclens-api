/**
 * Bill Sync Service
 *
 * Handles synchronization of bills from Congress.gov API to our database.
 * Includes incremental sync logic, change detection, and relationship tracking.
 */

import { PrismaClient, Bill } from '@prisma/client';
import { CongressApi } from '../congress';
import { getChangeDetectionService, ChangeDetectionService } from './change-detection.service';
import { getErrorHandler } from './error-handler.service';

const prisma = new PrismaClient();

/**
 * Sync options for bill synchronization
 */
export interface BillSyncOptions {
  congress?: number;
  billType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  priority?: 'active' | 'recent' | 'all'; // Determines which bills to sync
}

/**
 * Sync result statistics
 */
export interface BillSyncResult {
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  changesDetected: number;
  errors: Array<{ billId?: string; error: string }>;
  duration: number; // milliseconds
}

/**
 * BillSyncService - Synchronizes bills from Congress.gov API
 */
export class BillSyncService {
  private changeDetection: ChangeDetectionService;
  private errorHandler = getErrorHandler();

  constructor() {
    this.changeDetection = getChangeDetectionService();
  }

  /**
   * Sync bills based on options
   */
  async syncBills(options: BillSyncOptions = {}): Promise<BillSyncResult> {
    const startTime = Date.now();
    const result: BillSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      changesDetected: 0,
      errors: [],
      duration: 0,
    };

    console.log('[BillSync] Starting sync with options:', options);

    try {
      // Determine date range for sync
      const { dateFrom, dateTo } = this.determineDateRange(options);

      // Fetch bills from Congress API with automatic retry on failures
      // Note: Congress.gov API doesn't support fromDateTime/toDateTime filters on /bill endpoint
      // We'll fetch recent bills by congress and filter/sort by updateDate
      const apiResponse = await this.errorHandler.withRetry(
        async () => {
          return await CongressApi.bills.listBills({
            congress: options.congress || 118,
            billType: options.billType,
            limit: options.limit || 100,
            offset: options.offset || 0,
            sort: 'updateDate desc', // Most recently updated first
          });
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
        },
        { operation: 'listBills', options }
      );

      const bills = apiResponse.bills || [];
      result.recordsFetched = bills.length;

      console.log(`[BillSync] Fetched ${bills.length} bills from API`);

      // Process each bill
      for (const apiBill of bills) {
        try {
          await this.processBill(apiBill, result);
        } catch (error) {
          console.error(
            `[BillSync] Error processing bill ${apiBill.congress}-${apiBill.type}-${apiBill.number}:`,
            error
          );
          result.errors.push({
            billId: `${apiBill.congress}-${apiBill.type}-${apiBill.number}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.duration = Date.now() - startTime;
      console.log('[BillSync] Sync completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[BillSync] Sync failed:', error);
      result.errors.push({
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Sync a single bill by congress/type/number
   */
  async syncSingleBill(
    congress: number,
    billType: string,
    billNumber: number
  ): Promise<BillSyncResult> {
    const startTime = Date.now();
    const result: BillSyncResult = {
      recordsFetched: 1,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      changesDetected: 0,
      errors: [],
      duration: 0,
    };

    console.log(`[BillSync] Syncing single bill: ${congress}-${billType}-${billNumber}`);

    try {
      const apiBill = await this.errorHandler.withRetry(
        async () => {
          return await CongressApi.bills.getBillById({
            congress,
            billType,
            billNumber,
          });
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
        },
        { operation: 'getBillById', congress, billType, billNumber }
      );

      if (apiBill) {
        await this.processBill(apiBill, result);
      }

      result.duration = Date.now() - startTime;
      console.log('[BillSync] Single bill sync completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error(`[BillSync] Single bill sync failed:`, error);
      result.errors.push({
        billId: `${congress}-${billType}-${billNumber}`,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Sync bills that haven't been updated recently (based on priority)
   */
  async syncStale(hours = 24, limit = 100): Promise<BillSyncResult> {
    console.log(`[BillSync] Syncing stale bills (not updated in ${hours} hours)`);

    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Find bills that haven't been synced recently, prioritize high-priority bills
    const staleBills = await prisma.bill.findMany({
      where: {
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: cutoffDate } },
        ],
      },
      orderBy: [
        { priority: 'desc' }, // High priority first
        { lastSyncedAt: 'asc' }, // Oldest sync first
      ],
      take: limit,
    });

    console.log(`[BillSync] Found ${staleBills.length} stale bills to sync`);

    const startTime = Date.now();
    const result: BillSyncResult = {
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      changesDetected: 0,
      errors: [],
      duration: 0,
    };

    for (const bill of staleBills) {
      try {
        const singleResult = await this.syncSingleBill(
          bill.congress,
          bill.billType,
          bill.billNumber
        );

        // Aggregate results
        result.recordsFetched += singleResult.recordsFetched;
        result.recordsCreated += singleResult.recordsCreated;
        result.recordsUpdated += singleResult.recordsUpdated;
        result.recordsUnchanged += singleResult.recordsUnchanged;
        result.changesDetected += singleResult.changesDetected;
        result.errors.push(...singleResult.errors);
      } catch (error) {
        console.error(
          `[BillSync] Error syncing stale bill ${bill.congress}-${bill.billType}-${bill.billNumber}:`,
          error
        );
        result.errors.push({
          billId: `${bill.congress}-${bill.billType}-${bill.billNumber}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    result.duration = Date.now() - startTime;
    console.log('[BillSync] Stale sync completed:', result);

    return result;
  }

  /**
   * Process a single bill from API response
   */
  private async processBill(apiBill: any, result: BillSyncResult): Promise<void> {
    const billKey = {
      congress: apiBill.congress,
      billType: apiBill.type,
      billNumber: parseInt(String(apiBill.number), 10), // Ensure it's an integer
    };

    // Find existing bill
    const existingBill = await prisma.bill.findUnique({
      where: {
        congress_billType_billNumber: billKey,
      },
    });

    // Prepare bill data
    const billData = this.mapApiBillToModel(apiBill);

    // Upsert bill
    const updatedBill = await prisma.bill.upsert({
      where: {
        congress_billType_billNumber: billKey,
      },
      create: {
        ...billData,
        lastSyncedAt: new Date(),
        syncAttempts: 1,
      },
      update: {
        ...billData,
        lastSyncedAt: new Date(),
        syncAttempts: existingBill ? existingBill.syncAttempts + 1 : 1,
      },
    });

    // Track if this is create or update
    if (!existingBill) {
      result.recordsCreated++;
      console.log(
        `[BillSync] Created bill: ${billKey.congress}-${billKey.billType}-${billKey.billNumber}`
      );
    } else {
      // Detect changes
      const changes = await this.changeDetection.detectBillChanges(existingBill, updatedBill);

      if (changes.length > 0) {
        result.recordsUpdated++;
        result.changesDetected += changes.length;

        // Log changes
        await this.changeDetection.logChanges(updatedBill.id, changes);

        console.log(
          `[BillSync] Updated bill: ${billKey.congress}-${billKey.billType}-${billKey.billNumber} (${changes.length} changes)`
        );
      } else {
        result.recordsUnchanged++;
      }
    }
  }

  /**
   * Map API bill response to Prisma model
   */
  private mapApiBillToModel(apiBill: any): any {
    return {
      congress: apiBill.congress,
      billType: apiBill.type,
      billNumber: parseInt(String(apiBill.number), 10),
      title: apiBill.title,
      originChamber: apiBill.originChamber,
      originChamberCode: apiBill.originChamberCode,
      updateDate: apiBill.updateDate ? new Date(apiBill.updateDate) : null,
      updateDateIncludingText: apiBill.updateDateIncludingText
        ? new Date(apiBill.updateDateIncludingText)
        : null,
      introducedDate: apiBill.introducedDate ? new Date(apiBill.introducedDate) : null,
      latestActionDate: apiBill.latestAction?.actionDate
        ? new Date(apiBill.latestAction.actionDate)
        : null,
      latestActionText: apiBill.latestAction?.text,
      policyArea: apiBill.policyArea?.name,
      constitutionalAuthorityStatementText: apiBill.constitutionalAuthorityStatementText,
      sponsorBioguideId: apiBill.sponsors?.[0]?.bioguideId,
      sponsorFirstName: apiBill.sponsors?.[0]?.firstName,
      sponsorLastName: apiBill.sponsors?.[0]?.lastName,
      sponsorFullName: apiBill.sponsors?.[0]?.fullName,
      sponsorState: apiBill.sponsors?.[0]?.state,
      sponsorParty: apiBill.sponsors?.[0]?.party,
      lawNumber: apiBill.laws?.[0]?.number,
      isLaw: Boolean(apiBill.laws && apiBill.laws.length > 0),
      congressGovUrl: apiBill.url,
      apiResponseData: apiBill,
      lastChangedAt: apiBill.updateDate ? new Date(apiBill.updateDate) : new Date(),
    };
  }

  /**
   * Determine date range for sync based on options
   */
  private determineDateRange(options: BillSyncOptions): {
    dateFrom?: Date;
    dateTo?: Date;
  } {
    if (options.dateFrom || options.dateTo) {
      return {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      };
    }

    // Default: last 30 days
    if (options.priority === 'recent' || !options.priority) {
      return {
        dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dateTo: new Date(),
      };
    }

    // For 'active', focus on last 90 days
    if (options.priority === 'active') {
      return {
        dateFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        dateTo: new Date(),
      };
    }

    // For 'all', no date filter
    return {};
  }
}

// Singleton instance
let billSyncService: BillSyncService | null = null;

/**
 * Get the BillSyncService singleton instance
 */
export function getBillSyncService(): BillSyncService {
  if (!billSyncService) {
    billSyncService = new BillSyncService();
  }
  return billSyncService;
}
