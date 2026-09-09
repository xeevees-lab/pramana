/**
 * Known wire services and syndicated news aggregators.
 */
const WIRE_SIGNATURES = [
  { name: 'Associated Press', patterns: [/\bAP\b/, /associated press/i, /ap news/i] },
  { name: 'Reuters', patterns: [/\breuters\b/i] },
  { name: 'Agence France-Presse', patterns: [/\bAFP\b/, /agence france-presse/i] },
  { name: 'Bloomberg', patterns: [/\bbloomberg\b/i] },
  { name: 'PR Newswire', patterns: [/pr newswire/i, /prnewswire/i] },
  { name: 'Business Wire', patterns: [/business wire/i] },
];

/**
 * Classify a source into the strict Pramāṇa source hierarchy.
 *
 * @param {object} source - Source metadata or article source
 * @returns {'PRIMARY SOURCE'|'SCIENTIFIC_TECHNICAL'|'INDEPENDENT_NEWS'|'SECONDARY_REPORT'|'PUBLIC_SIGNAL'}
 */
export function classifySourceHierarchy(source = {}) {
  const name = (source.name || source.source_name || '').toLowerCase();
  const type = (source.type || source.source_type || '').toLowerCase();
  const url = (source.url || '').toLowerCase();

  // 1. Primary Sources & Official Documents
  if (
    type === 'manual' ||
    type === 'official' ||
    url.includes('.gov') ||
    url.includes('.mil') ||
    url.includes('.int') ||
    name.includes('ministry') ||
    name.includes('department of') ||
    name.includes('press release') ||
    name.includes('treaty') ||
    name.includes('white house') ||
    name.includes('parliament')
  ) {
    return 'PRIMARY SOURCE';
  }

  // 2. Scientific & Technical
  if (
    url.includes('.edu') ||
    name.includes('university') ||
    name.includes('institute') ||
    name.includes('journal') ||
    name.includes('usgs') ||
    name.includes('nasa') ||
    name.includes('copernicus') ||
    name.includes('nature') ||
    name.includes('meteorological')
  ) {
    return 'SCIENTIFIC_TECHNICAL';
  }

  // 3. Independent News Reporting
  if (
    type === 'rss' ||
    type === 'gdelt' ||
    type === 'newsapi' ||
    name.includes('reuters') ||
    name.includes('ap') ||
    name.includes('bbc') ||
    name.includes('deutsche welle') ||
    name.includes('al jazeera') ||
    name.includes('guardian') ||
    name.includes('npr')
  ) {
    return 'INDEPENDENT_NEWS';
  }

  // 4. Public & Social Signals
  if (
    type === 'social' ||
    name.includes('twitter') ||
    name.includes('reddit') ||
    name.includes('telegram') ||
    name.includes('social')
  ) {
    return 'PUBLIC_SIGNAL';
  }

  return 'SECONDARY_REPORT';
}

/**
 * Detect if an article originated from a known wire service.
 *
 * @param {object} article - Article title, summary, author, source_name
 * @returns {string|null} Wire service name or null
 */
export function detectWireService(article = {}) {
  if (article.wire_service) return article.wire_service;

  const combined = `${article.title || ''} ${article.author || ''} ${article.source_name || ''} ${(article.summary || '').slice(0, 300)}`;

  for (const wire of WIRE_SIGNATURES) {
    for (const pat of wire.patterns) {
      if (pat.test(combined)) {
        return wire.name;
      }
    }
  }
  return null;
}

/**
 * Compute Jaccard word similarity between two texts.
 *
 * @param {string} text1
 * @param {string} text2
 * @returns {number} Similarity coefficient (0.0 to 1.0)
 */
export function computeTextSimilarity(text1 = '', text2 = '') {
  if (!text1 || !text2) return 0;

  const words1 = new Set(
    text1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  );
  const words2 = new Set(
    text2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if two articles represent independent reporting or syndicated copies.
 * Two articles from the same wire service or with high text overlap
 * DO NOT count as independent corroboration.
 *
 * @param {object} art1
 * @param {object} art2
 * @returns {{ isIndependent: boolean, reason?: string }}
 */
export function checkSourceIndependence(art1, art2) {
  if (!art1 || !art2) return { isIndependent: true };
  if (art1.id && art2.id && art1.id === art2.id) {
    return { isIndependent: false, reason: 'Identical article record' };
  }

  // Check 1: Shared wire service
  const wire1 = detectWireService(art1);
  const wire2 = detectWireService(art2);
  if (wire1 && wire2 && wire1 === wire2) {
    return {
      isIndependent: false,
      reason: `Both articles derive from syndicated wire service: ${wire1}`,
    };
  }

  // Check 2: Same publishing outlet
  const src1 = (art1.source_name || '').toLowerCase().trim();
  const src2 = (art2.source_name || '').toLowerCase().trim();
  if (src1 && src2 && src1 === src2) {
    return { isIndependent: false, reason: 'Same publishing outlet' };
  }

  // Check 3: Text Jaccard overlap > 0.65 indicates syndicated wire reprint
  const sim = computeTextSimilarity(
    `${art1.title} ${art1.summary || ''}`,
    `${art2.title} ${art2.summary || ''}`
  );
  if (sim > 0.65) {
    return {
      isIndependent: false,
      reason: `Near-duplicate syndicated text copy (similarity: ${Math.round(sim * 100)}%)`,
    };
  }

  return { isIndependent: true };
}

/**
 * Filter an array of articles into independent source clusters.
 * Ensures duplicate wire reprints collapse into 1 independent source credit.
 *
 * @param {Array<object>} articles
 * @returns {Array<object>} Independent representative articles
 */
export function getIndependentSourceClusters(articles = []) {
  if (!Array.isArray(articles) || articles.length <= 1) return articles || [];

  const clusters = [];

  for (const article of articles) {
    let matchedCluster = false;
    for (const clusterLeader of clusters) {
      const { isIndependent } = checkSourceIndependence(article, clusterLeader);
      if (!isIndependent) {
        matchedCluster = true;
        break;
      }
    }

    if (!matchedCluster) {
      clusters.push(article);
    }
  }

  return clusters;
}

/**
 * Deterministically verify an atomic claim against retrieved evidence.
 *
 * Strict Rules:
 * 1. VERIFIED requires:
 *    - 2+ INDEPENDENT reliable sources (different publishers, non-syndicated)
 *    OR
 *    - 1 authoritative PRIMARY SOURCE / OFFICIAL DOCUMENT.
 * 2. CONTRADICTED requires:
 *    - Credible contradictory evidence or specific refutation from a reliable source.
 * 3. UNVERIFIED:
 *    - Insufficient evidence, single-source claim, or uncorroborated report.
 * 4. NEVER OUTPUT "FALSE".
 * 5. Public / social signals CANNOT independently establish VERIFIED.
 *
 * @param {object} claim - Claim object { id, text, claim_type }
 * @param {Array<object>} [supportingArticles=[]]
 * @param {Array<object>} [contradictingArticles=[]]
 * @returns {{
 *   status: 'VERIFIED'|'UNVERIFIED'|'CONTRADICTED',
 *   badgeLabel: string,
 *   independentSourceCount: number,
 *   provenance: string,
 *   explanation: string,
 *   sources: Array
 * }}
 */
export function verifyClaim(
  claim,
  supportingArticles = [],
  contradictingArticles = []
) {
  const claimText = claim?.text || '';

  // 1. Check for credible contradictions first
  if (Array.isArray(contradictingArticles) && contradictingArticles.length > 0) {
    const topContradictor = contradictingArticles[0];
    const contradictorName = topContradictor.source_name || 'Independent Reporting';
    return {
      status: 'CONTRADICTED',
      badgeLabel: `CONTRADICTED BY ${contradictorName.toUpperCase()}`,
      independentSourceCount: contradictingArticles.length,
      provenance: 'NEWS REPORTING',
      explanation: `Reporting by ${contradictorName} presents conflicting evidence or direct refutation of this claim.`,
      sources: contradictingArticles,
    };
  }

  // 2. Filter supporting articles into independent clusters (rejecting syndication duplicates)
  const independentSources = getIndependentSourceClusters(supportingArticles);
  const indepCount = independentSources.length;

  // Check for primary or official documents
  const hasPrimarySource = independentSources.some(
    s => classifySourceHierarchy(s) === 'PRIMARY SOURCE' || classifySourceHierarchy(s) === 'SCIENTIFIC_TECHNICAL'
  );

  // Check if sources are purely public/social signals
  const allSocial = independentSources.length > 0 &&
    independentSources.every(s => classifySourceHierarchy(s) === 'PUBLIC_SIGNAL');

  if (allSocial) {
    return {
      status: 'UNVERIFIED',
      badgeLabel: 'UNVERIFIED (PUBLIC SIGNAL ONLY)',
      independentSourceCount: indepCount,
      provenance: 'PUBLIC SIGNAL',
      explanation: 'This assertion is discussed across public channels but lacks independent journalistic or primary source corroboration.',
      sources: independentSources,
    };
  }

  // 3. Corroboration check
  if (hasPrimarySource || indepCount >= 2) {
    return {
      status: 'VERIFIED',
      badgeLabel: 'VERIFIED',
      independentSourceCount: indepCount,
      provenance: hasPrimarySource ? 'PRIMARY SOURCE' : 'NEWS REPORTING',
      explanation: hasPrimarySource
        ? 'Corroborated by authoritative primary source / official documentation.'
        : `Corroborated by ${indepCount} independent news reporting outlets (wire syndication de-duplicated).`,
      sources: independentSources,
    };
  }

  // 4. Insufficient corroboration fallback
  return {
    status: 'UNVERIFIED',
    badgeLabel: 'UNVERIFIED',
    independentSourceCount: indepCount,
    provenance: 'NEWS REPORTING',
    explanation: indepCount === 1
      ? 'Reported by a single outlet; second independent source verification is pending.'
      : 'Insufficient corroborated reporting available in the knowledge system for this assertion.',
    sources: independentSources,
  };
}
