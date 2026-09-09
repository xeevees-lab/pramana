import { describe, it, expect, beforeAll } from 'vitest';
import { retrieveHybridContext } from '../src/services/research/hybridRetriever.js';
import { query } from '../src/db/pool.js';

describe('9-Vector Hybrid Retrieval Engine', () => {
  let sampleTopic = 'flood';

  beforeAll(async () => {
    // Check if there are events or articles to query
    const { rows } = await query('SELECT title FROM events LIMIT 1');
    if (rows.length > 0) {
      // Pick first word as sample topic
      const words = rows[0].title.split(/\s+/).filter(w => w.length > 3);
      if (words.length > 0) {
        sampleTopic = words[0];
      }
    }
  });

  it('retrieves multi-dimensional context across events, articles, entities, and graph', async () => {
    const context = await retrieveHybridContext({ query: sampleTopic, limit: 5 });

    expect(context.query).toBe(sampleTopic);
    expect(context.expansion).toBeDefined();
    expect(Array.isArray(context.events)).toBe(true);
    expect(Array.isArray(context.articles)).toBe(true);
    expect(Array.isArray(context.claims)).toBe(true);
    expect(Array.isArray(context.entities)).toBe(true);
    expect(context.graphContext).toBeDefined();
    expect(Array.isArray(context.supportedHypotheses)).toBe(true);
    expect(Array.isArray(context.unsupportedHypotheses)).toBe(true);
  });

  it('ranks higher reliability sources ahead of low reliability sources', async () => {
    const context = await retrieveHybridContext({ query: sampleTopic, limit: 8 });

    if (context.articles.length >= 2) {
      const reliabilities = context.articles
        .map(a => a.reliability_score)
        .filter(r => r !== null && r !== undefined);

      // Check that reliability scores are ordered non-ascending
      for (let i = 0; i < reliabilities.length - 1; i++) {
        expect(reliabilities[i]).toBeGreaterThanOrEqual(reliabilities[i + 1]);
      }
    }
  });

  it('handles empty query safely', async () => {
    const empty = await retrieveHybridContext({ query: '' });
    expect(empty.events).toEqual([]);
    expect(empty.articles).toEqual([]);
    expect(empty.claims).toEqual([]);
  });
});
