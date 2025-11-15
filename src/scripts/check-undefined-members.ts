/**
 * Check which members still have "undefined" in fullName
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUndefinedMembers() {
  console.log('🔍 Checking members with "undefined" in fullName...\n');

  const members = await prisma.member.findMany({
    where: {
      fullName: { contains: 'undefined' },
    },
    select: {
      bioguideId: true,
      fullName: true,
      firstName: true,
      lastName: true,
      state: true,
      party: true,
      apiResponseData: true,
    },
  });

  console.log(`Found ${members.length} members with "undefined" in fullName:\n`);

  members.forEach((member) => {
    console.log(`${member.bioguideId}:`);
    console.log(`  fullName: "${member.fullName}"`);
    console.log(`  firstName: ${member.firstName}`);
    console.log(`  lastName: ${member.lastName}`);
    console.log(`  state: ${member.state}`);
    console.log(`  party: ${member.party}`);

    if (member.apiResponseData) {
      const apiData = member.apiResponseData as any;
      console.log(`  API name field: ${apiData.name || 'NULL'}`);
      console.log(`  API firstName: ${apiData.firstName || 'NULL'}`);
      console.log(`  API lastName: ${apiData.lastName || 'NULL'}`);
    }
    console.log('');
  });

  console.log('✅ Done!\n');
}

checkUndefinedMembers()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
