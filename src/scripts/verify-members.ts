/**
 * Verify Members Data
 * Quick check to confirm "undefined undefined" issue is resolved
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyMembers() {
  console.log('🔍 Verifying member data...\n');

  const totalMembers = await prisma.member.count();
  console.log(`Total members: ${totalMembers}`);

  // Check for "undefined undefined" issue
  const membersWithUndefined = await prisma.member.findMany({
    where: {
      fullName: { contains: 'undefined' },
    },
  });

  console.log(`\nMembers with "undefined" in fullName: ${membersWithUndefined.length}`);

  // Check for null fullNames
  const membersWithNullName = await prisma.member.findMany({
    where: {
      fullName: null,
    },
    take: 5,
    select: {
      bioguideId: true,
      fullName: true,
      firstName: true,
      lastName: true,
      state: true,
      party: true,
    },
  });

  if (membersWithNullName.length > 0) {
    console.log(`\nMembers with NULL fullName (${membersWithNullName.length}):`);
    membersWithNullName.forEach((member) => {
      console.log(`  ${member.bioguideId}: fullName=NULL, firstName="${member.firstName}", lastName="${member.lastName}"`);
    });
  } else {
    console.log('\n✅ No members with NULL fullName');
  }

  // Show sample of properly synced members
  const sampleMembers = await prisma.member.findMany({
    take: 10,
    orderBy: { updatedAt: 'desc' },
    select: {
      bioguideId: true,
      fullName: true,
      state: true,
      party: true,
      chamber: true,
      isCurrent: true,
    },
  });

  console.log(`\n✅ Sample members (10 most recently updated):`);
  sampleMembers.forEach((member) => {
    console.log(`  ${member.bioguideId}: ${member.fullName} (${member.party}-${member.state}, ${member.chamber}) [Current: ${member.isCurrent}]`);
  });

  console.log('\n✅ Member data verification complete!\n');
}

verifyMembers()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
