/**
 * Data Enrichment Service
 *
 * Enriches bills with additional data from detailed API endpoints.
 * The /bill list endpoint returns minimal data, so this service fetches
 * full details for important bills (e.g., watchlisted, high-priority).
 */

import { PrismaClient } from '@prisma/client';
import { CongressApi } from '../congress';

const prisma = new PrismaClient();

export interface EnrichmentOptions {
  billIds?: number[];
  watchlistedOnly?: boolean;
  missingSponsorsOnly?: boolean;
  limit?: number;
  daysOld?: number; // Enrich bills not enriched in X days
}

export interface EnrichmentResult {
  billsProcessed: number;
  billsEnriched: number;
  billsSkipped: number;
  errors: Array<{ billId: number; error: string }>;
  duration: number;
}

/**
 * Bill Enrichment Service
 *
 * Fetches full bill details to supplement list endpoint data
 */
export class BillEnrichmentService {
  /**
   * Enrich bills with full details from individual API calls
   */
  async enrichBills(options: EnrichmentOptions = {}): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const result: EnrichmentResult = {
      billsProcessed: 0,
      billsEnriched: 0,
      billsSkipped: 0,
      errors: [],
      duration: 0,
    };

    console.log('[Enrichment] Starting enrichment with options:', options);

    try {
      // Find bills that need enrichment
      const billsToEnrich = await this.findBillsNeedingEnrichment(options);

      console.log(`[Enrichment] Found ${billsToEnrich.length} bills to enrich`);

      // Process each bill
      for (const bill of billsToEnrich) {
        try {
          result.billsProcessed++;

          // Fetch full bill details from Congress API
          const fullBill = await CongressApi.bills.getBillById({
            congress: bill.congress,
            billType: bill.billType,
            billNumber: bill.billNumber,
          });

          if (!fullBill) {
            result.billsSkipped++;
            continue;
          }

          // Check if enrichment is needed
          const needsEnrichment = this.doesBillNeedEnrichment(bill, fullBill);

          if (!needsEnrichment) {
            result.billsSkipped++;
            continue;
          }

          // Update bill with enriched data
          await prisma.bill.update({
            where: { id: bill.id },
            data: {
              // Sponsor information (the main enrichment)
              sponsorBioguideId: fullBill.sponsors?.[0]?.bioguideId,
              sponsorFirstName: fullBill.sponsors?.[0]?.firstName,
              sponsorLastName: fullBill.sponsors?.[0]?.lastName,
              sponsorFullName: fullBill.sponsors?.[0]?.fullName,
              sponsorState: fullBill.sponsors?.[0]?.state,
              sponsorParty: fullBill.sponsors?.[0]?.party,

              // Additional enriched fields
              constitutionalAuthorityStatementText: fullBill.constitutionalAuthorityStatementText,

              // Track enrichment
              lastEnrichedAt: new Date(),
              enrichmentAttempts: (bill.enrichmentAttempts || 0) + 1,

              // Update API response data with full details
              apiResponseData: fullBill as any,
            },
          });

          result.billsEnriched++;
          console.log(
            `[Enrichment] Enriched bill: ${bill.congress}-${bill.billType}-${bill.billNumber}`
          );

          // Small delay to respect API rate limits
          await this.delay(100);
        } catch (error) {
          console.error(`[Enrichment] Error enriching bill ${bill.id}:`, error);
          result.errors.push({
            billId: bill.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      result.duration = Date.now() - startTime;
      console.log('[Enrichment] Enrichment completed:', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      console.error('[Enrichment] Enrichment failed:', error);
      result.errors.push({
        billId: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Find bills that need enrichment based on criteria
   */
  private async findBillsNeedingEnrichment(
    options: EnrichmentOptions
  ): Promise<any[]> {
    const where: any = {};

    // Specific bill IDs
    if (options.billIds && options.billIds.length > 0) {
      where.id = { in: options.billIds };
    }

    // Only watchlisted bills
    if (options.watchlistedOnly) {
      where.watchedBy = {
        some: {},
      };
    }

    // Bills missing sponsor data
    if (options.missingSponsorsOnly !== false) {
      where.sponsorFullName = null;
    }

    // Bills not enriched recently
    if (options.daysOld) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.daysOld);

      where.OR = [
        { lastEnrichedAt: null },
        { lastEnrichedAt: { lt: cutoffDate } },
      ];
    }

    // Query bills
    const bills = await prisma.bill.findMany({
      where,
      take: options.limit || 50,
      orderBy: [
        { watchlists: { _count: 'desc' } }, // Prioritize watchlisted bills
        { updateDate: 'desc' }, // Then most recently updated
      ],
    });

    return bills;
  }

  /**
   * Check if a bill needs enrichment by comparing existing vs full data
   */
  private doesBillNeedEnrichment(existingBill: any, fullBill: any): boolean {
    // Missing sponsor data
    if (!existingBill.sponsorFullName && fullBill.sponsors?.[0]) {
      return true;
    }

    // Missing constitutional authority
    if (
      !existingBill.constitutionalAuthorityStatementText &&
      fullBill.constitutionalAuthorityStatementText
    ) {
      return true;
    }

    // Haven't enriched recently (7 days)
    if (!existingBill.lastEnrichedAt) {
      return true;
    }

    const daysSinceEnrichment =
      (Date.now() - new Date(existingBill.lastEnrichedAt).getTime()) /
      (1000 * 60 * 60 * 24);

    return daysSinceEnrichment > 7;
  }

  /**
   * Enrich watchlisted bills specifically
   */
  async enrichWatchlistedBills(limit = 100): Promise<EnrichmentResult> {
    console.log('[Enrichment] Enriching watchlisted bills');

    return this.enrichBills({
      watchlistedOnly: true,
      limit,
    });
  }

  /**
   * Enrich bills missing sponsor data
   */
  async enrichBillsMissingSponsor(limit = 100): Promise<EnrichmentResult> {
    console.log('[Enrichment] Enriching bills missing sponsor data');

    return this.enrichBills({
      missingSponsorsOnly: true,
      limit,
    });
  }

  /**
   * Helper: Delay execution (for rate limiting)
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let enrichmentService: BillEnrichmentService | null = null;

/**
 * Get the BillEnrichmentService singleton instance
 */
export function getEnrichmentService(): BillEnrichmentService {
  if (!enrichmentService) {
    enrichmentService = new BillEnrichmentService();
  }
  return enrichmentService;
}

export default BillEnrichmentService;
