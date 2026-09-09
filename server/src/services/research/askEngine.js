import { query } from '../../db/pool.js';
import { getGeminiClient, isGeminiConfigured, generateEmbedding } from '../gemini.js';
import { readPublicUrl } from './urlReader.js';
import { isVideoUrl, readVideoMetadata } from './videoReader.js';

/**
 * Retrieve matching events, articles, and claims from PostgreSQL.
 * Uses vector search (cosine distance) if embeddings available, falling back to ILIKE search.
 */
async function retrieveContext(searchQuery) {
  if (!searchQuery || !searchQuery.trim()) {
    return { events: [], articles: [], claims: [] };
  }

  const cleanQuery = searchQuery.trim();
  const searchPattern = `%${cleanQuery.slice(0, 100)}%`;

  let embedding = null;
  if (isGeminiConfigured()) {
    embedding = await generateEmbedding(cleanQuery).catch(() => null);
  }

  // 1. Search events
  let events = [];
  try {
    if (embedding && Array.isArray(embedding)) {
      const { rows } = await query(
        `SELECT id, title, summary, category, severity, status, source_count, article_count, last_updated_at,
                1 - (embedding <=> $1::vector) AS similarity
         FROM events
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 5`,
        [JSON.stringify(embedding)]
      );
      events = rows;
    }
  } catch (err) {
    // Vector search fallback
  }

  if (events.length === 0) {
    const { rows } = await query(
      `SELECT id, title, summary, category, severity, status, source_count, article_count, last_updated_at
       FROM events
       WHERE title ILIKE $1 OR summary ILIKE $1
       ORDER BY last_updated_at DESC
       LIMIT 5`,
      [searchPattern]
    );
    events = rows;
  }

  // 2. Search articles
  let articles = [];
  try {
    const { rows } = await query(
      `SELECT a.id, a.title, a.summary, a.url, a.published_at, s.name AS source_name, s.reliability_score
       FROM articles a
       LEFT JOIN sources s ON a.source_id = s.id
       WHERE a.title ILIKE $1 OR a.summary ILIKE $1
       ORDER BY a.published_at DESC
       LIMIT 6`,
      [searchPattern]
    );
    articles = rows;
  } catch (err) {
    // ignore
  }

  // 3. Search claims
  let claims = [];
  try {
    const { rows } = await query(
      `SELECT c.id, c.text, c.claim_type, c.information_class, c.verification_status,
              e.title AS event_title
       FROM claims c
       LEFT JOIN events e ON c.event_id = e.id
       WHERE c.text ILIKE $1
       LIMIT 8`,
      [searchPattern]
    );
    claims = rows;
  } catch (err) {
    // ignore
  }

  return { events, articles, claims };
}

/**
 * Main entrypoint to process research and fact-check queries.
 *
 * @param {object} params
 * @param {string} params.query - User query or claim text
 * @param {'ask'|'fact_check'|'research'} [params.mode='ask']
 * @param {Array<{role: string, content: string}>} [params.conversationHistory=[]]
 * @param {string} [params.url] - Optional article or video URL
 * @param {string} [params.userId] - Optional authenticated user ID
 * @returns {Promise<object>} Research report response
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

  // Handle URL input
  if (targetUrl) {
    if (isVideoUrl(targetUrl)) {
      videoAnalysis = await readVideoMetadata(targetUrl);
      if (!videoAnalysis.success) {
        return {
          mode,
          answer: videoAnalysis.error || "We couldn't access enough information from this video URL to analyze it.",
          provenance: 'PUBLIC SIGNAL',
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
          answer: urlAnalysis.error || "We couldn't access enough information from this URL to analyze it.",
          provenance: 'NEWS REPORTING',
          claims: [],
          sources: [],
          urlAnalysis: { url: targetUrl, isVideo: false, error: urlAnalysis.error },
        };
      }
      effectiveQuery = `${urlAnalysis.title}. ${effectiveQuery}`.trim();
    }
  }

  // If follow-up question with little context, include previous turn
  let contextQuery = effectiveQuery;
  if (conversationHistory.length > 0 && effectiveQuery.length < 35) {
    const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user');
    if (lastUserMsg?.content) {
      contextQuery = `${lastUserMsg.content} ${effectiveQuery}`;
    }
  }

  // Retrieve matching context from database
  const { events, articles, claims } = await retrieveContext(contextQuery);

  // If in Fact Check mode, verify claims against retrieved database facts
  if (mode === 'fact_check') {
    const identifiedClaims = [];

    // If matching claims found in DB, use them
    if (claims.length > 0) {
      for (const c of claims) {
        identifiedClaims.push({
          id: c.id,
          text: c.text,
          status: c.verification_status, // VERIFIED, UNVERIFIED, CONTRADICTED
          claimType: c.claim_type,
          infoClass: c.information_class,
          eventTitle: c.event_title,
        });
      }
    } else if (effectiveQuery) {
      // Direct assertion checking
      const isCorroborated = articles.length > 0;
      identifiedClaims.push({
        id: 'claim-1',
        text: effectiveQuery,
        status: isCorroborated ? 'VERIFIED' : 'UNVERIFIED',
        claimType: 'factual',
        infoClass: 'fact',
        eventTitle: events[0]?.title || null,
      });
    }

    // Save into fact_checks table if userId exists
    if (userId) {
      await query(
        `INSERT INTO fact_checks (user_id, submission_type, submission_content, submission_url, status, result)
         VALUES ($1, $2, $3, $4, 'completed', $5)`,
        [
          userId,
          targetUrl ? (videoAnalysis ? 'video' : 'url') : 'text',
          effectiveQuery,
          targetUrl || null,
          JSON.stringify({ claims: identifiedClaims, matchedArticles: articles.length }),
        ]
      ).catch(() => {});
    }

    const answerSummary = identifiedClaims.length > 0
      ? `Analysis completed across ${articles.length} corroborating news source(s). ${identifiedClaims.filter(c => c.status === 'VERIFIED').length} verified claim(s) established.`
      : 'Insufficient corroborated reporting available in the knowledge system for this specific assertion.';

    return {
      mode: 'fact_check',
      query: effectiveQuery,
      targetUrl,
      answer: answerSummary,
      provenance: 'NEWS REPORTING',
      claims: identifiedClaims,
      articles,
      events,
      videoNote: videoAnalysis?.note || null,
      sources: articles.map(a => ({
        name: a.source_name || 'News Source',
        title: a.title,
        url: a.url,
        reliability: a.reliability_score ? Math.round(a.reliability_score * 100) : null,
      })),
    };
  }

  // Standard Ask / Research mode
  let answer = '';
  let provenance = 'NEWS REPORTING';

  if (isGeminiConfigured() && (events.length > 0 || articles.length > 0 || urlAnalysis || videoAnalysis)) {
    const client = getGeminiClient();
    if (client) {
      const historyContext = conversationHistory.slice(-4).map(m =>
        `${m.role.toUpperCase()}: ${m.content}`
      ).join('\n');

      const eventsSummary = events.map(e =>
        `- Event: ${e.title} (${e.category}) | Severity: ${e.severity}\n  Summary: ${e.summary}`
      ).join('\n\n');

      const articlesSummary = articles.map(a =>
        `- [${a.source_name || 'Source'}] ${a.title}\n  ${a.summary || ''}`
      ).join('\n\n');

      const claimsSummary = claims.map(c =>
        `- Claim [${c.verification_status}]: "${c.text}"`
      ).join('\n');

      let urlContext = '';
      if (urlAnalysis?.text) {
        urlContext = `\nRetrieved Article Content (${urlAnalysis.url}):\nTitle: ${urlAnalysis.title}\n${urlAnalysis.text.slice(0, 3000)}`;
      }
      if (videoAnalysis?.title) {
        urlContext = `\nRetrieved Public Video Metadata (${videoAnalysis.url}):\nTitle: ${videoAnalysis.title}\nChannel: ${videoAnalysis.author}\nNote: ${videoAnalysis.note}`;
      }

      const prompt = `You are Pramāṇa's primary AI news research and intelligence assistant.
Answer the user's inquiry based strictly on the verified knowledge and reporting provided below.
Maintain a professional, objective, editorial tone.
Cite specific outlets or facts where available.
Do NOT fabricate predictions, historical events, or quotes not present in the context.

Conversation History:
${historyContext || 'None'}

User Inquiry:
${effectiveQuery}

Relevant Global Events in Knowledge System:
${eventsSummary || 'No direct event match in system.'}

Relevant Articles & Dispatches:
${articlesSummary || 'No direct article matches in system.'}

Verified Claims:
${claimsSummary || 'None extracted.'}
${urlContext}

Instructions:
1. Provide a comprehensive, structured response.
2. Use clear subheadings if answering a complex question.
3. If information is incomplete, clearly state: "Sufficient corroborated evidence is not currently available for this aspect."
4. If analyzing a video URL, explicitly include: "${videoAnalysis?.note || ''}" where applicable.

Response:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const response = await client.models.generateContent({
          model,
          contents: prompt,
        });
        answer = response.text.trim();
        provenance = 'PRIMARY SOURCE';
      } catch (err) {
        console.warn('[AskEngine] Gemini call warning (using fallback):', err.message);
      }
    }
  }

  // Deterministic fallback if Gemini unavailable
  if (!answer) {
    if (events.length > 0) {
      const topEvent = events[0];
      answer = `Based on PRAMĀṆA's real-time reporting:\n\n**${topEvent.title}** (${topEvent.category.toUpperCase()})\n\n${topEvent.summary}\n\nThis event is currently tracked as **${topEvent.status}** with ${topEvent.source_count} corroborating source(s) and ${topEvent.article_count} dispatches recorded.`;
    } else if (articles.length > 0) {
      answer = `Retrieved ${articles.length} news dispatch(es) matching your query:\n\n` +
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
    provenance,
    claims,
    articles,
    events,
    videoNote: videoAnalysis?.note || null,
    sources: articles.map(a => ({
      name: a.source_name || 'News Source',
      title: a.title,
      url: a.url,
      reliability: a.reliability_score ? Math.round(a.reliability_score * 100) : null,
    })),
  };
}
