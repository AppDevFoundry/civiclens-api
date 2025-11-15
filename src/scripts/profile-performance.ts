/**
 * Performance Profiling Script
 *
 * Profiles the sync system to identify bottlenecks:
 * - API request time
 * - Database operation time
 * - Total sync duration
 * - Memory usage
 */

import { performance } from 'perf_hooks';
import { PrismaClient } from '@prisma/client';
import { getBillSyncService } from '../app/services/sync';

const prisma = new PrismaClient();

interface PerformanceMetrics {
  operation: string;
  duration: number;
  count?: number;
  avgDuration?: number;
}

class PerformanceProfiler {
  private metrics: PerformanceMetrics[] = [];
  private startTimes: Map<string, number> = new Map();

  start(operation: string) {
    this.startTimes.set(operation, performance.now());
  }

  end(operation: string, count?: number) {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operation}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.metrics.push({
      operation,
      duration,
      count,
      avgDuration: count ? duration / count : undefined,
    });

    this.startTimes.delete(operation);
  }

  getMetrics(): PerformanceMetrics[] {
    return this.metrics;
  }

  printReport() {
    console.log('\n📊 Performance Profile Report\n');
    console.log('='.repeat(80));
    console.log(
      `${'Operation'.padEnd(40)} ${'Duration'.padStart(12)} ${'Count'.padStart(8)} ${'Avg'.padStart(12)}`
    );
    console.log('='.repeat(80));

    const sorted = [...this.metrics].sort((a, b) => b.duration - a.duration);

    for (const metric of sorted) {
      const duration = `${metric.duration.toFixed(0)}ms`;
      const count = metric.count ? metric.count.toString() : '-';
      const avg = metric.avgDuration ? `${metric.avgDuration.toFixed(1)}ms` : '-';

      console.log(
        `${metric.operation.padEnd(40)} ${duration.padStart(12)} ${count.padStart(8)} ${avg.padStart(12)}`
      );
    }

    console.log('='.repeat(80));

    // Summary
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    console.log(`\nTotal Duration: ${totalDuration.toFixed(0)}ms (${(totalDuration / 1000).toFixed(2)}s)`);

    // Top bottlenecks
    console.log('\n🔴 Top 3 Bottlenecks:');
    sorted.slice(0, 3).forEach((metric, i) => {
      const percentage = ((metric.duration / totalDuration) * 100).toFixed(1);
      console.log(`  ${i + 1}. ${metric.operation}: ${metric.duration.toFixed(0)}ms (${percentage}%)`);
    });

    console.log('');
  }
}

async function main() {
  console.log('\n⚡ Starting Performance Profiling...\n');

  const profiler = new PerformanceProfiler();

  try {
    // 1. Test database query performance
    console.log('1️⃣  Testing database query performance...');
    profiler.start('DB: Count all bills');
    const billCount = await prisma.bill.count();
    profiler.end('DB: Count all bills');

    profiler.start('DB: Find 100 bills with relations');
    const billsWithRelations = await prisma.bill.findMany({
      take: 100,
      include: {
        watchlists: true,
        changeLogs: true,
      },
    });
    profiler.end('DB: Find 100 bills with relations', 100);

    profiler.start('DB: Find 100 bills without relations');
    const billsNoRelations = await prisma.bill.findMany({
      take: 100,
    });
    profiler.end('DB: Find 100 bills without relations', 100);

    console.log(`   ✓ Found ${billCount} bills total`);

    // 2. Test single vs batch inserts
    console.log('\n2️⃣  Testing database write performance...');

    // Single inserts (simulated)
    profiler.start('DB: 10 sequential inserts');
    for (let i = 0; i < 10; i++) {
      await prisma.syncJob.create({
        data: {
          jobType: 'test_job',
          payload: { test: i },
          status: 'completed',
        },
      });
    }
    profiler.end('DB: 10 sequential inserts', 10);

    // Batch insert
    profiler.start('DB: 10 batch inserts');
    await prisma.syncJob.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        jobType: 'test_job_batch',
        payload: { test: i },
        status: 'completed',
      })),
    });
    profiler.end('DB: 10 batch inserts', 10);

    // Cleanup test data
    await prisma.syncJob.deleteMany({
      where: {
        OR: [{ jobType: 'test_job' }, { jobType: 'test_job_batch' }],
      },
    });

    // 3. Test bill sync performance (small sample)
    console.log('\n3️⃣  Testing bill sync performance...');
    const billSync = getBillSyncService();

    profiler.start('Sync: Fetch 50 bills from API');
    const syncResult = await billSync.syncBills({
      limit: 50,
      priority: 'recent',
    });
    profiler.end('Sync: Fetch 50 bills from API', 50);

    console.log(`   ✓ Synced: ${syncResult.recordsFetched} fetched, ${syncResult.recordsUpdated} updated`);

    // 4. Test API endpoint performance
    console.log('\n4️⃣  Testing API query performance...');

    profiler.start('DB: Complex query with filters');
    await prisma.bill.findMany({
      where: {
        congress: 118,
        billType: 'hr',
        watchlists: {
          some: {},
        },
      },
      include: {
        watchlists: {
          include: {
            user: true,
          },
        },
      },
      take: 20,
    });
    profiler.end('DB: Complex query with filters', 20);

    // 5. Memory usage
    const memoryUsage = process.memoryUsage();
    console.log('\n5️⃣  Memory Usage:');
    console.log(`   RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);

    // Print report
    profiler.printReport();

    // Recommendations
    console.log('\n💡 Optimization Recommendations:\n');
    console.log('1. **Parallel API Requests**: Fetch multiple bills concurrently (respect rate limits)');
    console.log('2. **Batch Database Operations**: Use createMany/updateMany instead of sequential operations');
    console.log('3. **Query Optimization**: Add indexes, reduce relation loading where not needed');
    console.log('4. **Caching**: Cache frequently accessed bills/members (Redis)');
    console.log('5. **Connection Pooling**: Configure Prisma connection pool size');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during profiling:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
