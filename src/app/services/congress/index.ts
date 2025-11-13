/**
 * Congress.gov API Integration - Main Entry Point
 *
 * This module provides a unified interface to the Congress.gov API.
 * Use this as the single import point for all Congress-related functionality.
 *
 * @example
 * ```typescript
 * import { CongressApi } from '@/services/congress';
 *
 * // Fetch bills
 * const { bills } = await CongressApi.bills.listBills({ congress: 118, limit: 10 });
 *
 * // Get a specific member
 * const member = await CongressApi.members.getMemberById('B000944');
 * ```
 */

import billsService from './resources/bills.service';
import membersService from './resources/members.service';
import committeesService from './resources/committees.service';
import nominationsService from './resources/nominations.service';
import hearingsService from './resources/hearings.service';
import congressApiClient from './congress.client';

// Re-export types for convenience
export * from './congress.types';
export { congressApiClient };

/**
 * Main Congress API interface
 * Provides access to all Congress.gov resources
 */
export const CongressApi = {
  /**
   * Bills and legislation endpoints
   */
  bills: billsService,

  /**
   * Members of Congress endpoints
   */
  members: membersService,

  /**
   * Congressional committees endpoints
   */
  committees: committeesService,

  /**
   * Presidential nominations endpoints
   */
  nominations: nominationsService,

  /**
   * Committee hearings endpoints
   */
  hearings: hearingsService,

  /**
   * Direct access to HTTP client (for advanced use cases)
   */
  client: congressApiClient,

  /**
   * Health check - ping the Congress.gov API
   */
  ping: () => congressApiClient.ping()
};

/**
 * Default export
 */
export default CongressApi;
