/**
 * Jest Test Setup
 *
 * Loads environment variables before tests run.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Ensure test environment
process.env.NODE_ENV = 'test';

console.log('[Test Setup] Environment loaded');
