// server/scripts/run_10_golden_queries.mjs
import fetch from 'node-fetch';
import fs from 'fs';

const GOLDEN_QUERIES = [
  {
    id: 1,
    query: 'Did Apple launch the M4 MacBook Pro?',
    expectedIntent: 'PRODUCT_LAUNCH',
    shouldSuppressForecast: true,
  },
  {
    id: 2,
    query: 'Did OpenAI release GPT-5?',
    expectedIntent: 'MODEL_RELEASE',
    shouldSuppressForecast: true,
  },
  {
    id: 3,
    query: 'What are the latest AI technology updates?',
    expectedIntent: 'LATEST_NEWS',
    shouldSuppressForecast: true,
  },
  {
    id: 4,
    query: 'European unity study findings',
    expectedIntent: 'RESEARCH_FINDING',
    shouldSuppressForecast: true,
  },
  {
    id: 5,
    query: 'Slain Australian surfers homicide trial facts',
    expectedIntent: 'COURT_DECISION',
    shouldSuppressForecast: true,
  },
  {
    id: 6,
    query: 'What caused the floods in Kathmandu Nepal?',
    expectedIntent: 'CAUSE',
    shouldSuppressForecast: true,
  },
  {
    id: 7,
    query: 'Will river flooding worsen tomorrow in Kathmandu?',
    expectedIntent: 'FORECAST',
    shouldSuppressForecast: false,
  },
  {
    id: 8,
    query: 'Tung Chee-hwa historical role in Hong Kong',
    expectedIntent: 'HISTORY',
    shouldSuppressForecast: true,
  },
  {
    id: 9,
    query: 'Japan earthquake damage and casualty update',
    expectedIntent: 'DISASTER_STATUS',
    shouldSuppressForecast: true,
  },
  {
    id: 10,
    query: 'Quantum teleportation device consumer launch',
    expectedIntent: 'PRODUCT_LAUNCH',
    shouldSuppressForecast: true,
    expectInsufficient: true,
  }
];

async function run() {
  console.log('====================================================');
  console.log('PRAMĀṆA — 10 GOLDEN QUERIES LIVE FORENSIC AUDIT');
  console.log('====================================================\n');

  const results = [];

  for (const item of GOLDEN_QUERIES) {
    console.log(`\n--- Running Query ${item.id}: "${item.query}" ---`);
    try {
      const startTime = Date.now();
      const res = await fetch('http://localhost:3001/api/ask/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.query, mode: 'ask' }),
      });

      const elapsed = Date.now() - startTime;
      if (!res.ok) {
        console.error(`Query ${item.id} failed with HTTP ${res.status}`);
        results.push({ id: item.id, query: item.query, success: false, status: res.status });
        continue;
      }

      const data = await res.json();

      const intent = data.queryIntent?.primaryIntent || data.queryIntent?.detectedIntent || data.intent?.primaryIntent || 'UNKNOWN';
      const hasDirectAnswer = Boolean(data.directAnswer && data.directAnswer.trim().length > 0);
      const keyDevCount = Array.isArray(data.keyDevelopments) ? data.keyDevelopments.length : 0;
      const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
      const hasForecast = Boolean(data.forecast && (data.forecast.text || data.forecast.scenarioTree || data.forecast.confidence));
      const isInsufficient = Boolean(data.evidenceSufficiency?.isSufficient === false || data.directAnswer?.includes('cannot authoritatively answer') || data.directAnswer?.includes('No verified evidence'));
      
      const forecastCheckPass = item.shouldSuppressForecast ? !hasForecast : true;
      const sufficiencyCheckPass = item.expectInsufficient ? isInsufficient : true;

      console.log(`Status: HTTP ${res.status} (${elapsed}ms)`);
      console.log(`Detected Intent: ${intent} (Expected: ${item.expectedIntent})`);
      console.log(`Direct Answer Present: ${hasDirectAnswer}`);
      console.log(`Direct Answer Preview: "${(data.directAnswer || '').slice(0, 120)}..."`);
      console.log(`Key Developments: ${keyDevCount} items`);
      console.log(`Sources: ${sourceCount} items`);
      console.log(`Forecast Present: ${hasForecast} (Suppressed expected: ${item.shouldSuppressForecast} -> Pass: ${forecastCheckPass})`);
      console.log(`Sufficiency Gating: ${JSON.stringify(data.evidenceSufficiency || {})} -> Pass: ${sufficiencyCheckPass}`);

      results.push({
        id: item.id,
        query: item.query,
        success: true,
        elapsed,
        intent,
        hasDirectAnswer,
        directAnswerPreview: (data.directAnswer || '').slice(0, 200),
        keyDevelopments: data.keyDevelopments || [],
        sourceCount,
        sources: (data.sources || []).map(s => ({ title: s.title, source: s.source, tier: s.provenanceTier || s.tier })),
        hasForecast,
        forecastCheckPass,
        evidenceSufficiency: data.evidenceSufficiency,
        sufficiencyCheckPass,
      });
    } catch (err) {
      console.error(`Error running query ${item.id}:`, err.message);
      results.push({ id: item.id, query: item.query, success: false, error: err.message });
    }
  }

  console.log('\n====================================================');
  console.log('AUDIT SUMMARY');
  console.log('====================================================');
  console.table(results.map(r => ({
    ID: r.id,
    Query: r.query.slice(0, 30),
    Success: r.success,
    Intent: r.intent,
    Answer: r.hasDirectAnswer,
    KeyDevs: r.keyDevelopments?.length || 0,
    Sources: r.sourceCount || 0,
    ForecastOk: r.forecastCheckPass,
    SufficientOk: r.sufficiencyCheckPass,
  })));

  fs.writeFileSync('scripts/golden_queries_results.json', JSON.stringify(results, null, 2));
  console.log('\nSaved full results to server/scripts/golden_queries_results.json');
}

run();
