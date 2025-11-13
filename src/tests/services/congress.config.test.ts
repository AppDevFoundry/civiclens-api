/**
 * Congress Configuration Tests
 *
 * Tests for configuration loading and validation.
 */

describe('Congress Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('API Key Validation', () => {
    test('should throw error when CONGRESS_API_KEY is not set', () => {
      // Given: API key is not set
      delete process.env.CONGRESS_API_KEY;

      // When/Then: Importing config should throw
      expect(() => {
        jest.isolateModules(() => {
          require('../../app/config/congress.config');
        });
      }).toThrow('CONGRESS_API_KEY environment variable is required');
    });

    test('should throw error when CONGRESS_API_KEY is empty', () => {
      // Given: API key is empty string
      process.env.CONGRESS_API_KEY = '   ';

      // When/Then: Importing config should throw
      expect(() => {
        jest.isolateModules(() => {
          require('../../app/config/congress.config');
        });
      }).toThrow('CONGRESS_API_KEY environment variable is required');
    });

    test('should load config successfully with valid API key', () => {
      // Given: Valid API key is set
      process.env.CONGRESS_API_KEY = 'test-api-key-12345';

      // When: Config is loaded
      let config: any;
      jest.isolateModules(() => {
        config = require('../../app/config/congress.config').default;
      });

      // Then: Config should have correct API key
      expect(config).toBeDefined();
      expect(config!.apiKey).toBe('test-api-key-12345');
    });
  });

  describe('Base URL Configuration', () => {
    test('should use default base URL when not specified', () => {
      // Given: Only API key is set
      process.env.CONGRESS_API_KEY = 'test-api-key';
      delete process.env.CONGRESS_API_BASE_URL;

      // When: Config is loaded
      let config: any;
      jest.isolateModules(() => {
        config = require('../../app/config/congress.config').default;
      });

      // Then: Should use default base URL
      expect(config!.baseUrl).toBe('https://api.congress.gov/v3');
    });

    test('should use custom base URL when specified', () => {
      // Given: Custom base URL is set
      process.env.CONGRESS_API_KEY = 'test-api-key';
      process.env.CONGRESS_API_BASE_URL = 'https://custom.api.gov';

      // When: Config is loaded
      let config: any;
      jest.isolateModules(() => {
        config = require('../../app/config/congress.config').default;
      });

      // Then: Should use custom base URL
      expect(config!.baseUrl).toBe('https://custom.api.gov');
    });
  });

  describe('Default Configuration Values', () => {
    test('should have correct default values', () => {
      // Given: Valid API key is set
      process.env.CONGRESS_API_KEY = 'test-api-key';

      // When: Config is loaded
      let config: any;
      jest.isolateModules(() => {
        config = require('../../app/config/congress.config').default;
      });

      // Then: Should have correct defaults
      expect(config).toMatchObject({
        apiKey: 'test-api-key',
        baseUrl: 'https://api.congress.gov/v3',
        defaultFormat: 'json',
        defaultLimit: 20,
        requestTimeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
      });
    });
  });
});
