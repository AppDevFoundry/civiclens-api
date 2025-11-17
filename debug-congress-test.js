// Quick debug script to see the actual error
process.env.CONGRESS_API_KEY = 'test-api-key';
process.env.CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';
process.env.NODE_ENV = 'test';

const nock = require('nock');
const request = require('supertest');

// Disable real HTTP
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

// Mock the Congress API
nock('https://api.congress.gov')
  .get('/v3/bill')
  .query(true)
  .reply(200, {
    bills: [{
      congress: 118,
      type: 'hr',
      number: 1234,
      title: 'Test Bill'
    }],
    pagination: {
      count: 1
    }
  });

// Import app AFTER setting up mocks
const app = require('./src/app').default;

// Make the request
request(app)
  .get('/api/bills')
  .end((err, res) => {
    if (err) {
      console.error('Request error:', err);
    }
    console.log('Status:', res.status);
    console.log('Body:', JSON.stringify(res.body, null, 2));

    if (res.status !== 200) {
      console.log('\nFull response:', res.text);
    }

    process.exit(res.status === 200 ? 0 : 1);
  });
