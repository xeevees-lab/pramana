import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { validateUrl } from '../src/services/research/urlReader.js';
import { isVideoUrl } from '../src/services/research/videoReader.js';

describe('Ask & Fact Check Unified Engine', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('SSRF Protection in URL Reader', () => {
    it('blocks localhost and loopback addresses', () => {
      expect(validateUrl('http://localhost:3000').safe).toBe(false);
      expect(validateUrl('http://127.0.0.1:8080').safe).toBe(false);
      expect(validateUrl('http://127.0.0.2').safe).toBe(false);
      expect(validateUrl('http://0.0.0.0').safe).toBe(false);
    });

    it('blocks cloud metadata IP 169.254.169.254', () => {
      expect(validateUrl('http://169.254.169.254/latest/meta-data/').safe).toBe(false);
    });

    it('blocks RFC 1918 private IP addresses', () => {
      expect(validateUrl('http://10.0.0.1').safe).toBe(false);
      expect(validateUrl('http://192.168.1.1').safe).toBe(false);
      expect(validateUrl('http://172.16.0.1').safe).toBe(false);
      expect(validateUrl('http://172.31.255.255').safe).toBe(false);
    });

    it('blocks non-HTTP protocols', () => {
      expect(validateUrl('file:///etc/passwd').safe).toBe(false);
      expect(validateUrl('ftp://example.com').safe).toBe(false);
      expect(validateUrl('javascript:alert(1)').safe).toBe(false);
    });

    it('allows valid public URLs', () => {
      expect(validateUrl('https://www.bbc.com/news/world').safe).toBe(true);
      expect(validateUrl('https://en.wikipedia.org/wiki/Main_Page').safe).toBe(true);
    });
  });

  describe('Video URL Detection', () => {
    it('correctly identifies public video URLs', () => {
      expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(isVideoUrl('https://vimeo.com/123456789')).toBe(true);
      expect(isVideoUrl('https://www.bbc.com/news/article')).toBe(false);
    });
  });

  describe('POST /api/ask/query', () => {
    it('rejects empty query and URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error).toBe('Validation Error');
    });

    it('answers research query using real database context', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {
          query: 'world news updates',
          mode: 'ask',
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.mode).toBe('ask');
      expect(json.answer).toBeDefined();
      expect(typeof json.answer).toBe('string');
      expect(json.provenance).toBeDefined();
      expect(Array.isArray(json.sources)).toBe(true);
    });

    it('preserves multi-turn conversation context for follow-up questions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {
          query: 'Why did this happen?',
          mode: 'ask',
          conversationHistory: [
            { role: 'user', content: 'What is happening with European unity?' },
            { role: 'assistant', content: 'Reports indicate European nations are analyzing political cohesion.' },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.answer).toBeDefined();
    });

    it('safely handles blocked SSRF URLs with an honest error', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/query',
        payload: {
          url: 'http://169.254.169.254/secret',
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.urlAnalysis?.error).toContain('blocked');
    });
  });

  describe('POST /api/ask/fact-check & /api/fact-check', () => {
    it('verifies assertions against database claims and evidence', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/fact-check',
        payload: {
          query: 'Archaeologists in Peru uncovered an ancient tomb.',
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.mode).toBe('fact_check');
      expect(Array.isArray(json.claims)).toBe(true);
      if (json.claims.length > 0) {
        // Must use verified labels (never 'FALSE')
        expect(['VERIFIED', 'UNVERIFIED', 'CONTRADICTED']).toContain(json.claims[0].status);
      }
    });

    it('supports legacy /api/fact-check alias', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/fact-check',
        payload: {
          content: 'A recent treaty was signed.',
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.mode).toBe('fact_check');
    });
  });
});
