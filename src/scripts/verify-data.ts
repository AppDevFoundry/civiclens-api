/**
 * Data Verification Script
 * Checks data quality in the database after sync
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyData() {
  console.log('🔍 Verifying database data quality...\n');

  // Check Bills
  console.log('📜 BILLS:');
  const billCount = await prisma.bill.count();
  console.log(`  Total bills: ${billCount}`);

  const recentBills = await prisma.bill.findMany({
    take: 5,
    orderBy: { updateDate: 'desc' },
    select: {
      congress: true,
      billType: true,
      billNumber: true,
      title: true,
      sponsorFullName: true,
      latestActionDate: true,
      latestActionText: true,
    },
  });

  console.log(`\n  Sample bills (5 most recent):`);
  recentBills.forEach((bill) => {
    console.log(`    ${bill.congress}-${bill.billType}-${bill.billNumber}: ${bill.title?.substring(0, 60)}...`);
    console.log(`      Sponsor: ${bill.sponsorFullName || 'N/A'}`);
    console.log(`      Latest action: ${bill.latestActionText?.substring(0, 80) || 'N/A'}`);
  });

  // Check for bills with missing critical data
  const billsWithoutTitle = await prisma.bill.count({
    where: { title: null },
  });
  console.log(`\n  Bills missing title: ${billsWithoutTitle}`);

  const billsWithoutSponsor = await prisma.bill.count({
    where: { sponsorBioguideId: null },
  });
  console.log(`  Bills missing sponsor: ${billsWithoutSponsor}`);

  // Check Members
  console.log('\n👥 MEMBERS:');
  const memberCount = await prisma.member.count();
  console.log(`  Total members: ${memberCount}`);

  // Check for "undefined undefined" issue
  const membersWithUndefinedName = await prisma.member.findMany({
    where: {
      OR: [
        { fullName: { contains: 'undefined' } },
        { fullName: null },
      ],
    },
    take: 10,
    select: {
      bioguideId: true,
      fullName: true,
      firstName: true,
      lastName: true,
      state: true,
      party: true,
    },
  });

  if (membersWithUndefinedName.length > 0) {
    console.log(`\n  ⚠️  Members with problematic fullName (${membersWithUndefinedName.length}):`);
    membersWithUndefinedName.forEach((member) => {
      console.log(`    ${member.bioguideId}: "${member.fullName}" (firstName: ${member.firstName}, lastName: ${member.lastName})`);
    });
  } else {
    console.log(`  ✅ No members with undefined fullName`);
  }

  const recentMembers = await prisma.member.findMany({
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: {
      bioguideId: true,
      fullName: true,
      state: true,
      party: true,
      isCurrent: true,
    },
  });

  console.log(`\n  Sample members (5 most recent):`);
  recentMembers.forEach((member) => {
    console.log(`    ${member.bioguideId}: ${member.fullName} (${member.party}-${member.state}) [Current: ${member.isCurrent}]`);
  });

  // Check Hearings
  console.log('\n🏛️  HEARINGS:');
  const hearingCount = await prisma.hearing.count();
  console.log(`  Total hearings: ${hearingCount}`);

  if (hearingCount > 0) {
    const recentHearings = await prisma.hearing.findMany({
      take: 3,
      orderBy: { updatedAt: 'desc' },
      select: {
        jacketNumber: true,
        title: true,
        chamber: true,
        date: true,
      },
    });

    console.log(`\n  Sample hearings (3 most recent):`);
    recentHearings.forEach((hearing) => {
      console.log(`    ${hearing.jacketNumber}: ${hearing.title?.substring(0, 60)}...`);
      console.log(`      Chamber: ${hearing.chamber}, Date: ${hearing.date}`);
    });
  }

  // Check Sync Jobs
  console.log('\n⚙️  SYNC JOBS:');
  const syncJobs = await prisma.syncJob.groupBy({
    by: ['status', 'jobType'],
    _count: true,
  });

  console.log('  Job status breakdown:');
  syncJobs.forEach((job) => {
    console.log(`    ${job.jobType} - ${job.status}: ${job._count}`);
  });

  // Check Change Logs
  console.log('\n📊 CHANGE LOGS:');
  const changeCount = await prisma.billChangeLog.count();
  console.log(`  Total changes tracked: ${changeCount}`);

  if (changeCount > 0) {
    const recentChanges = await prisma.billChangeLog.findMany({
      take: 5,
      orderBy: { detectedAt: 'desc' },
      select: {
        changeType: true,
        previousValue: true,
        newValue: true,
        detectedAt: true,
        billId: true,
      },
    });

    console.log(`\n  Recent changes (5 most recent):`);
    recentChanges.forEach((change) => {
      console.log(`    Bill ${change.billId} - ${change.changeType}: "${JSON.stringify(change.previousValue)}" → "${JSON.stringify(change.newValue)}"`);
      console.log(`      Detected: ${change.detectedAt}`);
    });
  }

  console.log('\n✅ Data verification complete!\n');
}

verifyData()
  .catch((error) => {
    console.error('Error verifying data:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
