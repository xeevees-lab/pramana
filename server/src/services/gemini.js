import { GoogleGenAI } from '@google/genai';
import config from '../config/index.js';

let ai = null;

/**
 * Get or initialize the Gemini client singleton.
 * Returns null if GEMINI_API_KEY is not configured.
 */
export function getGeminiClient() {
  if (!config.gemini.apiKey) return null;
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return ai;
}

/**
 * Check if Gemini is configured.
 */
export function isGeminiConfigured() {
  return Boolean(config.gemini.apiKey);
}

/**
 * Generate a 768-dimensional text embedding for vector search.
 * Returns null if Gemini is not configured.
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text) {
  const client = getGeminiClient();
  if (!client || !text || typeof text !== 'string') return null;

  try {
    // Truncate to reasonable token limit (~2000 words)
    const truncated = text.slice(0, 8000);
    const response = await client.models.embedContent({
      model: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
      contents: truncated,
    });

    if (response?.embedding?.values) {
      return response.embedding.values;
    }
    return null;
  } catch (err) {
    console.warn('[Gemini Embedding] Failed to generate embedding:', err.message);
    return null;
  }
}

/**
 * Extract named entities from article text.
 * Returns array of { name, type, description }.
 * If Gemini not configured, returns empty array.
 * @param {string} title
 * @param {string} content
 * @returns {Promise<Array<{name: string, type: string, description?: string}>>}
 */
export async function extractEntities(title, content) {
  const client = getGeminiClient();
  if (!client) return [];

  const text = `${title}\n\n${(content || '').slice(0, 4000)}`;
  const prompt = `Extract all key entities mentioned in this news article.
Types allowed: "person", "organization", "country", "city", "location", "topic", "policy", "law".
Return a JSON array of objects with keys: "name" (canonical name), "type" (one of the allowed types), and "description" (1 sentence summary of their role in this story).
Article:
${text}

JSON array:`;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(e => e.name && e.type);
    }
    return [];
  } catch (err) {
    console.warn('[Gemini Entities] Extraction error:', err.message);
    return [];
  }
}

/**
 * Extract factual claims from article text.
 * Returns array of { text, claim_type, information_class }.
 * @param {string} title
 * @param {string} content
 * @returns {Promise<Array<{text: string, claim_type: string, information_class: string}>>}
 */
export async function extractClaims(title, content) {
  const client = getGeminiClient();
  if (!client) return [];

  const text = `${title}\n\n${(content || '').slice(0, 4000)}`;
  const prompt = `Extract 3 to 6 atomic, verifiable factual claims from this news article.
Each claim must be:
1. An objective assertion of fact (not an opinion or stylistic commentary)
2. Self-contained and understandable on its own
3. Classified by type: "factual", "causal", "predictive", "statistical"
4. Classified by information_class: "fact" (direct assertion of occurrence), "context" (background circumstance), "narrative_signal" (framing or narrative assertion)

Return a JSON array of objects with keys:
- "text": The clear, concise factual claim statement
- "claim_type": "factual" | "causal" | "predictive" | "statistical"
- "information_class": "fact" | "context" | "narrative_signal"

Article:
${text}

JSON array:`;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(c => c.text);
    }
    return [];
  } catch (err) {
    console.warn('[Gemini Claims] Extraction error:', err.message);
    return [];
  }
}

/**
 * Synthesize an event summary from multiple article titles and summaries.
 * @param {string[]} articleSnippets
 * @returns {Promise<{title: string, summary: string, category: string, severity: string}|null>}
 */
export async function synthesizeEvent(articleSnippets) {
  const client = getGeminiClient();
  if (!client || articleSnippets.length === 0) return null;

  const prompt = `Synthesize an objective news event from these article snippets.
Produce a JSON object with:
- "title": Clear, neutral editorial headline (e.g. "Global Treaty Signed on Maritime Security")
- "summary": 2-3 sentence factual overview answering what, where, when, and who.
- "category": One of ["politics", "conflict", "diplomacy", "economics", "business", "markets", "science", "technology", "environment", "climate", "disasters", "law", "public_policy", "international_affairs", "social", "health", "sports", "culture", "other"]
- "severity": One of ["critical", "high", "normal", "low"]

Articles:
${articleSnippets.join('\n---\n')}

JSON object:`;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    return JSON.parse(response.text.trim());
  } catch (err) {
    console.warn('[Gemini Synthesize] Synthesis error:', err.message);
    return null;
  }
}
