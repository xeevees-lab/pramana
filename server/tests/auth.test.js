import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Auth Routes — Unauthenticated', () => {
  it('POST /api/auth/session rejects without auth header', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/session',
    });

    // Should return 401 or 503 (depending on Firebase config)
    expect([401, 503]).toContain(response.statusCode);

    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();

    await app.close();
  });

  it('GET /api/auth/me rejects without auth header', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect([401, 503]).toContain(response.statusCode);

    await app.close();
  });

  it('DELETE /api/auth/account rejects without auth header', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/auth/account',
    });

    expect([401, 503]).toContain(response.statusCode);

    await app.close();
  });

  it('POST /api/auth/session rejects with invalid Bearer token', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      headers: {
        authorization: 'Bearer invalid-token-12345',
      },
    });

    // Without Firebase configured: 503. With Firebase: 401.
    expect([401, 503]).toContain(response.statusCode);

    await app.close();
  });
});
