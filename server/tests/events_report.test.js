import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { query } from '../src/db/pool.js';

describe('Event Long-Form Intelligence Report', () => {
  let app;
  let testEventId;

  beforeAll(async () => {
    app = await buildApp();

    // Fetch an existing event from the database, or create a temporary test event
    const { rows: events } = await query('SELECT id FROM events ORDER BY created_at DESC LIMIT 1');
    if (events.length > 0) {
      testEventId = events[0].id;
    } else {
      const ins = await query(
        `INSERT INTO events (title, summary, category, severity, status)
         VALUES ('Test International Summit', 'Delegates from 20 nations gathered for maritime discussions.', 'diplomacy', 'normal', 'ongoing')
         RETURNING id`
      );
      testEventId = ins.rows[0].id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/events/:id returns 404 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/events/:id returns rich assembled intelligence report', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/events/${testEventId}`,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();

    // Base event & related arrays
    expect(json.event).toBeDefined();
    expect(json.event.id).toBe(testEventId);
    expect(Array.isArray(json.articles)).toBe(true);
    expect(Array.isArray(json.claims)).toBe(true);
    expect(Array.isArray(json.entities)).toBe(true);
    expect(Array.isArray(json.relatedEvents)).toBe(true);

    // Assembled report structure
    expect(json.report).toBeDefined();
    expect(json.report.headline).toBeDefined();
    expect(json.report.meta).toBeDefined();
    expect(json.report.meta.category).toBeDefined();
    expect(json.report.verifiedPicture).toBeDefined();
    expect(typeof json.report.verifiedPicture).toBe('string');
    expect(json.report.whatHappened).toBeDefined();
    expect(Array.isArray(json.report.confirmedClaims)).toBe(true);
    expect(Array.isArray(json.report.uncertainClaims)).toBe(true);
    expect(Array.isArray(json.report.timeline)).toBe(true);
    expect(Array.isArray(json.report.sources)).toBe(true);
    expect(json.report.lastUpdated).toBeDefined();
  });
});
