import { retrieveHybridContext } from './hybridRetriever.js';
import { expandQuery, pruneHypotheses } from './queryExpander.js';
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
 * @returns {Promise<object>} Structured intelligence response
 */
export async function processResearchQuery({
  query: userQuery = '',
  mode = 'ask',
  conversationHistory = [],
  url = null,
  userId = null,
  topicContext = {},
} = {}) {
  let effectiveQuery = (userQuery || '').trim();
  let targetUrl = (url || '').trim();

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
  } = retrievalResult;

  const topEvent = events[0] || null;

  // 2. Causal Chain & Temporal Milestones
  const causalChain = await assembleCausalChain({
    event: topEvent,
    articles,
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

  // 4. Deterministic ML Escalation Forecast
  const mlForecast = await computeGroundedForecast({
    event: topEvent || { article_count: articles.length, source_count: new Set(articles.map(a => a.source_name)).size },
    articles,
    claims: dbClaims,
    entities,
    persist: false,
  });

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
  } else if (effectiveQuery) {
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
      theVerifiedPicture: verifiedClaims.find(c => c.status === 'VERIFIED')?.text || null,
      provenance: 'NEWS REPORTING',
      accessState: videoAnalysis ? 'METADATA_ONLY' : (urlAnalysis ? 'FULL_CONTENT_ANALYZED' : 'DIRECT_QUERY'),
      claims: verifiedClaims,
      articles,
      events,
      causalChain,
      timeline,
      mlForecast,
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

      const eventsSummary = events.slice(0, 3).map(e =>
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

      const prompt = `You are Pramāṇa's lead news research intelligence analyst.
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
          setTimeout(() => rej(new Error('Ask synthesis timeout')), 3500)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);
        executiveSummary = response.text.trim().replace(/^###\s+/gm, '').replace(/\*\*/g, '');
        provenance = 'PRIMARY SOURCE';
      } catch (err) {
        // Fallback to deterministic synthesis
      }
    }
  }

  // 8. Deterministic Fallback if LLM unavailable or timed out
  if (!executiveSummary) {
    if (events.length > 0) {
      const ev = events[0];
      theVerifiedPicture = verifiedClaims.find(c => c.status === 'VERIFIED')?.text || ev.summary;
      executiveSummary = `${ev.summary} This situation is tracked across ${ev.source_count || 1} independent source(s) and ${ev.article_count || 1} recorded dispatch(es).`;
    } else if (articles.length > 0) {
      executiveSummary = `Corroborated reporting from independent sources confirms coverage on this topic, led by reports such as "${articles[0].title}" from ${articles[0].source_name || 'News Source'}.`;
    } else {
      executiveSummary = `No independent corroborated reports or living events currently document "${effectiveQuery}". You can monitor the Live Wire as fresh dispatches are ingested.`;
    }
  }

  if (!theVerifiedPicture) {
    theVerifiedPicture = verifiedClaims.find(c => c.status === 'VERIFIED')?.text || (events[0]?.summary ? events[0].summary.slice(0, 180) : executiveSummary.slice(0, 180));
  }

  // 9. Construct First-Class Current Status vs Recent Event Object
  const isHistorical = temporalIntent === 'HISTORICAL';
  const primaryEvent = events[0] || null;
  const hasActiveEvent = !isHistorical && primaryEvent && (primaryEvent.status === 'developing' || primaryEvent.status === 'ongoing');
  const currentStatus = {
    isActive: Boolean(hasActiveEvent),
    headline: hasActiveEvent
      ? 'Active Living Event'
      : (events.length > 0 ? (isHistorical ? 'Historical Record' : 'Concluded / Recent Event') : 'No Active Alert'),
    description: hasActiveEvent
      ? `An active emergency is currently tracked across ${primaryEvent.source_count || 1} independent sources.`
      : (events.length > 0
          ? `Reporting documents a notable event (${primaryEvent.title}), though no active emergency alert is currently in effect.`
          : 'No corroborated emergency or ongoing alert is currently detected in latest dispatches.'),
  };

  // Determine evidence state
  const evidenceState = (articles.length > 0 || events.length > 0)
    ? 'CORROBORATED'
    : (temporalIntent === 'CURRENT_STATUS' ? 'CURRENT_ACTIVITY_NOT_FOUND' : 'NO_RELEVANT_EVIDENCE_FOUND');

  return {
    mode,
    query: effectiveQuery,
    temporalIntent,
    evidenceState,
    targetUrl,
    urlAnalysis: urlAnalysis || null,
    videoAnalysis: videoAnalysis || null,
    executiveSummary,
    answer: executiveSummary, // backwards compatibility
    theVerifiedPicture,
    currentStatus,
    provenance,
    accessState: videoAnalysis ? 'METADATA_ONLY' : (urlAnalysis ? 'FULL_CONTENT_ANALYZED' : 'DIRECT_QUERY'),
    claims: verifiedClaims,
    articles,
    events,
    entities,
    graphContext,
    causalChain,
    timeline,
    narrativeReport,
    mlForecast: mlForecast?.status === 'FORECAST_PRODUCED' ? mlForecast : { status: 'NO_FORECAST_JUSTIFIED' },
    eventFamily,
    videoNote: videoAnalysis?.note || null,
    sources: articles.map(a => ({
      id: a.id,
      headline: a.title,
      title: a.title,
      publisher: a.source_name || 'News Source',
      name: a.source_name || 'News Source',
      publishedAt: a.published_at,
      excerpt: a.summary || (a.content ? a.content.slice(0, 180) + '...' : ''),
      reliabilityScore: a.reliability_score ? Math.round(a.reliability_score * 100) : 50,
      wireService: a.wire_service || null,
      url: a.url,
    })),
  };
}
