/**
 * Test Parallel Bill Fetching
 *
 * Tests parallel execution by fetching bills from multiple congresses/types
 * This demonstrates the real performance benefit of parallelization
 */

import { CongressApi } from '../app/services/congress';
import { ParallelExecutor } from '../app/utils/parallel-executor';
import { getRateLimitMonitor } from '../app/utils/rate-limit-monitor';
import { performanceConfig } from '../app/config/performance.config';

async function testSequential() {
  console.log('\n📊 Test 1: Sequential Bill Fetching (baseline)\n');

  const queries = [
    { congress: 118, billType: 'hr' as const },
    { congress: 118, billType: 's' as const },
    { congress: 119, billType: 'hr' as const },
    { congress: 119, billType: 's' as const },
    { congress: 117, billType: 'hr' as const },
  ];

  const startTime = Date.now();
  const results: any[] = [];

  for (const query of queries) {
    try {
      const response = await CongressApi.bills.listBills({
        congress: query.congress,
        billType: query.billType,
        limit: 20,
        sort: 'updateDate desc',
      });
      results.push(response.bills || []);
      console.log(`  Fetched ${query.congress}-${query.billType}: ${response.bills?.length || 0} bills`);
    } catch (error) {
      console.error(`  Error fetching ${query.congress}-${query.billType}:`, error);
    }
  }

  const duration = Date.now() - startTime;
  const totalBills = results.flat().length;

  console.log(`\n  Total time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
  console.log(`  Total bills: ${totalBills}`);
  console.log(`  Average per request: ${Math.round(duration / queries.length)}ms`);

  return { duration, totalBills };
}

async function testParallel() {
  console.log('\n⚡ Test 2: Parallel Bill Fetching\n');
  console.log(`  Config: concurrency=${performanceConfig.parallel.concurrency}, delay=${performanceConfig.parallel.delayBetweenMs}ms\n`);

  const rateLimitMonitor = getRateLimitMonitor();
  rateLimitMonitor.reset();

  const queries = [
    { congress: 118, billType: 'hr' as const },
    { congress: 118, billType: 's' as const },
    { congress: 119, billType: 'hr' as const },
    { congress: 119, billType: 's' as const },
    { congress: 117, billType: 'hr' as const },
  ];

  const operations = queries.map((query) => async () => {
    rateLimitMonitor.recordRequest();
    const response = await CongressApi.bills.listBills({
      congress: query.congress,
      billType: query.billType,
      limit: 20,
      sort: 'updateDate desc',
    });
    console.log(`  Fetched ${query.congress}-${query.billType}: ${response.bills?.length || 0} bills`);
    return response.bills || [];
  });

  const startTime = Date.now();
  const parallelResult = await ParallelExecutor.execute(operations, {
    concurrency: performanceConfig.parallel.concurrency,
    delayBetweenMs: performanceConfig.parallel.delayBetweenMs,
    retry: true,
    maxRetries: 2,
  });

  const duration = Date.now() - startTime;
  const totalBills = parallelResult.results.flat().length;

  console.log(`\n  Total time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
  console.log(`  Total bills: ${totalBills}`);
  console.log(`  Completed: ${parallelResult.completed}/${queries.length} requests`);
  console.log(`  Failed: ${parallelResult.failed}`);
  console.log(`  Average per request: ${Math.round(duration / queries.length)}ms`);

  // Show rate limit stats
  const stats = rateLimitMonitor.getStats();
  console.log(`\n  Rate limit usage:`);
  console.log(`    Total requests: ${stats.totalRequests}`);
  console.log(`    Average rate: ${stats.averageRequestsPerSecond.toFixed(2)} req/sec`);
  console.log(`    Warning level: ${stats.warningLevel}`);

  return { duration, totalBills };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('⚡ Parallel vs Sequential API Fetching Performance Test');
  console.log('='.repeat(70));

  try {
    // Run sequential test
    const sequential = await testSequential();

    // Wait a moment between tests
    console.log('\n  Waiting 2 seconds before parallel test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run parallel test
    const parallel = await testParallel();

    // Compare results
    console.log('\n' + '='.repeat(70));
    console.log('📈 Performance Comparison:');
    console.log('='.repeat(70));
    console.log(`\n  Sequential: ${sequential.duration}ms (${(sequential.duration / 1000).toFixed(2)}s)`);
    console.log(`  Parallel:   ${parallel.duration}ms (${(parallel.duration / 1000).toFixed(2)}s)`);

    const improvement = ((sequential.duration - parallel.duration) / sequential.duration) * 100;
    const speedup = sequential.duration / parallel.duration;

    console.log(`\n  Time saved: ${sequential.duration - parallel.duration}ms`);
    console.log(`  Improvement: ${improvement.toFixed(1)}% faster`);
    console.log(`  Speedup: ${speedup.toFixed(2)}x`);

    if (improvement > 0) {
      console.log(`\n  ✅ Parallel execution is significantly faster!`);
    } else {
      console.log(`\n  ⚠️  Parallel execution was slower (unexpected)`);
    }

    // Extrapolate for larger syncs
    console.log(`\n💡 Extrapolated Performance for Typical Sync:\n`);
    console.log(`  For 50 API requests:`);
    console.log(`    Sequential: ~${Math.round((sequential.duration / 5) * 10 / 1000)}s`);
    console.log(`    Parallel:   ~${Math.round((parallel.duration / 5) * 10 / 1000)}s`);
    console.log(`    Time saved: ~${Math.round((sequential.duration - parallel.duration) / 5 * 10 / 1000)}s`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Performance test complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
