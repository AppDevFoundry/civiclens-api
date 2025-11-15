/**
 * Check Sponsor Data Script
 * Inspects a sample bill's API response to understand sponsor data structure
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSponsorData() {
  console.log('🔍 Checking sponsor data...\n');

  // Get a few bills to check their API response data
  const bills = await prisma.bill.findMany({
    take: 3,
    select: {
      congress: true,
      billType: true,
      billNumber: true,
      title: true,
      sponsorBioguideId: true,
      sponsorFullName: true,
      apiResponseData: true,
    },
  });

  bills.forEach((bill, index) => {
    console.log(`\n--- Bill ${index + 1}: ${bill.congress}-${bill.billType}-${bill.billNumber} ---`);
    console.log(`Title: ${bill.title?.substring(0, 60)}...`);
    console.log(`Sponsor BioguideId: ${bill.sponsorBioguideId || 'NULL'}`);
    console.log(`Sponsor FullName: ${bill.sponsorFullName || 'NULL'}`);

    if (bill.apiResponseData) {
      const apiData = bill.apiResponseData as any;
      console.log('\nAPI Response Structure:');
      console.log(`  - Has sponsors field: ${!!apiData.sponsors}`);
      if (apiData.sponsors) {
        console.log(`  - Sponsors array length: ${apiData.sponsors.length}`);
        if (apiData.sponsors.length > 0) {
          console.log(`  - First sponsor:`, JSON.stringify(apiData.sponsors[0], null, 2));
        }
      }
    }
  });

  console.log('\n✅ Done!\n');
}

checkSponsorData()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
