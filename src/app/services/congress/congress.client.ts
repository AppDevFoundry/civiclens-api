/**
 * Congress.gov API HTTP Client
 *
 * Provides a strongly typed, resilient HTTP client for the Congress.gov API.
 * Features:
 * - Automatic API key injection
 * - Request/response normalization
 * - Error handling with typed exceptions
 * - Retry logic for rate limiting (429 errors)
 * - Pagination helpers
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import congressConfig from '../../config/congress.config';
import {
  ApiResponse,
  Pagination,
  CongressApiException,
  BaseQueryParams
} from './congress.types';

/**
 * Congress.gov API Client
 * Manages all HTTP communication with the Congress.gov API
 */
export class CongressApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: congressConfig.baseUrl,
      timeout: congressConfig.requestTimeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CivicLens/1.0'
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor: Add API key to all requests
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add API key as query parameter
        config.params = {
          ...config.params,
          api_key: congressConfig.apiKey,
          format: config.params?.format || congressConfig.defaultFormat
        };

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor: Normalize responses and handle errors
    this.axiosInstance.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        // Handle rate limiting with retry
        if (error.response?.status === 429) {
          return this.handleRateLimit(error);
        }

        // Convert axios error to typed exception
        throw this.handleError(error);
      }
    );
  }

  /**
   * Handle rate limiting (429) with exponential backoff retry
   */
  private async handleRateLimit(error: AxiosError): Promise<any> {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };

    if (!config) {
      throw this.handleError(error);
    }

    // Initialize retry count
    config._retryCount = config._retryCount || 0;

    // Max retries reached
    if (config._retryCount >= congressConfig.retryAttempts) {
      throw this.handleError(error);
    }

    // Increment retry count
    config._retryCount += 1;

    // Calculate exponential backoff delay: baseDelay * 2^retryCount
    const delay = congressConfig.retryDelay * Math.pow(2, config._retryCount - 1);

    console.warn(
      `Congress.gov API rate limit hit. Retrying in ${delay}ms (attempt ${config._retryCount}/${congressConfig.retryAttempts})`
    );

    // Wait before retrying
    await this.sleep(delay);

    // Retry the request
    return this.axiosInstance.request(config);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Convert axios errors to typed CongressApiException
   */
  private handleError(error: AxiosError): CongressApiException {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;

      let message = 'Congress.gov API request failed';
      let detail: string | undefined;

      if (typeof data === 'string') {
        detail = data;
      } else if (data?.error) {
        message = data.error;
        detail = data.message || data.detail;
      } else if (data?.message) {
        message = data.message;
      }

      // Add status-specific messaging
      switch (status) {
        case 400:
          message = 'Bad request to Congress.gov API';
          break;
        case 401:
          message = 'Unauthorized: Invalid or missing API key';
          break;
        case 403:
          message = 'Forbidden: Access denied by Congress.gov API';
          break;
        case 404:
          message = 'Resource not found';
          break;
        case 429:
          message = 'Rate limit exceeded';
          break;
        case 500:
          message = 'Congress.gov API server error';
          break;
        case 503:
          message = 'Congress.gov API temporarily unavailable';
          break;
      }

      return new CongressApiException(
        status,
        message,
        detail,
        error.config?.headers?.['X-Request-Id'] as string,
        error.config?.url
      );
    } else if (error.request) {
      // Request made but no response received
      return new CongressApiException(
        0,
        'No response from Congress.gov API',
        'Network error or timeout',
        undefined,
        error.config?.url
      );
    } else {
      // Error setting up request
      return new CongressApiException(
        0,
        'Failed to create API request',
        error.message,
        undefined,
        error.config?.url
      );
    }
  }

  /**
   * Generic GET request with response normalization
   */
  async request<T>(path: string, params?: BaseQueryParams): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.get(path, { params });

      // Extract pagination if present
      const pagination = this.extractPagination(response.data);

      return {
        data: response.data,
        pagination,
        request: response.data.request
      };
    } catch (error) {
      // Error is already converted to CongressApiException by interceptor
      throw error;
    }
  }

  /**
   * GET request for collection endpoints (returns array of items)
   */
  async getCollection<T>(path: string, params?: BaseQueryParams): Promise<ApiResponse<T[]>> {
    const response = await this.request<any>(path, params);

    // Congress.gov API returns collections in different formats
    // Try to extract the array from common patterns
    let items: T[] = [];
    const data = response.data;

    // Pattern 1: { bills: [...] }
    // Pattern 2: { members: [...] }
    // Pattern 3: Direct array
    if (Array.isArray(data)) {
      items = data;
    } else if (data) {
      // Find the first array property
      const arrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
      if (arrayKey) {
        items = data[arrayKey];
      }
    }

    return {
      data: items,
      pagination: response.pagination,
      request: response.request
    };
  }

  /**
   * GET request for detail endpoints (returns single item)
   */
  async getDetail<T>(path: string, params?: BaseQueryParams): Promise<T> {
    const response = await this.request<any>(path, params);

    // Congress.gov API wraps single resources in an object
    // Try to extract the resource from common patterns
    const data = response.data;

    // Pattern 1: { bill: {...} }
    // Pattern 2: { member: {...} }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Find the first non-array, non-pagination property
      const resourceKey = Object.keys(data).find(
        key => !Array.isArray(data[key]) && key !== 'pagination' && key !== 'request'
      );
      if (resourceKey) {
        return data[resourceKey];
      }
    }

    return data;
  }

  /**
   * Extract pagination metadata from API response
   */
  private extractPagination(data: any): Pagination | undefined {
    if (!data || !data.pagination) {
      return undefined;
    }

    const pag = data.pagination;

    return {
      count: pag.count || 0,
      next: pag.next,
      previous: pag.prev || pag.previous
    };
  }

  /**
   * Build pagination params for next page
   */
  buildNextPageParams(pagination?: Pagination, currentParams?: BaseQueryParams): BaseQueryParams | null {
    if (!pagination?.next) {
      return null;
    }

    // Extract offset from next URL
    const url = new URL(pagination.next, congressConfig.baseUrl);
    const offset = url.searchParams.get('offset');
    const limit = url.searchParams.get('limit');

    return {
      ...currentParams,
      offset: offset ? parseInt(offset, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : currentParams?.limit
    };
  }

  /**
   * Build pagination params for previous page
   */
  buildPrevPageParams(pagination?: Pagination, currentParams?: BaseQueryParams): BaseQueryParams | null {
    if (!pagination?.previous) {
      return null;
    }

    const url = new URL(pagination.previous, congressConfig.baseUrl);
    const offset = url.searchParams.get('offset');
    const limit = url.searchParams.get('limit');

    return {
      ...currentParams,
      offset: offset ? parseInt(offset, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : currentParams?.limit
    };
  }

  /**
   * Format date for Congress.gov API (YYYY-MM-DDTHH:mm:ssZ)
   */
  formatApiDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Build date range query params
   */
  buildDateRange(fromDate?: Date, toDate?: Date): { fromDateTime?: string; toDateTime?: string } {
    return {
      fromDateTime: fromDate ? this.formatApiDate(fromDate) : undefined,
      toDateTime: toDate ? this.formatApiDate(toDate) : undefined
    };
  }

  /**
   * Health check - ping the API
   */
  async ping(): Promise<boolean> {
    try {
      // Try to fetch bill list with limit=1 as a health check
      await this.request('/bill', { limit: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Singleton instance of the Congress API client
 */
export const congressApiClient = new CongressApiClient();

export default congressApiClient;
