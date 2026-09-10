import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Common stop words and query conversational boilerplate to strip from search terms.
 */
/**
 * Common stop words and query conversational boilerplate to strip from search terms.
 */
export const STOP_WORDS = new Set([
  'what', 'when', 'where', 'why', 'how', 'which', 'who', 'whom', 'whose',
  'with', 'from', 'this', 'that', 'these', 'those', 'there', 'their',
  'have', 'were', 'been', 'about', 'tell', 'does', 'will', 'would', 'could',
  'should', 'is', 'are', 'was', 'the', 'and', 'for', 'any', 'some', 'happened',
  'occurred', 'happening', 'latest', 'recent', 'updates', 'update', 'news', 'reports',
  'report', 'finding', 'findings', 'study', 'studies', 'survey', 'surveys',
  'explain', 'explains', 'detail', 'details', 'matter', 'matters', 'happen', 'happens',
  'mean', 'means', 'say', 'says', 'give', 'gives', 'tell', 'tells', 'show', 'shows',
  'find', 'finds', 'overview', 'summary', 'comprehensive',
  'right', 'now', 'today', 'currently', 'moment', 'momentary'
]);

/**
 * 2-letter tokens of high analytical and subject value that must never be dropped.
 */
export const HIGH_VALUE_SHORT_TOKENS = new Set([
  'ai', 'eu', 'us', 'uk', 'un', 'ev', '5g', '6g', 'os', 'vr', 'ar', 'ip', 'g7', 'g8', 'pm', 'fm', 'pr'
]);

/**
 * Common domain concept heuristics for deterministic fallback expansion
 * when Gemini LLM call is unavailable or rate-limited.
 */
const DOMAIN_HEURISTICS = {
  ai: ['artificial intelligence', 'machine learning', 'neural network', 'llm', 'deep learning', 'model launch', 'reasoning'],
  technology: ['software', 'hardware', 'semiconductor', 'product launch', 'innovation', 'computing'],
  tech: ['software', 'hardware', 'semiconductor', 'product launch', 'innovation', 'computing'],
  launch: ['product launch', 'unveiled', 'debuted', 'released', 'announced'],
  launches: ['product launch', 'unveiled', 'debuted', 'released', 'announced'],
  japan: ['tokyo', 'fukushima', 'seismic', 'japan meteorological agency'],
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
  unity: ['united', 'unification', 'integration', 'solidarity', 'european union', 'eu'],
  united: ['unity', 'unification', 'integration', 'solidarity'],
  europe: ['european', 'eu', 'brussels'],
  european: ['europe', 'eu', 'brussels'],
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
 * Detect structured query intent across the 20 news intent taxonomy.
 *
 * @param {string} query
 * @param {'ask'|'fact_check'|'research'} mode
 * @returns {{
 *   primaryIntent: string,
 *   intents: string[],
 *   expectedEventTypes: string[],
 *   demotedEventTypes: string[],
 *   isBroadNewsQuery: boolean,
 *   forecastRequested: boolean,
 *   temporalFocus: 'CURRENT'|'RECENT'|'HISTORICAL'|'FUTURE'
 * }}
 */
export function detectQueryIntent(query = '', mode = 'ask') {
  const clean = (query || '').trim();
  const lower = clean.toLowerCase();

  const intents = [];
  let expectedEventTypes = [];
  let demotedEventTypes = [];
  let isBroadNewsQuery = false;
  let forecastRequested = false;

  // 1. Check for explicit forecasting / future intent
  if (
    /\b(will|predict|prediction|forecast|future of|what happens next|what will happen|outlook|projections?|by 2026|by 2030)\b/i.test(lower)
  ) {
    intents.push('FORECAST');
    forecastRequested = true;
    expectedEventTypes.push('FORECAST');
  }

  // 2. Check for Fact Check intent
  if (
    mode === 'fact_check' ||
    /\b(is this (?:claim )?true|is it true|fact[ -]check|verify if|did .* really|is .* fake|debunk|claim:)\b/i.test(lower)
  ) {
    intents.push('FACT_CHECK');
  }

  // 3. Product Launch & Model Release
  const hasLaunchSignal = /\b(product launches?|launch|launched|launching|unveils?|debuts?|releases? new|released new|ships? new|commercial availability|new devices?|new hardware)\b/i.test(lower);
  const hasModelSignal = /\b(model releases?|new (?:ai )?models?|llm releases?|weights?|foundation model|checkpoints?|gpt|claude|gemini|llama|mistral|deepseek)\b/i.test(lower);
  const hasProductSignal = /\b(product|products|devices?|apps?|features?|tools?)\b/i.test(lower);

  // 3. Model Release & Product Launch (Model Release is more specific)
  if (hasModelSignal) {
    intents.push('MODEL_RELEASE');
    intents.push('PRODUCT_RELEASE');
    expectedEventTypes.push('MODEL_RELEASE', 'PRODUCT_LAUNCH', 'PRODUCT_RELEASE', 'COMPANY_ANNOUNCEMENT');
    demotedEventTypes.push('EXPERT_WARNING', 'OPINION');
  }

  if (hasLaunchSignal || (hasProductSignal && /\b(new|latest|recent)\b/i.test(lower))) {
    if (!intents.includes('PRODUCT_LAUNCH')) intents.push('PRODUCT_LAUNCH');
    if (!intents.includes('PRODUCT_RELEASE')) intents.push('PRODUCT_RELEASE');
    expectedEventTypes.push('PRODUCT_LAUNCH', 'PRODUCT_RELEASE', 'FEATURE_RELEASE', 'COMPANY_ANNOUNCEMENT');
    demotedEventTypes.push('EXPERT_WARNING', 'OPINION', 'FORECAST', 'ANALYSIS');
  }

  // 4. Research & Scientific Discovery
  if (
    /\b(scientists? (?:discover(?:ed)?)|scientific discovery|discoveries|researchers? (?:found|find|publish(?:ed)?)|(?:new )?stud(?:y|ies)|study findings?|research findings?|clinical trial|breakthrough)\b/i.test(lower)
  ) {
    intents.push('RESEARCH_FINDING');
    intents.push('SCIENTIFIC_DISCOVERY');
    expectedEventTypes.push('RESEARCH_FINDING', 'SCIENTIFIC_DISCOVERY', 'REPORT');
    demotedEventTypes.push('OPINION', 'MARKET_MOVE', 'EXPERT_WARNING');
  }

  // 4b. Court Decisions & Legal Proceedings
  if (
    /\b(court|trial|verdict|homicide trial|sentencing|indictment|lawsuit|judge ruled|guilty|acquitted|convicted|plea|hearing)\b/i.test(lower)
  ) {
    intents.push('COURT_DECISION');
    intents.push('LEGAL');
    expectedEventTypes.push('COURT_DECISION', 'REPORT', 'INVESTIGATION');
  }

  // 5. Causal Analysis
  if (
    /\b(what caused|why did|cause of|root cause|how did .* happen|reasons? for)\b/i.test(lower)
  ) {
    intents.push('CAUSE');
    if (mode === 'research') intents.push('RESEARCH_FINDING');
    expectedEventTypes.push('REPORT', 'INVESTIGATION', 'DISASTER', 'CONFLICT', 'ANALYSIS');
  }

  // 6. Disaster Status
  if (
    /\b(earthquake|floods?|flooding|cyclone|hurricane|typhoon|tsunami|wildfire|landslide)\b/i.test(lower)
  ) {
    intents.push('DISASTER_STATUS');
    expectedEventTypes.push('DISASTER', 'REPORT');
  }

  // 7. Policy & Regulation
  if (
    /\b(regulat\w*|policy|policies|law|laws|legislation|act of|ftc|doj|antitrust|compliance|enforcement)\b/i.test(lower)
  ) {
    intents.push('POLICY');
    intents.push('REGULATION');
    expectedEventTypes.push('POLICY', 'REGULATION', 'LAW', 'GOVERNMENT');
  }

  // 8. Business & Markets
  if (
    /\b(business developments?|deals?|acquisitions?|merger|earnings|stocks?|nasdaq|market moves?)\b/i.test(lower)
  ) {
    intents.push('BUSINESS');
    intents.push('MARKETS');
    expectedEventTypes.push('BUSINESS_DEAL', 'ACQUISITION', 'MARKET_MOVE', 'COMPANY_ANNOUNCEMENT');
  }

  // 9. History & Timeline
  if (
    /\b(history of|historical role|historical background|historical figure|historical context|history)\b/i.test(lower)
  ) {
    intents.push('HISTORY');
    intents.push('TIMELINE');
    expectedEventTypes.push('REPORT', 'ANALYSIS');
  } else if (
    /\b(timeline|chronology|evolution of|what came before)\b/i.test(lower)
  ) {
    intents.push('TIMELINE');
    intents.push('HISTORY');
  }

  // 10. Broad news overview & Latest news
  const isBroadQuery = /\b(latest (?:ai )?technology|latest tech news|latest news|world news|tech overview|technology news|industry developments?)\b/i.test(lower) ||
    (lower.split(' ').length <= 4 && /\b(latest|news|technology|tech|ai)\b/i.test(lower) && !hasLaunchSignal && !hasModelSignal);

  if (isBroadQuery) {
    isBroadNewsQuery = true;
    if (!intents.includes('LATEST_NEWS')) intents.push('LATEST_NEWS');
    if (!intents.includes('NEWS_OVERVIEW')) intents.push('NEWS_OVERVIEW');
    expectedEventTypes.push(
      'PRODUCT_LAUNCH',
      'MODEL_RELEASE',
      'RESEARCH_FINDING',
      'COMPANY_ANNOUNCEMENT',
      'POLICY',
      'BUSINESS_DEAL'
    );
  } else if (/\b(latest|recent|updates?|today|now)\b/i.test(lower) && intents.length === 0) {
    intents.push('LATEST_NEWS');
  }

  if (intents.length === 0) {
    intents.push('GENERAL_EXPLANATION');
  }

  // Deduplicate and filter expected/demoted
  expectedEventTypes = [...new Set(expectedEventTypes)];
  demotedEventTypes = [...new Set(demotedEventTypes)].filter(t => !expectedEventTypes.includes(t));

  const primaryIntent = intents[0];

  return {
    primaryIntent,
    intents,
    expectedEventTypes,
    demotedEventTypes,
    isBroadNewsQuery,
    forecastRequested,
    temporalFocus: forecastRequested ? 'FUTURE' : (intents.includes('HISTORY') ? 'HISTORICAL' : 'CURRENT'),
  };
}

/**
 * Deconstruct a user query into structured search hypotheses.
 * These are candidate investigation paths, NOT established facts.
 *
 * @param {string} userQuery - The input prompt, topic, or claim
 * @param {'ask'|'fact_check'|'research'} mode - Query mode
 * @returns {Promise<{
 *   originalQuery: string,
 *   temporalIntent: string,
 *   queryIntent: ReturnType<typeof detectQueryIntent>,
 *   highSignalTokens: string[],
 *   targetEntities: string[],
 *   candidateHypotheses: string[],
 *   searchKeywords: string[],
 *   expandedQueryString: string
 * }>}
 */
export async function expandQuery(userQuery, mode = 'ask') {
  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return {
      originalQuery: '',
      temporalIntent: 'GENERAL_TOPIC',
      queryIntent: detectQueryIntent('', mode),
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
  const queryIntent = detectQueryIntent(cleanQuery, mode);

  // 1. Deterministic baseline extraction
  const tokens = lower.split(/[^a-zA-Z0-9_-]+/).filter(t => t.length > 2 || HIGH_VALUE_SHORT_TOKENS.has(t));
  const highSignalTokens = tokens.filter(t => !STOP_WORDS.has(t) && (t.length > 2 || HIGH_VALUE_SHORT_TOKENS.has(t)));
  const detectedHypotheses = new Set();
  const searchKeywords = new Set(highSignalTokens.length > 0 ? highSignalTokens : tokens);

  for (const [key, related] of Object.entries(DOMAIN_HEURISTICS)) {
    if (lower.includes(key)) {
      related.forEach(r => detectedHypotheses.add(r));
    }
  }

  // Detect capitalized candidate entity names from original query (excluding stop words and question openers)
  const capitalWords = (cleanQuery.match(/\b[A-Z][a-z0-9_-]+(?:\s+[A-Z][a-z0-9_-]+)*\b/g) || [])
    .filter(w => !STOP_WORDS.has(w.toLowerCase()));
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
    queryIntent,
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
