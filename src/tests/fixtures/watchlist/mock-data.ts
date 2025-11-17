/**
 * Mock Watchlist Data for Testing
 *
 * Provides test fixtures for watchlist-related integration tests.
 */

import { mockUsers } from '../users/mock-data';

/**
 * Mock bills for watchlist testing
 */
export const mockBills = {
  bill1: {
    id: 1,
    congress: 118,
    billType: 'hr',
    billNumber: 1234,
    title: 'Infrastructure Investment and Jobs Act',
    originChamber: 'House',
    originChamberCode: 'H',
    updateDate: new Date('2023-11-10T12:00:00Z'),
    introducedDate: new Date('2023-03-15'),
    latestActionDate: new Date('2023-11-10'),
    latestActionText: 'Referred to the Committee on Transportation',
    policyArea: 'Transportation and Public Works',
    sponsorBioguideId: 'S000001',
    sponsorFirstName: 'John',
    sponsorLastName: 'Smith',
    sponsorFullName: 'John Smith',
    sponsorState: 'CA',
    sponsorParty: 'D',
    isLaw: false,
    lastSyncedAt: new Date(),
    syncAttempts: 1,
    lastEnrichedAt: new Date(),
    enrichmentAttempts: 1,
  },
  bill2: {
    id: 2,
    congress: 118,
    billType: 's',
    billNumber: 567,
    title: 'Healthcare Reform Act',
    originChamber: 'Senate',
    originChamberCode: 'S',
    updateDate: new Date('2023-10-25T09:00:00Z'),
    introducedDate: new Date('2023-02-20'),
    latestActionDate: new Date('2023-10-25'),
    latestActionText: 'Passed Senate',
    policyArea: 'Health',
    sponsorBioguideId: 'J000002',
    sponsorFirstName: 'Jane',
    sponsorLastName: 'Johnson',
    sponsorFullName: 'Jane Johnson',
    sponsorState: 'TX',
    sponsorParty: 'R',
    isLaw: false,
    lastSyncedAt: new Date(),
    syncAttempts: 1,
    lastEnrichedAt: null,
    enrichmentAttempts: 0,
  },
  bill3: {
    id: 3,
    congress: 118,
    billType: 'hr',
    billNumber: 999,
    title: 'Privacy Protection Act',
    originChamber: 'House',
    originChamberCode: 'H',
    updateDate: new Date('2023-11-01T08:00:00Z'),
    introducedDate: new Date('2023-04-10'),
    latestActionDate: new Date('2023-11-01'),
    latestActionText: 'Introduced in House',
    policyArea: 'Civil Rights and Liberties, Minority Issues',
    sponsorBioguideId: 'W000003',
    sponsorFirstName: 'William',
    sponsorLastName: 'Williams',
    sponsorFullName: 'William Williams',
    sponsorState: 'NY',
    sponsorParty: 'D',
    isLaw: false,
    lastSyncedAt: new Date(),
    syncAttempts: 1,
    lastEnrichedAt: null,
    enrichmentAttempts: 0,
  },
};

/**
 * Mock members for watchlist testing
 */
export const mockMembers = {
  member1: {
    id: 1,
    bioguideId: 'S000001',
    fullName: 'John Smith',
    firstName: 'John',
    lastName: 'Smith',
    state: 'CA',
    district: 12,
    party: 'D',
    chamber: 'House',
    isCurrentMember: true,
    imageUrl: 'https://example.com/image1.jpg',
    officialUrl: 'https://example.com/smith',
    lastSyncedAt: new Date(),
    syncAttempts: 1,
  },
  member2: {
    id: 2,
    bioguideId: 'J000002',
    fullName: 'Jane Johnson',
    firstName: 'Jane',
    lastName: 'Johnson',
    state: 'TX',
    district: null,
    party: 'R',
    chamber: 'Senate',
    isCurrentMember: true,
    imageUrl: 'https://example.com/image2.jpg',
    officialUrl: 'https://example.com/johnson',
    lastSyncedAt: new Date(),
    syncAttempts: 1,
  },
};

/**
 * Mock watchlist items
 */
export const mockWatchlistItems = {
  // User 1 watching bill 1
  billWatchlist1: {
    id: 1,
    userId: mockUsers.testUser.id,
    billId: mockBills.bill1.id,
    memberId: null,
    topicKeyword: null,
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: false,
    digestMode: false,
    createdAt: new Date('2023-11-01T10:00:00Z'),
    updatedAt: new Date('2023-11-01T10:00:00Z'),
    lastNotifiedAt: null,
  },
  // User 1 watching bill 2
  billWatchlist2: {
    id: 2,
    userId: mockUsers.testUser.id,
    billId: mockBills.bill2.id,
    memberId: null,
    topicKeyword: null,
    notifyOnStatus: true,
    notifyOnActions: false,
    notifyOnCosponsors: true,
    digestMode: true,
    createdAt: new Date('2023-11-02T10:00:00Z'),
    updatedAt: new Date('2023-11-02T10:00:00Z'),
    lastNotifiedAt: new Date('2023-11-05T08:00:00Z'),
  },
  // User 1 watching member 1
  memberWatchlist: {
    id: 3,
    userId: mockUsers.testUser.id,
    billId: null,
    memberId: mockMembers.member1.id,
    topicKeyword: null,
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: false,
    digestMode: false,
    createdAt: new Date('2023-11-03T10:00:00Z'),
    updatedAt: new Date('2023-11-03T10:00:00Z'),
    lastNotifiedAt: null,
  },
  // User 1 watching topic
  topicWatchlist: {
    id: 4,
    userId: mockUsers.testUser.id,
    billId: null,
    memberId: null,
    topicKeyword: 'healthcare',
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: false,
    digestMode: true,
    createdAt: new Date('2023-11-04T10:00:00Z'),
    updatedAt: new Date('2023-11-04T10:00:00Z'),
    lastNotifiedAt: null,
  },
  // User 2 watching bill 1 (different user)
  otherUserWatchlist: {
    id: 5,
    userId: mockUsers.secondaryUser.id,
    billId: mockBills.bill1.id,
    memberId: null,
    topicKeyword: null,
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: false,
    digestMode: false,
    createdAt: new Date('2023-11-05T10:00:00Z'),
    updatedAt: new Date('2023-11-05T10:00:00Z'),
    lastNotifiedAt: null,
  },
};

/**
 * Mock change logs for watchlist items
 */
export const mockChangeLogs = {
  change1: {
    id: 1,
    billId: mockBills.bill1.id,
    changeType: 'action',
    previousValue: null,
    newValue: 'Referred to the Committee on Transportation',
    significance: 'medium',
    detectedAt: new Date('2023-11-10T12:00:00Z'),
    notified: false,
  },
  change2: {
    id: 2,
    billId: mockBills.bill1.id,
    changeType: 'status',
    previousValue: 'Introduced',
    newValue: 'In Committee',
    significance: 'high',
    detectedAt: new Date('2023-11-10T14:00:00Z'),
    notified: false,
  },
  change3: {
    id: 3,
    billId: mockBills.bill2.id,
    changeType: 'action',
    previousValue: null,
    newValue: 'Passed Senate',
    significance: 'high',
    detectedAt: new Date('2023-10-25T09:00:00Z'),
    notified: true,
  },
};

/**
 * Request payloads for watchlist API tests
 */
export const mockWatchlistPayloads = {
  addBillValid: {
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: false,
    digestMode: false,
  },
  addBillDigestMode: {
    notifyOnStatus: true,
    notifyOnActions: true,
    notifyOnCosponsors: true,
    digestMode: true,
  },
  addTopicValid: {
    keyword: 'privacy',
    notifyOnStatus: true,
    notifyOnActions: true,
    digestMode: false,
  },
  addTopicInvalid: {
    // Missing keyword
    notifyOnStatus: true,
  },
  updatePreferences: {
    notifyOnStatus: false,
    notifyOnActions: true,
    notifyOnCosponsors: true,
    digestMode: true,
  },
};

/**
 * Expected response structures for assertions
 */
export const mockWatchlistResponses = {
  emptyWatchlist: {
    watchlist: [],
    totalItems: 0,
    totalUnreadChanges: 0,
  },
  successAdd: {
    success: true,
    watchlist: expect.objectContaining({
      id: expect.any(Number),
      userId: expect.any(Number),
    }),
  },
  successRemove: {
    success: true,
    message: 'Removed from watchlist',
  },
  successUpdate: {
    success: true,
    watchlist: expect.objectContaining({
      id: expect.any(Number),
    }),
  },
  successMarkRead: {
    success: true,
    message: 'Marked as read',
  },
};

export default {
  mockBills,
  mockMembers,
  mockWatchlistItems,
  mockChangeLogs,
  mockWatchlistPayloads,
  mockWatchlistResponses,
};
