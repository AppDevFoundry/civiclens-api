/**
 * Congress API Response Mappers
 *
 * Transforms Congress.gov API responses into consistent API response format
 * for frontend consumption.
 */

import {
  Bill,
  BillDetail,
  Member,
  MemberDetail,
  Committee,
  CommitteeDetail,
  Nomination,
  NominationDetail,
  Hearing,
  HearingDetail
} from '../../services/congress';

/**
 * Map Bill to API response format
 */
const mapBill = (bill: Bill): any => ({
  congress: bill.congress,
  type: bill.type,
  number: bill.number,
  title: bill.title,
  originChamber: bill.originChamber,
  introducedDate: bill.introducedDate,
  updateDate: bill.updateDate,
  latestAction: bill.latestAction ? {
    date: bill.latestAction.actionDate,
    text: bill.latestAction.text
  } : null,
  sponsor: bill.sponsors && bill.sponsors.length > 0 ? {
    bioguideId: bill.sponsors[0].bioguideId,
    name: bill.sponsors[0].fullName,
    party: bill.sponsors[0].party,
    state: bill.sponsors[0].state
  } : null,
  policyArea: bill.policyArea?.name || null,
  url: bill.url,
  isLaw: bill.laws && bill.laws.length > 0
});

/**
 * Map BillDetail to API response format
 */
const mapBillDetail = (bill: BillDetail): any => ({
  ...mapBill(bill),
  constitutionalAuthorityStatement: bill.constitutionalAuthorityStatementText,
  cosponsors: bill.cosponsors,
  subjects: bill.subjects,
  summaries: bill.summaries,
  actions: bill.actions,
  relatedBills: bill.relatedBills,
  amendments: bill.amendments,
  laws: bill.laws,
  cboCostEstimates: bill.cboCostEstimates,
  committeeReports: bill.committeeReports
});

/**
 * Map Member to API response format
 */
const mapMember = (member: Member): any => ({
  bioguideId: member.bioguideId,
  name: member.name,
  firstName: member.firstName,
  lastName: member.lastName,
  state: member.state,
  district: member.district,
  party: member.party,
  chamber: member.chamber,
  imageUrl: member.depictionImageUrl,
  officialWebsiteUrl: member.officialWebsiteUrl,
  url: member.url
});

/**
 * Map MemberDetail to API response format
 */
const mapMemberDetail = (member: MemberDetail): any => ({
  ...mapMember(member),
  middleName: member.middleName,
  suffix: member.suffix,
  nickName: member.nickName,
  birthYear: member.birthYear,
  partyHistory: member.partyHistory,
  terms: member.terms,
  leadership: member.leadership,
  sponsoredLegislation: member.sponsoredLegislation,
  cosponsoredLegislation: member.cosponsoredLegislation,
  addressInformation: member.addressInformation
});

/**
 * Map Committee to API response format
 */
const mapCommittee = (committee: Committee): any => ({
  systemCode: committee.systemCode,
  name: committee.name,
  type: committee.committeeTypeCode,
  chamber: committee.chamber,
  isCurrent: committee.isCurrent,
  parent: committee.parent,
  url: committee.url,
  subcommittees: committee.subcommittees
});

/**
 * Map CommitteeDetail to API response format
 */
const mapCommitteeDetail = (committee: CommitteeDetail): any => ({
  ...mapCommittee(committee),
  committeeCode: committee.committeeCode,
  history: committee.history,
  reports: committee.reports,
  bills: committee.bills,
  nominations: committee.nominations
});

/**
 * Map Nomination to API response format
 */
const mapNomination = (nomination: Nomination): any => ({
  congress: nomination.congress,
  number: nomination.number,
  partNumber: nomination.partNumber,
  citation: nomination.citation,
  description: nomination.description,
  organization: nomination.organization,
  receivedDate: nomination.receivedDate,
  latestAction: nomination.latestAction ? {
    date: nomination.latestAction.actionDate,
    text: nomination.latestAction.text
  } : null,
  updateDate: nomination.updateDate,
  url: nomination.url
});

/**
 * Map NominationDetail to API response format
 */
const mapNominationDetail = (nomination: NominationDetail): any => ({
  ...mapNomination(nomination),
  committees: nomination.committees,
  actions: nomination.actions,
  hearings: nomination.hearings
});

/**
 * Map Hearing to API response format
 */
const mapHearing = (hearing: Hearing): any => ({
  congress: hearing.congress,
  chamber: hearing.chamber,
  jacketNumber: hearing.jacketNumber,
  title: hearing.title,
  date: hearing.date,
  updateDate: hearing.updateDate,
  committees: hearing.committees,
  url: hearing.url
});

/**
 * Map HearingDetail to API response format
 */
const mapHearingDetail = (hearing: HearingDetail): any => ({
  ...mapHearing(hearing),
  location: hearing.location,
  associatedMeetings: hearing.associatedMeetings,
  associatedBills: hearing.associatedBills,
  citations: hearing.citations,
  transcripts: hearing.transcripts
});

export default {
  mapBill,
  mapBillDetail,
  mapMember,
  mapMemberDetail,
  mapCommittee,
  mapCommitteeDetail,
  mapNomination,
  mapNominationDetail,
  mapHearing,
  mapHearingDetail
};
