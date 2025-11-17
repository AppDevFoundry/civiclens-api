/**
 * Create a test bill change to demonstrate notification workflow
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📊 Checking change detection status...\n');

  const [totalChanges, unnotifiedChanges, watchedBill] = await Promise.all([
    prisma.billChangeLog.count(),
    prisma.billChangeLog.count({ where: { notified: false } }),
    prisma.bill.findFirst({
      where: { watchlists: { some: {} } },
      include: { watchlists: { include: { user: true } } }
    }),
  ]);

  console.log('✓ Total bill changes logged:', totalChanges);
  console.log('✓ Unnotified changes:', unnotifiedChanges);

  if (!watchedBill) {
    console.log('❌ No watched bills found. Run test:notifications first.');
    process.exit(1);
  }

  console.log('✓ Watched bill:', `${watchedBill.title} (watched by ${watchedBill.watchlists.length} user(s))`);
  console.log('  Watchers:', watchedBill.watchlists.map(w => w.user.username).join(', '));

  console.log('\n📝 Creating a test change for the watched bill...\n');

  const testChange = await prisma.billChangeLog.create({
    data: {
      billId: watchedBill.id,
      changeType: 'action',
      previousValue: { text: 'Referred to committee', date: new Date('2025-01-10') },
      newValue: { text: 'Passed by House - Major update!', date: new Date() },
      notified: false,
    },
  });

  console.log('✓ Created test change:', testChange.id);
  console.log('  Change type:', testChange.changeType);
  console.log('  Bill:', watchedBill.title);
  console.log('  Previous action:', 'Referred to committee');
  console.log('  New action:', 'Passed by House - Major update!');

  console.log('\n✅ Test change created! Ready to process notifications.\n');

  await prisma.$disconnect();
}

main().catch(console.error);
