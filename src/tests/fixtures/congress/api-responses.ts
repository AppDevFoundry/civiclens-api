/**
 * Mock Congress.gov API Responses for Testing
 *
 * These fixtures represent typical responses from the Congress.gov API v3.
 */

export const mockBillsResponse = {
  bills: [
    {
      congress: 118,
      type: 'hr',
      number: 1234,
      title: 'Infrastructure Investment and Jobs Act',
      originChamber: 'House',
      originChamberCode: 'H',
      introducedDate: '2023-03-15',
      updateDate: '2023-11-10T12:00:00Z',
      latestAction: {
        actionDate: '2023-11-10',
        text: 'Referred to the Committee on Transportation'
      },
      sponsors: [
        {
          bioguideId: 'S000001',
          fullName: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          party: 'D',
          state: 'CA',
          district: 12
        }
      ],
      policyArea: {
        name: 'Transportation and Public Works'
      },
      url: 'https://api.congress.gov/v3/bill/118/hr/1234'
    },
    {
      congress: 118,
      type: 's',
      number: 567,
      title: 'Healthcare Reform Act',
      originChamber: 'Senate',
      originChamberCode: 'S',
      introducedDate: '2023-02-20',
      updateDate: '2023-10-25T09:00:00Z',
      latestAction: {
        actionDate: '2023-10-25',
        text: 'Passed Senate'
      },
      sponsors: [
        {
          bioguideId: 'J000002',
          fullName: 'Jane Johnson',
          firstName: 'Jane',
          lastName: 'Johnson',
          party: 'R',
          state: 'TX'
        }
      ],
      policyArea: {
        name: 'Health'
      },
      url: 'https://api.congress.gov/v3/bill/118/s/567'
    }
  ],
  pagination: {
    count: 2,
    next: null,
    prev: null
  }
};

export const mockBillDetailResponse = {
  bill: {
    congress: 118,
    type: 'hr',
    number: 1234,
    title: 'Infrastructure Investment and Jobs Act',
    originChamber: 'House',
    originChamberCode: 'H',
    introducedDate: '2023-03-15',
    updateDate: '2023-11-10T12:00:00Z',
    latestAction: {
      actionDate: '2023-11-10',
      text: 'Referred to the Committee on Transportation'
    },
    sponsors: [
      {
        bioguideId: 'S000001',
        fullName: 'John Smith',
        firstName: 'John',
        lastName: 'Smith',
        party: 'D',
        state: 'CA',
        district: 12
      }
    ],
    policyArea: {
      name: 'Transportation and Public Works'
    },
    cosponsors: {
      count: 45,
      url: 'https://api.congress.gov/v3/bill/118/hr/1234/cosponsors'
    },
    subjects: {
      count: 10,
      url: 'https://api.congress.gov/v3/bill/118/hr/1234/subjects'
    },
    summaries: {
      count: 2,
      url: 'https://api.congress.gov/v3/bill/118/hr/1234/summaries'
    },
    actions: {
      count: 15,
      url: 'https://api.congress.gov/v3/bill/118/hr/1234/actions'
    },
    constitutionalAuthorityStatementText: 'Article I, Section 8, Clause 3',
    laws: [],
    url: 'https://api.congress.gov/v3/bill/118/hr/1234'
  }
};

export const mockMembersResponse = {
  members: [
    {
      bioguideId: 'S000001',
      name: 'John Smith',
      firstName: 'John',
      lastName: 'Smith',
      party: 'D',
      state: 'CA',
      district: 12,
      chamber: 'House',
      updateDate: '2023-11-01T00:00:00Z',
      depictionImageUrl: 'https://example.com/image1.jpg',
      officialWebsiteUrl: 'https://example.com',
      url: 'https://api.congress.gov/v3/member/S000001'
    },
    {
      bioguideId: 'J000002',
      name: 'Jane Johnson',
      firstName: 'Jane',
      lastName: 'Johnson',
      party: 'R',
      state: 'TX',
      chamber: 'Senate',
      updateDate: '2023-11-01T00:00:00Z',
      depictionImageUrl: 'https://example.com/image2.jpg',
      officialWebsiteUrl: 'https://example.com',
      url: 'https://api.congress.gov/v3/member/J000002'
    }
  ],
  pagination: {
    count: 2,
    next: null,
    prev: null
  }
};

export const mockMemberDetailResponse = {
  member: {
    bioguideId: 'S000001',
    name: 'John Smith',
    firstName: 'John',
    middleName: 'Robert',
    lastName: 'Smith',
    party: 'D',
    state: 'CA',
    district: 12,
    chamber: 'House',
    birthYear: '1965',
    partyHistory: [
      {
        partyAbbreviation: 'D',
        partyName: 'Democratic',
        startYear: 2010
      }
    ],
    terms: {
      count: 5,
      items: [
        {
          startYear: 2010,
          endYear: 2012,
          chamber: 'House',
          stateCode: 'CA',
          district: 12
        }
      ]
    },
    updateDate: '2023-11-01T00:00:00Z',
    depictionImageUrl: 'https://example.com/image1.jpg',
    officialWebsiteUrl: 'https://example.com',
    sponsoredLegislation: {
      count: 123,
      url: 'https://api.congress.gov/v3/member/S000001/sponsored-legislation'
    },
    cosponsoredLegislation: {
      count: 456,
      url: 'https://api.congress.gov/v3/member/S000001/cosponsored-legislation'
    },
    url: 'https://api.congress.gov/v3/member/S000001'
  }
};

export const mockCommitteesResponse = {
  committees: [
    {
      systemCode: 'hsag00',
      name: 'Committee on Agriculture',
      committeeTypeCode: 'Standing',
      chamber: 'House',
      updateDate: '2023-11-01T00:00:00Z',
      isCurrent: true,
      url: 'https://api.congress.gov/v3/committee/house/hsag00',
      subcommittees: [
        {
          systemCode: 'hsag14',
          name: 'Subcommittee on Livestock and Foreign Agriculture',
          url: 'https://api.congress.gov/v3/committee/house/hsag14'
        }
      ]
    }
  ],
  pagination: {
    count: 1,
    next: null,
    prev: null
  }
};

export const mockNominationsResponse = {
  nominations: [
    {
      congress: 118,
      number: 'PN100',
      citation: 'PN100',
      description: 'John Doe to be Ambassador',
      organization: 'Department of State',
      receivedDate: '2023-05-10',
      latestAction: {
        actionDate: '2023-09-15',
        text: 'Confirmed by Senate'
      },
      updateDate: '2023-09-15T12:00:00Z',
      url: 'https://api.congress.gov/v3/nomination/118/PN100'
    }
  ],
  pagination: {
    count: 1,
    next: null,
    prev: null
  }
};

export const mockHearingsResponse = {
  hearings: [
    {
      congress: 118,
      chamber: 'House',
      jacketNumber: '12345',
      title: 'Hearing on Infrastructure Spending',
      date: '2023-10-15',
      updateDate: '2023-10-16T00:00:00Z',
      committees: [
        {
          systemCode: 'hspw00',
          name: 'Committee on Transportation and Infrastructure',
          url: 'https://api.congress.gov/v3/committee/house/hspw00'
        }
      ],
      url: 'https://api.congress.gov/v3/hearing/118/house/12345'
    }
  ],
  pagination: {
    count: 1,
    next: null,
    prev: null
  }
};

export const mockErrorResponses = {
  notFound: {
    error: 'Not Found',
    message: 'The requested resource was not found',
    status: 404
  },
  unauthorized: {
    error: 'Unauthorized',
    message: 'Invalid or missing API key',
    status: 401
  },
  rateLimited: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded',
    status: 429
  },
  serverError: {
    error: 'Internal Server Error',
    message: 'An error occurred while processing your request',
    status: 500
  }
};
