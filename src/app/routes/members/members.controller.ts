/**
 * Members Controller
 *
 * REST API endpoints for accessing Congressional members.
 */

import { Router, Request, Response } from 'express';
import prisma from '../../../prisma/prisma-client';
import { Prisma } from '@prisma/client';

const router = Router();

/**
 * GET /api/members
 * List members with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 250);
    const offset = parseInt(req.query.offset as string) || 0;

    const where: Prisma.MemberWhereInput = {};

    if (req.query.current !== 'false') {
      where.isCurrent = true;
    }

    if (req.query.state) {
      where.state = req.query.state as string;
    }

    if (req.query.party) {
      where.party = req.query.party as string;
    }

    if (req.query.chamber) {
      where.chamber = req.query.chamber as string;
    }

    if (req.query.search) {
      where.fullName = {
        contains: req.query.search as string,
        mode: 'insensitive',
      };
    }

    const [total, members] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.findMany({
        where,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
        take: limit,
        skip: offset,
        select: {
          id: true,
          bioguideId: true,
          firstName: true,
          lastName: true,
          fullName: true,
          party: true,
          partyName: true,
          state: true,
          district: true,
          chamber: true,
          isCurrent: true,
          imageUrl: true,
        },
      }),
    ]);

    res.json({
      members: members.map(m => ({
        bioguideId: m.bioguideId,
        name: m.fullName,
        firstName: m.firstName,
        lastName: m.lastName,
        party: m.party,
        partyName: m.partyName,
        state: m.state,
        district: m.district,
        chamber: m.chamber,
        isCurrent: m.isCurrent,
        imageUrl: m.imageUrl,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + members.length < total,
      },
    });
  } catch (error) {
    console.error('[members] List error:', error);
    res.status(500).json({
      error: 'Failed to list members',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/members/:bioguideId
 * Get a single member with their bills
 */
router.get('/:bioguideId', async (req: Request, res: Response) => {
  try {
    const { bioguideId } = req.params;

    const member = await prisma.member.findUnique({
      where: { bioguideId },
      include: {
        sponsoredBills: {
          orderBy: { introducedDate: 'desc' },
          take: 10,
          select: {
            slug: true,
            title: true,
            introducedDate: true,
            latestActionText: true,
            policyArea: true,
            isLaw: true,
          },
        },
        _count: {
          select: {
            sponsoredBills: true,
            cosponsoredBills: true,
          },
        },
      },
    });

    if (!member) {
      return res.status(404).json({
        error: 'Member not found',
        message: `No member found with bioguide ID: ${bioguideId}`,
      });
    }

    res.json({
      member: {
        bioguideId: member.bioguideId,
        name: member.fullName,
        firstName: member.firstName,
        lastName: member.lastName,
        party: member.party,
        partyName: member.partyName,
        state: member.state,
        district: member.district,
        chamber: member.chamber,
        isCurrent: member.isCurrent,
        imageUrl: member.imageUrl,
        officialWebsiteUrl: member.officialWebsiteUrl,
        birthYear: member.birthYear,
        terms: member.terms,
        sponsoredBillsCount: member._count.sponsoredBills,
        cosponsoredBillsCount: member._count.cosponsoredBills,
        recentSponsoredBills: member.sponsoredBills.map(b => ({
          slug: b.slug,
          title: b.title,
          introducedDate: b.introducedDate,
          latestActionText: b.latestActionText,
          policyArea: b.policyArea,
          isLaw: b.isLaw,
        })),
      },
    });
  } catch (error) {
    console.error('[members] Get by ID error:', error);
    res.status(500).json({
      error: 'Failed to get member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/members/:bioguideId/bills
 * Get all bills for a member (sponsored and cosponsored)
 */
router.get('/:bioguideId/bills', async (req: Request, res: Response) => {
  try {
    const { bioguideId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string | undefined; // 'sponsored' or 'cosponsored'

    const member = await prisma.member.findUnique({
      where: { bioguideId },
      select: { id: true },
    });

    if (!member) {
      return res.status(404).json({
        error: 'Member not found',
        message: `No member found with bioguide ID: ${bioguideId}`,
      });
    }

    let bills;
    let total;

    if (type === 'cosponsored') {
      // Get cosponsored bills
      const cosponsored = await prisma.billCosponsor.findMany({
        where: { memberId: member.id },
        include: {
          bill: {
            select: {
              slug: true,
              title: true,
              introducedDate: true,
              latestActionText: true,
              policyArea: true,
              isLaw: true,
              sponsorFullName: true,
              sponsorParty: true,
              sponsorState: true,
            },
          },
        },
        orderBy: { cosponsorDate: 'desc' },
        take: limit,
        skip: offset,
      });

      total = await prisma.billCosponsor.count({ where: { memberId: member.id } });

      bills = cosponsored.map(c => ({
        slug: c.bill.slug,
        title: c.bill.title,
        introducedDate: c.bill.introducedDate,
        latestActionText: c.bill.latestActionText,
        policyArea: c.bill.policyArea,
        isLaw: c.bill.isLaw,
        sponsor: {
          name: c.bill.sponsorFullName,
          party: c.bill.sponsorParty,
          state: c.bill.sponsorState,
        },
        cosponsorDate: c.cosponsorDate,
        isOriginalCosponsor: c.isOriginalCosponsor,
      }));
    } else {
      // Get sponsored bills (default)
      const sponsored = await prisma.bill.findMany({
        where: { sponsorBioguideId: bioguideId },
        orderBy: { introducedDate: 'desc' },
        take: limit,
        skip: offset,
        select: {
          slug: true,
          title: true,
          introducedDate: true,
          latestActionText: true,
          policyArea: true,
          isLaw: true,
          _count: {
            select: { cosponsors: true },
          },
        },
      });

      total = await prisma.bill.count({ where: { sponsorBioguideId: bioguideId } });

      bills = sponsored.map(b => ({
        slug: b.slug,
        title: b.title,
        introducedDate: b.introducedDate,
        latestActionText: b.latestActionText,
        policyArea: b.policyArea,
        isLaw: b.isLaw,
        cosponsorsCount: b._count.cosponsors,
      }));
    }

    res.json({
      bills,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + bills.length < total,
      },
    });
  } catch (error) {
    console.error('[members] Get bills error:', error);
    res.status(500).json({
      error: 'Failed to get member bills',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
