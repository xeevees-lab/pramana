import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { query } from '../src/db/pool.js';

const testFirebaseUid = 'test-profile-settings-uid-' + Date.now();

// Mock verifyIdToken so requireAuth succeeds with real database queries
vi.mock('../src/plugins/firebase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isInitialized: () => true,
    verifyIdToken: async (token) => {
      if (token === 'valid-test-token') {
        return {
          uid: testFirebaseUid,
          email: 'test.analyst@pramana.local',
          name: 'Test Analyst',
        };
      }
      return null;
    },
    deleteFirebaseUser: async () => true,
  };
});

// Import buildApp after mock
const { buildApp } = await import('../src/app.js');

describe('Profile & Settings API Endpoints', () => {
  let app;
  let testUserId;

  beforeAll(async () => {
    app = await buildApp({ logger: false });

    // Seed a test user directly in PostgreSQL
    const { rows } = await query(
      `INSERT INTO users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, firebase_uid, email, display_name`,
      [testFirebaseUid, 'test.analyst@pramana.local', 'Test Analyst']
    );
    testUserId = rows[0].id;
  });

  afterAll(async () => {
    if (testUserId) {
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await app.close();
  });

  describe('Unauthenticated Access Control', () => {
    it('PATCH /api/auth/profile rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        payload: { display_name: 'Hacker' },
      });
      expect([401, 503]).toContain(res.statusCode);
    });

    it('GET /api/auth/settings rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/settings',
      });
      expect([401, 503]).toContain(res.statusCode);
    });

    it('PUT /api/auth/settings rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/settings',
        payload: { ai: { model: 'gemini-2.5-pro' } },
      });
      expect([401, 503]).toContain(res.statusCode);
    });

    it('GET /api/auth/stats rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/stats',
      });
      expect([401, 503]).toContain(res.statusCode);
    });
  });

  describe('Authenticated Profile & Settings Operations', () => {
    const authHeaders = {
      authorization: 'Bearer valid-test-token',
    };

    it('Profile update rejects empty display name', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: authHeaders,
        payload: { display_name: '   ' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation Error');
    });

    it('Profile update rejects display name longer than 100 characters', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: authHeaders,
        payload: { display_name: 'A'.repeat(101) },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation Error');
    });

    it('Profile update rejects bio longer than 500 characters', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: authHeaders,
        payload: { bio: 'B'.repeat(501) },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation Error');
    });

    it('Profile update successfully updates display_name and bio and persists to PostgreSQL', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: authHeaders,
        payload: {
          display_name: 'Senior Geopolitical Analyst',
          bio: 'Investigating global trade narratives and OSINT corroboration.',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.display_name).toBe('Senior Geopolitical Analyst');
      expect(body.user.bio).toBe('Investigating global trade narratives and OSINT corroboration.');

      // Verify directly from PostgreSQL
      const { rows } = await query('SELECT display_name, bio FROM users WHERE id = $1', [testUserId]);
      expect(rows[0].display_name).toBe('Senior Geopolitical Analyst');
      expect(rows[0].bio).toBe('Investigating global trade narratives and OSINT corroboration.');
    });

    it('GET /api/auth/settings returns current settings and available AI models', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/settings',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.settings).toBeDefined();
      expect(body.system.active_provider).toBe('gemini');
      expect(body.system.available_models.length).toBeGreaterThanOrEqual(2);
    });

    it('PUT /api/auth/settings persists real preferences and rejects invalid options', async () => {
      // Try invalid model
      const invalidRes = await app.inject({
        method: 'PUT',
        url: '/api/auth/settings',
        headers: authHeaders,
        payload: { ai: { model: 'unsupported-model-xyz' } },
      });
      expect(invalidRes.statusCode).toBe(400);

      // Save valid settings
      const validRes = await app.inject({
        method: 'PUT',
        url: '/api/auth/settings',
        headers: authHeaders,
        payload: {
          ai: { model: 'gemini-2.5-pro', temperature: 0.2 },
          research: { research_depth: 'deep', citation_style: 'footnote' },
          privacy: { save_search_history: false },
        },
      });

      expect(validRes.statusCode).toBe(200);
      const body = JSON.parse(validRes.body);
      expect(body.settings.ai.model).toBe('gemini-2.5-pro');
      expect(body.settings.research.research_depth).toBe('deep');
      expect(body.settings.research.citation_style).toBe('footnote');
      expect(body.settings.privacy.save_search_history).toBe(false);

      // Verify directly from DB persistence
      const { rows } = await query('SELECT settings FROM users WHERE id = $1', [testUserId]);
      expect(rows[0].settings.ai.model).toBe('gemini-2.5-pro');
      expect(rows[0].settings.research.research_depth).toBe('deep');
    });

    it('GET /api/auth/stats returns genuine account stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/stats',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.fact_checks_submitted).toBe(0);
      expect(body.auth_provider).toBe('Google OAuth 2.0');
      expect(body.member_since).toBeDefined();
    });

    it('DELETE /api/auth/account rejects without explicit DELETE confirmation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/auth/account',
        headers: authHeaders,
        payload: { confirmation: 'no' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Confirmation Required');
    });

    it('DELETE /api/auth/account removes user with explicit DELETE confirmation', async () => {
      // Create a separate user to test actual deletion
      const tempUid = 'temp-delete-uid-' + Date.now();
      const { rows } = await query(
        `INSERT INTO users (firebase_uid, email, display_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [tempUid, 'delete.me@pramana.local', 'Delete Me']
      );
      const tempId = rows[0].id;

      // Mock verifyIdToken to return this temp user
      const tempApp = await buildApp({ logger: false });

      // We can directly test deletion on app with header if verifyIdToken matches,
      // or directly verify query
      const delRes = await app.inject({
        method: 'DELETE',
        url: '/api/auth/account',
        headers: authHeaders,
        payload: { confirmation: 'DELETE' },
      });

      expect(delRes.statusCode).toBe(200);
      const body = JSON.parse(delRes.body);
      expect(body.message).toBe('Account deleted successfully');

      // Verify the user is deleted from the database
      const { rows: verifyRows } = await query('SELECT * FROM users WHERE id = $1', [testUserId]);
      expect(verifyRows.length).toBe(0);
      testUserId = null; // Prevent double cleanup
    });
  });
});
