import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Common domain concept heuristics for deterministic fallback expansion
 * when Gemini LLM call is unavailable or rate-limited.
 */
const DOMAIN_HEURISTICS = {
  flood: ['rainfall', 'monsoon', 'river overflow', 'landslide', 'drainage', 'infrastructure', 'evacuation'],
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
};

/**
 * Deconstruct a user query into structured search hypotheses.
 * These are candidate investigation paths, NOT established facts.
 *
 * @param {string} userQuery - The input prompt, topic, or claim
 * @returns {Promise<{
 *   originalQuery: string,
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
      targetEntities: [],
      candidateHypotheses: [],
      searchKeywords: [],
      expandedQueryString: '',
    };
  }

  const cleanQuery = userQuery.trim();
  const lower = cleanQuery.toLowerCase();

  // 1. Deterministic baseline extraction
  const tokens = lower.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2);
  const detectedHypotheses = new Set();
  const searchKeywords = new Set(tokens);

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
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
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
            if (typeof h === 'string' && h.trim()) detectedHypotheses.add(h.trim());
          });
          candidateHypotheses = Array.from(detectedHypotheses);
        }
        if (Array.isArray(parsed.searchKeywords) && parsed.searchKeywords.length > 0) {
          parsed.searchKeywords.forEach(k => {
            if (typeof k === 'string' && k.trim()) searchKeywords.add(k.trim().toLowerCase());
          });
        }
      } catch (err) {
        // Fallback to deterministic heuristics on rate limit or API error
      }
    }
  }

  const uniqueEntities = [...new Set(targetEntities)].slice(0, 8);
  const uniqueHypotheses = [...new Set(candidateHypotheses)].slice(0, 10);
  const uniqueKeywords = [...new Set(searchKeywords)].slice(0, 15);

  const expandedQueryString = `${cleanQuery} ${uniqueHypotheses.slice(0, 4).join(' ')}`.trim();

  return {
    originalQuery: cleanQuery,
    targetEntities: uniqueEntities,
    candidateHypotheses: uniqueHypotheses,
    searchKeywords: uniqueKeywords,
    expandedQueryString,
  };
}

/**
 * Prune candidate search hypotheses against retrieved evidence.
 * Strict Ground Truth Rule:
 * Hypotheses that have zero corroboration in retrieved dispatches/articles
 * are discarded and never promoted to the final report as established facts.
 *
 * @param {string[]} candidateHypotheses - Proposed investigation hypotheses
 * @param {Array<{title: string, summary: string, content?: string}>} retrievedArticles - Actual evidence
 * @param {Array<{text: string}>} [retrievedClaims=[]] - Extracted claims
 * @returns {{
 *   supportedHypotheses: Array<{hypothesis: string, matchedExcerpts: string[]}>,
 *   unsupportedHypotheses: string[]
 * }}
 */
export function pruneHypotheses(
  candidateHypotheses = [],
  retrievedArticles = [],
  retrievedClaims = []
) {
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

    // Extract significant terms from hypothesis (length > 3)
    const terms = hypothesis.toLowerCase()
      .split(/[^a-zA-Z0-9_-]+/)
      .filter(t => t.length > 3 && !['about', 'with', 'from', 'this', 'that', 'have', 'were', 'been'].includes(t));

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

    // Supported if at least 50% of specific terms match OR full phrase appears
    if (matchRatio >= 0.5 || corpusText.includes(hypothesis.toLowerCase())) {
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
