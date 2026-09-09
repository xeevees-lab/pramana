import { query } from '../../db/pool.js';
import { isGeminiConfigured, generateEmbedding } from '../gemini.js';
import { queryGraphContext } from '../intelligence/knowledgeGraph.js';
import { expandQuery, pruneHypotheses } from './queryExpander.js';

/**
 * 9-Vector Hybrid Retrieval Engine
 * Combines lexical, semantic, graph, primary source, historical, claim, policy,
 * scientific context, and public signals into a unified research context.
 *
 * @param {object} params
 * @param {string} params.query - Raw user query or claim
 * @param {object} [params.expansion] - Pre-computed query expansion (or auto-computed)
 * @param {number} [params.limit=8] - Max items per category
 * @returns {Promise<object>} Unified research context
 */
export async function retrieveHybridContext({
  query: userQuery = '',
  expansion = null,
  limit = 8,
} = {}) {
  const cleanQuery = (userQuery || '').trim();
  if (!cleanQuery) {
    return {
      events: [],
      articles: [],
      claims: [],
      entities: [],
      graphContext: { entities: [], relatedEvents: [], causalLinks: [] },
      narratives: [],
      causalLinks: [],
      supportedHypotheses: [],
      unsupportedHypotheses: [],
    };
  }

  // 1. Expand query into hypotheses and search vectors
  const queryExp = expansion || (await expandQuery(cleanQuery));
  const searchPattern = `%${cleanQuery.slice(0, 80)}%`;
  const expandedTerms = queryExp.searchKeywords.slice(0, 6);

  // Vector 2: Semantic Embedding (pgvector 768-dim)
  let embedding = null;
  if (isGeminiConfigured()) {
    embedding = await generateEmbedding(queryExp.expandedQueryString || cleanQuery).catch(() => null);
  }

  // --- Vector 1 & 2: Search Events (Semantic + Lexical) ---
  let events = [];
  try {
    if (embedding && Array.isArray(embedding)) {
      const { rows } = await query(
        `SELECT id, title, summary, category, severity, status, location_name, country_code,
                source_count, article_count, first_reported_at, last_updated_at,
                1 - (embedding <=> $1::vector) AS similarity
         FROM events
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $2`,
        [JSON.stringify(embedding), limit]
      );
      events = rows;
    }
  } catch (err) {
    // Vector search fallback
  }

  if (events.length === 0) {
    // Lexical full-text / trigram search
    const { rows } = await query(
      `SELECT id, title, summary, category, severity, status, location_name, country_code,
              source_count, article_count, first_reported_at, last_updated_at
       FROM events
       WHERE title ILIKE $1 OR summary ILIKE $1
       ORDER BY last_updated_at DESC
       LIMIT $2`,
      [searchPattern, limit]
    );
    events = rows;
  }

  // --- Vector 1 & 4: Search Articles (Lexical + Authoritative Source Prioritization) ---
  let articles = [];
  try {
    // Search with priority for high-reliability and primary sources
    const { rows } = await query(
      `SELECT a.id, a.title, a.summary, a.content, a.url, a.published_at, a.wire_service,
              s.name AS source_name, s.type AS source_type, s.reliability_score
       FROM articles a
       LEFT JOIN sources s ON a.source_id = s.id
       WHERE a.title ILIKE $1 OR a.summary ILIKE $1
       ORDER BY
         COALESCE(s.reliability_score, 0.5) DESC,
         a.published_at DESC
       LIMIT $2`,
      [searchPattern, limit]
    );
    articles = rows;

    // If few articles matched literal pattern, search using expanded search terms
    if (articles.length < 3 && expandedTerms.length > 0) {
      const secondaryPattern = `%${expandedTerms[0]}%`;
      const { rows: moreRows } = await query(
        `SELECT a.id, a.title, a.summary, a.content, a.url, a.published_at, a.wire_service,
                s.name AS source_name, s.type AS source_type, s.reliability_score
         FROM articles a
         LEFT JOIN sources s ON a.source_id = s.id
         WHERE (a.title ILIKE $1 OR a.summary ILIKE $1)
           AND a.id NOT IN (SELECT id FROM articles WHERE title ILIKE $2)
         ORDER BY COALESCE(s.reliability_score, 0.5) DESC, a.published_at DESC
         LIMIT 4`,
        [secondaryPattern, searchPattern]
      );
      articles = [...articles, ...moreRows];
    }
  } catch (artErr) {
    console.warn('[HybridRetriever] Article retrieval warning:', artErr.message);
  }

  // --- Vector 6: Search Claims & Evidence ---
  let claims = [];
  try {
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
       WHERE c.text ILIKE $1
       GROUP BY c.id, e.title
       LIMIT $2`,
      [searchPattern, limit]
    );
    claims = rows;
  } catch (claimErr) {
    console.warn('[HybridRetriever] Claims retrieval warning:', claimErr.message);
  }

  // --- Vector 7 & 8: Search Entities (Laws, Policies, Organizations, Places) ---
  let entities = [];
  try {
    const { rows } = await query(
      `SELECT id, name, type, description
       FROM entities
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY (type IN ('law', 'policy', 'document')) DESC, name ASC
       LIMIT 10`,
      [searchPattern]
    );
    entities = rows;
  } catch (entErr) {
    console.warn('[HybridRetriever] Entity retrieval warning:', entErr.message);
  }

  // --- Vector 9: Search Public & Narrative Signals ---
  let narratives = [];
  const eventIds = events.map(e => e.id).filter(Boolean);
  if (eventIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT id, event_id, title, description, platform, share_pct, momentum, acceleration
         FROM narratives
         WHERE event_id = ANY($1::uuid[])
         LIMIT 5`,
        [eventIds]
      );
      narratives = rows;
    } catch (narrErr) {
      // ignore
    }
  }

  // --- Vector 3: Knowledge Graph Cypher Traversal ---
  const entityNames = [
    ...queryExp.targetEntities,
    ...entities.map(e => e.name),
  ];

  const graphContext = await queryGraphContext({
    entityNames,
    eventIds,
    keywords: expandedTerms,
    limit: 12,
  }).catch(() => ({ entities: [], relatedEvents: [], causalLinks: [], graphAvailable: false }));

  // Retrieve Causal Relationships from PostgreSQL
  let causalLinks = [];
  if (eventIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT id, event_id, cause_text, effect_text, relationship_type,
                is_directly_supported, confidence, evidence_refs
         FROM causal_relationships
         WHERE event_id = ANY($1::uuid[])
         LIMIT 10`,
        [eventIds]
      );
      causalLinks = rows;
    } catch (causalErr) {
      // ignore
    }
  }

  // If graph returned causal links, merge them
  if (graphContext.causalLinks && graphContext.causalLinks.length > 0) {
    const seenIds = new Set(causalLinks.map(c => c.id));
    for (const gLink of graphContext.causalLinks) {
      if (!seenIds.has(gLink.id)) {
        causalLinks.push({
          id: gLink.id,
          event_id: gLink.eventId,
          cause_text: gLink.cause,
          effect_text: gLink.effect,
          relationship_type: gLink.relType,
          is_directly_supported: gLink.isDirect,
          confidence: gLink.confidence,
          evidence_refs: [],
        });
        seenIds.add(gLink.id);
      }
    }
  }

  // --- Prune Hypotheses Against Retrieved Evidence ---
  const { supportedHypotheses, unsupportedHypotheses } = pruneHypotheses(
    queryExp.candidateHypotheses,
    articles,
    claims
  );

  return {
    query: cleanQuery,
    expansion: queryExp,
    events,
    articles,
    claims,
    entities,
    graphContext,
    narratives,
    causalLinks,
    supportedHypotheses,
    unsupportedHypotheses,
  };
}
