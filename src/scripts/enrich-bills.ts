/**
 * Bill Enrichment CLI
 *
 * Enriches bills with additional data from detailed API endpoints.
 * Usage: npm run enrich:bills [options]
 */

import { getEnrichmentService } from '../app/services/sync';

async function enrichBills() {
  console.log('📚 Bill Enrichment');
  console.log('==================\n');

  const enrichment = getEnrichmentService();

  try {
    // Enrich bills missing sponsor data (limit 50)
    console.log('🔍 Finding bills that need enrichment...\n');

    const result = await enrichment.enrichBillsMissingSponsor(50);

    console.log('\n✅ Enrichment Complete!');
    console.log('=======================');
    console.log(`Bills Processed: ${result.billsProcessed}`);
    console.log(`Bills Enriched: ${result.billsEnriched}`);
    console.log(`Bills Skipped: ${result.billsSkipped}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s\n`);

    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach((error) => {
        console.log(`  Bill ID ${error.billId}: ${error.error}`);
      });
      console.log('');
    }

    if (result.billsEnriched > 0) {
      console.log('💡 Tip: Run this periodically to keep sponsor data up to date');
      console.log('   You can also enrich watchlisted bills specifically:\n');
      console.log('   const result = await enrichment.enrichWatchlistedBills();\n');
    } else {
      console.log('✨ All bills are already enriched!\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Enrichment failed:', error);
    process.exit(1);
  }
}

enrichBills();
