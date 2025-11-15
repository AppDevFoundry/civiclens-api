/**
 * Test Parallel Sync Performance
 *
 * Compares sequential vs parallel sync performance
 */

import { getParallelBillSyncService } from '../app/services/sync';
import { printPerformanceConfig } from '../app/config/performance.config';
import { getRateLimitMonitor } from '../app/utils/rate-limit-monitor';

async function main() {
  console.log('\n⚡ Testing Parallel Sync Performance\n');
  console.log('='.repeat(70));

  // Show current configuration
  printPerformanceConfig();

  const parallelSync = getParallelBillSyncService();
  const rateLimitMonitor = getRateLimitMonitor();

  // Reset rate limit monitor
  rateLimitMonitor.reset();

  console.log('\n🚀 Test: Syncing 50 stale bills with parallel execution\n');

  try {
    const result = await parallelSync.syncStaleBillsParallel(50);

    console.log('\n📊 Results:\n');
    console.log(`  Duration: ${result.duration}ms (${(result.duration / 1000).toFixed(2)}s)`);
    console.log(`  Records fetched: ${result.recordsFetched}`);
    console.log(`  Records updated: ${result.recordsUpdated}`);
    console.log(`  Records unchanged: ${result.recordsUnchanged}`);
    console.log(`  Changes detected: ${result.changesDetected}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.recordsFetched > 0) {
      const avgTimePerBill = result.duration / result.recordsFetched;
      console.log(`  Average per bill: ${avgTimePerBill.toFixed(0)}ms`);

      // Compare to baseline
      const baselineTime = 198; // ms per bill from profiling
      const improvement = ((baselineTime - avgTimePerBill) / baselineTime) * 100;
      console.log(`  Baseline: ${baselineTime}ms per bill`);
      console.log(`  Improvement: ${improvement.toFixed(1)}% faster`);
    }

    // Show rate limit stats
    console.log('\n📈 Rate Limit Stats:\n');
    const stats = rateLimitMonitor.getStats();
    console.log(`  Total requests: ${stats.totalRequests}`);
    console.log(`  Requests (last hour): ${stats.requestsLastHour}`);
    console.log(`  Average rate: ${stats.averageRequestsPerSecond} req/sec`);
    console.log(`  Estimated hourly: ${stats.estimatedHourlyRate} requests`);
    console.log(`  API limit: 5,000 requests/hour`);
    console.log(`  Usage: ${((stats.estimatedHourlyRate / 5000) * 100).toFixed(1)}%`);
    console.log(`  Warning level: ${stats.warningLevel}`);

    // Calculate expected time for 200 bills
    if (result.recordsFetched > 0) {
      const avgTimePerBill = result.duration / result.recordsFetched;
      const expectedFor200 = (avgTimePerBill * 200) / 1000;
      console.log(`\n💡 Extrapolated Performance:\n`);
      console.log(`  Expected time for 200 bills: ${expectedFor200.toFixed(1)}s`);
      console.log(`  Previous time for 200 bills: ~20s`);
      if (expectedFor200 < 20) {
        const improvement = ((20 - expectedFor200) / 20) * 100;
        console.log(`  Estimated improvement: ${improvement.toFixed(1)}% faster ✅`);
      }
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.errors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.billId}: ${err.error}`);
      });
      if (result.errors.length > 5) {
        console.log(`  ... and ${result.errors.length - 5} more errors`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Parallel sync test complete!\n');

    // Check if we should adjust configuration
    const throttle = rateLimitMonitor.shouldThrottle();
    if (throttle.throttle) {
      console.log(`⚠️  Rate limit warning: ${throttle.reason}`);
      console.log(`   Recommendation: Wait ${throttle.waitMs}ms or reduce PARALLEL_CONCURRENCY\n`);
    } else {
      console.log('✅ Rate limiting: All clear - no throttling needed\n');
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
