import { query } from '../../db/pool.js';

/**
 * Infer news category from title and content keywords.
 * Maps to allowed categories in events table.
 * @param {string} text
 * @returns {string}
 */
export function inferCategory(text) {
  const lower = (text || '').toLowerCase();

  if (/\b(war|military|missile|army|attack|strike|troops|combat|weapons|defense|ceasefire|invasion|casualt)\b/.test(lower)) {
    return 'conflict';
  }
  if (/\b(treaty|summit|ambassador|sanction|diplomat|bilateral|un |united nations|nato|foreign minister|consul)\b/.test(lower)) {
    return 'diplomacy';
  }
  if (/\b(election|parliament|congress|president|prime minister|vote|campaign|senate|legislation|democrat|republican|cabinet)\b/.test(lower)) {
    return 'politics';
  }
  if (/\b(inflation|gdp|interest rate|central bank|federal reserve|currency|trade deficit|tariff|recession|debt)\b/.test(lower)) {
    return 'economics';
  }
  if (/\b(stocks|nasdaq|dow jones|s&p|yield|bond|shares|market index|equity|rally|sell-off)\b/.test(lower)) {
    return 'markets';
  }
  if (/\b(earnings|quarterly revenue|merger|acquisition|ceo|layoffs|startup|funding|antitrust)\b/.test(lower)) {
    return 'business';
  }
  if (/\b(ai|artificial intelligence|chip|semiconductor|cyber|hacker|software|quantum|cloud|data center|tech|algorithm)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(climate|wildfire|flood|hurricane|tornado|earthquake|drought|emissions|temperature|arctic|storm)\b/.test(lower)) {
    return 'climate';
  }
  if (/\b(virus|disease|vaccine|outbreak|hospital|health|fda|who |pandemic|medical|cancer)\b/.test(lower)) {
    return 'health';
  }
  if (/\b(supreme court|judge|verdict|indictment|lawsuit|prosecutor|trial|court|ruling|plea)\b/.test(lower)) {
    return 'law';
  }
  if (/\b(telescope|physics|biology|nasa|astronomy|discovery|researchers|species|fossil)\b/.test(lower)) {
    return 'science';
  }
  return 'politics'; // Default broad category
}

/**
 * Infer severity of an event.
 * @param {string} text
 * @returns {'critical'|'high'|'normal'|'low'}
 */
export function inferSeverity(text) {
  const lower = (text || '').toLowerCase();
  if (/\b(breaking|urgent|catastrophic|declaration of war|emergency declared|mass casualty|deadly earthquake)\b/.test(lower)) {
    return 'critical';
  }
  if (/\b(killed|explosion|crisis|warning|escalat|assassination|crash|collapse|threat)\b/.test(lower)) {
    return 'high';
  }
  return 'normal';
}

/**
 * Cluster an article into an existing event or create a new event.
 * Uses vector cosine similarity if embeddings are present, with trigram lexical fallback.
 *
 * @param {object} article - Stored article record from DB (with id, title, summary, published_at, image_url, embedding)
 * @returns {Promise<{eventId: string, isNew: boolean}>}
 */
export async function clusterArticle(article) {
  const combinedText = `${article.title} ${article.summary || ''}`;

  // 1. Vector cosine similarity search if article has embedding
  if (article.embedding) {
    try {
      const vectorRes = await query(
        `SELECT id, title, 1 - (embedding <=> $1::vector) AS similarity
         FROM events
         WHERE embedding IS NOT NULL
           AND status != 'historical'
           AND last_updated_at > NOW() - INTERVAL '7 days'
         ORDER BY embedding <=> $1::vector
         LIMIT 1`,
        [JSON.stringify(article.embedding)]
      );

      if (vectorRes.rows.length > 0 && vectorRes.rows[0].similarity >= 0.80) {
        const matched = vectorRes.rows[0];
        await linkArticleToEvent(matched.id, article.id, matched.similarity);
        return { eventId: matched.id, isNew: false };
      }
    } catch (err) {
      console.warn('[Clusterer] Vector search fallback:', err.message);
    }
  }

  // 2. Trigram similarity search fallback using PostgreSQL pg_trgm
  try {
    const textRes = await query(
      `SELECT id, title, similarity(title, $1) AS sim
       FROM events
       WHERE status != 'historical'
         AND last_updated_at > NOW() - INTERVAL '7 days'
         AND similarity(title, $1) >= 0.40
       ORDER BY sim DESC
       LIMIT 1`,
      [article.title]
    );

    if (textRes.rows.length > 0) {
      const matched = textRes.rows[0];
      await linkArticleToEvent(matched.id, article.id, matched.sim);
      return { eventId: matched.id, isNew: false };
    }
  } catch (err) {
    console.warn('[Clusterer] Text similarity search fallback:', err.message);
  }

  // 3. No match found -> create a new Event
  const category = inferCategory(combinedText);
  const severity = inferSeverity(combinedText);

  const newEventRes = await query(
    `INSERT INTO events (
       title, summary, category, severity, status,
       image_url, image_attribution, article_count, source_count,
       first_reported_at, last_updated_at, embedding
     ) VALUES (
       $1, $2, $3, $4, 'developing',
       $5, $6, 1, 1,
       $7, $7, $8
     )
     RETURNING id, title`,
    [
      article.title,
      article.summary || article.title,
      category,
      severity,
      article.image_url || null,
      article.image_attribution || null,
      article.published_at || new Date(),
      article.embedding ? JSON.stringify(article.embedding) : null,
    ]
  );

  const event = newEventRes.rows[0];

  // Link event <-> article
  await query(
    `INSERT INTO event_articles (event_id, article_id, relevance_score)
     VALUES ($1, $2, 1.0)
     ON CONFLICT DO NOTHING`,
    [event.id, article.id]
  );

  // Add live feed entry
  await query(
    `INSERT INTO live_entries (event_id, entry_type, title, description)
     VALUES ($1, 'new_event', $2, $3)`,
    [
      event.id,
      `New Event: ${article.title.slice(0, 120)}`,
      article.summary ? article.summary.slice(0, 200) : null,
    ]
  );

  return { eventId: event.id, isNew: true };
}

/**
 * Link an article to an existing event and update event metrics.
 */
async function linkArticleToEvent(eventId, articleId, relevanceScore = 1.0) {
  await query(
    `INSERT INTO event_articles (event_id, article_id, relevance_score)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, article_id) DO UPDATE SET relevance_score = EXCLUDED.relevance_score`,
    [eventId, articleId, relevanceScore]
  );

  // Recalculate article_count and source_count
  await query(
    `UPDATE events e
     SET
       article_count = (SELECT COUNT(*) FROM event_articles WHERE event_id = e.id),
       source_count = (
         SELECT COUNT(DISTINCT a.source_id)
         FROM event_articles ea
         JOIN articles a ON ea.article_id = a.id
         WHERE ea.event_id = e.id AND a.source_id IS NOT NULL
       ),
       last_updated_at = NOW(),
       image_url = COALESCE(e.image_url, (SELECT a.image_url FROM articles a WHERE a.id = $2 AND a.image_url IS NOT NULL LIMIT 1))
     WHERE e.id = $1`,
    [eventId, articleId]
  );

  // Live feed entry for new coverage
  await query(
    `INSERT INTO live_entries (event_id, entry_type, title, description)
     SELECT
       $1, 'new_evidence',
       'Additional Coverage: ' || a.title,
       'New reporting from ' || COALESCE(s.name, 'Independent source')
     FROM articles a
     LEFT JOIN sources s ON a.source_id = s.id
     WHERE a.id = $2
     LIMIT 1`,
    [eventId, articleId]
  );
}
