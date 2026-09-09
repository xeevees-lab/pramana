import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { expandQuery, pruneHypotheses } from '../src/services/research/queryExpander.js';
import { retrieveHybridContext } from '../src/services/research/hybridRetriever.js';
import { assembleCausalChain, CAUSAL_STAGES } from '../src/services/intelligence/causalEngine.js';
import { buildTemporalSequence } from '../src/services/intelligence/temporalEngine.js';
import { getIndependentSourceClusters, verifyClaimAgainstSources } from '../src/services/intelligence/claimVerifier.js';
import { computeGroundedForecast, MODEL_VERSION } from '../src/services/intelligence/forecastEngine.js';

describe('Phase 11: End-to-End Real Research Intelligence Brain Pipeline', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes complete 6-stage research intelligence data path', async () => {
    const rawQuery = 'What caused the recent environmental flooding crisis and what is the trajectory?';

    // Step 1: Query Expansion & Hypothesis Generation
    const expansion = await expandQuery(rawQuery);
    expect(expansion).toBeDefined();
    expect(expansion.originalQuery).toBe(rawQuery);
    expect(Array.isArray(expansion.candidateHypotheses)).toBe(true);
    expect(expansion.candidateHypotheses.length).toBeGreaterThan(0);

    // Step 2: 9-Vector Hybrid Retrieval
    const context = await retrieveHybridContext({ query: rawQuery, limit: 10 });
    expect(context).toBeDefined();
    expect(Array.isArray(context.events)).toBe(true);
    expect(Array.isArray(context.articles)).toBe(true);
    expect(Array.isArray(context.entities)).toBe(true);

    // Step 3: Hypothesis Pruning against retrieved dispatches
    const pruned = pruneHypotheses(expansion.candidateHypotheses, context.articles);
    expect(pruned).toBeDefined();
    expect(Array.isArray(pruned.supportedHypotheses)).toBe(true);
    expect(Array.isArray(pruned.unsupportedHypotheses)).toBe(true);

    // Step 4: Source Independence & Syndication Deduplication
    const mockWireArticles = [
      { id: '1', title: 'AP: Severe Floods Hit Region Following Rain', publisher: 'Associated Press', wire_service: 'AP' },
      { id: '2', title: 'AP: Severe Floods Hit Region Following Rain', publisher: 'Daily News', wire_service: 'AP' },
      { id: '3', title: 'Local Geological Survey Releases Rainfall Report', publisher: 'National Geological Survey', wire_service: null },
    ];
    const independentClusters = getIndependentSourceClusters(mockWireArticles);
    // The two AP dispatches must collapse into 1 independent cluster, giving 2 total independent clusters
    expect(independentClusters.length).toBe(2);

    // Step 5: Causal & Temporal Modeling (9 stages, SUPPORTED vs INFERRED)
    const causalSeq = await assembleCausalChain({
      event: context.events[0] || { id: 'evt-1', title: 'Floods' },
      articles: context.articles,
      skipLlm: true,
    });
    const stageKeys = Object.keys(causalSeq.stages);
    expect(stageKeys.length).toBe(9);
    expect(stageKeys.every(k => ['SUPPORTED', 'INFERRED', 'MISSING_EVIDENCE'].includes(causalSeq.stages[k].status))).toBe(true);

    // Step 6: Calibrated ML Forecasting (logistic regression with Wilson 95% CI bounds)
    const forecast = await computeGroundedForecast({
      event: context.events[0] || { id: 'evt-1', title: 'Floods', category: 'disasters', severity: 'high', article_count: 5, source_count: 3 },
      articles: context.articles,
    });
    expect(forecast.modelVersion).toBe('pramana-calibrated-logreg-v1.2');
    if (forecast.status === 'FORECAST_PRODUCED') {
      expect(typeof forecast.probability).toBe('number');
      expect(forecast.uncertaintyLower).toBeLessThanOrEqual(forecast.probability);
      expect(forecast.uncertaintyUpper).toBeGreaterThanOrEqual(forecast.probability);
      expect(forecast.featureContributions.length).toBeGreaterThan(0);
    } else {
      expect(forecast.status).toBe('NO_FORECAST_JUSTIFIED');
    }
  });

  it('POST /api/ask/query integrates intelligence brain and returns verified picture, causal chain, and forecast', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ask/query',
      payload: {
        query: 'What is happening with floods and infrastructure damage?',
        mode: 'ask',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.mode).toBe('ask');
    expect(body.answer).toBeDefined();
    expect(typeof body.answer).toBe('string');
    expect(body.provenance).toBeDefined();

    // Verify presence of Brain metadata
    expect(body.causalChain).toBeDefined();
    expect(body.mlForecast).toBeDefined();
    expect(body.mlForecast.modelVersion).toBe('pramana-calibrated-logreg-v1.2');
    expect(Array.isArray(body.claims)).toBe(true);
    expect(Array.isArray(body.entities)).toBe(true);
  });
});
