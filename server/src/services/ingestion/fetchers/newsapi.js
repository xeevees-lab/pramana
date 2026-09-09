import config from '../../../config/index.js';

const NEWSAPI_BASE = 'https://newsapi.org/v2/top-headlines';

/**
 * Fetch articles from NewsAPI.org.
 * @param {object} source - { id, name, config }
 * @returns {Promise<Array<object>>}
 */
export async function fetchNewsApiArticles(source) {
  const apiKey = source.config?.apiKey || config.newsapi.apiKey;
  if (!apiKey) {
    console.warn('[NewsAPI Fetcher] No API key configured. Skipping NewsAPI fetch.');
    return [];
  }

  const category = source.config?.category || 'general';
  const country = source.config?.country || 'us';
  const pageSize = source.config?.pageSize || 30;

  const url = new URL(NEWSAPI_BASE);
  url.searchParams.set('country', country);
  url.searchParams.set('category', category);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('apiKey', apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'PramanaNewsIntelligence/1.0' },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`NewsAPI returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`NewsAPI error: ${data.message || 'Unknown error'}`);
    }

    const articles = data.articles || [];

    return articles
      .filter((item) => item.title && item.title !== '[Removed]')
      .map((item) => ({
        externalId: item.url,
        url: item.url || '',
        title: item.title || '',
        content: item.content || item.description || '',
        summary: item.description || '',
        author: item.author || item.source?.name || source.name,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
        imageUrl: item.urlToImage || null,
        imageAttribution: item.source?.name || source.name,
        sourceId: source.id,
        sourceName: source.name || item.source?.name || 'NewsAPI',
        sourceType: 'newsapi',
      }));
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[NewsAPI Fetcher] Error:`, err.message);
    throw err;
  }
}
