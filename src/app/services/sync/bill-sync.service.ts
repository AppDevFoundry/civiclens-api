/**
 * Bill Sync Service
 *
 * Incrementally syncs bills from Congress.gov API to the database.
 * Includes summaries, actions, subjects, cosponsors, and text versions.
 */

import prisma from '../../../prisma/prisma-client';
import congressApiClient from '../congress/congress.client';
import { Bill, BillDetail } from '../congress/congress.types';
import { syncConfig } from './sync.config';
import { SyncJob } from '@prisma/client';
import { createHash } from 'crypto';

export interface BillSyncResult {
  success: boolean;
  jobId: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  apiRequestsMade: number;
  duration: number;
  error?: string;
}

/**
 * Generate a bill slug from its components
 */
function generateBillSlug(congress: number, billType: string, billNumber: number): string {
  return `${congress}-${billType}-${billNumber}`;
}

/**
 * Sync bills from Congress.gov API
 *
 * Performs incremental sync based on updateDate.
 * On first run, syncs bills from the last N days (configured by billSyncWindowDays).
 */
export async function syncBills(): Promise<BillSyncResult> {
  const startTime = Date.now();

  // Create sync job record
  const job = await prisma.syncJob.create({
    data: {
      jobType: 'BILL_SYNC',
      status: 'RUNNING',
    },
  });

  console.info(`[bill-sync] Starting sync job ${job.id}`);

  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let apiRequestsMade = 0;

  try {
    // Determine sync start date from last successful sync or default window
    const lastSuccessfulSync = await prisma.syncJob.findFirst({
      where: {
        jobType: 'BILL_SYNC',
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });

    let fromDate: Date;
    if (lastSuccessfulSync?.cursor) {
      // Continue from last sync cursor
      fromDate = new Date(lastSuccessfulSync.cursor);
      console.info(`[bill-sync] Continuing from cursor: ${fromDate.toISOString()}`);
    } else {
      // First sync: use configured window
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - syncConfig.billSyncWindowDays);
      console.info(`[bill-sync] First sync, using ${syncConfig.billSyncWindowDays} day window from ${fromDate.toISOString()}`);
    }

    // Track the latest updateDate we process for cursor
    let latestUpdateDate = fromDate;

    // Get existing bill IDs for created/updated tracking
    const existingBillSlugs = new Set(
      (await prisma.bill.findMany({ select: { slug: true } }))
        .map(b => b.slug)
        .filter((s): s is string => s !== null)
    );

    // Fetch bills with pagination
    let offset = 0;
    const pageSize = syncConfig.billSyncPageSize;
    let hasMore = true;

    while (hasMore) {
      console.info(`[bill-sync] Fetching bills offset=${offset}, limit=${pageSize}`);

      // Fetch bill list from API
      // Format date without milliseconds (Congress.gov API doesn't accept them)
      const fromDateStr = fromDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const response = await congressApiClient.getCollection<Bill>('/bill', {
        limit: pageSize,
        offset,
        fromDateTime: fromDateStr,
      } as any);

      apiRequestsMade++;

      const bills = response.data || [];
      console.info(`[bill-sync] Received ${bills.length} bills`);

      // Process each bill
      for (const billSummary of bills) {
        const slug = generateBillSlug(billSummary.congress, billSummary.type, billSummary.number);
        const isNew = !existingBillSlugs.has(slug);

        try {
          // Fetch full bill details (API paths need lowercase bill type)
          const billType = billSummary.type.toLowerCase();
          const billPath = `/bill/${billSummary.congress}/${billType}/${billSummary.number}`;
          const billDetail = await congressApiClient.getDetail<BillDetail>(billPath);
          apiRequestsMade++;

          // Upsert the bill
          const upsertedBill = await upsertBill(billDetail, slug);

          // Fetch and store additional data for the bill
          await Promise.all([
            syncBillActions(upsertedBill.id, billSummary.congress, billType, billSummary.number),
            syncBillSubjects(upsertedBill.id, billSummary.congress, billType, billSummary.number),
            syncBillSummaries(upsertedBill.id, billSummary.congress, billType, billSummary.number),
            syncBillCosponsors(upsertedBill.id, billSummary.congress, billType, billSummary.number),
            syncBillTextVersions(upsertedBill.id, billSummary.congress, billType, billSummary.number),
          ]);

          // Track 5 API requests for the additional endpoints
          apiRequestsMade += 5;

          recordsProcessed++;
          if (isNew) {
            recordsCreated++;
            existingBillSlugs.add(slug);

            // Generate notification event for new bill
            await createBillIntroducedEvent(upsertedBill);
          } else {
            recordsUpdated++;

            // Check for status change and generate event if needed
            await checkBillStatusChange(upsertedBill, billDetail);
          }

          // Track latest update date for cursor
          if (billDetail.updateDate) {
            const updateDate = new Date(billDetail.updateDate);
            if (updateDate > latestUpdateDate) {
              latestUpdateDate = updateDate;
            }
          }

          console.info(`[bill-sync] Processed ${slug} (${isNew ? 'new' : 'update'})`);
        } catch (error) {
          console.error(`[bill-sync] Failed to process bill ${slug}:`, error);
          // Continue with next bill
        }

        // Rate limit protection
        if (apiRequestsMade >= syncConfig.maxRequestsPerHour - syncConfig.requestThreshold) {
          console.warn(`[bill-sync] Approaching rate limit at ${apiRequestsMade} requests`);
          hasMore = false;
          break;
        }
      }

      // Check if there are more pages
      if (!response.pagination?.next || bills.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    // Update job as completed with cursor for next run
    const duration = Date.now() - startTime;
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        cursor: latestUpdateDate.toISOString(),
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        apiRequestsMade,
        completedAt: new Date(),
      },
    });

    console.info(`[bill-sync] Completed job ${job.id} in ${duration}ms: ${recordsProcessed} bills (${recordsCreated} created, ${recordsUpdated} updated), ${apiRequestsMade} API requests`);

    return {
      success: true,
      jobId: job.id,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      apiRequestsMade,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    console.error(`[bill-sync] Failed job ${job.id}:`, error);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        apiRequestsMade,
        completedAt: new Date(),
        errorMessage,
        errorDetails: error instanceof Error ? { stack: error.stack } : null,
      },
    });

    return {
      success: false,
      jobId: job.id,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      apiRequestsMade,
      duration,
      error: errorMessage,
    };
  }
}

/**
 * Upsert a bill into the database
 */
async function upsertBill(bill: BillDetail, slug: string) {
  const sponsor = bill.sponsors?.[0];
  const isLaw = Boolean(bill.laws && bill.laws.length > 0);
  const lawNumber = isLaw && bill.laws ? bill.laws[0].number : null;

  return prisma.bill.upsert({
    where: {
      congress_billType_billNumber: {
        congress: bill.congress,
        billType: bill.type,
        billNumber: typeof bill.number === 'string' ? parseInt(bill.number, 10) : bill.number,
      },
    },
    update: {
      slug,
      title: bill.title || null,
      originChamber: bill.originChamber || null,
      originChamberCode: bill.originChamberCode || null,
      updateDate: bill.updateDate ? new Date(bill.updateDate) : null,
      updateDateIncludingText: bill.updateDateIncludingText ? new Date(bill.updateDateIncludingText) : null,
      introducedDate: bill.introducedDate ? new Date(bill.introducedDate) : null,
      latestActionDate: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate) : null,
      latestActionText: bill.latestAction?.text || null,
      policyArea: bill.policyArea?.name || null,
      sponsorBioguideId: sponsor?.bioguideId || null,
      sponsorFirstName: sponsor?.firstName || null,
      sponsorLastName: sponsor?.lastName || null,
      sponsorFullName: sponsor?.fullName || null,
      sponsorState: sponsor?.state || null,
      sponsorParty: sponsor?.party || null,
      lawNumber,
      isLaw,
      congressGovUrl: bill.url || `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.originChamber?.toLowerCase()}-bill/${bill.number}`,
      apiResponseData: bill as any,
      updatedAt: new Date(),
    },
    create: {
      slug,
      congress: bill.congress,
      billType: bill.type,
      billNumber: typeof bill.number === 'string' ? parseInt(bill.number, 10) : bill.number,
      title: bill.title || null,
      originChamber: bill.originChamber || null,
      originChamberCode: bill.originChamberCode || null,
      updateDate: bill.updateDate ? new Date(bill.updateDate) : null,
      updateDateIncludingText: bill.updateDateIncludingText ? new Date(bill.updateDateIncludingText) : null,
      introducedDate: bill.introducedDate ? new Date(bill.introducedDate) : null,
      latestActionDate: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate) : null,
      latestActionText: bill.latestAction?.text || null,
      policyArea: bill.policyArea?.name || null,
      sponsorBioguideId: sponsor?.bioguideId || null,
      sponsorFirstName: sponsor?.firstName || null,
      sponsorLastName: sponsor?.lastName || null,
      sponsorFullName: sponsor?.fullName || null,
      sponsorState: sponsor?.state || null,
      sponsorParty: sponsor?.party || null,
      lawNumber,
      isLaw,
      congressGovUrl: bill.url || `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.originChamber?.toLowerCase()}-bill/${bill.number}`,
      apiResponseData: bill as any,
    },
  });
}

/**
 * Sync bill actions (legislative history)
 */
async function syncBillActions(billId: number, congress: number, billType: string, billNumber: number) {
  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/actions`;
    const response = await congressApiClient.request<any>(path);
    const actions = response.data.actions || [];

    // Delete existing actions and replace
    await prisma.billAction.deleteMany({ where: { billId } });

    if (actions.length > 0) {
      await prisma.billAction.createMany({
        data: actions.map((action: any) => ({
          billId,
          actionCode: action.actionCode || null,
          actionDate: new Date(action.actionDate),
          text: action.text,
          type: action.type || null,
          actionTime: action.actionTime || null,
          chamber: action.sourceSystem?.name?.includes('House') ? 'House' :
                   action.sourceSystem?.name?.includes('Senate') ? 'Senate' : null,
          sourceSystemCode: action.sourceSystem?.code || null,
          sourceSystemName: action.sourceSystem?.name || null,
          committees: action.committees || null,
        })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to sync actions for bill ${billId}:`, error);
  }
}

/**
 * Sync bill subjects
 */
async function syncBillSubjects(billId: number, congress: number, billType: string, billNumber: number) {
  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/subjects`;
    const response = await congressApiClient.request<any>(path);
    const subjects = response.data.subjects;

    // Delete existing subjects and replace
    await prisma.billSubject.deleteMany({ where: { billId } });

    const subjectRecords: { billId: number; name: string; isPolicyArea: boolean }[] = [];

    // Add policy area as primary subject
    if (subjects?.policyArea?.name) {
      subjectRecords.push({
        billId,
        name: subjects.policyArea.name,
        isPolicyArea: true,
      });
    }

    // Add legislative subjects
    if (subjects?.legislativeSubjects) {
      for (const subject of subjects.legislativeSubjects) {
        subjectRecords.push({
          billId,
          name: subject.name,
          isPolicyArea: false,
        });
      }
    }

    if (subjectRecords.length > 0) {
      await prisma.billSubject.createMany({
        data: subjectRecords,
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to sync subjects for bill ${billId}:`, error);
  }
}

/**
 * Sync bill summaries (CRS summaries)
 */
async function syncBillSummaries(billId: number, congress: number, billType: string, billNumber: number) {
  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/summaries`;
    const response = await congressApiClient.request<any>(path);
    const summaries = response.data.summaries || [];

    // Delete existing summaries and replace
    await prisma.billSummary.deleteMany({ where: { billId } });

    if (summaries.length > 0) {
      await prisma.billSummary.createMany({
        data: summaries.map((summary: any) => ({
          billId,
          versionCode: summary.versionCode || '00',
          actionDate: summary.actionDate ? new Date(summary.actionDate) : null,
          actionDesc: summary.actionDesc || null,
          text: summary.text || '',
          updateDate: summary.updateDate ? new Date(summary.updateDate) : null,
        })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to sync summaries for bill ${billId}:`, error);
  }
}

/**
 * Sync bill cosponsors
 */
async function syncBillCosponsors(billId: number, congress: number, billType: string, billNumber: number) {
  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/cosponsors`;
    const response = await congressApiClient.request<any>(path);
    const cosponsors = response.data.cosponsors || [];

    // Delete existing cosponsors
    await prisma.billCosponsor.deleteMany({ where: { billId } });

    // Get all member IDs we can link to
    const bioguideIds = cosponsors.map((c: any) => c.bioguideId).filter(Boolean);
    const members = await prisma.member.findMany({
      where: { bioguideId: { in: bioguideIds } },
      select: { id: true, bioguideId: true },
    });
    const memberMap = new Map(members.map(m => [m.bioguideId, m.id]));

    // Create cosponsor records for members we have
    const cosponsorRecords = cosponsors
      .filter((c: any) => memberMap.has(c.bioguideId))
      .map((cosponsor: any) => ({
        billId,
        memberId: memberMap.get(cosponsor.bioguideId)!,
        isPrimarySponsor: false,
        cosponsorDate: cosponsor.sponsorshipDate ? new Date(cosponsor.sponsorshipDate) : null,
        isOriginalCosponsor: cosponsor.isOriginalCosponsor || false,
      }));

    if (cosponsorRecords.length > 0) {
      await prisma.billCosponsor.createMany({
        data: cosponsorRecords,
        skipDuplicates: true,
      });
    }

    // Log if we couldn't find some members
    const missingMembers = cosponsors.filter((c: any) => !memberMap.has(c.bioguideId));
    if (missingMembers.length > 0) {
      console.warn(`[bill-sync] ${missingMembers.length} cosponsors not found in Member table for bill ${billId}`);
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to sync cosponsors for bill ${billId}:`, error);
  }
}

/**
 * Sync bill text versions (URLs only, not content)
 */
async function syncBillTextVersions(billId: number, congress: number, billType: string, billNumber: number) {
  try {
    const path = `/bill/${congress}/${billType}/${billNumber}/text`;
    const response = await congressApiClient.request<any>(path);
    const textVersions = response.data.textVersions || [];

    // Delete existing text versions
    await prisma.billTextVersion.deleteMany({ where: { billId } });

    if (textVersions.length > 0) {
      const records = textVersions.map((version: any) => {
        // Extract URLs from formats array
        const formats = version.formats || [];
        const pdfFormat = formats.find((f: any) => f.type === 'PDF');
        const txtFormat = formats.find((f: any) => f.type === 'Formatted Text');
        const xmlFormat = formats.find((f: any) => f.type === 'XML');
        const htmlFormat = formats.find((f: any) => f.type === 'Formatted XML');

        return {
          billId,
          type: version.type || 'Unknown',
          date: version.date ? new Date(version.date) : null,
          pdfUrl: pdfFormat?.url || null,
          txtUrl: txtFormat?.url || null,
          xmlUrl: xmlFormat?.url || null,
          htmlUrl: htmlFormat?.url || null,
        };
      });

      await prisma.billTextVersion.createMany({
        data: records,
        skipDuplicates: true,
      });

      // Also update the Bill record with the latest text URLs
      const latestVersion = textVersions[0];
      if (latestVersion) {
        const formats = latestVersion.formats || [];
        const pdfFormat = formats.find((f: any) => f.type === 'PDF');
        const txtFormat = formats.find((f: any) => f.type === 'Formatted Text');
        const xmlFormat = formats.find((f: any) => f.type === 'XML');

        await prisma.bill.update({
          where: { id: billId },
          data: {
            pdfUrl: pdfFormat?.url || null,
            textUrl: txtFormat?.url || null,
            xmlUrl: xmlFormat?.url || null,
          },
        });
      }
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to sync text versions for bill ${billId}:`, error);
  }
}

/**
 * Create a notification event for a newly introduced bill
 */
async function createBillIntroducedEvent(bill: any) {
  try {
    // Get subjects for matchable values
    const subjects = await prisma.billSubject.findMany({
      where: { billId: bill.id },
      select: { name: true },
    });

    const matchableValues = [
      bill.slug,
      bill.sponsorBioguideId,
      bill.policyArea,
      ...subjects.map(s => s.name),
      // Extract keywords from title
      ...(bill.title?.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4) || []),
    ].filter(Boolean);

    const eventHash = createHash('sha256')
      .update(`BILL_INTRODUCED:${bill.id}`)
      .digest('hex');

    await prisma.notificationEvent.upsert({
      where: { eventHash },
      update: {},
      create: {
        eventType: 'BILL_INTRODUCED',
        sourceType: 'BILL',
        sourceId: bill.id,
        eventData: {
          billSlug: bill.slug,
          title: bill.title,
          sponsor: bill.sponsorFullName,
          introducedDate: bill.introducedDate,
          policyArea: bill.policyArea,
        },
        matchableValues,
        eventHash,
      },
    });
  } catch (error) {
    console.error(`[bill-sync] Failed to create BILL_INTRODUCED event for ${bill.slug}:`, error);
  }
}

/**
 * Check for bill status change and create event if needed
 */
async function checkBillStatusChange(dbBill: any, apiBill: BillDetail) {
  try {
    // Compare latest action to detect status changes
    const oldAction = dbBill.latestActionText;
    const newAction = apiBill.latestAction?.text;

    if (newAction && oldAction !== newAction) {
      const subjects = await prisma.billSubject.findMany({
        where: { billId: dbBill.id },
        select: { name: true },
      });

      const matchableValues = [
        dbBill.slug,
        dbBill.sponsorBioguideId,
        dbBill.policyArea,
        ...subjects.map(s => s.name),
      ].filter(Boolean);

      const eventHash = createHash('sha256')
        .update(`BILL_ACTION:${dbBill.id}:${apiBill.latestAction?.actionDate}`)
        .digest('hex');

      await prisma.notificationEvent.upsert({
        where: { eventHash },
        update: {},
        create: {
          eventType: 'BILL_ACTION',
          sourceType: 'BILL',
          sourceId: dbBill.id,
          eventData: {
            billSlug: dbBill.slug,
            title: dbBill.title,
            actionDate: apiBill.latestAction?.actionDate,
            actionText: newAction,
            previousAction: oldAction,
          },
          matchableValues,
          eventHash,
        },
      });
    }
  } catch (error) {
    console.error(`[bill-sync] Failed to check status change for ${dbBill.slug}:`, error);
  }
}

/**
 * Get the most recent bill sync job
 */
export async function getLatestBillSyncJob(): Promise<SyncJob | null> {
  return prisma.syncJob.findFirst({
    where: { jobType: 'BILL_SYNC' },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Get bill sync statistics
 */
export async function getBillSyncStats(): Promise<{
  totalBills: number;
  billsWithSummaries: number;
  lastSync: Date | null;
  lastSyncStatus: string | null;
  cursor: string | null;
}> {
  const [totalBills, billsWithSummaries, lastJob] = await Promise.all([
    prisma.bill.count(),
    prisma.bill.count({
      where: {
        summaries: { some: {} },
      },
    }),
    getLatestBillSyncJob(),
  ]);

  return {
    totalBills,
    billsWithSummaries,
    lastSync: lastJob?.completedAt || lastJob?.startedAt || null,
    lastSyncStatus: lastJob?.status || null,
    cursor: lastJob?.cursor || null,
  };
}

export default {
  syncBills,
  getLatestBillSyncJob,
  getBillSyncStats,
};
