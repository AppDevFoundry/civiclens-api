/**
 * Congress.gov API Configuration
 *
 * Manages configuration for the Congress.gov API integration.
 * Validates required environment variables and provides typed access to settings.
 */

export interface CongressConfig {
  apiKey: string;
  baseUrl: string;
  defaultFormat: string;
  defaultLimit: number;
  requestTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Validates and loads Congress.gov API configuration from environment variables.
 *
 * @throws {Error} If CONGRESS_API_KEY is not set
 * @returns {CongressConfig} Validated configuration object
 */
function loadCongressConfig(): CongressConfig {
  const apiKey = process.env.CONGRESS_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'CONGRESS_API_KEY environment variable is required but not set. ' +
      'Please add it to your .env file. You can obtain an API key from: ' +
      'https://api.congress.gov/sign-up/'
    );
  }

  const baseUrl = process.env.CONGRESS_API_BASE_URL || 'https://api.congress.gov/v3';

  return {
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim(),
    defaultFormat: 'json',
    defaultLimit: 20,
    requestTimeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second base delay for exponential backoff
  };
}

/**
 * Singleton configuration instance.
 * Configuration is validated on first access.
 */
export const congressConfig = loadCongressConfig();

export default congressConfig;
