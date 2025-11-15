/**
 * Bills Service
 *
 * Database queries for bills from the CivicLens database.
 * This service queries our synced data, not the Congress.gov API.
 */

import prisma from '../../../prisma/prisma-client';
import { Prisma } from '@prisma/client';

export interface BillListParams {
  cursor?: string;
  limit?: number;
  congress?: number;
  billType?: string;
  status?: string;
  topic?: string;
  member?: string;
  search?: string;
  isLaw?: boolean;
}

export interface BillListResult {
  bills: any[];
  nextCursor: string | null;
  total: number;
}

/**
 * List bills with filtering and cursor-based pagination
 */
export async function listBills(params: BillListParams): Promise<BillListResult> {
  const limit = Math.min(params.limit || 20, 100);

  // Build where clause
  const where: Prisma.BillWhereInput = {};

  if (params.congress) {
    where.congress = params.congress;
  }

  if (params.billType) {
    where.billType = params.billType.toLowerCase();
  }

  if (params.isLaw !== undefined) {
    where.isLaw = params.isLaw;
  }

  if (params.topic) {
    where.subjects = {
      some: {
        name: {
          contains: params.topic,
          mode: 'insensitive',
        },
      },
    };
  }

  if (params.member) {
    where.OR = [
      { sponsorBioguideId: params.member },
      {
        cosponsors: {
          some: {
            member: {
              bioguideId: params.member,
            },
          },
        },
      },
    ];
  }

  if (params.search) {
    const searchTerms = params.search.split(' ').filter(Boolean);
    where.AND = searchTerms.map(term => ({
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { policyArea: { contains: term, mode: 'insensitive' as const } },
        { subjects: { some: { name: { contains: term, mode: 'insensitive' as const } } } },
      ],
    }));
  }

  // Handle cursor-based pagination
  let cursorFilter: Prisma.BillWhereInput = {};
  if (params.cursor) {
    // Cursor is bill ID
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      cursorFilter = { id: { lt: cursorId } };
    }
  }

  // Get total count and bills
  const [total, bills] = await Promise.all([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where: { ...where, ...cursorFilter },
      orderBy: [
        { updateDate: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1, // Fetch one extra to determine if there's a next page
      include: {
        subjects: {
          where: { isPolicyArea: true },
          take: 1,
        },
        _count: {
          select: {
            cosponsors: true,
            actions: true,
          },
        },
      },
    }),
  ]);

  // Check if there's a next page
  const hasMore = bills.length > limit;
  if (hasMore) {
    bills.pop(); // Remove the extra item
  }

  const nextCursor = hasMore && bills.length > 0
    ? bills[bills.length - 1].id.toString()
    : null;

  // Transform bills for response
  const transformedBills = bills.map(bill => ({
    id: bill.id,
    slug: bill.slug,
    congress: bill.congress,
    type: bill.billType,
    number: bill.billNumber,
    title: bill.title,
    introducedDate: bill.introducedDate,
    updateDate: bill.updateDate,
    latestActionDate: bill.latestActionDate,
    latestActionText: bill.latestActionText,
    policyArea: bill.policyArea,
    isLaw: bill.isLaw,
    sponsor: {
      bioguideId: bill.sponsorBioguideId,
      name: bill.sponsorFullName,
      party: bill.sponsorParty,
      state: bill.sponsorState,
    },
    cosponsorsCount: bill._count.cosponsors,
    actionsCount: bill._count.actions,
    links: {
      congressGov: bill.congressGovUrl,
    },
  }));

  return {
    bills: transformedBills,
    nextCursor,
    total,
  };
}

/**
 * Get a single bill by slug with all details
 */
export async function getBillBySlug(slug: string) {
  const bill = await prisma.bill.findUnique({
    where: { slug },
    include: {
      subjects: {
        orderBy: [
          { isPolicyArea: 'desc' },
          { name: 'asc' },
        ],
      },
      summaries: {
        orderBy: { actionDate: 'desc' },
        take: 1, // Most recent summary
      },
      actions: {
        orderBy: { actionDate: 'desc' },
        take: 10, // Last 10 actions for detail view
      },
      cosponsors: {
        include: {
          member: {
            select: {
              bioguideId: true,
              fullName: true,
              party: true,
              state: true,
              chamber: true,
            },
          },
        },
        orderBy: { cosponsorDate: 'desc' },
        take: 20, // First 20 cosponsors
      },
      textVersions: {
        orderBy: { date: 'desc' },
        take: 5, // Recent text versions
      },
      insights: {
        orderBy: { updatedAt: 'desc' },
      },
      _count: {
        select: {
          cosponsors: true,
          actions: true,
        },
      },
    },
  });

  if (!bill) {
    return null;
  }

  return {
    id: bill.id,
    slug: bill.slug,
    congress: bill.congress,
    type: bill.billType,
    number: bill.billNumber,
    title: bill.title,
    introducedDate: bill.introducedDate,
    updateDate: bill.updateDate,
    latestActionDate: bill.latestActionDate,
    latestActionText: bill.latestActionText,
    policyArea: bill.policyArea,
    isLaw: bill.isLaw,
    lawNumber: bill.lawNumber,

    sponsor: {
      bioguideId: bill.sponsorBioguideId,
      name: bill.sponsorFullName,
      firstName: bill.sponsorFirstName,
      lastName: bill.sponsorLastName,
      party: bill.sponsorParty,
      state: bill.sponsorState,
    },

    cosponsorsCount: bill._count.cosponsors,
    cosponsors: bill.cosponsors.map(c => ({
      bioguideId: c.member.bioguideId,
      name: c.member.fullName,
      party: c.member.party,
      state: c.member.state,
      chamber: c.member.chamber,
      cosponsorDate: c.cosponsorDate,
      isOriginalCosponsor: c.isOriginalCosponsor,
    })),

    actionsCount: bill._count.actions,
    actions: bill.actions.map(a => ({
      actionCode: a.actionCode,
      actionDate: a.actionDate,
      text: a.text,
      type: a.type,
      chamber: a.chamber,
    })),

    subjects: bill.subjects.map(s => s.name),

    // CivicLens AI insights
    insights: {
      plainSummary: bill.insights.find(i => i.insightType === 'PLAIN_SUMMARY')?.content || null,
      impactSummary: bill.insights.find(i => i.insightType === 'IMPACT_SUMMARY')?.content || null,
      keyProvisions: bill.insights.find(i => i.insightType === 'KEY_PROVISIONS')?.content || null,
      generatedAt: bill.insights[0]?.updatedAt || null,
    },

    // Official CRS summary
    officialSummary: bill.summaries[0]?.text || null,

    // Links to Congress.gov
    links: {
      congressGov: bill.congressGovUrl,
      fullTextPdf: bill.pdfUrl,
      fullTextTxt: bill.textUrl,
      fullTextXml: bill.xmlUrl,
    },

    // Text versions available
    textVersions: bill.textVersions.map(v => ({
      type: v.type,
      date: v.date,
      pdfUrl: v.pdfUrl,
      txtUrl: v.txtUrl,
      xmlUrl: v.xmlUrl,
      htmlUrl: v.htmlUrl,
    })),
  };
}

/**
 * Get paginated actions for a bill
 */
export async function getBillActions(slug: string, params: { cursor?: string; limit?: number }) {
  const bill = await prisma.bill.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!bill) {
    return null;
  }

  const limit = Math.min(params.limit || 50, 200);

  let cursorFilter: Prisma.BillActionWhereInput = {};
  if (params.cursor) {
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      cursorFilter = { id: { lt: cursorId } };
    }
  }

  const actions = await prisma.billAction.findMany({
    where: {
      billId: bill.id,
      ...cursorFilter,
    },
    orderBy: [
      { actionDate: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
  });

  const hasMore = actions.length > limit;
  if (hasMore) {
    actions.pop();
  }

  const nextCursor = hasMore && actions.length > 0
    ? actions[actions.length - 1].id.toString()
    : null;

  return {
    actions: actions.map(a => ({
      id: a.id,
      actionCode: a.actionCode,
      actionDate: a.actionDate,
      text: a.text,
      type: a.type,
      chamber: a.chamber,
    })),
    nextCursor,
  };
}

/**
 * Get all cosponsors for a bill
 */
export async function getBillCosponsors(slug: string, params: { cursor?: string; limit?: number }) {
  const bill = await prisma.bill.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!bill) {
    return null;
  }

  const limit = Math.min(params.limit || 100, 500);

  let cursorFilter: Prisma.BillCosponsorWhereInput = {};
  if (params.cursor) {
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      cursorFilter = { id: { lt: cursorId } };
    }
  }

  const cosponsors = await prisma.billCosponsor.findMany({
    where: {
      billId: bill.id,
      ...cursorFilter,
    },
    include: {
      member: {
        select: {
          bioguideId: true,
          fullName: true,
          party: true,
          state: true,
          chamber: true,
        },
      },
    },
    orderBy: [
      { cosponsorDate: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
  });

  const hasMore = cosponsors.length > limit;
  if (hasMore) {
    cosponsors.pop();
  }

  const nextCursor = hasMore && cosponsors.length > 0
    ? cosponsors[cosponsors.length - 1].id.toString()
    : null;

  return {
    cosponsors: cosponsors.map(c => ({
      bioguideId: c.member.bioguideId,
      name: c.member.fullName,
      party: c.member.party,
      state: c.member.state,
      chamber: c.member.chamber,
      cosponsorDate: c.cosponsorDate,
      isOriginalCosponsor: c.isOriginalCosponsor,
    })),
    nextCursor,
  };
}

export default {
  listBills,
  getBillBySlug,
  getBillActions,
  getBillCosponsors,
};
