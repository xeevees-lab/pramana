import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Common framing dimensions across news reporting.
 */
const FRAMING_CATEGORIES = [
  { name: 'Causal & Environmental', keywords: ['rainfall', 'monsoon', 'climate', 'geological', 'weather', 'natural'] },
  { name: 'Human Impact & Casualties', keywords: ['death', 'killed', 'displaced', 'homeless', 'victim', 'survivor', 'toll'] },
  { name: 'Government & Institutional Response', keywords: ['rescue', 'army', 'police', 'shelter', 'minister', 'aid', 'budget', 'relief'] },
  { name: 'Accountability & Governance', keywords: ['corruption', 'drainage', 'encroachment', 'failure', 'delay', 'warning ignored', 'negligence'] },
  { name: 'Economic & Infrastructure Repercussions', keywords: ['highway', 'bridge', 'supply chain', 'inflation', 'trade', 'billions', 'loss'] },
];

/**
 * Analyze observable cross-source reporting differences across retrieved articles.
 *
 * Ethical Constraints:
 * - NO ad-hominem labeling of individuals or journalists as "biased".
 * - NO personal political scores or bot accusations.
 * - Shows observable framing emphasis, quoted sources, and terminology variations.
 *
 * @param {Array<object>} articles - Retrieved articles from multiple sources
 * @param {Array<object>} [narratives=[]] - Narrative momentum signals from database
 * @returns {Promise<{
 *   framingDistribution: Array<{category: string, percentage: number, articleCount: number}>,
 *   sourceFramingComparison: Array<{source: string, emphasis: string, headline: string}>,
 *   narrativeSignals: Array<object>,
 *   framingObservation: string
 * }>}
 */
export async function analyzeNarratives(articles = [], narratives = [], skipLlm = false) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return {
      framingDistribution: [],
      sourceFramingComparison: [],
      narrativeSignals: narratives || [],
      framingObservation: 'Insufficient cross-source reporting available to evaluate narrative divergence.',
    };
  }

  // 1. Deterministic framing classification based on terminology
  const counts = {};
  FRAMING_CATEGORIES.forEach(fc => { counts[fc.name] = 0; });

  const sourceComparison = [];

  for (const art of articles) {
    const text = `${art.title || ''} ${art.summary || ''}`.toLowerCase();
    let topCategory = 'Human Impact & Casualties';
    let maxMatches = -1;

    for (const fc of FRAMING_CATEGORIES) {
      let matches = 0;
      for (const kw of fc.keywords) {
        if (text.includes(kw)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        topCategory = fc.name;
      }
    }

    counts[topCategory] = (counts[topCategory] || 0) + 1;

    sourceComparison.push({
      source: art.source_name || 'News Wire',
      emphasis: topCategory,
      headline: art.title || 'Untitled Report',
      publishedAt: art.published_at || null,
    });
  }

  const total = articles.length;
  const framingDistribution = FRAMING_CATEGORIES.map(fc => ({
    category: fc.name,
    articleCount: counts[fc.name] || 0,
    percentage: Math.round(((counts[fc.name] || 0) / total) * 100),
  })).filter(f => f.articleCount > 0);

  // 2. Synthesize objective observation across sources
  let framingObservation = '';
  const topFrames = [...framingDistribution].sort((a, b) => b.articleCount - a.articleCount);

  if (topFrames.length >= 2) {
    framingObservation = `Reporting exhibits distinct analytical framing: ${topFrames[0].percentage}% of dispatches focus on ${topFrames[0].category.toLowerCase()}, while ${topFrames[1].percentage}% emphasize ${topFrames[1].category.toLowerCase()}.`;
  } else if (topFrames.length === 1) {
    framingObservation = `Dispatches predominantly center on ${topFrames[0].category.toLowerCase()} across initial coverage.`;
  } else {
    framingObservation = 'Cross-source coverage is consistent with standard breaking event reporting.';
  }

  // 3. If Gemini is available, requested, and multiple distinct sources exist, refine observation neutrally
  const distinctSources = new Set(articles.map(a => a.source_name).filter(Boolean));
  if (!skipLlm && isGeminiConfigured() && distinctSources.size >= 2) {
    const client = getGeminiClient();
    if (client) {
      const headlines = articles.slice(0, 6).map(a => `[${a.source_name || 'Source'}]: "${a.title}"`).join('\n');
      const prompt = `You are an objective media analyst at Pramāṇa.
Compare the observable headline framing of these articles about the same story.
STRICT ETHICAL GUIDELINES:
1. Do NOT label individual journalists or outlets as "biased", "propaganda", or "bad".
2. Describe ONLY the observable thematic differences (e.g. which actors are highlighted, whether the focus is on cause vs casualties vs official response).
3. Max 2 neutral, professional sentences.

Headlines:
${headlines}

Observation:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LLM call timeout')), 2500)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);
        const text = response.text.trim();
        if (text && text.length > 20 && text.length < 300) {
          framingObservation = text;
        }
      } catch (err) {
        // Deterministic observation preserved
      }
    }
  }

  return {
    framingDistribution,
    sourceFramingComparison: sourceComparison.slice(0, 10),
    narrativeSignals: narratives.slice(0, 5),
    framingObservation,
  };
}
