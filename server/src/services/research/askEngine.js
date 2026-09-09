import { query } from '../../db/pool.js';
import { getGeminiClient, isGeminiConfigured } from '../gemini.js';
import { readPublicUrl } from './urlReader.js';
import { isVideoUrl, readVideoMetadata } from './videoReader.js';
import { retrieveHybridContext } from './hybridRetriever.js';
import { verifyClaim, classifySourceHierarchy } from '../intelligence/claimVerifier.js';
import { assembleCausalChain } from '../intelligence/causalEngine.js';
import { buildTemporalSequence } from '../intelligence/temporalEngine.js';
import { analyzeNarratives } from '../intelligence/narrativeAnalyzer.js';
import { computeGroundedForecast } from '../intelligence/forecastEngine.js';

/**
 * Main research engine processing queries, topics, claims, URLs, and video URLs.
 * Integrates 9-vector hybrid retrieval, hypothesis pruning, evidence-grounded causal chains,
 * syndication-checked verification, and calibrated ML forecasting.
 *
 * @param {object} params
 * @param {string} params.query - User query or claim text
 * @param {'ask'|'fact_check'|'research'} [params.mode='ask']
 * @param {Array<{role: string, content: string}>} [params.conversationHistory=[]]
 * @param {string} [params.url] - Optional article or video URL
 * @param {string} [params.userId] - Optional authenticated user ID
 * @returns {Promise<object>} Grounded research dossier response
 */
export async function processResearchQuery({
  query: userQuery = '',
  mode = 'ask',
  conversationHistory = [],
  url = '',
  userId = null,
}) {
  let effectiveQuery = (userQuery || '').trim();
  let targetUrl = (url || '').trim();

  // If query itself is a URL, extract it
  if (!targetUrl && (effectiveQuery.startsWith('http://') || effectiveQuery.startsWith('https://'))) {
    const parts = effectiveQuery.split(/\s+/);
    targetUrl = parts[0];
    effectiveQuery = parts.slice(1).join(' ') || '';
  }

  let urlAnalysis = null;
  let videoAnalysis = null;

  // Handle URL input with honest labeling and SSRF protection
  if (targetUrl) {
    if (isVideoUrl(targetUrl)) {
      videoAnalysis = await readVideoMetadata(targetUrl);
      if (!videoAnalysis.success) {
        return {
          mode,
          query: effectiveQuery,
          targetUrl,
          answer: videoAnalysis.error || "We couldn't access enough information from this video URL to analyze it.",
          provenance: 'PUBLIC SIGNAL',
          accessState: 'UNABLE_TO_ACCESS',
          claims: [],
          sources: [],
          urlAnalysis: { url: targetUrl, isVideo: true, error: videoAnalysis.error },
        };
      }
      effectiveQuery = `${videoAnalysis.title} ${effectiveQuery}`.trim();
    } else {
      urlAnalysis = await readPublicUrl(targetUrl);
      if (!urlAnalysis.success) {
        return {
          mode,
          query: effectiveQuery,
          targetUrl,
          answer: urlAnalysis.error || "We couldn't access enough information from this URL to analyze it.",
          provenance: 'NEWS REPORTING',
          accessState: 'UNABLE_TO_ACCESS',
          claims: [],
          sources: [],
          urlAnalysis: { url: targetUrl, isVideo: false, error: urlAnalysis.error },
        };
      }
      effectiveQuery = `${urlAnalysis.title}. ${effectiveQuery}`.trim();
    }
  }

  // Conversational Memory: If follow-up question, combine with recent conversation turn
  let searchContextQuery = effectiveQuery;
  if (conversationHistory.length > 0 && effectiveQuery.length < 40) {
    const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user');
    if (lastUserMsg?.content) {
      searchContextQuery = `${lastUserMsg.content} ${effectiveQuery}`;
    }
  }

  // 1. 9-Vector Hybrid Retrieval & Hypothesis Pruning
  const retrieval = await retrieveHybridContext({
    query: searchContextQuery,
    limit: mode === 'research' ? 10 : 6,
  });

  const {
    events,
    articles,
    claims: dbClaims,
    entities,
    graphContext,
    narratives,
    causalLinks,
    supportedHypotheses,
    unsupportedHypotheses,
  } = retrieval;

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

  // 3. Narrative Framing Comparison (deterministic terminology classification)
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
    // Single assertion verification
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
    if (userId) {
      await query(
        `INSERT INTO fact_checks (user_id, submission_type, submission_content, submission_url, status, result)
         VALUES ($1, $2, $3, $4, 'completed', $5)`,
        [
          userId,
          targetUrl ? (videoAnalysis ? 'video' : 'url') : 'text',
          effectiveQuery,
          targetUrl || null,
          JSON.stringify({ claims: verifiedClaims, matchedArticles: articles.length }),
        ]
      ).catch(() => {});
    }

    const verifiedCount = verifiedClaims.filter(c => c.status === 'VERIFIED').length;
    const answerSummary = verifiedClaims.length > 0
      ? `Audit completed across ${articles.length} corroborating dispatch(es). Established ${verifiedCount} verified assertion(s) with wire-syndication de-duplication.`
      : 'Insufficient independent corroborated reporting available in the knowledge system to verify this assertion.';

    return {
      mode: 'fact_check',
      query: effectiveQuery,
      targetUrl,
      answer: answerSummary,
      theVerifiedPicture: verifiedClaims.find(c => c.status === 'VERIFIED')?.text || null,
      provenance: 'NEWS REPORTING',
      accessState: videoAnalysis ? 'METADATA_ONLY' : (urlAnalysis ? 'FULL_CONTENT_ANALYZED' : 'DIRECT_QUERY'),
      claims: verifiedClaims,
      articles,
      events,
      causalChain,
      timeline,
      mlForecast,
      videoNote: videoAnalysis?.note || null,
      sources: articles.map(a => ({
        name: a.source_name || 'News Source',
        type: classifySourceHierarchy(a),
        title: a.title,
        url: a.url,
        reliability: a.reliability_score ? Math.round(a.reliability_score * 100) : null,
      })),
    };
  }

  // 7. Grounded Synthesis RAG for Ask & Deep Research Modes
  let answer = '';
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
Synthesize an evidence-grounded research intelligence dossier answering the user's inquiry based STRICTLY on the corroborated evidence below.

CRITICAL INSTRUCTIONS:
1. Ground truth only: Do NOT invent facts, statistics, historical dates, or predictions not present in the snippets.
2. Structure your response into clear editorial sections:
   - "### The Verified Picture": 2 crisp sentences summarizing the established core facts.
   - "### What Happened & Context": Chronological, objective explanation.
   - "### Causal Sequence": Walk through preconditions, trigger, mechanism, and consequences where supported.
   - "### What Remains Uncertain": Explicitly state what reporting has not yet established.
3. If analyzing video metadata, explicitly include the limitation: "${videoAnalysis?.note || ''}".

Conversation History:
${historyContext || 'None'}

User Inquiry:
${effectiveQuery}

Verified Events in Database:
${eventsSummary || 'No direct event match.'}

Retrieved Dispatches:
${articlesSummary || 'No matching dispatches.'}

Evaluated Claims:
${claimsSummary || 'None extracted.'}

Corroborated Search Hypotheses:
${supportedHypothesesText}
${urlContext}

Response:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
        });
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Ask synthesis timeout')), 4000)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);
        answer = response.text.trim();
        provenance = 'PRIMARY SOURCE';

        // Extract verified picture from text if generated
        if (answer.includes('### The Verified Picture')) {
          const parts = answer.split('### The Verified Picture');
          if (parts[1]) {
            const vpLines = parts[1].split('###')[0].trim();
            theVerifiedPicture = vpLines;
          }
        }
      } catch (err) {
        // Fallback to deterministic synthesis
      }
    }
  }

  // 8. Deterministic Fallback if LLM unavailable or timed out
  if (!answer) {
    if (events.length > 0) {
      const ev = events[0];
      theVerifiedPicture = verifiedClaims.find(c => c.status === 'VERIFIED')?.text || ev.summary;
      answer = `### The Verified Picture\n${theVerifiedPicture}\n\n### What Happened\n${ev.summary}\n\nTracked across ${ev.source_count} independent source(s) and ${ev.article_count} recorded dispatch(es).`;
    } else if (articles.length > 0) {
      answer = `### Retrieved Reporting\nRetrieved ${articles.length} corroborated news dispatch(es):\n\n` +
        articles.slice(0, 3).map(a => `• **${a.title}** (${a.source_name || 'News Wire'}) — ${a.summary || ''}`).join('\n\n');
    } else {
      answer = `No corroborated reports or living events currently match "${effectiveQuery}" in the intelligence database. You can monitor the Live Wire as fresh dispatches are ingested.`;
    }
  }

  return {
    mode,
    query: effectiveQuery,
    targetUrl,
    answer,
    theVerifiedPicture,
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
    mlForecast,
    videoNote: videoAnalysis?.note || null,
    sources: articles.map(a => ({
      name: a.source_name || 'News Source',
      type: classifySourceHierarchy(a),
      title: a.title,
      url: a.url,
      reliability: a.reliability_score ? Math.round(a.reliability_score * 100) : null,
    })),
  };
}
