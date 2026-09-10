/**
 * newsRanker.js
 * 
 * Trainable Relevance & Ranking Model for Pramāṇa News Intelligence.
 * Extracts 16 signals and evaluates candidates using a trained, interpretable model.
 * 
 * Implements configurable feature flag:
 * PRAMANA_RANKER_STRATEGY = 'NEW_NEWS_RANKER' (default) | 'LEGACY_RANKER'
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, 'models', 'pramana-news-ranker-v1.json');

// Default initial weights before/alongside artifact loading
const DEFAULT_MODEL = {
  version: 'pramana-news-ranker-v1-base',
  featureVersion: 'v1.0',
  intercept: -0.45,
  weights: {
    query_semantic_similarity: 1.85,
    query_lexical_overlap: 1.25,
    headline_match: 1.65,
    entity_overlap: 1.40,
    topic_match: 0.90,
    event_type_match: 2.10, // Major weight: distinguishes product launch from commentary
    temporal_relevance: 1.15,
    source_reliability: 0.80,
    source_independence: 0.70,
    event_importance: 0.60,
    novelty: 0.50,
    historical_current_fit: 0.85,
    redundancy_penalty: -0.90,
    syndication_similarity: -0.75,
    graph_relevance: 0.95,
    direct_answer_relevance: 2.20, // Critical: prioritizes direct answers over tangential context
  },
  featureNames: [
    'query_semantic_similarity',
    'query_lexical_overlap',
    'headline_match',
    'entity_overlap',
    'topic_match',
    'event_type_match',
    'temporal_relevance',
    'source_reliability',
    'source_independence',
    'event_importance',
    'novelty',
    'historical_current_fit',
    'redundancy_penalty',
    'syndication_similarity',
    'graph_relevance',
    'direct_answer_relevance',
  ],
};

let activeModel = { ...DEFAULT_MODEL };

// Attempt to load trained artifact if present
export function reloadModelArtifact() {
  try {
    if (fs.existsSync(MODEL_PATH)) {
      const data = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8'));
      if (data && data.weights && typeof data.intercept === 'number') {
        activeModel = {
          ...data,
          version: data.modelVersion || data.version || 'pramana-news-ranker-v1',
        };
        return true;
      }
    }
  } catch (err) {
    console.warn('[NewsRanker] Warning loading model artifact:', err.message);
  }
  activeModel = { ...DEFAULT_MODEL };
  return false;
}

// Initial load
reloadModelArtifact();

/**
 * Extract 16 standardized features for a candidate (article or event) relative to query.
 * All features are normalized between 0.0 and 1.0 (or [-1.0, 1.0] for penalties).
 *
 * @param {Object} queryInfo - { originalQuery, queryIntent, highSignalTokens, targetEntities }
 * @param {Object} candidate - Candidate article or event from retriever
 * @param {Object} context - { poolCandidates, now }
 * @returns {Record<string, number>}
 */
export function extractCandidateFeatures(queryInfo = {}, candidate = {}, context = {}) {
  const queryText = (queryInfo.originalQuery || '').toLowerCase();
  const queryTokens = new Set(
    (queryInfo.highSignalTokens && queryInfo.highSignalTokens.length > 0)
      ? queryInfo.highSignalTokens
      : queryText.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2)
  );

  const title = (candidate.title || '').toLowerCase();
  const text = `${candidate.title || ''} ${candidate.summary || candidate.content || ''}`.toLowerCase();
  const titleTokens = new Set(title.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2));
  const bodyTokens = new Set(text.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2));

  // 1. Semantic similarity
  const query_semantic_similarity = Math.max(0, Math.min(1.0, Number(candidate.similarity || candidate.relevance_score || 0.5)));

  // 2. Lexical overlap
  let queryOverlapCount = 0;
  for (const t of queryTokens) {
    if (bodyTokens.has(t)) queryOverlapCount++;
  }
  const query_lexical_overlap = queryTokens.size > 0 ? (queryOverlapCount / queryTokens.size) : 0.0;

  // 3. Headline match
  let titleOverlapCount = 0;
  for (const t of queryTokens) {
    if (titleTokens.has(t)) titleOverlapCount++;
  }
  const headline_match = queryTokens.size > 0 ? (titleOverlapCount / queryTokens.size) : 0.0;

  // 4. Entity overlap
  const targetEntities = (queryInfo.targetEntities || []).map(e => e.toLowerCase());
  let entityOverlapCount = 0;
  if (targetEntities.length > 0) {
    for (const ent of targetEntities) {
      if (text.includes(ent)) entityOverlapCount++;
    }
  }
  const entity_overlap = targetEntities.length > 0 ? (entityOverlapCount / targetEntities.length) : (candidate.entities?.length ? 0.4 : 0.2);

  // 5. Topic match
  const candidateCategory = (candidate.category || '').toLowerCase();
  const queryIntent = queryInfo.queryIntent || {};
  let topic_match = 0.5;
  if (candidateCategory && queryText.includes(candidateCategory)) {
    topic_match = 1.0;
  } else if (candidateCategory === 'technology' && (queryText.includes('ai') || queryText.includes('software') || queryText.includes('model') || queryText.includes('tech'))) {
    topic_match = 0.95;
  } else if (candidateCategory === 'climate' && (queryText.includes('flood') || queryText.includes('earthquake') || queryText.includes('disaster'))) {
    topic_match = 0.95;
  }

  // 6. Event type match
  const candidateEventTypes = candidate.event_types || [];
  const expectedTypes = queryIntent.expectedEventTypes || [];
  const demotedTypes = queryIntent.demotedEventTypes || [];

  let event_type_match = 0.5; // neutral baseline
  if (expectedTypes.length > 0 && candidateEventTypes.length > 0) {
    const hasExpected = candidateEventTypes.some(t => expectedTypes.includes(t));
    const hasDemoted = candidateEventTypes.some(t => demotedTypes.includes(t));
    if (hasExpected && !hasDemoted) {
      event_type_match = 1.0;
    } else if (hasExpected && hasDemoted) {
      event_type_match = 0.6;
    } else if (hasDemoted) {
      event_type_match = 0.05; // strongly penalized
    } else {
      event_type_match = 0.35;
    }
  } else if (expectedTypes.length === 0) {
    event_type_match = 0.6;
  }

  // 7. Temporal relevance
  const now = context.now ? new Date(context.now).getTime() : Date.now();
  const candidateDate = candidate.published_at || candidate.first_reported_at || candidate.created_at;
  const ageHours = candidateDate ? Math.max(0, (now - new Date(candidateDate).getTime()) / (1000 * 60 * 60)) : 48;
  // Half-life decay over 7 days (168 hours)
  const temporal_relevance = Math.exp(-0.004 * ageHours);

  // 8. Source reliability
  const source_reliability = Math.max(0.5, Math.min(1.0, Number(candidate.reliability_score || candidate.source?.reliability_score || 0.82)));

  // 9. Source independence
  const source_count = Number(candidate.source_count || (candidate.sources ? candidate.sources.length : 1));
  const source_independence = Math.min(1.0, source_count / 4.0);

  // 10. Event importance
  const article_count = Number(candidate.article_count || 1);
  const event_importance = Math.min(1.0, Math.log2(article_count + 1) / 3.0);

  // 11. Novelty
  const novelty = candidate.is_novelty ? 1.0 : 0.6;

  // 12. Historical/Current fit
  const temporalFocus = queryIntent.temporalFocus || 'CURRENT';
  let historical_current_fit = 0.8;
  if (temporalFocus === 'HISTORICAL') {
    historical_current_fit = candidate.status === 'historical' || ageHours > 168 ? 1.0 : 0.5;
  } else if (temporalFocus === 'CURRENT') {
    historical_current_fit = candidate.status === 'developing' || ageHours <= 72 ? 1.0 : 0.6;
  }

  // 13. Redundancy penalty (check duplicate titles in pool)
  let redundancy_penalty = 0.0;
  if (context.poolCandidates && context.poolCandidates.length > 1) {
    const similarCount = context.poolCandidates.filter(c => c.id !== candidate.id && c.title === candidate.title).length;
    if (similarCount > 0) redundancy_penalty = 0.8;
  }

  // 14. Syndication similarity
  let syndication_similarity = 0.0;
  if (candidate.is_syndicated) {
    syndication_similarity = 0.7;
  }

  // 15. Graph relevance
  const graphDegree = Number(candidate.graph_degree || candidate.connections_count || 0);
  const graph_relevance = Math.min(1.0, graphDegree / 5.0 || 0.4);

  // 16. Direct answer relevance: Does this directly answer the specific intent vs generic context?
  let direct_answer_relevance = 0.5;
  if (queryIntent.intents?.includes('PRODUCT_LAUNCH')) {
    // Requires active launch words
    if (/\b(?:unveils?|launches?|debuts?|releases?|announced (?:new|commercial))\b/i.test(title)) {
      direct_answer_relevance = 0.98;
    } else if (/\b(?:warns?|caution|risk|danger|threat|worried)\b/i.test(title)) {
      direct_answer_relevance = 0.02; // explicitly near zero for warnings when asked for launches
    } else {
      direct_answer_relevance = 0.35;
    }
  } else if (queryIntent.intents?.includes('RESEARCH_FINDING')) {
    if (/\b(?:researchers?|scientists?|study|discovery|published|trial)\b/i.test(title)) {
      direct_answer_relevance = 0.95;
    } else {
      direct_answer_relevance = 0.40;
    }
  } else if (queryIntent.intents?.includes('DISASTER_STATUS')) {
    if (/\b(?:earthquake|floods?|quake|cyclone|hurricane|disaster)\b/i.test(title)) {
      direct_answer_relevance = 0.95;
    } else {
      direct_answer_relevance = 0.30;
    }
  } else if (queryIntent.intents?.includes('CAUSE')) {
    if (/\b(?:cause|reason|trigger|why|rainfall|fault|failure|investigation)\b/i.test(text)) {
      direct_answer_relevance = 0.90;
    } else {
      direct_answer_relevance = 0.45;
    }
  } else {
    direct_answer_relevance = (headline_match * 0.5) + (query_semantic_similarity * 0.5);
  }

  return {
    query_semantic_similarity,
    query_lexical_overlap,
    headline_match,
    entity_overlap,
    topic_match,
    event_type_match,
    temporal_relevance,
    source_reliability,
    source_independence,
    event_importance,
    novelty,
    historical_current_fit,
    redundancy_penalty,
    syndication_similarity,
    graph_relevance,
    direct_answer_relevance,
  };
}

/**
 * Score a candidate using the active logistic regression model.
 *
 * @param {Record<string, number>} features
 * @param {Object} [model]
 * @returns {number} Probability between 0.0 and 1.0
 */
export function scoreFeatures(features, model = activeModel) {
  let z = model.intercept || 0;
  const weights = model.weights || {};

  for (const [name, val] of Object.entries(features)) {
    const w = weights[name] || 0;
    z += w * val;
  }

  // Sigmoid
  return 1 / (1 + Math.exp(-z));
}

/**
 * Rank a list of candidate articles or events with the trainable news ranker.
 * Respects feature flag PRAMANA_RANKER_STRATEGY.
 *
 * @param {Object} queryInfo - { originalQuery, queryIntent, highSignalTokens, targetEntities }
 * @param {Array<Object>} candidates - List of candidate records
 * @param {Object} [options]
 * @returns {Array<Object>} Ranked candidates with _rankScore, _features, and _provenance
 */
export function rankCandidates(queryInfo = {}, candidates = [], options = {}) {
  const strategy = process.env.PRAMANA_RANKER_STRATEGY || 'NEW_NEWS_RANKER';

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  // Safe fallback to legacy retriever scores if feature flag disabled
  if (strategy === 'LEGACY_RANKER') {
    return [...candidates].sort((a, b) => {
      const scoreA = a.compositeScore || a.relevance_score || a.similarity || 0;
      const scoreB = b.compositeScore || b.relevance_score || b.similarity || 0;
      return scoreB - scoreA;
    });
  }

  const context = {
    poolCandidates: candidates,
    now: options.now || Date.now(),
  };

  const scored = candidates.map(cand => {
    const features = extractCandidateFeatures(queryInfo, cand, context);
    const score = scoreFeatures(features, activeModel);

    // Apply severe suppression if candidate matches demoted types for this query
    const demotedTypes = queryInfo.queryIntent?.demotedEventTypes || [];
    const candTypes = cand.event_types || [];
    const isDemoted = candTypes.some(t => demotedTypes.includes(t));
    const finalScore = isDemoted ? score * 0.20 : score;

    return {
      ...cand,
      _rankScore: Number(finalScore.toFixed(4)),
      ranker_score: Number(finalScore.toFixed(4)),
      _rawRankScore: Number(score.toFixed(4)),
      _features: features,
      _isSuppressed: isDemoted,
      _rankerVersion: activeModel.version,
    };
  });

  // Sort descending by rank score, with reliability as tie-breaker for closely scored candidates
  return scored.sort((a, b) => {
    const diff = b._rankScore - a._rankScore;
    if (Math.abs(diff) > 0.02) return diff;
    const relDiff = (b.reliability_score || 0) - (a.reliability_score || 0);
    return relDiff !== 0 ? relDiff : diff;
  });
}

export const extractRankerFeatures = extractCandidateFeatures;

export function scoreCandidatePair(queryInfo, cand, context = {}) {
  const features = extractCandidateFeatures(queryInfo, cand, context);
  return scoreFeatures(features, activeModel);
}

export function setRankerStrategy(strategy) {
  process.env.PRAMANA_RANKER_STRATEGY = strategy;
}

export function getActiveModelMetadata() {
  return {
    strategy: process.env.PRAMANA_RANKER_STRATEGY || 'NEW_NEWS_RANKER',
    version: activeModel.version,
    featureVersion: activeModel.featureVersion,
    intercept: activeModel.intercept,
    featureCount: Object.keys(activeModel.weights || {}).length,
    weights: activeModel.weights,
  };
}
