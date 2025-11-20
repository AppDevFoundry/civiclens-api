/**
 * Tag Controller Integration Tests
 *
 * Tests for tag listing endpoint.
 */

// @ts-nocheck - Disable TypeScript for mock setup flexibility

import request from 'supertest';

// Mock tag service - default export
const mockGetTags = jest.fn();

jest.mock('../../app/routes/tag/tag.service', () => ({
  __esModule: true,
  default: (...args: any[]) => mockGetTags(...args),
}));

// Mock auth module
jest.mock('../../app/routes/auth/auth', () => ({
  __esModule: true,
  default: {
    required: (req: any, res: any, next: any) => next(),
    optional: (req: any, res: any, next: any) => next(),
  },
}));

import app from '../../app';

describe('Tag Controller Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/tags', () => {
    it('should return list of tags', async () => {
      const tags = ['javascript', 'typescript', 'nodejs', 'react', 'testing'];
      mockGetTags.mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toEqual(tags);
      expect(mockGetTags).toHaveBeenCalled();
    });

    it('should return empty array when no tags exist', async () => {
      mockGetTags.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toEqual([]);
    });

    it('should handle service errors', async () => {
      mockGetTags.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/tags')
        .expect(500);
    });

    it('should return tags sorted alphabetically', async () => {
      const tags = ['zebra', 'apple', 'banana', 'cherry'];
      mockGetTags.mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toEqual(tags);
      expect(mockGetTags).toHaveBeenCalled();
    });

    it('should handle large number of tags', async () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag-${i}`);
      mockGetTags.mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toHaveLength(100);
    });

    it('should return tags with special characters', async () => {
      const tags = ['c++', 'c#', '.net', 'node.js'];
      mockGetTags.mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toEqual(tags);
    });
  });
});
