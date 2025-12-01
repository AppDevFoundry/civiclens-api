/**
 * Mock User Data for Testing
 *
 * Provides test user fixtures with consistent data for integration and E2E tests.
 */

import jwt from 'jsonwebtoken';

// JWT secret (matches the one used in the app)
const JWT_SECRET = process.env.JWT_SECRET || 'superSecret';

/**
 * Generate a test JWT token for a user ID
 */
export function generateTestToken(userId: number): string {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Test users with various states
 */
export const mockUsers = {
  // Primary test user (matches dev-auth.ts)
  testUser: {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    password: '$2a$10$hashedpassword123', // bcrypt hash of 'testpassword123'
    bio: 'Test user for development and testing',
    image: 'https://api.realworld.io/images/smiley-cyrus.jpeg',
    demo: false,
  },

  // Secondary user for multi-user tests
  secondaryUser: {
    id: 2,
    email: 'secondary@example.com',
    username: 'secondaryuser',
    password: '$2a$10$hashedpassword456',
    bio: 'Secondary test user',
    image: 'https://api.realworld.io/images/smiley-cyrus.jpeg',
    demo: false,
  },

  // User with no watchlists
  newUser: {
    id: 3,
    email: 'newuser@example.com',
    username: 'newuser',
    password: '$2a$10$hashedpassword789',
    bio: null,
    image: 'https://api.realworld.io/images/smiley-cyrus.jpeg',
    demo: false,
  },

  // User with disabled notifications
  unsubscribedUser: {
    id: 4,
    email: 'unsubscribed@example.com',
    username: 'unsubscribeduser',
    password: '$2a$10$hashedpasswordabc',
    bio: 'Unsubscribed from notifications',
    image: 'https://api.realworld.io/images/smiley-cyrus.jpeg',
    demo: false,
  },
};

/**
 * Pre-generated tokens for test users
 */
export const mockTokens = {
  testUser: generateTestToken(mockUsers.testUser.id),
  secondaryUser: generateTestToken(mockUsers.secondaryUser.id),
  newUser: generateTestToken(mockUsers.newUser.id),
  unsubscribedUser: generateTestToken(mockUsers.unsubscribedUser.id),
  invalid: 'invalid-token-12345',
  expired: jwt.sign({ id: 999 }, JWT_SECRET, { expiresIn: '-1h' }),
};

/**
 * Authorization headers ready for use with supertest
 */
export const mockAuthHeaders = {
  testUser: `Token ${mockTokens.testUser}`,
  secondaryUser: `Token ${mockTokens.secondaryUser}`,
  newUser: `Token ${mockTokens.newUser}`,
  unsubscribedUser: `Token ${mockTokens.unsubscribedUser}`,
  invalid: `Token ${mockTokens.invalid}`,
  expired: `Token ${mockTokens.expired}`,
};

/**
 * User creation payload for registration tests
 */
export const mockUserPayloads = {
  validRegistration: {
    user: {
      username: 'newregistereduser',
      email: 'newregistered@example.com',
      password: 'password123',
    },
  },
  duplicateEmail: {
    user: {
      username: 'anotheruser',
      email: 'test@example.com', // Same as testUser
      password: 'password123',
    },
  },
  duplicateUsername: {
    user: {
      username: 'testuser', // Same as testUser
      email: 'another@example.com',
      password: 'password123',
    },
  },
  invalidEmail: {
    user: {
      username: 'invalidemailuser',
      email: 'not-an-email',
      password: 'password123',
    },
  },
  shortPassword: {
    user: {
      username: 'shortpassuser',
      email: 'shortpass@example.com',
      password: '123',
    },
  },
};

export default {
  mockUsers,
  mockTokens,
  mockAuthHeaders,
  mockUserPayloads,
  generateTestToken,
};
