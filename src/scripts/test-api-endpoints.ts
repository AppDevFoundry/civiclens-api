/**
 * API Endpoints Test Script
 *
 * Tests the Congress Sync System API endpoints to ensure they're working correctly.
 * Run the development server first with: npm start
 */

import axios, { AxiosInstance } from 'axios';

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'testpassword123',
};

let authToken: string | null = null;
let testBillId: number | null = null;
let testMemberId: string | null = null;

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  validateStatus: () => true, // Don't throw on any status
});

/**
 * Test result tracking
 */
const results = {
  passed: 0,
  failed: 0,
  tests: [] as Array<{ name: string; status: 'PASS' | 'FAIL'; message?: string }>,
};

function logTest(name: string, passed: boolean, message?: string) {
  results.tests.push({
    name,
    status: passed ? 'PASS' : 'FAIL',
    message,
  });

  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}`);
    if (message) console.log(`   ${message}`);
  }
}

/**
 * Setup: Get test data from database
 */
async function setup() {
  console.log('\n🔧 Setup: Getting test data from database...\n');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Get a test bill
    const bill = await prisma.bill.findFirst({
      orderBy: { updateDate: 'desc' },
    });

    if (bill) {
      testBillId = bill.id;
      console.log(`   Found test bill: ${bill.congress}-${bill.billType}-${bill.billNumber}`);
    }

    // Get a test member
    const member = await prisma.member.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (member) {
      testMemberId = member.bioguideId;
      console.log(`   Found test member: ${member.fullName} (${member.bioguideId})`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('   Setup error:', error);
  }
}

/**
 * Test 1: Health Check
 */
async function testHealthCheck() {
  try {
    const response = await api.get('/cron/health');
    const passed = response.status === 200 && response.data.status === 'healthy';
    logTest(
      'Health Check (GET /api/cron/health)',
      passed,
      passed ? undefined : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Health Check (GET /api/cron/health)', false, String(error));
  }
}

/**
 * Test 2: Admin Dashboard
 */
async function testAdminDashboard() {
  try {
    const response = await api.get('/admin/dashboard');
    const passed = response.status === 200 && response.data.timestamp;
    logTest(
      'Admin Dashboard (GET /api/admin/dashboard)',
      passed,
      passed ? `Found ${response.data.database?.billCount || 0} bills, ${response.data.database?.memberCount || 0} members` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Admin Dashboard (GET /api/admin/dashboard)', false, String(error));
  }
}

/**
 * Test 3: Register User (for watchlist tests)
 */
async function testRegisterUser() {
  try {
    const response = await api.post('/users', TEST_USER);

    // Either 201 (created) or 422 (already exists) is acceptable
    const passed = response.status === 201 || response.status === 422;

    if (response.status === 201 && response.data.user?.token) {
      authToken = response.data.user.token;
    }

    logTest(
      'Register User (POST /api/users)',
      passed,
      passed ? (response.status === 422 ? 'User already exists' : 'User created') : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Register User (POST /api/users)', false, String(error));
  }
}

/**
 * Test 4: Login User
 */
async function testLoginUser() {
  try {
    const response = await api.post('/users/login', {
      user: {
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
    });

    const passed = response.status === 200 && response.data.user?.token;

    if (passed && response.data.user.token) {
      authToken = response.data.user.token;
    }

    logTest(
      'Login User (POST /api/users/login)',
      passed,
      passed ? `Token acquired` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Login User (POST /api/users/login)', false, String(error));
  }
}

/**
 * Test 5: Get Watchlist (Empty)
 */
async function testGetWatchlistEmpty() {
  if (!authToken) {
    logTest('Get Empty Watchlist (GET /api/watchlist)', false, 'No auth token');
    return;
  }

  try {
    const response = await api.get('/watchlist', {
      headers: { Authorization: `Token ${authToken}` },
    });

    const passed = response.status === 200 && Array.isArray(response.data.watchlist);
    logTest(
      'Get Empty Watchlist (GET /api/watchlist)',
      passed,
      passed ? `Found ${response.data.totalItems || 0} items` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Get Empty Watchlist (GET /api/watchlist)', false, String(error));
  }
}

/**
 * Test 6: Add Bill to Watchlist
 */
async function testAddBillToWatchlist() {
  if (!authToken || !testBillId) {
    logTest('Add Bill to Watchlist (POST /api/watchlist/bill/:id)', false, 'Missing auth token or test bill');
    return;
  }

  try {
    const response = await api.post(
      `/watchlist/bill/${testBillId}`,
      {
        notifyOnStatus: true,
        notifyOnActions: true,
      },
      {
        headers: { Authorization: `Token ${authToken}` },
      }
    );

    const passed = response.status === 201 || response.status === 200;
    logTest(
      'Add Bill to Watchlist (POST /api/watchlist/bill/:id)',
      passed,
      passed ? `Bill ${testBillId} added` : `Status: ${response.status}, ${response.data.error || ''}`
    );
  } catch (error) {
    logTest('Add Bill to Watchlist (POST /api/watchlist/bill/:id)', false, String(error));
  }
}

/**
 * Test 7: Get Watchlist (With Items)
 */
async function testGetWatchlistWithItems() {
  if (!authToken) {
    logTest('Get Watchlist with Items (GET /api/watchlist)', false, 'No auth token');
    return;
  }

  try {
    const response = await api.get('/watchlist', {
      headers: { Authorization: `Token ${authToken}` },
    });

    const passed = response.status === 200 && response.data.totalItems > 0;
    logTest(
      'Get Watchlist with Items (GET /api/watchlist)',
      passed,
      passed ? `Found ${response.data.totalItems} items` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Get Watchlist with Items (GET /api/watchlist)', false, String(error));
  }
}

/**
 * Test 8: Remove Bill from Watchlist
 */
async function testRemoveBillFromWatchlist() {
  if (!authToken || !testBillId) {
    logTest('Remove Bill from Watchlist (DELETE /api/watchlist/bill/:id)', false, 'Missing auth token or test bill');
    return;
  }

  try {
    const response = await api.delete(`/watchlist/bill/${testBillId}`, {
      headers: { Authorization: `Token ${authToken}` },
    });

    const passed = response.status === 200 || response.status === 204;
    logTest(
      'Remove Bill from Watchlist (DELETE /api/watchlist/bill/:id)',
      passed,
      passed ? `Bill ${testBillId} removed` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Remove Bill from Watchlist (DELETE /api/watchlist/bill/:id)', false, String(error));
  }
}

/**
 * Test 9: Trigger Bill Sync via Cron
 */
async function testCronSyncBills() {
  try {
    const response = await api.post('/cron/sync-bills');
    const passed = response.status === 200 && response.data.success === true;
    logTest(
      'Trigger Bill Sync (POST /api/cron/sync-bills)',
      passed,
      passed ? `Synced in ${response.data.result?.duration}ms` : `Status: ${response.status}`
    );
  } catch (error) {
    logTest('Trigger Bill Sync (POST /api/cron/sync-bills)', false, String(error));
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧪 Congress Sync System API Tests');
  console.log('==================================\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // Check if server is running
  try {
    await api.get('/cron/health');
  } catch (error) {
    console.error('❌ Cannot connect to API server!');
    console.error('   Please start the development server first: npm start\n');
    process.exit(1);
  }

  // Setup
  await setup();

  console.log('\n🧪 Running tests...\n');

  // Run tests in sequence
  await testHealthCheck();
  await testAdminDashboard();
  await testRegisterUser();
  await testLoginUser();
  await testGetWatchlistEmpty();
  await testAddBillToWatchlist();
  await testGetWatchlistWithItems();
  await testRemoveBillFromWatchlist();
  await testCronSyncBills();

  // Print summary
  console.log('\n==================================');
  console.log('📊 Test Summary');
  console.log('==================================\n');
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%\n`);

  if (results.failed > 0) {
    console.log('Failed Tests:');
    results.tests
      .filter((t) => t.status === 'FAIL')
      .forEach((t) => {
        console.log(`  - ${t.name}`);
        if (t.message) console.log(`    ${t.message}`);
      });
    console.log('');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
