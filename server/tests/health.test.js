import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health Routes', () => {
  it('GET /api/health returns status ok', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(body.timestamp).toBeDefined();

    await app.close();
  });

  it('GET /api/health/ready returns degraded when no databases', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });

    // Without running databases, should be 503 degraded
    expect(response.statusCode).toBe(503);

    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks).toBeDefined();
    expect(body.checks.postgres).toBe('unavailable');

    await app.close();
  });
});
