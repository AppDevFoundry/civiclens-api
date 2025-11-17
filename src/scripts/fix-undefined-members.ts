/**
 * Fix the 3 remaining members with "undefined undefined"
 * by manually syncing them
 */

import { PrismaClient } from '@prisma/client';
import { CongressApi } from '../app/services/congress';
import { getMemberSyncService } from '../app/services/sync/member-sync.service';

const prisma = new PrismaClient();

async function fixUndefinedMembers() {
  console.log('🔧 Fixing members with "undefined undefined"...\n');

  const memberIds = ['K000180', 'C000344', 'S000785'];
  const memberSync = getMemberSyncService();

  for (const bioguideId of memberIds) {
    try {
      console.log(`Syncing ${bioguideId}...`);

      const result = await memberSync.syncMembers({ bioguideId });

      if (result.errors.length > 0) {
        console.log(`  ⚠️  Errors: ${result.errors[0].error}`);
      } else if (result.recordsUpdated > 0) {
        console.log(`  ✅ Updated`);
      } else if (result.recordsCreated > 0) {
        console.log(`  ✅ Created`);
      } else {
        console.log(`  ℹ️  No changes`);
      }
    } catch (error) {
      console.error(`  ❌ Error syncing ${bioguideId}:`, error);
    }
  }

  // Verify they're fixed
  console.log('\n🔍 Verifying fix...');
  const stillUndefined = await prisma.member.count({
    where: {
      fullName: { contains: 'undefined' },
    },
  });

  console.log(`\nMembers still with "undefined": ${stillUndefined}`);

  if (stillUndefined === 0) {
    console.log('✅ All "undefined undefined" members have been fixed!\n');
  } else {
    console.log('⚠️  Some members still have "undefined" in their name.\n');
  }
}

fixUndefinedMembers()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
