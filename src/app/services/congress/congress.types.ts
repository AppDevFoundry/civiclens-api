/**
 * TypeScript type definitions for Congress.gov API
 *
 * These types are based on the Congress.gov API v3 schema.
 * Reference: https://api.congress.gov/
 */

// ============================================================================
// Enums
// ============================================================================

export enum BillType {
  HR = 'hr',           // House Bill
  S = 's',             // Senate Bill
  HJRES = 'hjres',     // House Joint Resolution
  SJRES = 'sjres',     // Senate Joint Resolution
  HCONRES = 'hconres', // House Concurrent Resolution
  SCONRES = 'sconres', // Senate Concurrent Resolution
  HRES = 'hres',       // House Simple Resolution
  SRES = 'sres'        // Senate Simple Resolution
}

export enum Chamber {
  HOUSE = 'House',
  SENATE = 'Senate',
  JOINT = 'Joint'
}

export enum ChamberCode {
  H = 'H',
  S = 'S'
}

export enum PartyAffiliation {
  DEMOCRATIC = 'D',
  REPUBLICAN = 'R',
  INDEPENDENT = 'I',
  LIBERTARIAN = 'L',
  OTHER = 'O'
}

export enum CommitteeType {
  STANDING = 'Standing',
  SELECT = 'Select',
  SPECIAL = 'Special',
  JOINT = 'Joint'
}

export enum NominationStatus {
  RECEIVED = 'Received',
  CONFIRMED = 'Confirmed',
  REJECTED = 'Rejected',
  WITHDRAWN = 'Withdrawn',
  RETURNED = 'Returned'
}

// ============================================================================
// Pagination & API Response Wrappers
// ============================================================================

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface Pagination {
  count: number;
  next?: string;
  previous?: string;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
  request?: RequestMetadata;
}

export interface RequestMetadata {
  contentType: string;
  format: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface CongressApiError {
  status: number;
  message: string;
  detail?: string;
  requestId?: string;
  path?: string;
}

export class CongressApiException extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
    public readonly requestId?: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'CongressApiException';
  }
}

// ============================================================================
// Bill Types
// ============================================================================

export interface BillsQueryParams extends PaginationParams {
  congress?: number;
  billType?: BillType | string;
  fromDateTime?: string;
  toDateTime?: string;
  sort?: 'updateDate desc' | 'updateDate asc';
}

export interface BillIdentifier {
  congress: number;
  billType: BillType | string;
  billNumber: number;
}

export interface BillSponsor {
  bioguideId: string;
  fullName: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  party: string;
  state: string;
  district?: number;
  url?: string;
  isByRequest?: string;
}

export interface BillAction {
  actionCode?: string;
  actionDate: string;
  text: string;
  type?: string;
  actionTime?: string;
  sourceSystem?: {
    code: number;
    name: string;
  };
  committees?: Array<{
    systemCode: string;
    name: string;
  }>;
}

export interface BillSubject {
  name: string;
  updateDate: string;
}

export interface Bill {
  congress: number;
  type: string;
  number: number;
  originChamber?: string;
  originChamberCode?: string;
  title?: string;
  introducedDate?: string;
  updateDate: string;
  updateDateIncludingText?: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  sponsors?: BillSponsor[];
  cosponsors?: {
    count: number;
    url: string;
  };
  policyArea?: {
    name: string;
  };
  subjects?: {
    count: number;
    url: string;
  };
  summaries?: {
    count: number;
    url: string;
  };
  actions?: {
    count: number;
    url: string;
  };
  constitutionalAuthorityStatementText?: string;
  laws?: Array<{
    type: string;
    number: string;
  }>;
  url: string;
}

export interface BillDetail extends Bill {
  committeeReports?: Array<{
    citation: string;
    url: string;
  }>;
  relatedBills?: {
    count: number;
    url: string;
  };
  amendments?: {
    count: number;
    url: string;
  };
  textVersions?: {
    count: number;
    url: string;
  };
  cboCostEstimates?: Array<{
    title: string;
    url: string;
    pubDate: string;
  }>;
  notes?: string;
}

// ============================================================================
// Member Types
// ============================================================================

export interface MembersQueryParams extends PaginationParams {
  currentMember?: boolean;
  state?: string;
  district?: number;
  party?: PartyAffiliation | string;
  chamber?: Chamber | string;
}

export interface MemberTerm {
  startYear: number;
  endYear?: number;
  chamber: string;
  memberType?: string;
  stateCode?: string;
  stateName?: string;
  district?: number;
}

export interface Member {
  bioguideId: string;
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  nickName?: string;
  party?: string;
  partyHistory?: Array<{
    partyAbbreviation: string;
    partyName: string;
    startYear: number;
    endYear?: number;
  }>;
  state?: string;
  district?: number;
  chamber?: string;
  terms?: {
    count: number;
    items: MemberTerm[];
  };
  updateDate: string;
  url: string;
  depictionImageUrl?: string;
  officialWebsiteUrl?: string;
  addressInformation?: {
    officeAddress?: string;
    city?: string;
    district?: string;
    phoneNumber?: string;
  };
}

export interface MemberDetail extends Member {
  birthYear?: string;
  deathYear?: string;
  honorificName?: string;
  directOrderName?: string;
  invertedOrderName?: string;
  leadership?: Array<{
    type: string;
    congress?: number;
    current?: boolean;
  }>;
  cosponsoredLegislation?: {
    count: number;
    url: string;
  };
  sponsoredLegislation?: {
    count: number;
    url: string;
  };
}

// ============================================================================
// Committee Types
// ============================================================================

export interface CommitteesQueryParams extends PaginationParams {
  chamber?: Chamber | string;
  committeeType?: CommitteeType | string;
  currentCommittee?: boolean;
}

export interface CommitteeIdentifier {
  systemCode: string;
  chamber: Chamber | string;
}

export interface Subcommittee {
  systemCode: string;
  name: string;
  url: string;
}

export interface Committee {
  systemCode: string;
  name: string;
  committeeTypeCode?: string;
  chamber?: string;
  url: string;
  updateDate?: string;
  isCurrent?: boolean;
  parent?: {
    systemCode: string;
    name: string;
    url: string;
  };
  subcommittees?: Subcommittee[];
}

export interface CommitteeDetail extends Committee {
  committeeCode?: string;
  history?: Array<{
    startDate: string;
    endDate?: string;
    superintendent?: string;
    location?: string;
  }>;
  reports?: {
    count: number;
    url: string;
  };
  bills?: {
    count: number;
    url: string;
  };
  nominations?: {
    count: number;
    url: string;
  };
}

// ============================================================================
// Nomination Types
// ============================================================================

export interface NominationsQueryParams extends PaginationParams {
  congress?: number;
  sort?: 'updateDate desc' | 'updateDate asc';
}

export interface NominationIdentifier {
  congress: number;
  nominationNumber: string;
}

export interface Nomination {
  congress: number;
  number: string;
  partNumber?: string;
  citation?: string;
  description?: string;
  receivedDate?: string;
  organization?: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  updateDate: string;
  url: string;
}

export interface NominationDetail extends Nomination {
  committees?: Array<{
    systemCode: string;
    name: string;
    url: string;
  }>;
  actions?: {
    count: number;
    url: string;
  };
  hearings?: {
    count: number;
    url: string;
  };
}

// ============================================================================
// Hearing Types
// ============================================================================

export interface HearingsQueryParams extends PaginationParams {
  congress?: number;
  chamber?: Chamber | string;
  fromDateTime?: string;
  toDateTime?: string;
}

export interface Hearing {
  congress: number;
  chamber: string;
  jacketNumber?: string;
  number?: string;
  part?: string;
  title: string;
  date?: string;
  updateDate?: string;
  url: string;
  committees?: Array<{
    systemCode: string;
    name: string;
    url: string;
  }>;
}

export interface HearingDetail extends Hearing {
  location?: string;
  associatedMeetings?: Array<{
    eventId: string;
    type: string;
  }>;
  associatedBills?: Array<{
    congress: number;
    type: string;
    number: number;
    url: string;
  }>;
  citations?: Array<{
    type: string;
    text: string;
  }>;
  transcripts?: Array<{
    type: string;
    url: string;
  }>;
}

// ============================================================================
// Collection Response Types
// ============================================================================

export interface BillsResponse {
  bills: Bill[];
  pagination?: Pagination;
}

export interface MembersResponse {
  members: Member[];
  pagination?: Pagination;
}

export interface CommitteesResponse {
  committees: Committee[];
  pagination?: Pagination;
}

export interface NominationsResponse {
  nominations: Nomination[];
  pagination?: Pagination;
}

export interface HearingsResponse {
  hearings: Hearing[];
  pagination?: Pagination;
}

// ============================================================================
// Detail Response Types (for single resource endpoints)
// ============================================================================

export interface BillDetailResponse {
  bill: BillDetail;
}

export interface MemberDetailResponse {
  member: MemberDetail;
}

export interface CommitteeDetailResponse {
  committee: CommitteeDetail;
}

export interface NominationDetailResponse {
  nomination: NominationDetail;
}

export interface HearingDetailResponse {
  hearing: HearingDetail;
}

// ============================================================================
// Utility Types
// ============================================================================

export type SortOrder = 'asc' | 'desc';

export interface DateRangeFilter {
  fromDateTime?: string;
  toDateTime?: string;
}

export interface BaseQueryParams extends PaginationParams {
  format?: 'json' | 'xml';
  api_key?: string;
}
