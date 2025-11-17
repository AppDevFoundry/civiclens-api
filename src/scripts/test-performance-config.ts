/**
 * Test Performance Configuration
 *
 * Shows current configuration and validates safety
 */

import {
  performanceConfig,
  printPerformanceConfig,
  calculateRequestRate,
  validateConfig,
  getSafeConfig,
  getAggressiveConfig,
} from '../app/config/performance.config';

function main() {
  console.log('\n🔧 Performance Configuration Test\n');
  console.log('='.repeat(70));

  // 1. Show current config
  printPerformanceConfig();

  // 2. Calculate request rates
  const rates = calculateRequestRate(performanceConfig.parallel);
  console.log('\n📊 Calculated Request Rates:\n');
  console.log(`  Burst rate: ${rates.burstRate} req/sec`);
  console.log(`  Sustained rate: ${rates.sustainedRate} req/sec`);
  console.log(`  Estimated hourly: ${rates.hourlyEstimate} requests`);
  console.log(`  API limit: 5,000 requests/hour`);
  console.log(
    `  Capacity used: ${((rates.hourlyEstimate / 5000) * 100).toFixed(1)}%`
  );

  // 3. Validate config
  console.log('\n✅ Configuration Validation:\n');
  const validation = validateConfig(performanceConfig);

  if (validation.valid) {
    console.log('  ✓ Configuration is valid');
  } else {
    console.log('  ✗ Configuration has errors:');
    validation.errors.forEach((err) => console.log(`    - ${err}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\n  ⚠️  Warnings:');
    validation.warnings.forEach((warn) => console.log(`    - ${warn}`));
  } else {
    console.log('  ✓ No warnings');
  }

  // 4. Show example configurations
  console.log('\n📋 Example Configurations:\n');

  console.log('SAFE (Conservative for Production Start):');
  const safe = getSafeConfig();
  const safeRates = calculateRequestRate(safe.parallel);
  console.log(`  Concurrency: ${safe.parallel.concurrency}`);
  console.log(`  Delay: ${safe.parallel.delayBetweenMs}ms`);
  console.log(`  Estimated hourly: ${safeRates.hourlyEstimate} requests (${((safeRates.hourlyEstimate / 5000) * 100).toFixed(1)}% of limit)`);

  console.log('\nCURRENT (Default):');
  console.log(`  Concurrency: ${performanceConfig.parallel.concurrency}`);
  console.log(`  Delay: ${performanceConfig.parallel.delayBetweenMs}ms`);
  console.log(`  Estimated hourly: ${rates.hourlyEstimate} requests (${((rates.hourlyEstimate / 5000) * 100).toFixed(1)}% of limit)`);

  console.log('\nAGGRESSIVE (For Testing/Development):');
  const aggressive = getAggressiveConfig();
  const aggressiveRates = calculateRequestRate(aggressive.parallel);
  console.log(`  Concurrency: ${aggressive.parallel.concurrency}`);
  console.log(`  Delay: ${aggressive.parallel.delayBetweenMs}ms`);
  console.log(`  Estimated hourly: ${aggressiveRates.hourlyEstimate} requests (${((aggressiveRates.hourlyEstimate / 5000) * 100).toFixed(1)}% of limit)`);

  // 5. Show how to tune
  console.log('\n🎛️  How to Tune Configuration:\n');
  console.log('Via Environment Variables:');
  console.log('  PARALLEL_CONCURRENCY=2      # Lower concurrency (safer)');
  console.log('  PARALLEL_CONCURRENCY=5      # Higher concurrency (faster)');
  console.log('  PARALLEL_DELAY_MS=200       # Slower requests (safer)');
  console.log('  PARALLEL_DELAY_MS=100       # Faster requests');
  console.log('  PARALLEL_MAX_RPS=5          # Hard limit on req/sec');
  console.log('');
  console.log('Example usage:');
  console.log('  PARALLEL_CONCURRENCY=2 npm run sync:bills');
  console.log('  PARALLEL_CONCURRENCY=5 PARALLEL_DELAY_MS=120 npm run sync:bills');
  console.log('');

  // 6. Recommendations
  console.log('💡 Recommendations:\n');
  console.log('1. **Start Conservative**: Use concurrency=2-3 in production');
  console.log('2. **Monitor API Headers**: Check X-RateLimit-Remaining in responses');
  console.log('3. **Gradual Increase**: If stable for 24h, increase by 1');
  console.log('4. **Watch for 429s**: If you get rate limited, decrease immediately');
  console.log('5. **Peak Times**: Lower concurrency during high-traffic periods');
  console.log('');

  console.log('='.repeat(70));
  console.log('');
}

main();
