import { query } from '../../db/pool.js';
import { isGeminiConfigured, generateEmbedding } from '../gemini.js';
import { queryGraphContext } from '../intelligence/knowledgeGraph.js';
import { expandQuery, pruneHypotheses, detectQueryIntent } from './queryExpander.js';
import { rankCandidates } from '../ml/newsRanker.js';

/**
 * Configurable thresholds for Two-Stage Multi-Lane Hybrid Retrieval.
 * Note: These are initial configurable defaults subject to empirical validation against the Golden Set.
 */
export const VECTOR_RECALL_THRESHOLD = 0.38;
export const FINAL_RELEVANCE_THRESHOLD = 0.34;

export const DEFAULT_RETRIEVAL_WEIGHTS = {
  semantic: 0.30,
  lexical: 0.25,
  entity: 0.20,
  graph: 0.10,
  temporal: 0.10,
  sourceReliability: 0.05,
};

/**
 * Compute lexical token match ratio between a set of high-signal query tokens and target text.
 * Generically handles inflected/stemmed forms (e.g. "flooding" matches "flood", "disputes" matches "dispute").
 *
 * @param {string[]} queryTokens - High-signal query tokens
 * @param {string} targetText - Target title, summary, or content
 * @returns {number} Overlap ratio between 0.0 and 1.0
 */
export function computeTokenOverlap(queryTokens = [], targetText = '') {
  if (!queryTokens.length || !targetText) return 0;
  const lowerText = targetText.toLowerCase();
  let matched = 0;
  for (const token of queryTokens) {
    const stem = token.endsWith('ing') && token.length > 5 ? token.slice(0, -3)
      : token.endsWith('es') && token.length > 4 ? token.slice(0, -2)
      : token.endsWith('s') && token.length > 3 ? token.slice(0, -1)
      : token.endsWith('y') && token.length > 4 ? token.slice(0, -1)
      : token.endsWith('an') && token.length > 4 ? token.slice(0, -2)
      : token;

    if (token.length <= 3) {
      const regex = new RegExp(`\\b${token}\\b`, 'i');
      if (regex.test(lowerText)) {
        matched++;
      }
    } else {
      const wordRegex = new RegExp(`\\b(${token}|${stem}\\w*)\\b`, 'i');
      if (wordRegex.test(lowerText)) {
        matched++;
      }
    }
  }
  return matched / queryTokens.length;
}

/**
 * Compute adaptive temporal relevance score based on intent and published age.
 *
 * @param {Date|string} date
 * @param {'CURRENT_STATUS'|'RECENT_EVENT'|'CAUSAL'|'HISTORICAL'|'GENERAL_TOPIC'} intent
 * @returns {number} Score between 0.0 and 1.0
 */
export function computeTemporalScore(date, intent = 'GENERAL_TOPIC') {
  if (!date) return 0.5;
  const ageHours = Math.max(0, (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));

  if (intent === 'CURRENT_STATUS') {
    // Strongly favors breaking events in the last 72 hours (0.8 - 1.0),
    // but maintains an informative floor (~0.35 - 0.5) so that recent events
    // can be evaluated and correctly reported as settled/recent rather than dropping out.
    if (ageHours <= 72) {
      return 0.7 + 0.3 * Math.exp(-ageHours / 72);
    }
    return Math.max(0.35, 0.7 * Math.exp(-ageHours / (24 * 90)));
  }

  if (intent === 'HISTORICAL') {
    // Favors older archival events
    return Math.min(1.0, 0.3 + (ageHours / (24 * 365)));
  }

  // RECENT_EVENT, CAUSAL, GENERAL_TOPIC: smooth adaptive decay over months
  // Major events remain high-scoring for weeks and months
  return Math.exp(-ageHours / (24 * 180));
}

/**
 * Two-Stage Multi-Lane Hybrid Retrieval Engine.
 * Combines Stage 1 Broad Recall with Stage 2 Precision Reranking & Relevance Gate.
 *
 * @param {object} params
 * @param {string} params.query - Raw user query or claim
 * @param {object} [params.expansion] - Pre-computed query expansion (or auto-computed)
 * @param {number} [params.limit=8] - Max items per category
 * @param {number} [params.vectorRecallThreshold=VECTOR_RECALL_THRESHOLD]
 * @param {number} [params.finalRelevanceThreshold=FINAL_RELEVANCE_THRESHOLD]
 * @param {object} [params.weights=DEFAULT_RETRIEVAL_WEIGHTS]
 * @returns {Promise<object>} Unified research context
 */
export async function retrieveHybridContext({
  query: userQuery = '',
  expansion = null,
  limit = 8,
  vectorRecallThreshold = VECTOR_RECALL_THRESHOLD,
  finalRelevanceThreshold = FINAL_RELEVANCE_THRESHOLD,
  weights = DEFAULT_RETRIEVAL_WEIGHTS,
} = {}) {
  const cleanQuery = (userQuery || '').trim();
  if (!cleanQuery) {
    return {
      query: '',
      expansion: null,
      temporalIntent: 'GENERAL_TOPIC',
      events: [],
      articles: [],
      claims: [],
      entities: [],
      graphContext: { entities: [], relatedEvents: [], causalLinks: [] },
      narratives: [],
      causalLinks: [],
      supportedHypotheses: [],
      unsupportedHypotheses: [],
      eventFamily: [],
    };
  }

  // 1. Expand query into hypotheses, temporal intent, and high-signal tokens
  const queryExp = expansion || (await expandQuery(cleanQuery));
  const highSignalTokens = queryExp.highSignalTokens || [];
  const targetEntities = queryExp.targetEntities || [];
  const temporalIntent = queryExp.temporalIntent || 'GENERAL_TOPIC';

  // 2. Generate 768-dim semantic vector embedding
  let embedding = null;
  if (isGeminiConfigured()) {
    embedding = await generateEmbedding(queryExp.expandedQueryString || cleanQuery).catch(() => null);
  }

  // =========================================================================
  // STAGE 1: BROAD RECALL CANDIDATE GENERATION
  // =========================================================================

  // --- Lane 1 & 2: Broad Candidate Events (Lexical + Semantic pgvector) ---
  const eventCandidateMap = new Map();

  // 1a. Semantic pgvector event retrieval
  if (embedding && Array.isArray(embedding)) {
    try {
      const { rows } = await query(
        `SELECT id, title, summary, category, severity, status, location_name, country_code,
                source_count, article_count, first_reported_at, last_updated_at, event_types,
                1 - (embedding <=> $1::vector) AS similarity
         FROM events
         WHERE embedding IS NOT NULL
           AND 1 - (embedding <=> $1::vector) >= $2
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 25`,
        [JSON.stringify(embedding), vectorRecallThreshold]
      );
      for (const row of rows) {
        eventCandidateMap.set(row.id, { ...row, sourceChannel: 'semantic_vector' });
      }
    } catch (err) {
      console.warn('[HybridRetriever] Semantic event vector search warning:', err.message);
    }
  }

  // 1b. Lexical multi-term token event retrieval
  if (highSignalTokens.length > 0) {
    const eventClauses = [];
    const eventParams = [];
    highSignalTokens.forEach(t => {
      if (t.length <= 3) {
        eventParams.push(`\\m${t}\\M`);
        eventClauses.push(`(title ~* $${eventParams.length} OR summary ~* $${eventParams.length})`);
      } else {
        eventParams.push(`%${t}%`);
        eventClauses.push(`(title ILIKE $${eventParams.length} OR summary ILIKE $${eventParams.length})`);
      }
    });

    try {
      const { rows } = await query(
        `SELECT id, title, summary, category, severity, status, location_name, country_code,
                source_count, article_count, first_reported_at, last_updated_at, event_types,
                0.5 AS similarity
         FROM events
         WHERE (${eventClauses.join(' OR ')})
         ORDER BY last_updated_at DESC
         LIMIT 25`,
        eventParams
      );
      for (const row of rows) {
        if (!eventCandidateMap.has(row.id)) {
          eventCandidateMap.set(row.id, { ...row, sourceChannel: 'lexical_tokens' });
        }
      }
    } catch (err) {
      console.warn('[HybridRetriever] Lexical event search warning:', err.message);
    }
  }

  // --- Lane 1 & 2: Broad Candidate Articles (Lexical + Semantic pgvector) ---
  const articleCandidateMap = new Map();

  // 2a. Semantic pgvector article retrieval
  if (embedding && Array.isArray(embedding)) {
    try {
      const { rows } = await query(
        `SELECT a.id, a.title, a.summary, a.content, a.url, a.published_at, a.wire_service,
                a.event_types, a.event_type_scores, a.external_provenance,
                s.name AS source_name, s.type AS source_type, s.reliability_score,
                1 - (a.embedding <=> $1::vector) AS similarity
         FROM articles a
         LEFT JOIN sources s ON a.source_id = s.id
         WHERE a.embedding IS NOT NULL
           AND 1 - (a.embedding <=> $1::vector) >= $2
         ORDER BY a.embedding <=> $1::vector ASC
         LIMIT 35`,
        [JSON.stringify(embedding), vectorRecallThreshold]
      );
      for (const row of rows) {
        articleCandidateMap.set(row.id, { ...row, sourceChannel: 'semantic_vector' });
      }
    } catch (err) {
      console.warn('[HybridRetriever] Semantic article vector search warning:', err.message);
    }
  }

  // 2b. Lexical multi-term token article retrieval
  if (highSignalTokens.length > 0) {
    const artClauses = [];
    const artParams = [];
    highSignalTokens.forEach(t => {
      if (t.length <= 3) {
        artParams.push(`\\m${t}\\M`);
        artClauses.push(`(a.title ~* $${artParams.length} OR a.summary ~* $${artParams.length} OR a.content ~* $${artParams.length})`);
      } else {
        artParams.push(`%${t}%`);
        artClauses.push(`(a.title ILIKE $${artParams.length} OR a.summary ILIKE $${artParams.length} OR a.content ILIKE $${artParams.length})`);
      }
    });

    try {
      const { rows } = await query(
        `SELECT a.id, a.title, a.summary, a.content, a.url, a.published_at, a.wire_service,
                a.event_types, a.event_type_scores, a.external_provenance,
                s.name AS source_name, s.type AS source_type, s.reliability_score,
                0.5 AS similarity
         FROM articles a
         LEFT JOIN sources s ON a.source_id = s.id
         WHERE (${artClauses.join(' OR ')})
         ORDER BY COALESCE(s.reliability_score, 0.5) DESC, a.published_at DESC
         LIMIT 35`,
        artParams
      );
      for (const row of rows) {
        if (!articleCandidateMap.has(row.id)) {
          articleCandidateMap.set(row.id, { ...row, sourceChannel: 'lexical_tokens' });
        }
      }
    } catch (err) {
      console.warn('[HybridRetriever] Lexical article search warning:', err.message);
    }
  }

  // --- Lane 3: Neo4j Knowledge Graph Traversal & Entity Expansion ---
  const seedEventIds = Array.from(eventCandidateMap.keys());
  const entityNames = [
    ...targetEntities,
    ...highSignalTokens.filter(t => t.length > 3),
  ];

  const graphContext = await queryGraphContext({
    entityNames,
    eventIds: seedEventIds.slice(0, 10),
    limit: 15,
  }).catch(() => ({
    entities: [],
    relatedEvents: [],
    causalLinks: [],
    discoveredArticleIds: [],
    discoveredEventIds: [],
    graphAvailable: false,
  }));

  // Hydrate discovered graph articles from PostgreSQL
  if (graphContext.discoveredArticleIds?.length > 0) {
    try {
      const { rows: graphArticles } = await query(
        `SELECT a.id, a.title, a.summary, a.content, a.url, a.published_at, a.wire_service,
                s.name AS source_name, s.type AS source_type, s.reliability_score,
                0.6 AS similarity
         FROM articles a
         LEFT JOIN sources s ON a.source_id = s.id
         WHERE a.id = ANY($1::uuid[])`,
        [graphContext.discoveredArticleIds]
      );
      for (const ga of graphArticles) {
        if (!articleCandidateMap.has(ga.id)) {
          articleCandidateMap.set(ga.id, { ...ga, sourceChannel: 'graph_traversal' });
        }
      }
    } catch (err) {
      console.warn('[HybridRetriever] Graph article hydration warning:', err.message);
    }
  }

  // Hydrate discovered graph events from PostgreSQL
  if (graphContext.discoveredEventIds?.length > 0) {
    try {
      const { rows: graphEvents } = await query(
        `SELECT id, title, summary, category, severity, status, location_name, country_code,
                source_count, article_count, first_reported_at, last_updated_at,
                0.6 AS similarity
         FROM events
         WHERE id = ANY($1::uuid[])`,
        [graphContext.discoveredEventIds]
      );
      for (const ge of graphEvents) {
        if (!eventCandidateMap.has(ge.id)) {
          eventCandidateMap.set(ge.id, { ...ge, sourceChannel: 'graph_traversal' });
        }
      }
    } catch (err) {
      console.warn('[HybridRetriever] Graph event hydration warning:', err.message);
    }
  }

  // --- Lane 4: Event-Family Linkage Across Temporal Boundaries ---
  const eventFamily = [];
  const primaryEvents = Array.from(eventCandidateMap.values()).slice(0, 3);
  for (const pe of primaryEvents) {
    if (pe.country_code || pe.category) {
      try {
        const { rows: sisterEvents } = await query(
          `SELECT id, title, category, severity, status, location_name, country_code,
                  first_reported_at, last_updated_at
           FROM events
           WHERE id != $1
             AND (
               (country_code = $2 AND category = $3)
               OR title ILIKE $4
             )
           ORDER BY last_updated_at DESC
           LIMIT 4`,
          [
            pe.id,
            pe.country_code,
            pe.category,
            `%${highSignalTokens[0] || pe.location_name || ''}%`,
          ]
        );
        for (const se of sisterEvents) {
          eventFamily.push({
            id: se.id,
            title: se.title,
            category: se.category,
            relationship: 'EVENT_FAMILY',
          });
          if (!eventCandidateMap.has(se.id)) {
            eventCandidateMap.set(se.id, { ...se, similarity: 0.45, sourceChannel: 'event_family' });
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // =========================================================================
  // STAGE 2: PRECISION RERANKING & RELEVANCE GATE
  // =========================================================================

  // --- Rerank Articles ---
  const scoredArticles = [];
  for (const art of articleCandidateMap.values()) {
    const textCorpus = `${art.title} ${art.summary || ''} ${(art.content || '').slice(0, 400)}`;

    const sSemantic = typeof art.similarity === 'number' ? Math.max(0, Math.min(1, art.similarity)) : 0.5;
    const sLexical = computeTokenOverlap(highSignalTokens, textCorpus);
    const sTitle = computeTokenOverlap(highSignalTokens, art.title);
    const sEntity = computeTokenOverlap(targetEntities.map(e => e.toLowerCase()), textCorpus);
    const sGraph = art.sourceChannel === 'graph_traversal' ? 1.0 : 0.0;
    const sTemporal = computeTemporalScore(art.published_at, temporalIntent);
    const sSource = art.reliability_score || 0.5;

    // Composite multi-signal relevance score (headline matches prioritized over buried mentions)
    const effectiveLexical = sTitle > 0 ? (0.5 * sLexical + 0.5 * sTitle) : (0.7 * sLexical);
    const compositeScore =
      weights.semantic * sSemantic +
      weights.lexical * effectiveLexical +
      weights.entity * sEntity +
      weights.graph * sGraph +
      weights.temporal * sTemporal +
      weights.sourceReliability * sSource;

    // Aggressive Negative Suppression Gate:
    // If an article contains 0 lexical overlap with high-signal query tokens, 0 entity overlap,
    // and semantic similarity < 0.65, strongly suppress it from reaching synthesis.
    if (highSignalTokens.length > 0 && sLexical === 0 && sEntity === 0 && sSemantic < 0.65) {
      continue;
    }

    if (compositeScore >= finalRelevanceThreshold) {
      scoredArticles.push({
        ...art,
        compositeScore,
        sLexical,
        sTitle,
        sSemantic,
      });
    }
  }

  const queryInfo = {
    originalQuery: cleanQuery,
    queryIntent: queryExp.queryIntent || detectQueryIntent(cleanQuery),
    highSignalTokens,
    targetEntities,
  };

  // Rank articles with trainable ranker (respects PRAMANA_RANKER_STRATEGY)
  const rankedArticles = rankCandidates(queryInfo, scoredArticles);
  const retainedArticles = rankedArticles.slice(0, limit);

  // --- Rerank Events ---
  const scoredEvents = [];
  for (const ev of eventCandidateMap.values()) {
    const eventCorpus = `${ev.title} ${ev.summary || ''} ${ev.location_name || ''}`;

    const sSemantic = typeof ev.similarity === 'number' ? Math.max(0, Math.min(1, ev.similarity)) : 0.5;
    const sLexical = computeTokenOverlap(highSignalTokens, eventCorpus);
    const sTitle = computeTokenOverlap(highSignalTokens, ev.title);
    const sEntity = computeTokenOverlap(targetEntities.map(e => e.toLowerCase()), eventCorpus);
    const sGraph = ev.sourceChannel === 'graph_traversal' || ev.sourceChannel === 'event_family' ? 1.0 : 0.0;
    const sTemporal = computeTemporalScore(ev.last_updated_at, temporalIntent);
    const sSource = (ev.source_count || 1) >= 2 ? 0.9 : 0.6;

    const effectiveLexical = sTitle > 0 ? (0.5 * sLexical + 0.5 * sTitle) : (0.7 * sLexical);
    const compositeScore =
      weights.semantic * sSemantic +
      weights.lexical * effectiveLexical +
      weights.entity * sEntity +
      weights.graph * sGraph +
      weights.temporal * sTemporal +
      weights.sourceReliability * sSource;

    if (highSignalTokens.length > 0 && sLexical === 0 && sEntity === 0 && sSemantic < 0.65) {
      continue;
    }

    if (compositeScore >= finalRelevanceThreshold) {
      scoredEvents.push({
        ...ev,
        compositeScore,
        sLexical,
        sSemantic,
      });
    }
  }

  // Rank events with trainable ranker
  const rankedEvents = rankCandidates(queryInfo, scoredEvents);
  const retainedEvents = rankedEvents.slice(0, limit);

  // --- Fetch Corroborating Claims & Evidence for Retained Events ---
  let claims = [];
  const retainedEventIds = retainedEvents.map(e => e.id);
  if (retainedEventIds.length > 0 || highSignalTokens.length > 0) {
    try {
      const claimPattern = `%${highSignalTokens[0] || cleanQuery.slice(0, 40)}%`;
      const { rows } = await query(
        `SELECT c.id, c.text, c.claim_type, c.information_class, c.verification_status,
                c.extracted_at, e.title AS event_title,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ev.id,
                      'type', ev.type,
                      'text', ev.text,
                      'confidence', ev.confidence,
                      'url', ev.url
                    )
                  ) FILTER (WHERE ev.id IS NOT NULL), '[]'
                ) AS evidence
         FROM claims c
         LEFT JOIN events e ON c.event_id = e.id
         LEFT JOIN evidence ev ON c.id = ev.claim_id
         WHERE c.event_id = ANY($1::uuid[]) OR c.text ILIKE $2
         GROUP BY c.id, e.title
         LIMIT 8`,
        [retainedEventIds, claimPattern]
      );
      claims = rows;
    } catch (claimErr) {
      console.warn('[HybridRetriever] Claims retrieval warning:', claimErr.message);
    }
  }

  // --- Fetch Related Entities ---
  let entities = [];
  try {
    const entPattern = `%${highSignalTokens[0] || cleanQuery.slice(0, 40)}%`;
    const { rows } = await query(
      `SELECT id, name, type, description
       FROM entities
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY (type IN ('location', 'country', 'organization', 'law')) DESC, name ASC
       LIMIT 10`,
      [entPattern]
    );
    entities = rows;
  } catch (entErr) {
    console.warn('[HybridRetriever] Entity retrieval warning:', entErr.message);
  }

  // --- Fetch Causal Links ---
  let causalLinks = [];
  if (retainedEventIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT id, event_id, cause_text, effect_text, relationship_type,
                is_directly_supported, confidence, evidence_refs
         FROM causal_relationships
         WHERE event_id = ANY($1::uuid[])
         LIMIT 10`,
        [retainedEventIds]
      );
      causalLinks = rows;
    } catch (causalErr) {
      // ignore
    }
  }

  // Merge graph causal links
  if (graphContext.causalLinks?.length > 0) {
    const seenCausals = new Set(causalLinks.map(c => c.id));
    for (const gl of graphContext.causalLinks) {
      if (!seenCausals.has(gl.id)) {
        causalLinks.push({
          id: gl.id,
          event_id: gl.eventId,
          cause_text: gl.cause,
          effect_text: gl.effect,
          relationship_type: gl.relType,
          is_directly_supported: gl.isDirect,
          confidence: gl.confidence,
          evidence_refs: [],
        });
        seenCausals.add(gl.id);
      }
    }
  }

  // --- Prune Hypotheses Against Retained Reporting ---
  const { supportedHypotheses, unsupportedHypotheses } = pruneHypotheses(
    queryExp.candidateHypotheses,
    retainedArticles,
    claims
  );

  return {
    query: cleanQuery,
    temporalIntent,
    queryIntent: queryExp.queryIntent || detectQueryIntent(cleanQuery),
    rankerStrategy: process.env.PRAMANA_RANKER_STRATEGY || 'NEW_NEWS_RANKER',
    expansion: queryExp,
    events: retainedEvents,
    articles: retainedArticles,
    claims,
    entities,
    graphContext,
    causalLinks,
    supportedHypotheses,
    unsupportedHypotheses,
    eventFamily: [...new Map(eventFamily.map(ef => [ef.id, ef])).values()],
    candidateStats: {
      rawArticlesFound: articleCandidateMap.size,
      retainedArticlesCount: retainedArticles.length,
      rawEventsFound: eventCandidateMap.size,
      retainedEventsCount: retainedEvents.length,
    },
  };
}
