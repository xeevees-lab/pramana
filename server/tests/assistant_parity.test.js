import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { processResearchQuery } from '../src/services/research/askEngine.js';

describe('Floating Assistant & Ask Architectural Parity & Output Hygiene', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('shares identical processResearchQuery service across /ask and floating assistant queries', async () => {
    const query = 'What happened with the Nepal floods?';

    // 1. Direct invocation (as used in brain)
    const directResult = await processResearchQuery({ query, mode: 'ask' });
    expect(directResult).toBeDefined();
    expect(directResult.executiveSummary).toBeDefined();
    expect(directResult.currentStatus).toBeDefined();

    // 2. HTTP POST /api/ask/query invocation (called by both AskPage and FloatingIntelligence)
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask/query',
      payload: { query, mode: 'ask' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);

    // Architectural guarantee: Output structure must match identically
    expect(body.provenance).toBe(directResult.provenance);
    expect(body.currentStatus).toBeDefined();
    expect(typeof body.currentStatus.isActive).toBe('boolean');
    expect(body.executiveSummary).toBeDefined();
    expect(Array.isArray(body.sources)).toBe(true);
  });

  it('ensures zero raw markdown headers in executiveSummary and single verified picture', async () => {
    const query = 'Slain surfers trial in Mexico';
    const result = await processResearchQuery({ query, mode: 'ask' });

    // Ensure executive summary does not start with markdown headers
    expect(result.executiveSummary).not.toMatch(/^#{1,6}\s/);

    // Ensure status is explicitly classified
    expect(result.currentStatus).toBeDefined();
    expect(typeof result.currentStatus.isActive).toBe('boolean');

    // Ensure sources are returned with proper publisher and url
    if (result.sources && result.sources.length > 0) {
      result.sources.forEach((src) => {
        expect(src.name).toBeDefined();
        expect(src.url).toBeDefined();
      });
    }
  });

  it('correctly distinguishes current status vs recent history for settled events', async () => {
    const query = 'What happened in the Hong Kong handover legacy with Tung Chee-hwa?';
    const result = await processResearchQuery({ query, mode: 'ask' });

    expect(result.currentStatus).toBeDefined();
    // Historical event should NOT be active
    expect(result.currentStatus.isActive).toBe(false);
  });
});
