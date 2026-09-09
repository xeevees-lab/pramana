import { describe, it, expect } from 'vitest';
import { computeGroundedForecast, MODEL_VERSION } from '../src/services/intelligence/forecastEngine.js';
import { query } from '../src/db/pool.js';

describe('Deterministic ML Forecasting Engine', () => {
  it('returns NO_FORECAST_JUSTIFIED when reporting data is insufficient', async () => {
    const result = await computeGroundedForecast({
      event: { article_count: 1, source_count: 1 },
      articles: [{ title: 'Single report' }],
    });

    expect(result.status).toBe('NO_FORECAST_JUSTIFIED');
    expect(result.probability).toBeNull();
    expect(result.uncertaintyLower).toBeNull();
    expect(result.uncertaintyUpper).toBeNull();
    expect(result.explanation).toContain('Insufficient');
  });

  it('computes calibrated probability and 95% Wilson confidence bounds from real features', async () => {
    const mockArticles = [
      { source_name: 'Reuters', reliability_score: 0.9 },
      { source_name: 'AP', reliability_score: 0.85 },
      { source_name: 'BBC', reliability_score: 0.88 },
      { source_name: 'Al Jazeera', reliability_score: 0.8 },
    ];

    const result = await computeGroundedForecast({
      event: {
        category: 'disasters',
        severity: 'high',
        article_count: 4,
        source_count: 4,
      },
      articles: mockArticles,
      claims: [{ verification_status: 'VERIFIED' }],
      entities: [{ name: 'Nepal' }, { name: 'Kathmandu' }],
    });

    expect(result.status).toBe('FORECAST_PRODUCED');
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(typeof result.probability).toBe('number');
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThan(1);

    // Wilson confidence intervals must enclose the probability
    expect(result.uncertaintyLower).toBeLessThanOrEqual(result.probability);
    expect(result.uncertaintyUpper).toBeGreaterThanOrEqual(result.probability);

    // Feature contributions must be populated
    expect(result.featureContributions.length).toBeGreaterThan(3);
    expect(result.explanation).toContain('%');
  });

  it('persists grounded forecast record in database when requested', async () => {
    const { rows } = await query('SELECT id FROM events LIMIT 1');
    if (rows.length === 0) return;
    const testEventId = rows[0].id;

    const result = await computeGroundedForecast({
      event: {
        id: testEventId,
        category: 'conflict',
        article_count: 5,
        source_count: 3,
      },
      articles: [
        { source_name: 'Reuters', reliability_score: 0.9 },
        { source_name: 'AP', reliability_score: 0.85 },
      ],
      persist: true,
    });

    expect(result.status).toBe('FORECAST_PRODUCED');

    // Verify it was stored in the forecasts table
    const dbRes = await query(
      'SELECT * FROM forecasts WHERE event_id = $1 AND model_version = $2 ORDER BY predicted_at DESC LIMIT 1',
      [testEventId, MODEL_VERSION]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(Number(dbRes.rows[0].probability)).toBeCloseTo(result.probability, 2);
  });
});
