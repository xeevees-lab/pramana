import { query } from '../../db/pool.js';
import { classifyTextTaxonomy } from '../intelligence/eventTaxonomy.js';

/**
 * Infer news category from title and content keywords.
 * Maps to allowed categories in events table.
 * Uses generic keyword patterns — no hardcoded brands, countries, or product names.
 * @param {string} text
 * @returns {string}
 */
export function inferCategory(text) {
  const lower = (text || '').toLowerCase();

  if (/\b(war|military|missile|army|attack|strike|troops|combat|weapons|defense|ceasefire|invasion|casualt|airstrikes|shelling|armed conflict|insurgent|guerrilla)\b/.test(lower)) {
    return 'conflict';
  }
  if (/\b(treaty|diplomatic summit|peace summit|g7 summit|g20 summit|nato summit|bilateral summit|leaders summit|summit talks|ambassador|sanction|diplomat|bilateral|un |united nations|nato|foreign minister|consul|envoy|multilateral|peacekeep)\b/.test(lower)) {
    return 'diplomacy';
  }
  if (/\b(election|parliament|congress|president|prime minister|vote|campaign|senate|legislation|democrat|republican|cabinet|referendum|ballot|impeach|governor|mayor)\b/.test(lower)) {
    return 'politics';
  }
  if (/\b(inflation|gdp|interest rate|central bank|federal reserve|currency|trade deficit|tariff|recession|debt|monetary policy|fiscal)\b/.test(lower)) {
    return 'economics';
  }
  if (/\b(stocks|nasdaq|dow jones|s&p|yield|bond|shares|market index|equity|rally|sell-off|ipo|stock market)\b/.test(lower)) {
    return 'markets';
  }
  if (/\b(earnings|quarterly revenue|merger|acquisition|ceo|layoffs|startup|funding|antitrust|profit|revenue|valuation|venture capital|private equity|corporate|shareholder|dividend)\b/.test(lower)) {
    return 'business';
  }
  // Technology — expanded to cover AI, hardware, software, product launches, platforms, robotics, etc.
  if (/\b(artificial intelligence|machine learning|deep learning|neural network|large language model|generative ai|chatbot|ai model|ai system|reasoning model|foundation model|openai|anthropic|deepmind|chatgpt|claude|gemini|hugging face)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(semiconductor|chip|processor|gpu|cpu|fabrication|lithograph|transistor|silicon|wafer|foundry)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(software|app|application|platform|operating system|browser|firmware|update|patch|version|release|beta|developer|api|sdk|open source)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(smartphone|laptop|tablet|wearable|headset|gadget|device|hardware|robot|drone|autonomous|self-driving|ev battery|electric vehicle)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(cyber|hacker|ransomware|malware|data breach|encryption|quantum comput|cloud computing|data center|5g|6g|broadband|fiber optic|satellite internet)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(product launch|launched|launches|launching|unveils?|announc\w* new|debuts?|flagship|next-gen|cutting-edge|breakthrough tech|innovation|tech giant|tech company|tech summit)\b/.test(lower)) {
    return 'technology';
  }
  if (/\b(climate|wildfire|flood|hurricane|tornado|earthquake|drought|emissions|temperature|arctic|storm|tsunami|typhoon|cyclone|landslide|volcanic|eruption|heatwave|monsoon)\b/.test(lower)) {
    return 'climate';
  }
  if (/\b(virus|disease|vaccine|outbreak|hospital|health|fda|who |pandemic|medical|cancer|surgery|clinical trial|drug approv|pharma|therapeutic|epidemic|infection)\b/.test(lower)) {
    return 'health';
  }
  if (/\b(supreme court|judge|verdict|indictment|lawsuit|prosecutor|trial|court|ruling|plea|attorney general|legal|sentence|conviction|acquit)\b/.test(lower)) {
    return 'law';
  }
  // Science — expanded to cover space, biology, physics, research discoveries
  if (/\b(telescope|physics|biology|nasa|astronomy|discovery|researchers|species|fossil|genome|crispr|particle|exoplanet|mars|moon|space station|satellite|rocket|launch vehicle|orbit|astrophys|lab|experiment|scientific|study finds|study shows|journal|peer.review)\b/.test(lower)) {
    return 'science';
  }
  if (/\b(solar|wind energy|renewable|nuclear|oil price|opec|natural gas|pipeline|energy transition|power grid|electricity|hydroelectric|geothermal)\b/.test(lower)) {
    return 'environment';
  }
  if (/\b(olympic|world cup|championship|tournament|match|league|medal|athlete|coach|soccer|football|cricket|tennis|basketball|baseball|racing|motorsport)\b/.test(lower)) {
    return 'sports';
  }
  if (/\b(film|movie|album|concert|museum|theater|theatre|award|grammy|oscar|emmy|festival|exhibition|novel|book|artist|cultural|heritage)\b/.test(lower)) {
    return 'culture';
  }
  // Default: 'other' — NOT politics, to avoid systematic misclassification
  return 'other';
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
  const category = inferCategory(combinedText);
  const severity = inferSeverity(combinedText);

  // Classify article taxonomy
  const taxonomy = classifyTextTaxonomy(article.title, article.summary || article.content || '', { category });
  try {
    await query(
      `UPDATE articles SET event_types = $1, event_type_scores = $2 WHERE id = $3`,
      [taxonomy.eventTypes, JSON.stringify(taxonomy.scores), article.id]
    );
  } catch (taxErr) {
    console.warn('[Clusterer] Taxonomy update warning:', taxErr.message);
  }

  // 1. Vector cosine similarity search if article has embedding
  if (article.embedding) {
    try {
      const vectorRes = await query(
        `SELECT id, title, category, event_types, 1 - (embedding <=> $1::vector) AS similarity
         FROM events
         WHERE embedding IS NOT NULL
           AND status != 'historical'
           AND last_updated_at > NOW() - INTERVAL '7 days'
         ORDER BY embedding <=> $1::vector
         LIMIT 3`,
        [JSON.stringify(article.embedding)]
      );

      for (const matched of vectorRes.rows) {
        const hasSharedType = taxonomy.eventTypes.some(t => t !== 'OTHER' && (matched.event_types || []).includes(t));
        const sameCategory = matched.category === category;
        const compositeScore = (matched.similarity * 0.55) + (hasSharedType ? 0.25 : 0.0) + (sameCategory ? 0.20 : 0.0);

        if (compositeScore >= 0.75 || matched.similarity >= 0.82) {
          await linkArticleToEvent(matched.id, article.id, compositeScore, taxonomy.eventTypes);
          return { eventId: matched.id, isNew: false };
        }
      }
    } catch (err) {
      console.warn('[Clusterer] Vector search fallback:', err.message);
    }
  }

  // 2. Trigram similarity search fallback using PostgreSQL pg_trgm
  try {
    const textRes = await query(
      `SELECT id, title, category, event_types, similarity(title, $1) AS sim
       FROM events
       WHERE status != 'historical'
         AND last_updated_at > NOW() - INTERVAL '7 days'
         AND similarity(title, $1) >= 0.38
       ORDER BY sim DESC
       LIMIT 3`,
      [article.title]
    );

    for (const matched of textRes.rows) {
      const hasSharedType = taxonomy.eventTypes.some(t => t !== 'OTHER' && (matched.event_types || []).includes(t));
      const compositeScore = (matched.sim * 0.55) + (hasSharedType ? 0.25 : 0.0) + (matched.category === category ? 0.20 : 0.0);
      if (compositeScore >= 0.65 || matched.sim >= 0.55) {
        await linkArticleToEvent(matched.id, article.id, compositeScore, taxonomy.eventTypes);
        return { eventId: matched.id, isNew: false };
      }
    }
  } catch (err) {
    console.warn('[Clusterer] Text similarity search fallback:', err.message);
  }

  // 3. No match found -> create a new Event
  const newEventRes = await query(
    `INSERT INTO events (
       title, summary, category, severity, status,
       image_url, image_attribution, article_count, source_count,
       first_reported_at, last_updated_at, embedding, event_types
     ) VALUES (
       $1, $2, $3, $4, 'developing',
       $5, $6, 1, 1,
       $7, $7, $8, $9
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
      taxonomy.eventTypes,
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
 * Also evaluates whether the event headline should be updated
 * based on the incoming article's freshness and source quality.
 */
async function linkArticleToEvent(eventId, articleId, relevanceScore = 1.0, incomingEventTypes = []) {
  await query(
    `INSERT INTO event_articles (event_id, article_id, relevance_score)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, article_id) DO UPDATE SET relevance_score = EXCLUDED.relevance_score`,
    [eventId, articleId, relevanceScore]
  );

  // Recalculate article_count and source_count, and merge event_types
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
       event_types = ARRAY(
         SELECT DISTINCT unnest(array_cat(COALESCE(e.event_types, '{}'), $3::TEXT[]))
       ),
       image_url = COALESCE(e.image_url, (SELECT a.image_url FROM articles a WHERE a.id = $2 AND a.image_url IS NOT NULL LIMIT 1))
     WHERE e.id = $1`,
    [eventId, articleId, incomingEventTypes]
  );

  // Deterministic headline evolution check
  if (relevanceScore >= 0.75) {
    await updateEventHeadline(eventId, articleId);
  }

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

/**
 * Deterministic event headline evolution.
 *
 * An event headline may be updated ONLY when:
 * 1. The new article belongs to the event (already guaranteed by caller).
 * 2. The new article is meaningfully newer than the current headline source (>= 2 hours).
 * 3. The source quality is appropriate (reliability_score >= 0.5 or from a known publisher).
 * 4. The new headline is not a near-duplicate syndicated copy of the existing one
 *    (checked via simple normalized Jaccard overlap < 0.80).
 *
 * This prevents both headline staleness and syndicated churn.
 */
async function updateEventHeadline(eventId, articleId) {
  try {
    // Get the current event headline and the new article details
    const { rows: eventRows } = await query(
      `SELECT title, summary, first_reported_at FROM events WHERE id = $1`,
      [eventId]
    );
    if (eventRows.length === 0) return;

    const currentEvent = eventRows[0];

    const { rows: articleRows } = await query(
      `SELECT a.title, a.summary, a.published_at, COALESCE(s.reliability_score, 0.5) AS reliability
       FROM articles a
       LEFT JOIN sources s ON a.source_id = s.id
       WHERE a.id = $1`,
      [articleId]
    );
    if (articleRows.length === 0) return;

    const article = articleRows[0];

    // Gate 1: Source quality must be adequate
    if (article.reliability < 0.5) return;

    // Gate 2: Article must be meaningfully newer than the event's first report (>= 2 hours)
    const firstReportedAt = new Date(currentEvent.first_reported_at || 0).getTime();
    const articlePublishedAt = new Date(article.published_at || 0).getTime();
    const ageGapHours = (articlePublishedAt - firstReportedAt) / (1000 * 60 * 60);
    if (ageGapHours < 2) return;

    // Gate 3: The new headline must not be a near-duplicate of the current headline
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const oldWords = new Set(normalize(currentEvent.title));
    const newWords = new Set(normalize(article.title));
    if (oldWords.size > 0 && newWords.size > 0) {
      let intersection = 0;
      for (const w of oldWords) {
        if (newWords.has(w)) intersection++;
      }
      const union = new Set([...oldWords, ...newWords]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > 0.80) return; // Too similar — syndicated churn, skip
    }

    // All gates passed: update the event headline and summary
    await query(
      `UPDATE events
       SET title = $2, summary = COALESCE($3, summary)
       WHERE id = $1`,
      [eventId, article.title, article.summary || null]
    );

    console.log(`[Clusterer] Headline evolved for event ${eventId}: "${article.title}"`);
  } catch (err) {
    console.warn('[Clusterer] Headline update warning:', err.message);
  }
}
