/**
 * Jest Test Setup
 *
 * This file runs before all tests to set up mocks and global test configuration.
 */

import { getMockEmailService } from './__mocks__/email.service.mock';

// Mock the email service module to avoid network calls during tests
jest.mock('../app/services/notifications/email.service', () => {
  const mockEmailService = getMockEmailService();

  return {
    EmailService: jest.fn().mockImplementation(() => mockEmailService),
    getEmailService: jest.fn(() => mockEmailService),
  };
});

// Reset mocks before each test
beforeEach(() => {
  const mockEmailService = getMockEmailService();
  mockEmailService.reset();
});

// Suppress console logs during tests (optional - comment out if you need to see logs)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };
