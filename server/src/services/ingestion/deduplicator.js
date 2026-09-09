import crypto from 'crypto';
import { query } from '../../db/pool.js';

/**
 * Generate a deterministic SHA-256 hash for an article to detect duplicates.
 * Normalizes title punctuation and whitespace so minor feed variations produce the same hash.
 * @param {object} article - Normalized article
 * @returns {string} - Hex SHA-256 hash
 */
export function computeContentHash(article) {
  // Normalize title: lowercase, strip all non-alphanumeric except space
  const normalizedTitle = (article.title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize URL: domain + pathname (ignoring protocol and query)
  let normalizedUrl = '';
  try {
    const parsed = new URL(article.url || '');
    normalizedUrl = `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    normalizedUrl = (article.url || '').toLowerCase().trim();
  }

  // Snippet of content
  const snippet = (article.content || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 150)
    .trim();

  const rawString = `${normalizedTitle}|${normalizedUrl}|${snippet}`;
  return crypto.createHash('sha256').update(rawString, 'utf8').digest('hex');
}

/**
 * Check if an article with this content hash already exists in PostgreSQL.
 * @param {string} contentHash
 * @returns {Promise<boolean>}
 */
export async function isDuplicate(contentHash) {
  const { rows } = await query(
    'SELECT id FROM articles WHERE content_hash = $1 LIMIT 1',
    [contentHash]
  );
  return rows.length > 0;
}
