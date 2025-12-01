/**
 * Article Controller Integration Tests
 *
 * Tests for article CRUD operations, comments, and favorites.
 */

// @ts-nocheck - Disable TypeScript for mock setup flexibility

import request from 'supertest';
import { mockAuthHeaders } from '../fixtures';

// Mock article service
const mockArticleService = {
  getArticles: jest.fn(),
  getFeed: jest.fn(),
  createArticle: jest.fn(),
  getArticle: jest.fn(),
  updateArticle: jest.fn(),
  deleteArticle: jest.fn(),
  getCommentsByArticle: jest.fn(),
  addComment: jest.fn(),
  deleteComment: jest.fn(),
  favoriteArticle: jest.fn(),
  unfavoriteArticle: jest.fn(),
};

jest.mock('../../app/routes/article/article.service', () => ({
  getArticles: (...args) => mockArticleService.getArticles(...args),
  getFeed: (...args) => mockArticleService.getFeed(...args),
  createArticle: (...args) => mockArticleService.createArticle(...args),
  getArticle: (...args) => mockArticleService.getArticle(...args),
  updateArticle: (...args) => mockArticleService.updateArticle(...args),
  deleteArticle: (...args) => mockArticleService.deleteArticle(...args),
  getCommentsByArticle: (...args) => mockArticleService.getCommentsByArticle(...args),
  addComment: (...args) => mockArticleService.addComment(...args),
  deleteComment: (...args) => mockArticleService.deleteComment(...args),
  favoriteArticle: (...args) => mockArticleService.favoriteArticle(...args),
  unfavoriteArticle: (...args) => mockArticleService.unfavoriteArticle(...args),
}));

// Mock auth module to control required vs optional auth
jest.mock('../../app/routes/auth/auth', () => ({
  __esModule: true,
  default: {
    required: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
      }
      if (authHeader === mockAuthHeaders.testUser) {
        req.auth = { user: { id: 1 } };
      } else if (authHeader === mockAuthHeaders.invalid) {
        return res.status(401).json({ error: 'Invalid token' });
      } else {
        return res.status(401).json({ error: 'Invalid token' });
      }
      next();
    },
    optional: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (authHeader === mockAuthHeaders.testUser) {
        req.auth = { user: { id: 1 } };
      } else if (authHeader === mockAuthHeaders.invalid) {
        return res.status(401).json({ error: 'Invalid token' });
      } else {
        req.auth = null;
      }
      next();
    },
  },
}));

import app from '../../app';

describe('Article Controller Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/articles', () => {
    it('should return paginated articles', async () => {
      const articles = {
        articles: [
          { slug: 'test-article', title: 'Test Article', description: 'Test' },
        ],
        articlesCount: 1,
      };
      mockArticleService.getArticles.mockResolvedValue(articles);

      const response = await request(app)
        .get('/api/articles')
        .expect(200);

      expect(response.body).toEqual(articles);
      expect(mockArticleService.getArticles).toHaveBeenCalled();
    });

    it('should pass query parameters', async () => {
      mockArticleService.getArticles.mockResolvedValue({ articles: [], articlesCount: 0 });

      await request(app)
        .get('/api/articles?offset=10&limit=5&tag=javascript')
        .expect(200);

      expect(mockArticleService.getArticles).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: '10',
          limit: '5',
          tag: 'javascript',
        }),
        undefined
      );
    });

    it('should pass user id when authenticated', async () => {
      mockArticleService.getArticles.mockResolvedValue({ articles: [], articlesCount: 0 });

      await request(app)
        .get('/api/articles')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(mockArticleService.getArticles).toHaveBeenCalledWith(
        expect.any(Object),
        1
      );
    });
  });

  describe('GET /api/articles/feed', () => {
    it('should return user feed', async () => {
      const feed = {
        articles: [
          { slug: 'feed-article', title: 'Feed Article' },
        ],
        articlesCount: 1,
      };
      mockArticleService.getFeed.mockResolvedValue(feed);

      const response = await request(app)
        .get('/api/articles/feed')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body).toEqual(feed);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/articles/feed')
        .expect(401);
    });
  });

  describe('POST /api/articles', () => {
    it('should create article', async () => {
      const article = {
        slug: 'new-article',
        title: 'New Article',
        description: 'Description',
        body: 'Content',
      };
      mockArticleService.createArticle.mockResolvedValue(article);

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          article: {
            title: 'New Article',
            description: 'Description',
            body: 'Content',
          },
        })
        .expect(201);

      expect(response.body.article).toEqual(article);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/articles')
        .send({ article: { title: 'Test' } })
        .expect(401);
    });
  });

  describe('GET /api/articles/:slug', () => {
    it('should return single article', async () => {
      const article = {
        slug: 'test-article',
        title: 'Test Article',
        body: 'Content',
      };
      mockArticleService.getArticle.mockResolvedValue(article);

      const response = await request(app)
        .get('/api/articles/test-article')
        .expect(200);

      expect(response.body.article).toEqual(article);
      expect(mockArticleService.getArticle).toHaveBeenCalledWith('test-article', undefined);
    });

    it('should handle not found', async () => {
      mockArticleService.getArticle.mockRejectedValue(new Error('Article not found'));

      await request(app)
        .get('/api/articles/nonexistent')
        .expect(500);
    });
  });

  describe('PUT /api/articles/:slug', () => {
    it('should update article', async () => {
      const updated = {
        slug: 'updated-article',
        title: 'Updated Title',
      };
      mockArticleService.updateArticle.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/articles/test-article')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          article: { title: 'Updated Title' },
        })
        .expect(200);

      expect(response.body.article).toEqual(updated);
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/articles/test-article')
        .send({ article: { title: 'Updated' } })
        .expect(401);
    });
  });

  describe('DELETE /api/articles/:slug', () => {
    it('should delete article', async () => {
      mockArticleService.deleteArticle.mockResolvedValue(undefined);

      await request(app)
        .delete('/api/articles/test-article')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(204);

      expect(mockArticleService.deleteArticle).toHaveBeenCalledWith('test-article', 1);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/articles/test-article')
        .expect(401);
    });
  });

  describe('GET /api/articles/:slug/comments', () => {
    it('should return article comments', async () => {
      const comments = [
        { id: 1, body: 'Comment 1' },
        { id: 2, body: 'Comment 2' },
      ];
      mockArticleService.getCommentsByArticle.mockResolvedValue(comments);

      const response = await request(app)
        .get('/api/articles/test-article/comments')
        .expect(200);

      expect(response.body.comments).toEqual(comments);
    });
  });

  describe('POST /api/articles/:slug/comments', () => {
    it('should add comment', async () => {
      const comment = { id: 1, body: 'New comment' };
      mockArticleService.addComment.mockResolvedValue(comment);

      const response = await request(app)
        .post('/api/articles/test-article/comments')
        .set('Authorization', mockAuthHeaders.testUser)
        .send({
          comment: { body: 'New comment' },
        })
        .expect(200);

      expect(response.body.comment).toEqual(comment);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/articles/test-article/comments')
        .send({ comment: { body: 'Test' } })
        .expect(401);
    });
  });

  describe('DELETE /api/articles/:slug/comments/:id', () => {
    it('should delete comment', async () => {
      mockArticleService.deleteComment.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/articles/test-article/comments/1')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(mockArticleService.deleteComment).toHaveBeenCalledWith(1, 1);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/articles/test-article/comments/1')
        .expect(401);
    });
  });

  describe('POST /api/articles/:slug/favorite', () => {
    it('should favorite article', async () => {
      const article = {
        slug: 'test-article',
        favorited: true,
        favoritesCount: 1,
      };
      mockArticleService.favoriteArticle.mockResolvedValue(article);

      const response = await request(app)
        .post('/api/articles/test-article/favorite')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.article.favorited).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/articles/test-article/favorite')
        .expect(401);
    });
  });

  describe('DELETE /api/articles/:slug/favorite', () => {
    it('should unfavorite article', async () => {
      const article = {
        slug: 'test-article',
        favorited: false,
        favoritesCount: 0,
      };
      mockArticleService.unfavoriteArticle.mockResolvedValue(article);

      const response = await request(app)
        .delete('/api/articles/test-article/favorite')
        .set('Authorization', mockAuthHeaders.testUser)
        .expect(200);

      expect(response.body.article.favorited).toBe(false);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/articles/test-article/favorite')
        .expect(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors', async () => {
      mockArticleService.getArticles.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/articles')
        .expect(500);
    });
  });
});
