/**
 * GDELT 2.0 Doc API Fetcher.
 * Queries GDELT's global news article database.
 */

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

/**
 * Parse GDELT seendate format: "YYYYMMDDTHHMMSSZ" into Date
 * @param {string} dateStr
 * @returns {Date}
 */
function parseGdeltDate(dateStr) {
  if (!dateStr) return new Date();
  try {
    // Format: 20260908T123000Z
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
    }
    return new Date(dateStr);
  } catch {
    return new Date();
  }
}

/**
 * Fetch articles from GDELT 2.0 Doc API.
 * @param {object} source - { id, name, config }
 * @returns {Promise<Array<object>>} - Raw article objects
 */
export async function fetchGdeltArticles(source) {
  const query = source.config?.query || 'news'; // Fetch broad news articles
  const maxRecords = source.config?.maxRecords || 30;

  const url = new URL(GDELT_DOC_API);
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', String(maxRecords));
  url.searchParams.set('sort', 'datedesc');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GDELT API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return [];
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // GDELT sometimes returns non-JSON or HTML if rate limited
      console.warn('[GDELT Fetcher] Received non-JSON response from GDELT');
      return [];
    }

    const articles = data.articles || [];

    return articles.map((item) => ({
      externalId: item.url,
      url: item.url || '',
      title: item.title || '',
      content: item.title || '', // GDELT artlist gives title and domain
      summary: item.title || '',
      author: item.domain || 'GDELT',
      publishedAt: parseGdeltDate(item.seendate),
      imageUrl: item.socialimage || null,
      imageAttribution: item.domain || 'GDELT',
      language: item.language || 'en',
      sourceId: source.id,
      sourceName: source.name || 'GDELT',
      sourceType: 'gdelt',
      metadata: {
        domain: item.domain,
        sourcecountry: item.sourcecountry,
      },
    }));
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[GDELT Fetcher] Error fetching GDELT:`, err.message);
    throw err;
  }
}
