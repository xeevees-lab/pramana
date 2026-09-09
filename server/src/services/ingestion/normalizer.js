/**
 * Article Normalization Pipeline
 * Standardizes raw articles from diverse sources (RSS, GDELT, NewsAPI).
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'ref_src', 'fbclid', 'gclid', 'msclkid', 'twclid', '_hsenc', '_hsmi',
]);

/**
 * Remove tracking and advertising query parameters from URLs.
 * @param {string} rawUrl
 * @returns {string}
 */
export function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    const keysToDelete = [];
    for (const key of url.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.startsWith('utm_')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => url.searchParams.delete(k));
    // Remove trailing hash if empty or generic
    if (url.hash === '#' || url.hash === '#top') {
      url.hash = '';
    }
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Unescape common HTML entities and strip unwanted HTML tags.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize an article object into standard database format.
 * @param {object} raw - Raw article from any fetcher
 * @returns {object|null} - Normalized article or null if invalid
 */
export function normalizeArticle(raw) {
  if (!raw) return null;

  const rawTitle = raw.title || '';
  const cleanTitle = stripHtml(rawTitle);

  // Must have a meaningful title
  if (!cleanTitle || cleanTitle.length < 5) {
    return null;
  }

  const rawContent = raw.content || raw.summary || '';
  const cleanContent = stripHtml(rawContent);

  const rawSummary = raw.summary || raw.content || '';
  let cleanSummary = stripHtml(rawSummary);
  if (cleanSummary.length > 500) {
    cleanSummary = cleanSummary.slice(0, 497) + '...';
  }

  const canonicalUrl = cleanUrl(raw.url);

  let publishedAt = raw.publishedAt;
  if (!publishedAt || isNaN(new Date(publishedAt).getTime())) {
    publishedAt = new Date();
  } else {
    publishedAt = new Date(publishedAt);
  }

  return {
    sourceId: raw.sourceId || null,
    externalId: String(raw.externalId || canonicalUrl || cleanTitle),
    url: canonicalUrl,
    title: cleanTitle,
    content: cleanContent || cleanTitle,
    summary: cleanSummary || cleanTitle,
    author: raw.author ? stripHtml(raw.author) : null,
    publishedAt,
    imageUrl: raw.imageUrl ? cleanUrl(raw.imageUrl) : null,
    imageAttribution: raw.imageAttribution ? stripHtml(raw.imageAttribution) : null,
    language: raw.language || 'en',
    sourceType: raw.sourceType || 'unknown',
  };
}
