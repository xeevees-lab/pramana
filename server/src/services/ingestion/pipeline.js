import crypto from 'crypto';
import { query } from '../../db/pool.js';
import { fetchRssFeed } from './fetchers/rss.js';
import { fetchGdeltArticles } from './fetchers/gdelt.js';
import { fetchNewsApiArticles } from './fetchers/newsapi.js';
import { normalizeArticle } from './normalizer.js';
import { computeContentHash, isDuplicate } from './deduplicator.js';
import { clusterArticle } from './clusterer.js';
import {
  isGeminiConfigured,
  generateEmbedding,
  extractEntities,
  extractClaims,
} from '../gemini.js';

/**
 * Fetch raw items from a source based on its type.
 */
async function fetchFromSource(source) {
  switch (source.type) {
    case 'rss':
      return await fetchRssFeed(source);
    case 'gdelt':
      return await fetchGdeltArticles(source);
    case 'newsapi':
      return await fetchNewsApiArticles(source);
    default:
      console.warn(`[Pipeline] Unknown source type: ${source.type}`);
      return [];
  }
}

/**
 * Run full ingestion pipeline for a single source.
 * @param {object} source - Database row from sources table
 * @returns {Promise<object>} - Ingestion summary
 */
export async function ingestSource(source) {
  const startTime = Date.now();
  console.log(`[Pipeline] Starting ingestion for: ${source.name} (${source.type})`);

  let rawItems = [];
  try {
    rawItems = await fetchFromSource(source);
  } catch (err) {
    console.error(`[Pipeline] Fetch failed for ${source.name}:`, err.message);
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: 'failed',
      error: err.message,
      fetched: 0,
      ingested: 0,
      duplicates: 0,
      durationMs: Date.now() - startTime,
    };
  }

  let ingested = 0;
  let duplicates = 0;
  let skipped = 0;
  const geminiAvailable = isGeminiConfigured();

  for (const raw of rawItems) {
    try {
      const normalized = normalizeArticle(raw);
      if (!normalized) {
        skipped++;
        continue;
      }

      const contentHash = computeContentHash(normalized);
      if (await isDuplicate(contentHash)) {
        duplicates++;
        continue;
      }

      // If Gemini is configured, generate embedding and extract intelligence
      let embedding = null;
      let entities = [];
      let claims = [];

      if (geminiAvailable) {
        try {
          const [emb, ent, clm] = await Promise.all([
            generateEmbedding(`${normalized.title}\n\n${normalized.summary}`),
            extractEntities(normalized.title, normalized.content),
            extractClaims(normalized.title, normalized.content),
          ]);
          embedding = emb;
          entities = ent || [];
          claims = clm || [];
        } catch (genErr) {
          console.warn('[Pipeline] Gemini extraction warning:', genErr.message);
        }
      }

      // Insert article into PostgreSQL
      const insertRes = await query(
        `INSERT INTO articles (
           source_id, external_id, url, title, content, summary,
           author, published_at, fetched_at, image_url, image_attribution,
           language, content_hash, embedding
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, NOW(), $9, $10,
           $11, $12, $13
         )
         ON CONFLICT (content_hash) DO NOTHING
         RETURNING id, title, summary, published_at, image_url, image_attribution, embedding`,
        [
          normalized.sourceId,
          normalized.externalId,
          normalized.url,
          normalized.title,
          normalized.content,
          normalized.summary,
          normalized.author,
          normalized.publishedAt,
          normalized.imageUrl,
          normalized.imageAttribution,
          normalized.language,
          contentHash,
          embedding ? JSON.stringify(embedding) : null,
        ]
      );

      if (insertRes.rows.length === 0) {
        duplicates++;
        continue;
      }

      const savedArticle = insertRes.rows[0];

      // Cluster article into an Event
      const { eventId } = await clusterArticle(savedArticle);

      // Save extracted claims if any
      for (const claim of claims) {
        const claimHash = crypto
          .createHash('sha256')
          .update(`${claim.text}|${eventId}`)
          .digest('hex');

        await query(
          `INSERT INTO claims (
             event_id, article_id, text, claim_type, information_class,
             verification_status, content_hash
           ) VALUES ($1, $2, $3, $4, $5, 'UNVERIFIED', $6)
           ON CONFLICT (content_hash) DO NOTHING`,
          [
            eventId,
            savedArticle.id,
            claim.text,
            claim.claim_type || 'factual',
            claim.information_class || 'fact',
            claimHash,
          ]
        );
      }

      // Save extracted entities if any
      for (const entity of entities) {
        const entRes = await query(
          `INSERT INTO entities (name, type, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (name, type) DO UPDATE SET
             description = COALESCE(EXCLUDED.description, entities.description),
             updated_at = NOW()
           RETURNING id`,
          [entity.name, entity.type, entity.description || null]
        );

        if (entRes.rows.length > 0 && eventId) {
          const entityId = entRes.rows[0].id;
          await query(
            `INSERT INTO entity_events (entity_id, event_id, role)
             VALUES ($1, $2, 'related')
             ON CONFLICT DO NOTHING`,
            [entityId, eventId]
          );
        }
      }

      ingested++;
    } catch (articleErr) {
      console.error(`[Pipeline] Error processing article "${raw.title?.slice(0, 50)}":`, articleErr.message);
    }
  }

  // Update source last_fetched_at
  await query(
    'UPDATE sources SET last_fetched_at = NOW(), updated_at = NOW() WHERE id = $1',
    [source.id]
  );

  const durationMs = Date.now() - startTime;
  console.log(
    `[Pipeline] Finished ${source.name}: ${ingested} ingested, ${duplicates} duplicates, ${skipped} skipped (${durationMs}ms)`
  );

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: 'success',
    fetched: rawItems.length,
    ingested,
    duplicates,
    skipped,
    durationMs,
  };
}

/**
 * Ingest from all enabled sources in database.
 * @returns {Promise<Array<object>>} - Array of source ingestion summaries
 */
export async function ingestAllSources() {
  const { rows: sources } = await query(
    'SELECT * FROM sources WHERE enabled = true ORDER BY name ASC'
  );

  if (sources.length === 0) {
    console.log('[Pipeline] No enabled sources found in database');
    return [];
  }

  const results = [];
  for (const source of sources) {
    const res = await ingestSource(source);
    results.push(res);
  }

  return results;
}
