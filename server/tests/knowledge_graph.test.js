import { describe, it, expect, beforeAll } from 'vitest';
import {
  syncPostgresToNeo4j,
  queryGraphContext,
  insertCausalRelationship,
} from '../src/services/intelligence/knowledgeGraph.js';
import { isHealthy, runCypher } from '../src/db/neo4j.js';
import { query } from '../src/db/pool.js';

describe('Neo4j Knowledge Graph Layer', () => {
  let neo4jAvailable = false;
  let testEventId = null;

  beforeAll(async () => {
    neo4jAvailable = await isHealthy().catch(() => false);
    // Find or create test event in PostgreSQL
    const { rows } = await query('SELECT id, title FROM events LIMIT 1');
    if (rows.length > 0) {
      testEventId = rows[0].id;
    }
  });

  it('verifies Neo4j connectivity and schema readiness', async () => {
    if (!neo4jAvailable) {
      console.warn('Neo4j not available in test environment, testing graceful fallback');
      const fallback = await queryGraphContext({ entityNames: ['Nepal'] });
      expect(fallback.graphAvailable).toBe(false);
      return;
    }

    expect(neo4jAvailable).toBe(true);
    const res = await runCypher('RETURN 1 as test');
    expect(res.records[0].get('test').toNumber()).toBe(1);
  });

  it('syncs PostgreSQL entities, events, articles, and sources into Neo4j', async () => {
    if (!neo4jAvailable) return;

    const result = await syncPostgresToNeo4j();
    expect(result.status).toBe('synced');
    expect(result.nodesCreated).toBeGreaterThan(0);
    expect(result.relationshipsCreated).toBeGreaterThan(0);

    // Verify node counts
    const nodeRes = await runCypher('MATCH (n) RETURN count(n) as count');
    const totalNodes = nodeRes.records[0].get('count').toNumber();
    expect(totalNodes).toBeGreaterThanOrEqual(result.nodesCreated);
  });

  it('traverses connected entities and co-occurring events via Cypher', async () => {
    if (!neo4jAvailable) return;

    // Get an entity name from Neo4j
    const entRes = await runCypher('MATCH (n:Entity) RETURN n.name AS name LIMIT 1');
    const sampleEntity = entRes.records.length > 0 ? entRes.records[0].get('name') : null;

    const context = await queryGraphContext({
      entityNames: sampleEntity ? [sampleEntity] : [],
      eventIds: testEventId ? [testEventId] : [],
      limit: 10,
    });

    expect(context.graphAvailable).toBe(true);
    expect(Array.isArray(context.entities)).toBe(true);
    expect(Array.isArray(context.relatedEvents)).toBe(true);
    expect(Array.isArray(context.causalLinks)).toBe(true);
  });

  it('enforces evidence references when creating causal relationships', async () => {
    // Attempting to create causal edge without required fields throws
    await expect(
      insertCausalRelationship({
        eventId: testEventId,
        causeText: '',
        effectText: 'Flood',
        relationshipType: 'trigger',
      })
    ).rejects.toThrow();

    if (testEventId) {
      const validCausal = await insertCausalRelationship({
        eventId: testEventId,
        causeText: 'Torrential monsoon downpour exceeding 200mm within 24 hours',
        effectText: 'Flash flooding and landslides across low-lying settlements',
        relationshipType: 'trigger',
        isDirectlySupported: true,
        confidence: 0.92,
        evidenceRefs: [
          {
            source: 'Meteorological Department & AP Wire',
            url: 'https://example.com/dispatch',
            excerpt: 'Severe localized downpour caused river banks to collapse.',
          },
        ],
      });

      expect(validCausal.id).toBeDefined();
      expect(validCausal.relationship_type).toBe('trigger');
      expect(validCausal.is_directly_supported).toBe(true);

      // Verify it was stored in PostgreSQL
      const { rows } = await query(
        'SELECT * FROM causal_relationships WHERE id = $1',
        [validCausal.id]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].cause_text).toContain('Torrential monsoon');

      // Verify it was mapped into Neo4j
      if (neo4jAvailable) {
        const graphCausal = await queryGraphContext({ eventIds: [testEventId] });
        const matched = graphCausal.causalLinks.find(c => c.id === validCausal.id);
        expect(matched).toBeDefined();
        expect(matched.relType).toBe('trigger');
      }
    }
  });
});
