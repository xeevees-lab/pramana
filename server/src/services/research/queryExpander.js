import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Common stop words and query conversational boilerplate to strip from search terms.
 */
export const STOP_WORDS = new Set([
  'what', 'when', 'where', 'why', 'how', 'which', 'who', 'whom', 'whose',
  'with', 'from', 'this', 'that', 'these', 'those', 'there', 'their',
  'have', 'were', 'been', 'about', 'tell', 'does', 'will', 'would', 'could',
  'should', 'is', 'are', 'was', 'the', 'and', 'for', 'any', 'some', 'happened',
  'occurred', 'happening', 'latest', 'recent', 'updates', 'update', 'news', 'reports'
]);

/**
 * Common domain concept heuristics for deterministic fallback expansion
 * when Gemini LLM call is unavailable or rate-limited.
 */
const DOMAIN_HEURISTICS = {
  flood: ['rainfall', 'monsoon', 'river overflow', 'landslide', 'drainage', 'infrastructure', 'evacuation'],
  flooding: ['rainfall', 'monsoon', 'river overflow', 'landslide', 'drainage', 'infrastructure', 'evacuation'],
  quake: ['fault line', 'aftershocks', 'epicenter', 'casualties', 'structural damage', 'seismic'],
  earthquake: ['fault line', 'aftershocks', 'epicenter', 'casualties', 'structural damage', 'seismic'],
  cyclone: ['wind speed', 'storm surge', 'landfall', 'evacuation', 'coastal warning'],
  hurricane: ['wind speed', 'storm surge', 'landfall', 'evacuation', 'coastal warning'],
  typhoon: ['wind speed', 'storm surge', 'landfall', 'evacuation', 'coastal warning'],
  war: ['ceasefire', 'artillery', 'territorial control', 'diplomatic talks', 'civilian casualties', 'sanctions'],
  conflict: ['ceasefire', 'artillery', 'territorial control', 'diplomatic talks', 'civilian casualties', 'sanctions'],
  election: ['turnout', 'voting', 'coalition', 'ballot', 'parliament', 'campaign finance'],
  trial: ['indictment', 'prosecution', 'testimony', 'verdict', 'defense counsel', 'evidence'],
  economy: ['inflation', 'interest rates', 'central bank', 'gdp growth', 'trade balance', 'employment'],
  tariff: ['import duties', 'trade deficit', 'customs', 'bilateral trade', 'retaliatory measures'],
};

/**
 * Classify the temporal and analytical intent of the research query.
 *
 * @param {string} query
 * @returns {'CURRENT_STATUS'|'RECENT_EVENT'|'CAUSAL'|'HISTORICAL'|'GENERAL_TOPIC'}
 */
export function classifyTemporalIntent(query = '') {
  const lower = (query || '').toLowerCase().trim();

  // Current status check
  if (
    lower.includes('right now') ||
    lower.includes('currently') ||
    lower.includes('at this moment') ||
    lower.includes('today') ||
    lower.includes('latest update') ||
    lower.includes('breaking') ||
    lower.startsWith('is ') ||
    lower.startsWith('are ')
  ) {
    return 'CURRENT_STATUS';
  }

  // Causal explanation
  if (
    lower.includes('why did') ||
    lower.includes('what caused') ||
    lower.includes('cause of') ||
    lower.includes('root cause') ||
    lower.includes('how did this happen')
  ) {
    return 'CAUSAL';
  }

  // Historical retrospective
  if (
    lower.includes('history of') ||
    lower.includes('historical') ||
    lower.includes('legacy') ||
    lower.includes('handover') ||
    lower.includes('origins of') ||
    lower.includes('background of') ||
    lower.includes('decades ago') ||
    lower.includes('in the 19') ||
    lower.includes('in the 200') ||
    lower.includes('past events') ||
    lower.includes('anniversary')
  ) {
    return 'HISTORICAL';
  }

  // Recent event reconstruction
  if (
    lower.includes('what happened') ||
    lower.includes('aftermath') ||
    lower.includes('consequences') ||
    lower.includes('damage') ||
    lower.includes('victims') ||
    lower.includes('rescue')
  ) {
    return 'RECENT_EVENT';
  }

  return 'GENERAL_TOPIC';
}

/**
 * Deconstruct a user query into structured search hypotheses.
 * These are candidate investigation paths, NOT established facts.
 *
 * @param {string} userQuery - The input prompt, topic, or claim
 * @returns {Promise<{
 *   originalQuery: string,
 *   temporalIntent: string,
 *   highSignalTokens: string[],
 *   targetEntities: string[],
 *   candidateHypotheses: string[],
 *   searchKeywords: string[],
 *   expandedQueryString: string
 * }>}
 */
export async function expandQuery(userQuery) {
  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return {
      originalQuery: '',
      temporalIntent: 'GENERAL_TOPIC',
      highSignalTokens: [],
      targetEntities: [],
      candidateHypotheses: [],
      searchKeywords: [],
      expandedQueryString: '',
    };
  }

  const cleanQuery = userQuery.trim();
  const lower = cleanQuery.toLowerCase();
  const temporalIntent = classifyTemporalIntent(cleanQuery);

  // 1. Deterministic baseline extraction
  const tokens = lower.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2);
  const highSignalTokens = tokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
  const detectedHypotheses = new Set();
  const searchKeywords = new Set(highSignalTokens.length > 0 ? highSignalTokens : tokens);

  for (const [key, related] of Object.entries(DOMAIN_HEURISTICS)) {
    if (lower.includes(key)) {
      related.forEach(r => detectedHypotheses.add(r));
    }
  }

  // Detect capitalized candidate entity names from original query
  const capitalWords = cleanQuery.match(/\b[A-Z][a-z0-9_-]+(?:\s+[A-Z][a-z0-9_-]+)*\b/g) || [];
  const targetEntities = [...new Set(capitalWords)];

  let candidateHypotheses = Array.from(detectedHypotheses);

  // 2. LLM-assisted rich hypothesis generation if Gemini available
  if (isGeminiConfigured()) {
    const client = getGeminiClient();
    if (client) {
      const prompt = `You are a senior intelligence research analyst at Pramāṇa.
Deconstruct this user research query into search investigation hypotheses.
Remember: These are search vectors to retrieve evidence, NOT confirmed facts.

Query: "${cleanQuery}"

Respond strictly in valid JSON with:
{
  "targetEntities": ["list of explicit or implicit people, places, organizations, countries"],
  "candidateHypotheses": ["list of 3 to 7 plausible causal, institutional, physical, or policy mechanisms to investigate"],
  "searchKeywords": ["list of 5 to 10 distinct keyword search terms for full-text retrieval"]
}

JSON:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('LLM call timeout')), 2000)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);

        const parsed = JSON.parse(response.text.trim());
        if (Array.isArray(parsed.targetEntities) && parsed.targetEntities.length > 0) {
          parsed.targetEntities.forEach(e => {
            if (typeof e === 'string' && e.trim()) targetEntities.push(e.trim());
          });
        }
        if (Array.isArray(parsed.candidateHypotheses) && parsed.candidateHypotheses.length > 0) {
          parsed.candidateHypotheses.forEach(h => {
            if (typeof h === 'string' && h.trim()) candidateHypotheses.push(h.trim());
          });
        }
        if (Array.isArray(parsed.searchKeywords) && parsed.searchKeywords.length > 0) {
          parsed.searchKeywords.forEach(k => {
            if (typeof k === 'string' && k.trim()) {
              const cleanK = k.trim().toLowerCase();
              if (!STOP_WORDS.has(cleanK)) searchKeywords.add(cleanK);
            }
          });
        }
      } catch (err) {
        // Fall back gracefully to deterministic heuristics
      }
    }
  }

  // Deduplicate and assemble
  const finalKeywords = Array.from(searchKeywords).filter(k => !STOP_WORDS.has(k) && k.length > 2);
  const finalEntities = Array.from(new Set(targetEntities));

  // Synthesize rich expanded query string for semantic vector search
  const expandedQueryString = [
    cleanQuery,
    ...candidateHypotheses.slice(0, 4),
  ].join(' ').slice(0, 300);

  return {
    originalQuery: cleanQuery,
    temporalIntent,
    highSignalTokens,
    targetEntities: finalEntities,
    candidateHypotheses,
    searchKeywords: finalKeywords,
    expandedQueryString,
  };
}

/**
 * Prune candidate hypotheses against retrieved articles and claims.
 * Drops any candidate hypothesis that finds zero corroboration in retrieved reporting.
 *
 * @param {string[]} candidateHypotheses
 * @param {Array<object>} retrievedArticles
 * @param {Array<object>} [retrievedClaims=[]]
 * @returns {{
 *   supportedHypotheses: Array<{hypothesis: string, matchedExcerpts: string[]}>,
 *   unsupportedHypotheses: string[]
 * }}
 */
export function pruneHypotheses(candidateHypotheses = [], retrievedArticles = [], retrievedClaims = []) {
  if (!Array.isArray(candidateHypotheses) || candidateHypotheses.length === 0) {
    return { supportedHypotheses: [], unsupportedHypotheses: [] };
  }

  // Combine retrieved texts for evidence scanning
  const corpus = [];
  for (const art of retrievedArticles) {
    if (art.title) corpus.push(art.title);
    if (art.summary) corpus.push(art.summary);
    if (art.content) corpus.push(art.content.slice(0, 1000));
  }
  for (const clm of retrievedClaims) {
    if (clm.text) corpus.push(clm.text);
  }

  const corpusText = corpus.join(' ').toLowerCase();

  const supportedHypotheses = [];
  const unsupportedHypotheses = [];

  for (const hypothesis of candidateHypotheses) {
    if (!hypothesis || typeof hypothesis !== 'string') continue;

    // Extract significant terms from hypothesis (length > 3, exclude stop words)
    const terms = hypothesis.toLowerCase()
      .split(/[^a-zA-Z0-9_-]+/)
      .filter(t => t.length > 3 && !STOP_WORDS.has(t));

    if (terms.length === 0) {
      unsupportedHypotheses.push(hypothesis);
      continue;
    }

    // Check how many terms are documented in the retrieved evidence corpus
    const matchedTerms = terms.filter(t => corpusText.includes(t));
    const matchRatio = matchedTerms.length / terms.length;

    // Find sample matching snippets
    const matchedExcerpts = [];
    for (const snippet of corpus) {
      if (terms.some(t => snippet.toLowerCase().includes(t))) {
        matchedExcerpts.push(snippet.slice(0, 160));
        if (matchedExcerpts.length >= 2) break;
      }
    }

    // Supported if at least 40% of specific terms match OR full phrase appears
    if (matchRatio >= 0.4 || corpusText.includes(hypothesis.toLowerCase())) {
      supportedHypotheses.push({
        hypothesis,
        matchedExcerpts,
      });
    } else {
      unsupportedHypotheses.push(hypothesis);
    }
  }

  return {
    supportedHypotheses,
    unsupportedHypotheses,
  };
}
