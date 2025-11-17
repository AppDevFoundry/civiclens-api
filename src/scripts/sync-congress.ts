#!/usr/bin/env ts-node
/**
 * Manual Congress Sync Script
 *
 * CLI tool for manually triggering Congress data synchronization.
 * Useful for development, testing, and maintenance operations.
 *
 * Usage:
 *   npm run sync:bills -- --days=30
 *   npm run sync:members
 *   npm run sync:hearings -- --upcoming
 *   npm run sync:all -- --strategy=full
 */

import { getOrchestrator, SyncStrategy, ResourceType } from '../app/services/sync';

// Parse command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'help';

const options: Record<string, string> = {};
args.slice(1).forEach((arg) => {
  const match = arg.match(/--(\w+)=(.+)/);
  if (match) {
    options[match[1]] = match[2];
  } else if (arg.startsWith('--')) {
    options[arg.slice(2)] = 'true';
  }
});

async function main() {
  console.log('🚀 Congress Sync CLI\n');

  const orchestrator = getOrchestrator();

  try {
    switch (command) {
      case 'bills':
        await syncBills(orchestrator, options);
        break;

      case 'members':
        await syncMembers(orchestrator, options);
        break;

      case 'hearings':
        await syncHearings(orchestrator, options);
        break;

      case 'all':
        await syncAll(orchestrator, options);
        break;

      case 'status':
        await showStatus(orchestrator);
        break;

      case 'help':
      default:
        showHelp();
        break;
    }

    console.log('\n✅ Done!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function syncBills(orchestrator: any, options: Record<string, string>) {
  console.log('📜 Syncing bills...\n');

  const result = await orchestrator.sync({
    strategy: options.strategy || SyncStrategy.INCREMENTAL,
    resources: [ResourceType.BILLS],
    async: false,
  });

  printResult(result);
}

async function syncMembers(orchestrator: any, options: Record<string, string>) {
  console.log('👥 Syncing members...\n');

  const result = await orchestrator.sync({
    strategy: options.strategy || SyncStrategy.INCREMENTAL,
    resources: [ResourceType.MEMBERS],
    async: false,
  });

  printResult(result);
}

async function syncHearings(orchestrator: any, options: Record<string, string>) {
  console.log('🏛️  Syncing hearings...\n');

  const result = await orchestrator.sync({
    strategy: options.strategy || SyncStrategy.INCREMENTAL,
    resources: [ResourceType.HEARINGS],
    async: false,
  });

  printResult(result);
}

async function syncAll(orchestrator: any, options: Record<string, string>) {
  console.log('🌐 Syncing all resources...\n');

  const strategy = options.strategy || SyncStrategy.INCREMENTAL;
  console.log(`Strategy: ${strategy}\n`);

  const result = await orchestrator.sync({
    strategy: strategy as SyncStrategy,
    resources: [ResourceType.BILLS, ResourceType.MEMBERS, ResourceType.HEARINGS],
    async: false,
  });

  printResult(result);
}

async function showStatus(orchestrator: any) {
  console.log('📊 Sync Status (last 24 hours):\n');

  const stats = await orchestrator.getSyncStats(24);

  console.log(`Recent syncs: ${stats.recentSyncs}`);
  console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`Avg duration: ${(stats.avgDuration / 1000).toFixed(2)}s`);
  console.log('\nBy resource:');
  Object.entries(stats.byResource).forEach(([resource, data]: [string, any]) => {
    console.log(`  ${resource}: ${data.syncs} syncs, ${data.errors} errors`);
  });
}

function printResult(result: any) {
  console.log('Results:');
  console.log(`  Duration: ${(result.totalDuration / 1000).toFixed(2)}s`);
  console.log(`  Fetched: ${result.totalRecords.fetched}`);
  console.log(`  Created: ${result.totalRecords.created}`);
  console.log(`  Updated: ${result.totalRecords.updated}`);
  console.log(`  Unchanged: ${result.totalRecords.unchanged}`);
  console.log(`  Errors: ${result.totalErrors}`);

  if (result.totalErrors > 0) {
    console.log('\nErrors encountered:');
    Object.values(result.results).forEach((resourceResult: any) => {
      if (resourceResult.errors && resourceResult.errors.length > 0) {
        resourceResult.errors.forEach((err: any) => {
          console.log(`  - ${err.billId || err.memberId || 'Unknown'}: ${err.error}`);
        });
      }
    });
  }
}

function showHelp() {
  console.log(`
Usage: npm run sync:<command> -- [options]

Commands:
  bills        Sync bills from Congress.gov
  members      Sync members of Congress
  hearings     Sync committee hearings
  all          Sync all resources
  status       Show sync status and statistics
  help         Show this help message

Options:
  --strategy=<strategy>    Sync strategy (incremental, stale, priority, full)
  --days=<number>          Number of days to sync (for bills)
  --congress=<number>      Congress number (default: 118)

Examples:
  npm run sync:bills
  npm run sync:bills -- --strategy=full
  npm run sync:all -- --strategy=incremental
  npm run sync:status
`);
}

// Run the script
main();
