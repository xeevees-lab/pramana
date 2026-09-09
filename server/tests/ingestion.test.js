import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { normalizeArticle, cleanUrl, stripHtml } from '../src/services/ingestion/normalizer.js';
import { computeContentHash } from '../src/services/ingestion/deduplicator.js';
import { inferCategory, inferSeverity } from '../src/services/ingestion/clusterer.js';

describe('Normalizer & Utilities', () => {
  it('cleanUrl strips tracking and utm parameters', () => {
    const raw = 'https://example.com/world/news?utm_source=twitter&utm_medium=social&ref=123&article=456';
    const cleaned = cleanUrl(raw);
    expect(cleaned).toBe('https://example.com/world/news?article=456');
  });

  it('stripHtml removes scripts, tags, and unescapes entities', () => {
    const html = '<p>Breaking: <b>Global</b> treaty signed &amp; ratified.<script>alert(1)</script></p>';
    const cleaned = stripHtml(html);
    expect(cleaned).toBe('Breaking: Global treaty signed & ratified.');
  });

  it('normalizeArticle rejects empty or too short titles', () => {
    expect(normalizeArticle({ title: 'Hi' })).toBeNull();
    expect(normalizeArticle({ title: '' })).toBeNull();
    expect(normalizeArticle(null)).toBeNull();
  });

  it('normalizeArticle formats fields correctly', () => {
    const normalized = normalizeArticle({
      title: '<h1>Major Summit Held in Geneva</h1>',
      content: '<p>Diplomats gathered to discuss international security.</p>',
      url: 'https://news.example.com/summit?utm_campaign=daily',
      author: 'Jane Doe',
      publishedAt: '2026-09-08T10:00:00Z',
    });

    expect(normalized).not.toBeNull();
    expect(normalized.title).toBe('Major Summit Held in Geneva');
    expect(normalized.content).toBe('Diplomats gathered to discuss international security.');
    expect(normalized.url).toBe('https://news.example.com/summit');
    expect(normalized.author).toBe('Jane Doe');
    expect(normalized.publishedAt).toBeInstanceOf(Date);
  });
});

describe('Deduplication & Content Hashing', () => {
  it('computeContentHash is deterministic', () => {
    const artA = {
      title: 'Global Economic Forum Opens in Tokyo',
      url: 'https://reuters.com/business/tokyo-forum',
      content: 'Leaders discussed monetary policy and inflation forecasts.',
    };

    const artB = {
      title: 'Global Economic Forum Opens in Tokyo',
      url: 'https://reuters.com/business/tokyo-forum?utm_source=feed',
      content: 'Leaders discussed monetary policy and inflation forecasts.',
    };

    const hashA = computeContentHash(artA);
    const hashB = computeContentHash(artB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64); // SHA-256 hex string
  });
});

describe('Category & Severity Inference', () => {
  it('infers conflict category from combat keywords', () => {
    expect(inferCategory('Missile strikes reported near border as troops mobilize')).toBe('conflict');
  });

  it('infers economics category from central bank keywords', () => {
    expect(inferCategory('Federal Reserve cuts interest rates amid slowing inflation')).toBe('economics');
  });

  it('infers technology category from AI and chip keywords', () => {
    expect(inferCategory('New quantum semiconductor architecture unveiled')).toBe('technology');
  });

  it('infers climate category from storm and wildfire keywords', () => {
    expect(inferCategory('Severe hurricane makes landfall causing massive coastal flooding')).toBe('climate');
  });

  it('infers critical severity for breaking emergency events', () => {
    expect(inferSeverity('Breaking: Emergency declared following catastrophic earthquake')).toBe('critical');
  });
});

describe('Ingestion & Intelligence API Endpoints', () => {
  it('GET /api/sources returns list of seeded sources', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/sources',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources.length).toBeGreaterThan(0);

    const sourceNames = body.sources.map(s => s.name);
    expect(sourceNames).toContain('BBC World News');

    await app.close();
  });

  it('GET /api/articles returns paginated articles', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/articles?limit=5',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.limit).toBe(5);

    await app.close();
  });

  it('GET /api/events returns paginated events with category filters', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/events?limit=5',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.pagination).toBeDefined();

    await app.close();
  });

  it('GET /api/events/live returns live entries', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/events/live?limit=5',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body.entries)).toBe(true);

    await app.close();
  });
});
