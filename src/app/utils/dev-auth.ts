/**
 * Development Auth Helper
 *
 * Provides easy JWT generation and test user management for development/testing.
 * DO NOT use in production!
 */

import generateToken from '../routes/auth/token.utils';
import * as bcrypt from 'bcryptjs';
import prisma from '../../prisma/prisma-client';

/**
 * Test user credentials (consistent across dev/test environments)
 */
export const TEST_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'testpassword123',
};

/**
 * Create or get test user with known credentials
 * Useful for automated testing and development
 */
export async function getOrCreateTestUser() {
  // Check if test user exists
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER.email },
    select: {
      id: true,
      email: true,
      username: true,
      bio: true,
      image: true,
    },
  });

  // Create if doesn't exist
  if (!user) {
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

    user = await prisma.user.create({
      data: {
        username: TEST_USER.username,
        email: TEST_USER.email,
        password: hashedPassword,
        bio: 'Test user for development and testing',
      },
      select: {
        id: true,
        email: true,
        username: true,
        bio: true,
        image: true,
      },
    });

    console.log('[DevAuth] Created test user:', TEST_USER.email);
  }

  return {
    ...user,
    token: generateToken(user.id),
  };
}

/**
 * Generate a JWT token for a specific user ID
 * Useful for testing authenticated endpoints
 */
export function generateTestToken(userId: number): string {
  return generateToken(userId);
}

/**
 * Get a ready-to-use Authorization header value
 */
export async function getTestAuthHeader(): Promise<string> {
  const user = await getOrCreateTestUser();
  return `Token ${user.token}`;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Verify if a request should bypass authentication in development
 * Use this in auth middleware for development convenience
 */
export function shouldBypassAuth(): boolean {
  return isDevelopment() && process.env.DEV_BYPASS_AUTH === 'true';
}

// Export for easy importing
export default {
  TEST_USER,
  getOrCreateTestUser,
  generateTestToken,
  getTestAuthHeader,
  isDevelopment,
  shouldBypassAuth,
};
