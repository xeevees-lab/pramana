/**
 * eventTaxonomy.js
 * 
 * News Event Taxonomy & Multi-Label Classification Engine for Pramāṇa.
 * Defines 26 standardized event types and classifies articles/events with confidence scores.
 * 
 * CRITICAL PRODUCT PRINCIPLE:
 * Distinguishes an article merely ABOUT a product from an actual PRODUCT LAUNCH / RELEASE.
 * Distinguishes EXPERT_WARNING / FORECAST from empirical RESEARCH_FINDING / SCIENTIFIC_DISCOVERY.
 */

export const EVENT_TYPES = [
  'PRODUCT_LAUNCH',
  'PRODUCT_RELEASE',
  'MODEL_RELEASE',
  'FEATURE_RELEASE',
  'COMPANY_ANNOUNCEMENT',
  'RESEARCH_FINDING',
  'SCIENTIFIC_DISCOVERY',
  'EXPERT_WARNING',
  'FORECAST',
  'POLICY',
  'REGULATION',
  'LAW',
  'ELECTION',
  'APPOINTMENT',
  'DIPLOMATIC_DEVELOPMENT',
  'CONFLICT',
  'DISASTER',
  'MARKET_MOVE',
  'BUSINESS_DEAL',
  'ACQUISITION',
  'COURT_DECISION',
  'INVESTIGATION',
  'REPORT',
  'ANALYSIS',
  'OPINION',
  'OTHER',
];

// Specific regex/keyword indicators for each category
const PATTERNS = {
  PRODUCT_LAUNCH: [
    /\b(?:unveils?|launches?|launched|launching|debuts?|debuted|rolls? out|rolled out|introduces?|introduced)\b/i,
    /\b(?:now available|open for pre-orders?|hits the market|commercial availability)\b/i,
    /\b(?:unveiled new|reveals? new|announced its new)\b/i,
  ],
  PRODUCT_RELEASE: [
    /\b(?:releases?|released|releasing|ships?|shipped|shipping)\b/i,
    /\b(?:version \d+|v\d+\.\d+|\bupdate \d+|general availability|\bGA\b)\b/i,
    /\b(?:available to download|now live|public beta|rollout)\b/i,
  ],
  MODEL_RELEASE: [
    /\b(?:llm|foundation model|weights|open weights|checkpoints?|model architecture)\b/i,
    /\b(?:gpt[-\s]?[a-z0-9.]+|claude[-\s]?[a-z0-9.]+|gemini[-\s]?[a-z0-9.]+|llama[-\s]?[a-z0-9.]+|mistral|deepseek|gemma|qwen|phi[-\s]?[0-9]+)\b/i,
    /\b(?:releases model|launches model|open-sources? (?:model|weights)|fine-tuned model)\b/i,
    /\b(?:new ai model|vision-language model|multimodal model|reasoning model|frontier ai model)\b/i,
  ],
  FEATURE_RELEASE: [
    /\b(?:new feature|adds support for|now supports?|integration with|integrates?|functionality)\b/i,
    /\b(?:plug-?in|extension|capability|enhancement|update brings)\b/i,
  ],
  COMPANY_ANNOUNCEMENT: [
    /\b(?:press release|company announces|statement from|spokesperson said|official announcement)\b/i,
    /\b(?:ceo announces|unveiled at|keynote|developers conference|earnings call)\b/i,
  ],
  RESEARCH_FINDING: [
    /\b(?:researchers? (?:find|found|show|discover|publish|reveal))\b/i,
    /\b(?:study (?:shows|finds|reveals|demonstrates|suggests|indicates))\b/i,
    /\b(?:published in|peer-reviewed|journal|arxiv|clinical trial|paper shows)\b/i,
  ],
  SCIENTIFIC_DISCOVERY: [
    /\b(?:scientists? (?:discover|discovered|breakthrough|unearth|identify))\b/i,
    /\b(?:new species|astronomers? detect|telescope captures|particle discovered|genome sequence)\b/i,
    /\b(?:scientific breakthrough|quantum breakthrough|fusion milestone)\b/i,
  ],
  EXPERT_WARNING: [
    /\b(?:warns?|warned|warning|caution|cautions|raises alarm|alarm bells)\b/i,
    /\b(?:threat of|danger of|existential risk|scientists warn|experts urge|catastrophic risk)\b/i,
  ],
  FORECAST: [
    /\b(?:predicts?|predicted|prediction|forecasts?|projected|projections?|outlook)\b/i,
    /\b(?:expected to|by 2026|by 2030|future of|will see|estimated to grow)\b/i,
  ],
  POLICY: [
    /\b(?:government policy|framework|guidelines?|national strategy|executive order)\b/i,
    /\b(?:white house|parliament|cabinet approves|ministry announces|action plan)\b/i,
  ],
  REGULATION: [
    /\b(?:regulators?|regulatory|antitrust|ftc|fcc|sec|doj|eu commission|dma|dsa)\b/i,
    /\b(?:compliance|mandate|rules? on|enforcement action|oversight committee)\b/i,
  ],
  LAW: [
    /\b(?:legislation|bill|lawmakers? pass|enacted|statute|act of parliament|signed into law)\b/i,
    /\b(?:ai act|chips act|treaty ratified|constitution)\b/i,
  ],
  ELECTION: [
    /\b(?:elections?|ballots?|polls?|voters?|presidential race|parliamentary vote|referendum)\b/i,
  ],
  APPOINTMENT: [
    /\b(?:appoints?|appointed|steps down|resigns?|named as ceo|new director|cabinet reshuffle)\b/i,
  ],
  DIPLOMATIC_DEVELOPMENT: [
    /\b(?:summit|bilateral|talks|treaty|envoy|ambassador|sanctions?|accord|diplomats?)\b/i,
  ],
  CONFLICT: [
    /\b(?:airstrikes?|military|missiles?|shelling|offensive|truce|ceasefire|troops?|clashes?|war)\b/i,
  ],
  DISASTER: [
    /\b(?:earthquake|floods?|flooding|cyclone|hurricane|typhoon|wildfires?|landslide|tsunami|volcano)\b/i,
    /\b(?:magnitude|richter|death toll|casualties|evacuation|rescue operations?)\b/i,
  ],
  MARKET_MOVE: [
    /\b(?:shares? (?:surge|plunge|drop|rally)|stock price|nasdaq|s&p|ipo|market cap)\b/i,
  ],
  BUSINESS_DEAL: [
    /\b(?:partnership|strategic alliance|joint venture|contract signed|multi-million dollar deal)\b/i,
  ],
  ACQUISITION: [
    /\b(?:acquires?|acquired|acquisition|buys? out|takeover|merger|in talks to buy)\b/i,
  ],
  COURT_DECISION: [
    /\b(?:supreme court|judge rules|verdict|lawsuit|injunction|appeals court|settlement reached)\b/i,
  ],
  INVESTIGATION: [
    /\b(?:inquiry|probe|investigation|inspectors?|whistleblower|audit finds|subpoena)\b/i,
  ],
  REPORT: [
    /\b(?:report finds|investigative report|annual review|dossier|comprehensive report)\b/i,
  ],
  ANALYSIS: [
    /\b(?:analysis|deep dive|why it matters|behind the scenes|perspective|explainer)\b/i,
  ],
  OPINION: [
    /\b(?:opinion|editorial|columnist|commentary|op-ed|viewpoint|perspectives?)\b/i,
  ],
  OTHER: [],
};

// Negative indicators: articles merely discussing a product rather than a launch
const NON_LAUNCH_DISCUSSION_PATTERNS = [
  /\b(?:how to|review of|hands-on with|tips for|comparison between|why .* is (?:bad|good|failing|overrated))\b/i,
  /\b(?:what we know about|rumors?|leaks? suggest|speculation|might feature)\b/i,
  /\b(?:interview with|profile of|history of)\b/i,
];

/**
 * Classify a text (headline + body) into one or more news event types with calibrated probabilities.
 * 
 * @param {string} title - Headline / title
 * @param {string} text - Article body or summary
 * @param {Object} metadata - Optional additional context (source, category, tags)
 * @returns {{ primaryType: string, eventTypes: string[], scores: Record<string, number> }}
 */
export function classifyTextTaxonomy(title = '', text = '', metadata = {}) {
  const fullText = `${title || ''} ${text || ''}`.trim();
  const titleText = title || '';
  const scores = {};

  for (const type of EVENT_TYPES) {
    scores[type] = 0.0;
  }

  if (!fullText) {
    scores.OTHER = 1.0;
    return { primaryType: 'OTHER', eventTypes: ['OTHER'], scores };
  }

  // 1. Calculate pattern match scores
  for (const [type, patterns] of Object.entries(PATTERNS)) {
    let matchCount = 0;
    let titleMatch = false;

    for (const pat of patterns) {
      if (pat.test(titleText)) {
        titleMatch = true;
        matchCount += 2; // Title matches carry 2x weight
      } else if (pat.test(fullText)) {
        matchCount += 1;
      }
    }

    if (matchCount > 0) {
      // Score calculation based on matches and headline importance
      const base = titleMatch ? 0.65 : 0.40;
      const boost = Math.min(0.30, matchCount * 0.10);
      scores[type] = Math.min(0.98, base + boost);
    }
  }

  // 2. Critical distinction: Article ABOUT a product vs. a PRODUCT LAUNCH
  const isDiscussionOnly = NON_LAUNCH_DISCUSSION_PATTERNS.some(p => p.test(titleText));
  if (isDiscussionOnly) {
    // If it's a review, opinion, or speculative piece, strongly demote launch/release
    scores.PRODUCT_LAUNCH = Math.max(0, (scores.PRODUCT_LAUNCH || 0) * 0.25);
    scores.PRODUCT_RELEASE = Math.max(0, (scores.PRODUCT_RELEASE || 0) * 0.25);
    scores.MODEL_RELEASE = Math.max(0, (scores.MODEL_RELEASE || 0) * 0.25);
    scores.ANALYSIS = Math.max(scores.ANALYSIS || 0, 0.75);
  }

  // 3. Demote product launch if title is primarily an expert warning
  const isWarningTitle = PATTERNS.EXPERT_WARNING.some(p => p.test(titleText));
  if (isWarningTitle) {
    scores.PRODUCT_LAUNCH = Math.max(0, (scores.PRODUCT_LAUNCH || 0) * 0.20);
    scores.PRODUCT_RELEASE = Math.max(0, (scores.PRODUCT_RELEASE || 0) * 0.20);
    scores.MODEL_RELEASE = Math.max(0, (scores.MODEL_RELEASE || 0) * 0.20);
    scores.EXPERT_WARNING = Math.max(scores.EXPERT_WARNING || 0, 0.85);
  }

  // 4. Synergies (Compatible types)
  // If MODEL_RELEASE is high, PRODUCT_RELEASE and PRODUCT_LAUNCH should also be boosted
  if (scores.MODEL_RELEASE >= 0.65) {
    scores.PRODUCT_RELEASE = Math.max(scores.PRODUCT_RELEASE || 0, scores.MODEL_RELEASE * 0.90);
    if (!isDiscussionOnly && !isWarningTitle) {
      scores.PRODUCT_LAUNCH = Math.max(scores.PRODUCT_LAUNCH || 0, scores.MODEL_RELEASE * 0.85);
    }
  }

  // If SCIENTIFIC_DISCOVERY is high, RESEARCH_FINDING is also high
  if (scores.SCIENTIFIC_DISCOVERY >= 0.70) {
    scores.RESEARCH_FINDING = Math.max(scores.RESEARCH_FINDING || 0, scores.SCIENTIFIC_DISCOVERY * 0.95);
  }

  // If LAW is high, POLICY & REGULATION are also compatible
  if (scores.LAW >= 0.70) {
    scores.REGULATION = Math.max(scores.REGULATION || 0, scores.LAW * 0.80);
    scores.POLICY = Math.max(scores.POLICY || 0, scores.LAW * 0.75);
  }

  // 5. Threshold selection (>= 0.45 threshold for multi-label assignment)
  const threshold = 0.45;
  const activeTypes = Object.entries(scores)
    .filter(([_, score]) => score >= threshold)
    .sort((a, b) => b[1] - a[1]);

  let eventTypes = activeTypes.map(([type]) => type);
  if (eventTypes.length === 0) {
    scores.OTHER = 0.60;
    eventTypes = ['OTHER'];
  }

  const primaryType = eventTypes[0] || 'OTHER';

  return {
    primaryType,
    eventTypes,
    scores,
    eventTypeScores: scores,
  };
}

export const TAXONOMY_CATEGORIES = EVENT_TYPES;
export const EVENT_TAXONOMY = PATTERNS;

/**
 * Backfill taxonomy classifications for existing articles and events in PostgreSQL.
 * Non-destructive: only updates newly populated columns event_types and event_type_scores.
 * 
 * @param {Object} dbPool - PostgreSQL pool client
 * @returns {Promise<{ articlesClassified: number, eventsClassified: number }>}
 */
export async function backfillTaxonomyForCorpus(dbPool) {
  let articlesCount = 0;
  let eventsCount = 0;

  try {
    // 1. Fetch unclassified articles
    const { rows: articles } = await dbPool.query(`
      SELECT id, title, content, summary 
      FROM articles 
      WHERE event_types IS NULL OR cardinality(event_types) = 0
      LIMIT 2000
    `);

    for (const art of articles) {
      const taxonomy = classifyTextTaxonomy(art.title, art.content || art.summary || '');
      await dbPool.query(`
        UPDATE articles 
        SET event_types = $1, event_type_scores = $2 
        WHERE id = $3
      `, [taxonomy.eventTypes, JSON.stringify(taxonomy.scores), art.id]);
      articlesCount++;
    }

    // 2. Fetch unclassified events
    const { rows: events } = await dbPool.query(`
      SELECT id, title, summary, category 
      FROM events 
      WHERE event_types IS NULL OR cardinality(event_types) = 0
      LIMIT 500
    `);

    for (const ev of events) {
      const taxonomy = classifyTextTaxonomy(ev.title, ev.summary || '', { category: ev.category });
      await dbPool.query(`
        UPDATE events 
        SET event_types = $1 
        WHERE id = $2
      `, [taxonomy.eventTypes, ev.id]);
      eventsCount++;
    }
  } catch (err) {
    console.error('[EventTaxonomy] Backfill error:', err.message);
  }

  return { articlesClassified: articlesCount, eventsClassified: eventsCount };
}
