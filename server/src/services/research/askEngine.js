import { retrieveHybridContext } from './hybridRetriever.js';
import { expandQuery, pruneHypotheses, detectQueryIntent } from './queryExpander.js';
import { evaluateEvidenceSufficiency, retrieveExternalAuthoritativeResearch } from './externalResearcher.js';
import { readUrlContent } from './urlReader.js';
import { readVideoMetadata, isVideoUrl } from './videoReader.js';
import { assembleCausalChain } from '../intelligence/causalEngine.js';
import { buildTemporalSequence } from '../intelligence/temporalEngine.js';
import { analyzeNarratives } from '../intelligence/narrativeAnalyzer.js';
import { computeGroundedForecast } from '../intelligence/forecastEngine.js';
import { verifyClaim, classifySourceHierarchy } from '../intelligence/claimVerifier.js';
import { getGeminiClient, isGeminiConfigured } from '../gemini.js';
import { query } from '../../db/pool.js';

/**
 * Evaluates candidate verified claims against the user's explicit query
 * to ensure that only directly relevant verified assertions are selected as
 * the "Verified Picture", preventing unrelated high-confidence claims from
 * contaminating answers.
 *
 * @param {string} userQuery
 * @param {Array<object>} claims
 * @returns {object|null} The most relevant verified claim, or null if no claim passes relevance threshold.
 */
export function getQueryRelevantVerifiedPicture(userQuery, claims = []) {
  if (!userQuery || !Array.isArray(claims) || claims.length === 0) {
    return null;
  }

  const stopWords = new Set([
    'what', 'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'with', 'from',
    'have', 'has', 'had', 'were', 'been', 'about', 'latest', 'news', 'update',
    'updates', 'report', 'reports', 'findings', 'explain', 'detail', 'details'
  ]);

  const queryTokens = userQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3 && !stopWords.has(t));

  if (queryTokens.length === 0) {
    return null;
  }

  const verified = claims.filter(c => (c.verification_status === 'VERIFIED' || c.status === 'VERIFIED'));
  if (verified.length === 0) {
    return null;
  }

  let bestClaim = null;
  let highestScore = 0;

  for (const claim of verified) {
    const text = (claim.content || claim.text || '').toLowerCase();
    let matches = 0;
    for (const token of queryTokens) {
      if (text.includes(token)) {
        matches++;
      }
    }

    const matchRatio = matches / queryTokens.length;
    // Require at least 40% keyword match or at least 2 distinct significant keyword matches
    if ((matchRatio >= 0.4 || matches >= 2) && matches > highestScore) {
      highestScore = matches;
      bestClaim = claim;
    }
  }

  return bestClaim;
}

/**
 * Process a research or fact-checking inquiry through the complete
 * Two-Stage Pramāṇa Research Intelligence Brain.
 *
 * @param {object} params
 * @param {string} [params.query] - User question, topic, or claim
 * @param {'ask'|'fact_check'|'research'} [params.mode='ask'] - Operation mode
 * @param {Array<{role: string, content: string}>} [params.conversationHistory=[]] - Multi-turn conversation context
 * @param {string} [params.url] - Optional article or video URL to inspect
 * @param {string} [params.userId] - Authenticated user ID (if logged in)
 * @param {object} [params.topicContext={}] - Persisted conversation topic context for follow-up questions
 * @param {string|object} [params.pageContext=null] - Page context (explicit query always has priority)
 * @returns {Promise<object>} Structured intelligence response
 */
export async function processResearchQuery({
  query: userQuery = '',
  mode = 'ask',
  conversationHistory = [],
  url = null,
  userId = null,
  topicContext = {},
  pageContext = null,
} = {}) {
  let effectiveQuery = (userQuery || '').trim();
  let targetUrl = (url || '').trim();

  // EXPLICIT QUERY PRECEDENCE:
  // User's explicit query always takes precedence over pageContext.
  // If userQuery is empty, fallback to pageContext if provided.
  if (!effectiveQuery && pageContext) {
    effectiveQuery = typeof pageContext === 'string' ? pageContext : (pageContext.title || '');
  }

  // If query is an embedded URL, parse it
  if (!targetUrl && (effectiveQuery.startsWith('http://') || effectiveQuery.startsWith('https://'))) {
    targetUrl = effectiveQuery;
    effectiveQuery = '';
  }

  let urlAnalysis = null;
  let videoAnalysis = null;

  // Process URL input if present
  if (targetUrl) {
    if (isVideoUrl(targetUrl)) {
      videoAnalysis = await readVideoMetadata(targetUrl);
      if (!effectiveQuery && videoAnalysis?.title) {
        effectiveQuery = `${videoAnalysis.title} ${videoAnalysis.author || ''}`;
      }
    } else {
      urlAnalysis = await readUrlContent(targetUrl);
      if (!effectiveQuery && urlAnalysis?.title) {
        effectiveQuery = urlAnalysis.title;
      }
    }
  }

  // If follow-up query with pronouns ("them", "this", "it"), blend topicContext
  if (topicContext?.lastQuery && (effectiveQuery.toLowerCase().includes('why did') || effectiveQuery.toLowerCase().includes('what caused') || effectiveQuery.length < 15)) {
    effectiveQuery = `${effectiveQuery} (regarding: ${topicContext.primaryTopic || topicContext.lastQuery})`;
  }

  // 1. Two-Stage Multi-Lane Hybrid Retrieval
  const retrievalResult = await retrieveHybridContext({
    query: effectiveQuery,
    limit: 8,
  });

  const {
    events,
    articles,
    claims: dbClaims,
    entities,
    graphContext,
    causalLinks,
    narratives,
    supportedHypotheses,
    temporalIntent,
    eventFamily,
    expansion,
  } = retrievalResult;

  const queryIntent = retrievalResult.queryIntent || detectQueryIntent(effectiveQuery, mode);
  const queryHighSignalTokens = expansion?.highSignalTokens || [];

  // Evidence Sufficiency Gate
  const queryInfo = {
    originalQuery: effectiveQuery,
    queryIntent,
    highSignalTokens: queryHighSignalTokens,
  };

  let sufficiency = evaluateEvidenceSufficiency(queryInfo, articles);
  let externalArticles = [];

  if (!sufficiency.isSufficient) {
    try {
      externalArticles = await retrieveExternalAuthoritativeResearch(queryInfo);
      if (externalArticles.length > 0) {
        articles.push(...externalArticles);
        sufficiency = evaluateEvidenceSufficiency(queryInfo, articles);
      }
    } catch (extErr) {
      console.warn('[AskEngine] External research fallback warning:', extErr.message);
    }
  }

  // Helper to verify if an item actually pertains to the query topic (prevents nearest-event substitution)
  const isItemRelevantToQuery = (item) => {
    if (!item) return false;
    const corpus = `${item.title} ${item.summary || ''}`.toLowerCase();

    // If candidate exclusively matches demoted types for this query intent, suppress
    const demotedTypes = queryIntent.demotedEventTypes || [];
    const itemTypes = item.event_types || [];
    if (demotedTypes.length > 0 && itemTypes.length > 0) {
      const hasOnlyDemoted = itemTypes.every(t => demotedTypes.includes(t) || t === 'OTHER');
      if (hasOnlyDemoted) return false;
    }

    if (queryHighSignalTokens.length === 0) return true;

    let matches = 0;
    for (const token of queryHighSignalTokens) {
      if (token.length <= 3) {
        if (new RegExp(`\\b${token}\\b`, 'i').test(corpus)) {
          matches++;
        }
      } else {
        const stem = token.endsWith('ing') && token.length > 5 ? token.slice(0, -3)
          : token.endsWith('es') && token.length > 4 ? token.slice(0, -2)
          : token.endsWith('s') && token.length > 3 ? token.slice(0, -1)
          : token.endsWith('y') && token.length > 4 ? token.slice(0, -1)
          : token.endsWith('an') && token.length > 4 ? token.slice(0, -2)
          : token;
        if (corpus.includes(token) || (stem && corpus.includes(stem))) {
          matches++;
        }
      }
    }

    const matchRatio = matches / queryHighSignalTokens.length;
    if (queryHighSignalTokens.length === 1) return matches >= 1;
    if (queryHighSignalTokens.length === 2) return matches === 2;
    return matches >= 2 && matchRatio >= 0.5;
  };

  const relevantEvents = events.filter(isItemRelevantToQuery);
  const relevantArticles = articles.filter(isItemRelevantToQuery);
  const topEvent = relevantEvents[0] || null;

  // 2. Causal Chain & Temporal Milestones
  const causalChain = await assembleCausalChain({
    event: topEvent,
    articles: relevantArticles.length > 0 ? relevantArticles : articles,
    claims: dbClaims,
    existingCausalLinks: causalLinks,
    skipLlm: true,
  });

  const { timeline } = buildTemporalSequence({
    event: topEvent,
    articles,
    claims: dbClaims,
  });

  // 3. Narrative Framing Analysis
  const narrativeReport = await analyzeNarratives(articles, narratives, true);

  // 4. Deterministic ML Escalation Forecast (Strictly suppressed in Ask mode unless future requested)
  let mlForecast = null;
  const shouldProduceForecast = mode === 'research' || queryIntent.forecastRequested === true;

  if (shouldProduceForecast) {
    mlForecast = await computeGroundedForecast({
      event: topEvent || { article_count: articles.length, source_count: new Set(articles.map(a => a.source_name)).size },
      articles,
      claims: dbClaims,
      entities,
      persist: false,
    });
  } else {
    mlForecast = {
      status: 'NO_FORECAST_JUSTIFIED',
      reason: 'Forecast suppressed for standard news inquiries to prevent speculative alarmism.',
      modelVersion: 'pramana-calibrated-logreg-v1.2',
    };
  }

  // 5. Deterministic Claim Verification with Syndication Check
  const verifiedClaims = [];
  if (dbClaims.length > 0) {
    for (const c of dbClaims) {
      const v = verifyClaim(c, articles);
      verifiedClaims.push({
        id: c.id,
        text: c.text,
        status: v.status,
        badgeLabel: v.badgeLabel,
        independentSourceCount: v.independentSourceCount,
        provenance: v.provenance,
        claimType: c.claim_type,
        infoClass: c.information_class,
        eventTitle: c.event_title,
        explanation: v.explanation,
      });
    }
  } else if (mode === 'fact_check' && effectiveQuery) {
    const v = verifyClaim({ text: effectiveQuery }, articles);
    verifiedClaims.push({
      id: 'claim-custom',
      text: effectiveQuery,
      status: v.status,
      badgeLabel: v.badgeLabel,
      independentSourceCount: v.independentSourceCount,
      provenance: v.provenance,
      claimType: 'factual',
      infoClass: 'fact',
      eventTitle: topEvent?.title || null,
      explanation: v.explanation,
    });
  }

  // 6. Fact Check Mode Return
  if (mode === 'fact_check') {
    const relevantVp = getQueryRelevantVerifiedPicture(effectiveQuery, verifiedClaims);
    const verifiedCount = verifiedClaims.filter(c => c.status === 'VERIFIED').length;
    const answerSummary = verifiedClaims.length > 0
      ? `Audit completed across ${articles.length} corroborating dispatch(es). Established ${verifiedCount} verified assertion(s) with wire-syndication de-duplication.`
      : 'Insufficient independent corroborated reporting available in the knowledge system to verify this assertion.';

    return {
      mode: 'fact_check',
      query: effectiveQuery,
      targetUrl,
      answer: answerSummary,
      executiveSummary: answerSummary,
      theVerifiedPicture: relevantVp ? (relevantVp.text || relevantVp.content) : null,
      provenance: 'NEWS REPORTING',
      accessState: videoAnalysis ? 'METADATA_ONLY' : (urlAnalysis ? 'FULL_CONTENT_ANALYZED' : 'DIRECT_QUERY'),
      claims: verifiedClaims,
      articles,
      events,
      causalChain,
      timeline,
      mlForecast: mlForecast?.status === 'FORECAST_PRODUCED' ? mlForecast : { status: 'NO_FORECAST_JUSTIFIED', modelVersion: 'pramana-calibrated-logreg-v1.2' },
      eventFamily,
      videoNote: videoAnalysis?.note || null,
      sources: articles.map(a => ({
        id: a.id,
        headline: a.title,
        publisher: a.source_name || 'News Source',
        publishedAt: a.published_at,
        excerpt: a.summary || (a.content ? a.content.slice(0, 180) + '...' : ''),
        reliabilityScore: a.reliability_score ? Math.round(a.reliability_score * 100) : 50,
        wireService: a.wire_service || null,
        url: a.url,
      })),
    };
  }

  // 7. Grounded Synthesis for Ask & Deep Research Modes
  let executiveSummary = '';
  let theVerifiedPicture = '';
  let provenance = 'NEWS REPORTING';

  if (isGeminiConfigured() && (articles.length > 0 || events.length > 0 || urlAnalysis || videoAnalysis)) {
    const client = getGeminiClient();
    if (client) {
      const historyContext = conversationHistory.slice(-4).map(m =>
        `${m.role.toUpperCase()}: ${m.content}`
      ).join('\n');

      const eventsSummary = relevantEvents.slice(0, 3).map(e =>
        `Event: ${e.title} (${e.category}) | Status: ${e.status} | Severity: ${e.severity}\nSummary: ${e.summary}`
      ).join('\n\n');

      const articlesSummary = articles.slice(0, 5).map(a =>
        `[${a.source_name || 'Source'} (${classifySourceHierarchy(a)})]: "${a.title}"\n${a.summary || ''}`
      ).join('\n\n');

      const claimsSummary = verifiedClaims.slice(0, 6).map(c =>
        `- [${c.status} (${c.independentSourceCount} indep source(s))]: "${c.text}"`
      ).join('\n');

      const supportedHypothesesText = supportedHypotheses.length > 0
        ? supportedHypotheses.map(h => `- Confirmed Mechanism: ${h.hypothesis}`).join('\n')
        : 'None verified in dispatches.';

      let urlContext = '';
      if (urlAnalysis?.text) {
        urlContext = `\nRetrieved Article Content (${urlAnalysis.url}):\nTitle: ${urlAnalysis.title}\n${urlAnalysis.text.slice(0, 2500)}`;
      }
      if (videoAnalysis?.title) {
        urlContext = `\nRetrieved Public Video Metadata (${videoAnalysis.url}):\nTitle: ${videoAnalysis.title}\nChannel: ${videoAnalysis.author}\nNote: ${videoAnalysis.note}`;
      }

      const isAskMode = mode === 'ask';
      const prompt = isAskMode
        ? `You are Pramāṇa's direct, conversational news intelligence analyst.
Synthesize a concise, direct, evidence-grounded answer (1 to 2 clear paragraphs) answering the user's inquiry based STRICTLY on the corroborated evidence below.

CRITICAL INSTRUCTIONS:
1. Ground truth only: Do NOT invent facts, statistics, or details not present in the snippets.
2. Direct conversational answer first: Answer the question clearly and immediately. Do not dump references or repeat the user's query.
3. No markdown headings: DO NOT use markdown headers (no "###", no "**Title:**").
4. Objectivity: Objective, grounded news intelligence tone.

Conversation History:
${historyContext || 'None'}

User Inquiry:
${effectiveQuery}

Verified Events in System:
${eventsSummary || 'No direct event match.'}

Corroborated Reporting:
${articlesSummary || 'No matching dispatches.'}

Evaluated Claims:
${claimsSummary || 'None extracted.'}

Corroborated Search Hypotheses:
${supportedHypothesesText}
${urlContext}

Answer:`
        : `You are Pramāṇa's lead news research intelligence analyst.
Synthesize an evidence-grounded research intelligence summary answering the user's inquiry based STRICTLY on the corroborated evidence below.

CRITICAL INSTRUCTIONS:
1. Ground truth only: Do NOT invent facts, statistics, historical dates, or predictions not present in the snippets.
2. Provide a clean, cohesive research prose answer (2 to 3 paragraphs). DO NOT include markdown headings (no "###", no "**Title:**").
3. Distinctly cover:
   - What the corroborated reporting establishes as established facts.
   - The broader context and timeline.
   - What remains unverified or uncertain in current coverage.
4. Tone: Rigorous, objective research prose (e.g. "Available reporting indicates...", "Corroborated sources confirm..."). Never reference internal database terms (never say "in our database" or "retrieved dispatches").

Conversation History:
${historyContext || 'None'}

User Inquiry:
${effectiveQuery}

Verified Events in System:
${eventsSummary || 'No direct event match.'}

Corroborated Reporting:
${articlesSummary || 'No matching dispatches.'}

Evaluated Claims:
${claimsSummary || 'None extracted.'}

Corroborated Search Hypotheses:
${supportedHypothesesText}
${urlContext}

Research Summary:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
        });
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Ask synthesis timeout')), 6000)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);
        executiveSummary = response.text.trim().replace(/^###\s+/gm, '').replace(/\*\*/g, '');
        provenance = 'PRIMARY SOURCE';
      } catch (err) {
        // Fallback to deterministic synthesis
      }
    }
  }

  // 8. Honest Insufficiency Check and Deterministic Fallback
  if (!sufficiency.isSufficient) {
    if (queryIntent.primaryIntent === 'PRODUCT_LAUNCH' || queryIntent.primaryIntent === 'MODEL_RELEASE') {
      executiveSummary = 'No sufficiently supported recent product-launch or model-release information is available in the current evidence set.';
    } else if (queryIntent.primaryIntent === 'DISASTER_STATUS') {
      executiveSummary = 'No corroborated recent disaster or earthquake reports are currently documented for this specific location.';
    } else if (queryIntent.primaryIntent === 'RESEARCH_FINDING' || queryIntent.primaryIntent === 'SCIENTIFIC_DISCOVERY') {
      executiveSummary = 'No empirical research findings or published scientific discoveries are documented for this query in current evidence.';
    } else {
      executiveSummary = 'No sufficiently supported recent information is available in the current evidence set to answer this inquiry.';
    }
  } else if (!executiveSummary) {
    if (relevantEvents.length > 0) {
      const ev = relevantEvents[0];
      executiveSummary = mode === 'ask'
        ? `${ev.summary} (${ev.source_count || 1} corroborated source(s)).`
        : `${ev.summary} This situation is tracked across ${ev.source_count || 1} independent source(s) and ${ev.article_count || 1} recorded dispatch(es).`;
    } else if (relevantArticles.length > 0) {
      executiveSummary = mode === 'ask'
        ? `Reports indicate that "${relevantArticles[0].title}" (${relevantArticles[0].source_name || 'News Source'}).`
        : `Corroborated reporting from independent sources confirms coverage on this topic, led by reports such as "${relevantArticles[0].title}" from ${relevantArticles[0].source_name || 'News Source'}.`;
    } else {
      executiveSummary = `No independent corroborated reports or living events currently document "${effectiveQuery}". You can monitor the Live Wire as fresh dispatches are ingested.`;
    }
  }

  const relevantVp = getQueryRelevantVerifiedPicture(effectiveQuery, verifiedClaims);
  theVerifiedPicture = relevantVp
    ? (relevantVp.text || relevantVp.content)
    : (topEvent?.summary ? topEvent.summary.slice(0, 180) : executiveSummary.slice(0, 180));

  // 9. Construct First-Class Current Status vs Recent Event Object
  const isHistorical = temporalIntent === 'HISTORICAL';
  const primaryEvent = topEvent;
  const hasActiveEvent = !isHistorical && primaryEvent && (primaryEvent.status === 'developing' || primaryEvent.status === 'ongoing');
  const currentStatus = {
    isActive: Boolean(hasActiveEvent),
    headline: hasActiveEvent
      ? 'Active Living Event'
      : (primaryEvent ? (isHistorical ? 'Historical Record' : 'Concluded / Recent Event') : 'No Active Alert'),
    description: hasActiveEvent
      ? `An active emergency is currently tracked across ${primaryEvent.source_count || 1} independent sources.`
      : (primaryEvent
          ? `Reporting documents a notable event (${primaryEvent.title}), though no active emergency alert is currently in effect.`
          : 'No corroborated emergency or ongoing alert is currently detected in latest dispatches.'),
  };

  // Determine evidence state strictly based on sufficiency gate
  const evidenceState = sufficiency.isSufficient
    ? 'CORROBORATED'
    : (sufficiency.evidenceState || (temporalIntent === 'CURRENT_STATUS' ? 'CURRENT_ACTIVITY_NOT_FOUND' : 'NO_RELEVANT_EVIDENCE_FOUND'));

  // Target articles pool (only relevant items when sufficient)
  const targetArticles = sufficiency.isSufficient
    ? (relevantArticles.length > 0 ? relevantArticles : articles)
    : [];

  const allFormattedSources = targetArticles.map(a => ({
    id: a.id,
    headline: a.title,
    title: a.title,
    publisher: a.source_name || 'News Source',
    name: a.source_name || 'News Source',
    publishedAt: a.published_at,
    excerpt: a.summary || (a.content ? a.content.slice(0, 180) + '...' : ''),
    reliabilityScore: a.reliability_score ? Math.round(a.reliability_score * 100) : 50,
    sourceTier: a.source_tier || (a.reliability_score >= 0.90 ? 'PRIMARY_SOURCE' : 'HIGH_QUALITY_NEWS'),
    wireService: a.wire_service || null,
    isExternal: Boolean(a.is_external),
    url: a.url,
  }));

  // Structured Key Developments for Answer-First hierarchy (Part 15)
  const keyDevelopments = [];
  if (sufficiency.isSufficient && targetArticles.length > 0) {
    for (const art of targetArticles.slice(0, 4)) {
      keyDevelopments.push({
        title: art.title,
        date: art.published_at ? new Date(art.published_at).toISOString().slice(0, 10) : 'Recent',
        organization: art.source_name || 'News Source',
        whatHappened: art.summary || art.title,
        whyItMatters: art.summary ? art.summary.slice(0, 140) : 'Corroborated reporting from independent sources.',
        url: art.url,
        sourceTier: art.source_tier || (art.reliability_score >= 0.90 ? 'PRIMARY_SOURCE' : 'HIGH_QUALITY_NEWS'),
      });
    }
  }

  // Structured Evidence Drawer for Optional Verification (Part 15 & 16)
  const evidenceDrawer = {
    verifiedClaimsCount: verifiedClaims.length,
    claims: verifiedClaims,
    supportedHypotheses,
    causalLinksCount: (causalChain || []).length,
    isOpenByDefault: mode === 'fact_check',
  };

  return {
    mode,
    query: effectiveQuery,
    temporalIntent,
    queryIntent,
    evidenceState,
    evidenceSufficiency: sufficiency,
    isExternalFallbackUsed: externalArticles.length > 0,
    targetUrl,
    urlAnalysis: urlAnalysis || null,
    videoAnalysis: videoAnalysis || null,
    executiveSummary,
    answer: executiveSummary, // backwards compatibility
    directAnswer: executiveSummary,
    keyDevelopments,
    evidenceDrawer,
    theVerifiedPicture,
    currentStatus,
    provenance,
    accessState: videoAnalysis ? 'METADATA_ONLY' : (urlAnalysis ? 'FULL_CONTENT_ANALYZED' : 'DIRECT_QUERY'),
    claims: verifiedClaims,
    articles: targetArticles,
    events: relevantEvents,
    entities,
    graphContext,
    causalChain: causalChain || [],
    timeline,
    narrativeReport,
    mlForecast,
    eventFamily,
    videoNote: videoAnalysis?.note || null,
    sources: allFormattedSources.slice(0, 4),
    allSources: allFormattedSources,
    moreSources: allFormattedSources.slice(4),
  };
}
