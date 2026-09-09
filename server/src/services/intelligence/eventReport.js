import { query } from '../../db/pool.js';
import { getGeminiClient, isGeminiConfigured } from '../gemini.js';
import { assembleCausalChain } from './causalEngine.js';
import { buildTemporalSequence } from './temporalEngine.js';
import { verifyClaim, classifySourceHierarchy } from './claimVerifier.js';
import { analyzeNarratives } from './narrativeAnalyzer.js';
import { computeGroundedForecast } from './forecastEngine.js';
import { queryGraphContext } from './knowledgeGraph.js';

/**
 * Deterministic baseline overview constructor when LLM is unavailable.
 */
function buildDeterministicSections(event, articles, claims) {
  const verifiedClaims = claims.filter(c => c.verification_status === 'VERIFIED');
  const verifiedPicture = verifiedClaims.length > 0
    ? verifiedClaims.slice(0, 4).map(c => c.text).join(' ')
    : (event.summary || articles[0]?.summary || 'Reporting is currently developing across independent sources.');

  const narrativeParagraphs = [];
  if (event.summary) {
    narrativeParagraphs.push(event.summary);
  }
  for (const art of articles.slice(0, 3)) {
    if (art.summary && !narrativeParagraphs.includes(art.summary)) {
      narrativeParagraphs.push(art.summary);
    }
  }
  const whatHappened = narrativeParagraphs.join('\n\n') || event.summary || '';

  const causalClaims = claims.filter(c => c.claim_type === 'causal' || c.information_class === 'context');
  const whyThisHappened = causalClaims.length > 0
    ? causalClaims.map(c => c.text).join(' ')
    : null;

  return {
    verifiedPicture,
    whatHappened,
    whyThisHappened,
  };
}

/**
 * Assemble a comprehensive long-form research intelligence report for an event.
 * Combines real database records (articles, claims, evidence, entities, narratives, forecasts)
 * with knowledge graph traversal, causal reasoning, temporal sequencing, syndication-verified claims,
 * and deterministic ML forecasting.
 *
 * @param {object} event - Event record from database
 * @param {Array} articles - Articles associated with the event
 * @param {Array} claims - Extracted claims with verification status
 * @param {Array} entities - Extracted entities with types and roles
 * @param {Array} narratives - Narrative signals
 * @param {Array} forecasts - Model predictions
 * @param {Array} relatedEvents - Related events sharing category or entities
 * @returns {Promise<object>} Structured intelligence report
 */
export async function assembleEventReport(
  event,
  articles = [],
  claims = [],
  entities = [],
  narratives = [],
  forecasts = [],
  relatedEvents = []
) {
  // 1. Meta Information
  const meta = {
    eventId: event.id,
    firstReportedAt: event.first_reported_at || event.created_at,
    lastUpdatedAt: event.last_updated_at || new Date().toISOString(),
    sourceCount: Math.max(event.source_count || 0, new Set(articles.map(a => a.source_name).filter(Boolean)).size),
    articleCount: Math.max(event.article_count || 0, articles.length),
    category: event.category || 'politics',
    severity: event.severity || 'normal',
    status: event.status || 'developing',
    location: event.location_name || null,
    country: event.country_code || null,
  };

  // 2. Query Knowledge Graph for Connected Entities and Graph-Derived Related Events
  let graphData = { entities: [], relatedEvents: [], causalLinks: [] };
  try {
    graphData = await queryGraphContext({
      eventIds: event.id ? [event.id] : [],
      entityNames: entities.map(e => e.name),
      limit: 10,
    });
  } catch (err) {
    // Graceful graph fallback
  }

  // Combine related events from PostgreSQL and Neo4j
  const mergedRelatedEvents = [...relatedEvents];
  const seenEventIds = new Set(mergedRelatedEvents.map(e => e.id));
  for (const grEvent of graphData.relatedEvents) {
    if (!seenEventIds.has(grEvent.id) && grEvent.id !== event.id) {
      mergedRelatedEvents.push({
        id: grEvent.id,
        title: grEvent.title,
        category: grEvent.category || event.category,
      });
      seenEventIds.add(grEvent.id);
    }
  }

  // 3. Evidence-Grounded Causal Sequence (9 Stages)
  const causalResult = await assembleCausalChain({
    event,
    articles,
    claims,
    existingCausalLinks: graphData.causalLinks,
  });

  // Identify stages with missing evidence for honest reporting
  const insufficientEvidenceGaps = Object.entries(causalResult.stages)
    .filter(([_, data]) => data.status === 'MISSING_EVIDENCE')
    .map(([stage]) => stage.replace('_', ' '));

  // 4. Temporal Milestones
  const { timeline } = buildTemporalSequence({ event, articles, claims });

  // 5. Deterministic Claim Verification with Syndication De-duplication
  const verifiedClaimsList = [];
  const uncertainClaimsList = [];
  const contradictoryClaimsList = [];

  for (const rawClaim of claims) {
    const verified = verifyClaim(rawClaim, articles);
    const enriched = {
      id: rawClaim.id,
      text: rawClaim.text,
      claim_type: rawClaim.claim_type,
      information_class: rawClaim.information_class,
      verification_status: verified.status,
      badgeLabel: verified.badgeLabel,
      independentSourceCount: verified.independentSourceCount,
      provenance: verified.provenance,
      explanation: verified.explanation,
    };

    if (verified.status === 'VERIFIED') {
      verifiedClaimsList.push(enriched);
    } else if (verified.status === 'CONTRADICTED') {
      contradictoryClaimsList.push(enriched);
    } else {
      uncertainClaimsList.push(enriched);
    }
  }

  // 6. Separate Entities by Domain & Merge Graph Entities
  const allEntities = [...entities];
  const seenEntNames = new Set(allEntities.map(e => e.name.toLowerCase()));
  for (const gEnt of graphData.entities) {
    if (!seenEntNames.has(gEnt.name.toLowerCase())) {
      allEntities.push({
        id: `graph-${gEnt.name}`,
        name: gEnt.name,
        type: (gEnt.type || 'topic').toLowerCase(),
        description: `Connected via Knowledge Graph (${gEnt.role})`,
      });
      seenEntNames.add(gEnt.name.toLowerCase());
    }
  }

  const legalAndPolicyEntities = allEntities.filter(e =>
    e.type === 'law' || e.type === 'policy' || e.type === 'document'
  );
  const peopleEntities = allEntities.filter(e => e.type === 'person');
  const organizationEntities = allEntities.filter(e => e.type === 'organization');
  const locationEntities = allEntities.filter(e =>
    e.type === 'country' || e.type === 'city' || e.type === 'location'
  );

  // 7. Cross-Source Media Coverage & Narrative Analysis
  const narrativeResult = await analyzeNarratives(articles, narratives);

  const mediaCoverage = articles.map(art => ({
    id: art.id,
    sourceName: art.source_name || 'News Wire',
    sourceType: classifySourceHierarchy(art),
    sourceReliability: art.source_reliability ? Math.round(art.source_reliability * 100) : null,
    title: art.title,
    summary: art.summary,
    author: art.author,
    publishedAt: art.published_at,
    url: art.url,
  }));

  // 8. Deterministic ML Escalation Forecast
  const mlForecast = await computeGroundedForecast({
    event,
    articles,
    claims,
    entities: allEntities,
    persist: false,
  });

  // 9. Deterministic Baseline Sections
  const deterministic = buildDeterministicSections(event, articles, claims);
  let verifiedPicture = deterministic.verifiedPicture;
  let whatHappened = deterministic.whatHappened;
  let whyThisHappened = deterministic.whyThisHappened || causalResult.summaryCausalChain;
  let historicalContext = null;

  // 10. Check Database Cache
  let parsedCached = null;
  if (event.generated_article) {
    try {
      parsedCached = JSON.parse(event.generated_article);
      if (parsedCached?.verifiedPicture) {
        verifiedPicture = parsedCached.verifiedPicture;
        whatHappened = parsedCached.whatHappened || whatHappened;
        whyThisHappened = parsedCached.whyThisHappened || whyThisHappened;
        historicalContext = parsedCached.historicalContext || null;
      }
    } catch {
      // ignore non-JSON cache
    }
  }

  // 11. Grounded Overview Synthesis via Gemini (if not cached)
  if (!parsedCached && isGeminiConfigured() && articles.length > 0) {
    const client = getGeminiClient();
    if (client) {
      const articleSnippets = articles.slice(0, 5).map(a =>
        `Source: ${a.source_name || 'News'} | Title: ${a.title}\nSummary: ${a.summary || ''}`
      ).join('\n---\n');

      const claimsSnippet = claims.slice(0, 8).map(c =>
        `- [${c.verification_status}] ${c.text}`
      ).join('\n');

      const prompt = `You are the lead intelligence research analyst at Pramāṇa.
Synthesize a grounded, professional long-form analysis of this real news event based ONLY on the evidence provided.
Do NOT invent facts, dates, sources, or predictions not present in the snippets.

Event Title: ${event.title}
Category: ${event.category}
Location: ${event.location_name || 'Not specified'}

Articles:
${articleSnippets}

Claims Extracted:
${claimsSnippet}

Respond strictly in valid JSON:
{
  "verifiedPicture": "2-3 crisp sentences summarizing the established, verifiable core facts.",
  "whatHappened": "Detailed chronological explanation across 2-3 substantive paragraphs.",
  "whyThisHappened": "Causal drivers supported strictly by the reporting.",
  "historicalContext": "Historical precedent mentioned in reporting (or null if none)."
}

JSON:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('LLM synthesis timeout')), 3000)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);

        const parsed = JSON.parse(response.text.trim());
        if (parsed.verifiedPicture) verifiedPicture = parsed.verifiedPicture;
        if (parsed.whatHappened) whatHappened = parsed.whatHappened;
        if (parsed.whyThisHappened) whyThisHappened = parsed.whyThisHappened;
        if (parsed.historicalContext) historicalContext = parsed.historicalContext;

        // Save into events.generated_article for fast caching
        await query(
          'UPDATE events SET generated_article = $1, last_updated_at = NOW() WHERE id = $2',
          [JSON.stringify(parsed), event.id]
        ).catch(() => {});
      } catch (err) {
        // Deterministic fallback preserved
      }
    }
  }

  return {
    headline: event.title,
    meta,
    verifiedPicture,
    whatHappened,
    confirmedClaims: verifiedClaimsList,
    uncertainClaims: uncertainClaimsList,
    contradictoryClaims: contradictoryClaimsList,
    causalChain: causalResult,
    timeline,
    whyThisHappened,
    historicalContext,
    lawAndPolicy: legalAndPolicyEntities,
    people: peopleEntities,
    organizations: organizationEntities,
    locations: locationEntities,
    mediaCoverage,
    framingDistribution: narrativeResult.framingDistribution,
    framingObservation: narrativeResult.framingObservation,
    narratives,
    relatedEvents: mergedRelatedEvents.slice(0, 8),
    forecasts: mlForecast.status === 'FORECAST_PRODUCED' ? [mlForecast] : forecasts,
    mlForecast,
    insufficientEvidenceGaps,
    sources: mediaCoverage.map(m => ({
      name: m.sourceName,
      type: m.sourceType,
      title: m.title,
      url: m.url,
      reliability: m.sourceReliability,
      publishedAt: m.publishedAt,
      author: m.author,
    })),
    lastUpdated: new Date().toISOString(),
  };
}
