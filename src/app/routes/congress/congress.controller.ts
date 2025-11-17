/**
 * Congress API Controller
 *
 * Express routes for accessing Congress.gov data.
 * All routes are prefixed with /api when mounted in the main router.
 */

import { NextFunction, Request, Response, Router } from 'express';
import auth from '../auth/auth';
import { CongressApi } from '../../services/congress';
import congressMapper from './congress.mapper';
import HttpException from '../../models/http-exception.model';

const router = Router();

// ============================================================================
// Health Check & Diagnostics
// ============================================================================

/**
 * GET /api/congress/ping
 * Health check endpoint for Congress.gov API
 */
router.get('/congress/ping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isHealthy = await CongressApi.ping();

    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'Congress.gov API',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Bills Routes
// ============================================================================

/**
 * GET /api/bills
 * List bills with optional filters
 * Query params: congress, billType, fromDateTime, toDateTime, limit, offset, sort
 */
router.get('/bills', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      congress: req.query.congress ? parseInt(req.query.congress as string, 10) : undefined,
      billType: req.query.billType as string | undefined,
      fromDateTime: req.query.fromDateTime as string | undefined,
      toDateTime: req.query.toDateTime as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      sort: req.query.sort as any
    };

    const result = await CongressApi.bills.listBills(params);

    res.json({
      bills: result.bills.map(bill => congressMapper.mapBill(bill)),
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[Congress API] /bills error:', error);
    next(error);
  }
});

/**
 * GET /api/bills/:congress/:type/:number
 * Get a specific bill
 */
router.get('/bills/:congress/:type/:number', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const congress = parseInt(req.params.congress, 10);
    const billType = req.params.type;
    const billNumber = parseInt(req.params.number, 10);

    if (isNaN(congress) || isNaN(billNumber)) {
      throw new HttpException(400, { errors: { message: 'Invalid congress or bill number' } });
    }

    const bill = await CongressApi.bills.getBillById({ congress, billType, billNumber });

    if (!bill) {
      throw new HttpException(404, { errors: { message: 'Bill not found' } });
    }

    res.json({
      bill: congressMapper.mapBillDetail(bill)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bills/:congress/:type/:number/actions
 * Get bill actions (legislative history)
 */
router.get('/bills/:congress/:type/:number/actions', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const congress = parseInt(req.params.congress, 10);
    const billType = req.params.type;
    const billNumber = parseInt(req.params.number, 10);

    const result = await CongressApi.bills.getBillActions({ congress, billType, billNumber });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bills/:congress/:type/:number/subjects
 * Get bill subjects/policy areas
 */
router.get('/bills/:congress/:type/:number/subjects', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const congress = parseInt(req.params.congress, 10);
    const billType = req.params.type;
    const billNumber = parseInt(req.params.number, 10);

    const result = await CongressApi.bills.getBillSubjects({ congress, billType, billNumber });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Members Routes
// ============================================================================

/**
 * GET /api/members
 * List members with optional filters
 * Query params: currentMember, state, district, party, chamber, limit, offset
 */
router.get('/members', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      currentMember: req.query.currentMember === 'true',
      state: req.query.state as string | undefined,
      district: req.query.district ? parseInt(req.query.district as string, 10) : undefined,
      party: req.query.party as string | undefined,
      chamber: req.query.chamber as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
    };

    const result = await CongressApi.members.listMembers(params);

    res.json({
      members: result.members.map(member => congressMapper.mapMember(member)),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/members/:bioguideId
 * Get a specific member
 */
router.get('/members/:bioguideId', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bioguideId = req.params.bioguideId;

    const member = await CongressApi.members.getMemberById(bioguideId);

    if (!member) {
      throw new HttpException(404, { errors: { message: 'Member not found' } });
    }

    res.json({
      member: congressMapper.mapMemberDetail(member)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/members/:bioguideId/sponsored-legislation
 * Get member's sponsored legislation
 */
router.get('/members/:bioguideId/sponsored-legislation', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bioguideId = req.params.bioguideId;

    const result = await CongressApi.members.getMemberSponsorship(bioguideId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Committees Routes
// ============================================================================

/**
 * GET /api/committees
 * List committees with optional filters
 * Query params: chamber, committeeType, currentCommittee, limit, offset
 */
router.get('/committees', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      chamber: req.query.chamber as string | undefined,
      committeeType: req.query.committeeType as string | undefined,
      currentCommittee: req.query.currentCommittee === 'true',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
    };

    const result = await CongressApi.committees.listCommittees(params);

    res.json({
      committees: result.committees.map(committee => congressMapper.mapCommittee(committee)),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/committees/:chamber/:systemCode
 * Get a specific committee
 */
router.get('/committees/:chamber/:systemCode', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chamber = req.params.chamber;
    const systemCode = req.params.systemCode;

    const committee = await CongressApi.committees.getCommitteeById({ chamber, systemCode });

    if (!committee) {
      throw new HttpException(404, { errors: { message: 'Committee not found' } });
    }

    res.json({
      committee: congressMapper.mapCommitteeDetail(committee)
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Nominations Routes
// ============================================================================

/**
 * GET /api/nominations
 * List nominations with optional filters
 * Query params: congress, limit, offset, sort
 */
router.get('/nominations', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      congress: req.query.congress ? parseInt(req.query.congress as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      sort: req.query.sort as any
    };

    const result = await CongressApi.nominations.listNominations(params);

    res.json({
      nominations: result.nominations.map(nom => congressMapper.mapNomination(nom)),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/nominations/:congress/:number
 * Get a specific nomination
 */
router.get('/nominations/:congress/:number', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const congress = parseInt(req.params.congress, 10);
    const nominationNumber = req.params.number;

    const nomination = await CongressApi.nominations.getNominationById({ congress, nominationNumber });

    if (!nomination) {
      throw new HttpException(404, { errors: { message: 'Nomination not found' } });
    }

    res.json({
      nomination: congressMapper.mapNominationDetail(nomination)
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Hearings Routes
// ============================================================================

/**
 * GET /api/hearings
 * List hearings with optional filters
 * Query params: congress, chamber, fromDateTime, toDateTime, limit, offset
 */
router.get('/hearings', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = {
      congress: req.query.congress ? parseInt(req.query.congress as string, 10) : undefined,
      chamber: req.query.chamber as string | undefined,
      fromDateTime: req.query.fromDateTime as string | undefined,
      toDateTime: req.query.toDateTime as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
    };

    const result = await CongressApi.hearings.listHearings(params);

    res.json({
      hearings: result.hearings.map(hearing => congressMapper.mapHearing(hearing)),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

export default router;
