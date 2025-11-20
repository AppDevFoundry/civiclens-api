/**
 * Database Connection Test
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);

    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('Database connection successful!', result);

    const userCount = await prisma.user.count();
    console.log('User count:', userCount);

    const billCount = await prisma.bill.count();
    console.log('Bill count:', billCount);

  } catch (error) {
    console.error('Database connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
