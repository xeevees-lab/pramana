import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'PramanaNewsIntelligence/1.0 (+https://github.com/pramana)',
    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['dc:creator', 'creator'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

/**
 * Fetch articles from an RSS or Atom feed.
 * @param {object} source - { id, name, url }
 * @returns {Promise<Array<object>>} - Raw article objects
 */
export async function fetchRssFeed(source) {
  if (!source.url) {
    throw new Error(`Source ${source.name} (${source.id}) has no URL`);
  }

  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items || [];

    return items.map((item) => {
      // Find best image URL from enclosures or media tags
      let imageUrl = null;
      if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image/')) {
        imageUrl = item.enclosure.url;
      } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
        imageUrl = item.mediaContent.$.url;
      } else if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
        imageUrl = item.mediaThumbnail.$.url;
      }

      return {
        externalId: item.guid || item.id || item.link,
        url: item.link || '',
        title: item.title || '',
        content: item.contentEncoded || item.content || item.contentSnippet || '',
        summary: item.contentSnippet || item.summary || '',
        author: item.creator || item.author || source.name,
        publishedAt: item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate) : new Date(),
        imageUrl,
        imageAttribution: source.name,
        sourceId: source.id,
        sourceName: source.name,
        sourceType: 'rss',
      };
    });
  } catch (err) {
    console.error(`[RSS Fetcher] Error fetching ${source.name} (${source.url}):`, err.message);
    throw err;
  }
}
