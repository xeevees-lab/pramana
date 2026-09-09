import { query } from '../../db/pool.js';
import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Deterministic fallback to construct rich report sections directly from data
 * when AI synthesis is unavailable or rate-limited.
 */
function buildDeterministicSections(event, articles, claims, entities) {
  // Verified picture
  const verifiedClaims = claims.filter(c => c.verification_status === 'VERIFIED');
  const verifiedPicture = verifiedClaims.length > 0
    ? verifiedClaims.slice(0, 4).map(c => c.text).join(' ')
    : (event.summary || (articles[0]?.summary) || 'Reporting is currently developing across independent sources.');

  // What happened
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

  // Why this happened (causal claims & background)
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
 * Assemble a comprehensive 18-section long-form intelligence report for an event.
 * Combines real database records (articles, claims, evidence, entities, narratives, forecasts)
 * with grounded AI synthesis and deterministic fallback.
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
  // 1. Meta information
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

  // 2. Separate claims by verification status & type
  const confirmedClaims = claims.filter(c => c.verification_status === 'VERIFIED');
  const uncertainClaims = claims.filter(c => c.verification_status === 'UNVERIFIED');
  const contradictoryClaims = claims.filter(c => c.verification_status === 'CONTRADICTED');

  // 3. Separate entities by domain
  const legalAndPolicyEntities = entities.filter(e =>
    e.type === 'law' || e.type === 'policy' || e.type === 'document'
  );
  const peopleEntities = entities.filter(e => e.type === 'person');
  const organizationEntities = entities.filter(e => e.type === 'organization');
  const locationEntities = entities.filter(e =>
    e.type === 'country' || e.type === 'city' || e.type === 'location'
  );

  // 4. Construct chronological timeline from articles and claims
  const timelineItems = [];
  for (const art of articles) {
    if (art.published_at && art.title) {
      timelineItems.push({
        id: `art-${art.id}`,
        timestamp: art.published_at,
        source: art.source_name || 'News Wire',
        title: art.title,
        description: art.summary ? art.summary.slice(0, 220) + '...' : null,
        url: art.url,
      });
    }
  }
  for (const clm of claims) {
    if (clm.extracted_at && clm.text) {
      timelineItems.push({
        id: `clm-${clm.id}`,
        timestamp: clm.extracted_at,
        source: 'Intelligence Extraction',
        title: clm.text,
        description: `Verified Status: ${clm.verification_status}`,
        url: null,
      });
    }
  }
  // Sort timeline chronologically (earliest to latest)
  timelineItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Deduplicate near-identical timeline titles
  const seenTitles = new Set();
  const timeline = timelineItems.filter(item => {
    const key = item.title.toLowerCase().slice(0, 40);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  }).slice(0, 15);

  // 5. Media coverage comparison
  const mediaCoverage = articles.map(art => ({
    id: art.id,
    sourceName: art.source_name || 'News Wire',
    sourceReliability: art.source_reliability ? Math.round(art.source_reliability * 100) : null,
    title: art.title,
    summary: art.summary,
    author: art.author,
    publishedAt: art.published_at,
    url: art.url,
  }));

  // 6. Deterministic baseline
  const deterministic = buildDeterministicSections(event, articles, claims, entities);
  let verifiedPicture = deterministic.verifiedPicture;
  let whatHappened = deterministic.whatHappened;
  let whyThisHappened = deterministic.whyThisHappened;
  let historicalContext = null;

  // 7. If cached in database and fresh, use cached generated_article
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
      // Not JSON, ignore and regenerate
    }
  }

  // 8. If AI configured and no valid cache, synthesize rich grounded overview
  if (!parsedCached && isGeminiConfigured() && articles.length > 0) {
    const client = getGeminiClient();
    if (client) {
      const articleSnippets = articles.slice(0, 5).map(a =>
        `Source: ${a.source_name || 'News'} | Title: ${a.title}\nSummary: ${a.summary || ''}`
      ).join('\n---\n');

      const claimsSnippet = claims.slice(0, 8).map(c =>
        `- [${c.verification_status}] ${c.text} (${c.claim_type})`
      ).join('\n');

      const prompt = `You are the lead intelligence analyst for Pramāṇa.
Generate a grounded, professional long-form analysis of this real news event based ONLY on the evidence provided below.
Do NOT invent facts, dates, sources, or predictions not present in the snippets.

Event Title: ${event.title}
Category: ${event.category}
Location: ${event.location_name || 'Not specified'}

Articles:
${articleSnippets}

Claims Extracted:
${claimsSnippet}

Respond strictly in valid JSON with these keys:
{
  "verifiedPicture": "2-3 crisp sentences summarizing the established, verifiable core facts.",
  "whatHappened": "Detailed chronological explanation of the developments across 2-3 substantive paragraphs.",
  "whyThisHappened": "Context and underlying causal drivers supported by the reporting.",
  "historicalContext": "Historical background or precedent mentioned in the reports (or null if none)."
}

JSON:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

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
        console.warn('[EventReport] Gemini synthesis warning (using deterministic):', err.message);
      }
    }
  }

  return {
    headline: event.title,
    meta,
    verifiedPicture,
    whatHappened,
    confirmedClaims,
    uncertainClaims,
    contradictoryClaims,
    timeline,
    whyThisHappened,
    historicalContext,
    lawAndPolicy: legalAndPolicyEntities,
    people: peopleEntities,
    organizations: organizationEntities,
    locations: locationEntities,
    mediaCoverage,
    narratives,
    relatedEvents,
    forecasts,
    sources: mediaCoverage.map(m => ({
      name: m.sourceName,
      title: m.title,
      url: m.url,
      reliability: m.sourceReliability,
      publishedAt: m.publishedAt,
      author: m.author,
    })),
    lastUpdated: new Date().toISOString(),
  };
}
