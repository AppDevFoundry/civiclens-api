/**
 * Check Bill Sync Status
 *
 * Shows how many bills are stale and ready for sync testing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalBills = await prisma.bill.count();
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  const staleBills = await prisma.bill.count({
    where: {
      OR: [
        { lastSyncedAt: { lt: cutoffDate } },
        { lastSyncedAt: null },
      ],
    },
  });

  const recentlySynced = await prisma.bill.count({
    where: {
      lastSyncedAt: { gte: cutoffDate },
    },
  });

  console.log(`\nDatabase Bill Status:`);
  console.log(`  Total bills: ${totalBills}`);
  console.log(`  Stale bills (>24h old or never synced): ${staleBills}`);
  console.log(`  Recently synced (<24h ago): ${recentlySynced}`);

  // Show last sync times
  const bills = await prisma.bill.findMany({
    orderBy: { lastSyncedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      billNumber: true,
      billType: true,
      congress: true,
      lastSyncedAt: true,
    },
  });

  console.log(`\n  Recent bills (showing up to 10):`);
  bills.forEach(bill => {
    const timeAgo = bill.lastSyncedAt
      ? `${Math.round((Date.now() - bill.lastSyncedAt.getTime()) / 1000 / 60)} min ago`
      : 'never';
    console.log(`    ${bill.congress}-${bill.billType}-${bill.billNumber}: ${timeAgo}`);
  });

  await prisma.$disconnect();
}

main();
