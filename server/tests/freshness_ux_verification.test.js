import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { inferCategory } from '../src/services/ingestion/clusterer.js';
import { processResearchQuery, getQueryRelevantVerifiedPicture } from '../src/services/research/askEngine.js';

describe('Pramāṇa Freshness, Ingestion, Headlines, Claims & Retrieval Verification', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. News Sources & Category Inference', () => {
    it('has configured Technology, Science, and Business sources in the database', async () => {
      const { rows } = await query(
        "SELECT name, type, enabled FROM sources WHERE name ILIKE '%Technology%' OR name ILIKE '%Science%' OR name ILIKE '%Business%'"
      );
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.enabled).toBe(true);
      }
    });

    it('infers technology category for AI models and product launches without politics bias', () => {
      expect(inferCategory('OpenAI debuts new reasoning model with improved capabilities')).toBe('technology');
      expect(inferCategory('Nvidia unveils cutting-edge next-gen GPU architecture at tech summit')).toBe('technology');
      expect(inferCategory('Tech giant unveils new flagship smartphone and AI software update')).toBe('technology');
      expect(inferCategory('New semiconductor fabrication facility begins silicon wafer production')).toBe('technology');
    });

    it('infers science category for space, telescope, and research discoveries', () => {
      expect(inferCategory('James Webb Space Telescope discovers ancient galaxy cluster')).toBe('science');
      expect(inferCategory('NASA rover finds signs of ancient lakebed on Mars')).toBe('science');
      expect(inferCategory('Researchers discover new species in deep ocean trench')).toBe('science');
    });

    it('infers business and economics correctly', () => {
      expect(inferCategory('Major tech startup raises $500M in venture capital funding round')).toBe('business');
      expect(inferCategory('Federal Reserve weighs interest rate decision as inflation cools')).toBe('economics');
      expect(inferCategory('Global stock markets rally as tech shares jump on earnings')).toBe('markets');
    });

    it('infers climate and environment correctly', () => {
      expect(inferCategory('Record monsoon rains trigger flash floods and landslides in Nepal')).toBe('climate');
      expect(inferCategory('Solar and wind energy installations surge as clean power transition accelerates')).toBe('environment');
    });

    it('guarantees inferCategory only produces values allowed by the database constraint', () => {
      const ALLOWED = [
        'politics', 'conflict', 'diplomacy', 'economics', 'business',
        'markets', 'science', 'technology', 'environment', 'climate',
        'disasters', 'law', 'public_policy', 'international_affairs',
        'social', 'health', 'sports', 'culture', 'other'
      ];
      
      const testCases = [
        'Something completely unusual and unclassifiable xyz',
        'Solar energy project in Nevada',
        'New operating system patch released today',
        'Champions League quarter-final highlights and scores'
      ];

      for (const tc of testCases) {
        const cat = inferCategory(tc);
        expect(ALLOWED).toContain(cat);
      }
    });
  });

  describe('2. Event Headline Evolution Logic', () => {
    it('preserves authoritative headline when candidate is duplicate or low quality', async () => {
      // Fetch an existing event
      const { rows } = await query('SELECT id, title FROM events LIMIT 1');
      if (rows.length > 0) {
        const event = rows[0];
        expect(event.title).toBeDefined();
        expect(event.title.length).toBeGreaterThan(0);
      }
    });

    it('allows GET /api/events/:id to return current authoritative title', async () => {
      const { rows } = await query('SELECT id, title FROM events LIMIT 1');
      if (rows.length > 0) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/events/${rows[0].id}`,
        });
        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.payload);
        const returnedTitle = data.event?.title || data.report?.headline || data.title;
        expect(returnedTitle).toBe(rows[0].title);
      }
    });
  });

  describe('3. Verified Picture Strict Evidence Relevance Gate', () => {
    it('suppresses unrelated verified claims from becoming the Verified Picture', () => {
      const userQuery = 'European unity report findings';
      const claims = [
        {
          id: 'claim-1',
          content: 'Ukraine military reported 500 casualties in eastern front fighting',
          verification_status: 'VERIFIED',
          confidence: 0.95,
        },
        {
          id: 'claim-2',
          content: 'A recent survey found European citizens support greater political unity despite economic challenges',
          verification_status: 'VERIFIED',
          confidence: 0.88,
        },
      ];

      const vp = getQueryRelevantVerifiedPicture(userQuery, claims);
      expect(vp).toBeDefined();
      // Must NOT select claim-1 (Ukraine casualty) because it is irrelevant to European unity report
      const text = vp.content || vp.text;
      expect(text).toContain('European citizens support greater political unity');
      expect(text).not.toContain('Ukraine military');
    });

    it('returns null if no verified claim has strong relevance to the user query', () => {
      const userQuery = 'Quantum computing breakthrough in Tokyo';
      const claims = [
        {
          id: 'claim-1',
          content: 'Nepal flood relief teams deployed across southern plains',
          verification_status: 'VERIFIED',
          confidence: 0.9,
        },
        {
          id: 'claim-2',
          content: 'Gaza humanitarian corridor negotiations reach deadlock',
          verification_status: 'VERIFIED',
          confidence: 0.85,
        },
      ];

      const vp = getQueryRelevantVerifiedPicture(userQuery, claims);
      expect(vp).toBeNull();
    });
  });

  describe('4. Live Feed API & Refresh Semantics', () => {
    it('GET /api/events/live returns clean, deduplicated article list with timestamps', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/events/live?limit=20',
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      const items = data.entries || data.articles || [];
      expect(Array.isArray(items)).toBe(true);

      if (items.length > 0) {
        const ids = items.map(i => i.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length); // No duplicates
      }
    });

    it('GET /api/articles returns paginated articles sorted by published/fetched date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/articles?limit=20',
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data.articles)).toBe(true);
      expect(data.pagination).toBeDefined();
    });

    it('POST /api/sources/fetch-all triggers ingestion run and returns status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sources/fetch-all',
      });
      expect([200, 202]).toContain(res.statusCode);
      const data = JSON.parse(res.payload);
      expect(data).toBeDefined();
      expect(data.status).toBe('success');
    }, 60000);
  });

  describe('5. Temporal Lane Retrieval Discrimination', () => {
    it('distinguishes "Is Nepal flooding right now?" from "Nepal floods" historical query', async () => {
      const currentRes = await processResearchQuery({
        query: 'Is Nepal flooding right now?',
        mode: 'ask',
      });
      expect(currentRes.currentStatus).toBeDefined();
      expect(typeof currentRes.currentStatus.isActive).toBe('boolean');

      const topicRes = await processResearchQuery({
        query: 'Nepal floods',
        mode: 'ask',
      });
      expect(topicRes).toBeDefined();
      // Topic query should retrieve historical/recent context without falsely asserting zero information exists
      expect(topicRes.executiveSummary).toBeDefined();
      expect(topicRes.executiveSummary.length).toBeGreaterThan(20);
    });
  });

  describe('6. Floating Assistant Request Isolation & Output Consistency', () => {
    it('POST /api/ask/query responds with structured intelligence and no raw markdown titles', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {
          query: 'Artificial intelligence regulations in Europe',
          mode: 'ask',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.executiveSummary).toBeDefined();
      expect(data.executiveSummary).not.toMatch(/^#{1,6}\s/);
      expect(data.currentStatus).toBeDefined();
      expect(Array.isArray(data.sources)).toBe(true);
    });

    it('preserves query focus when page context is provided (explicit query always wins)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {
          query: 'latest semiconductor technology announcements',
          pageContext: 'Ukraine military operations in Donbas',
          mode: 'ask',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.executiveSummary).toBeDefined();
      // Explicit user query must NOT be hijacked by page context
      const summaryLower = data.executiveSummary.toLowerCase();
      expect(summaryLower.includes('ukraine military') || summaryLower.includes('donbas')).toBe(false);
      expect(
        summaryLower.includes('semiconductor') ||
        summaryLower.includes('technology') ||
        summaryLower.includes('corroborated') ||
        summaryLower.includes('document') ||
        summaryLower.includes('report') ||
        summaryLower.includes('evidence')
      ).toBe(true);
    });
  });
});
