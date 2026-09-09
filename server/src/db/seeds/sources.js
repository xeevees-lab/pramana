import { query } from '../pool.js';

export const DEFAULT_SOURCES = [
  {
    name: 'BBC World News',
    type: 'rss',
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    reliability_score: 0.88,
    enabled: true,
    config: {},
  },
  {
    name: 'Al Jazeera English',
    type: 'rss',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    reliability_score: 0.82,
    enabled: true,
    config: {},
  },
  {
    name: 'NPR News',
    type: 'rss',
    url: 'https://feeds.npr.org/1001/rss.xml',
    reliability_score: 0.85,
    enabled: true,
    config: {},
  },
  {
    name: 'The Guardian World',
    type: 'rss',
    url: 'https://www.theguardian.com/world/rss',
    reliability_score: 0.84,
    enabled: true,
    config: {},
  },
  {
    name: 'Deutsche Welle World',
    type: 'rss',
    url: 'https://rss.dw.com/rdf/rss-en-world',
    reliability_score: 0.86,
    enabled: true,
    config: {},
  },
  {
    name: 'GDELT Global Intelligence',
    type: 'gdelt',
    url: null,
    reliability_score: 0.75,
    enabled: true,
    config: {
      query: 'tone>0 OR tone<0',
      maxRecords: 40,
    },
  },
  {
    name: 'NewsAPI Top Headlines',
    type: 'newsapi',
    url: null,
    reliability_score: 0.80,
    enabled: false,
    config: {
      category: 'general',
      country: 'us',
    },
  },
];

/**
 * Seed default news sources into the database.
 * Idempotent: Only inserts sources that don't already exist by name.
 */
export async function seedSources() {
  let inserted = 0;

  for (const src of DEFAULT_SOURCES) {
    const existing = await query('SELECT id FROM sources WHERE name = $1 LIMIT 1', [src.name]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO sources (name, type, url, reliability_score, enabled, config)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          src.name,
          src.type,
          src.url,
          src.reliability_score,
          src.enabled,
          JSON.stringify(src.config),
        ]
      );
      inserted++;
    }
  }

  console.log(`[Seed] Seeded ${inserted} default sources (${DEFAULT_SOURCES.length - inserted} already existed)`);
  return inserted;
}
