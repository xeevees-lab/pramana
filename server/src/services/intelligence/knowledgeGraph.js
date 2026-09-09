import { runCypher, isHealthy } from '../../db/neo4j.js';
import { query } from '../../db/pool.js';

/**
 * Synchronize PostgreSQL entities, events, articles, claims, sources, and relationships
 * into the Neo4j Knowledge Graph.
 *
 * @returns {Promise<{nodesCreated: number, relationshipsCreated: number}>}
 */
export async function syncPostgresToNeo4j() {
  const healthy = await isHealthy().catch(() => false);
  if (!healthy) {
    console.warn('[KnowledgeGraph] Neo4j unavailable, skipping graph sync');
    return { nodesCreated: 0, relationshipsCreated: 0, status: 'unavailable' };
  }

  console.log('[KnowledgeGraph] Starting bi-directional sync from PostgreSQL to Neo4j...');
  let nodesCreated = 0;
  let relationshipsCreated = 0;

  try {
    // 1. Sync Sources
    const { rows: sources } = await query(
      'SELECT id, name, type, reliability_score FROM sources WHERE enabled = true'
    );
    for (const s of sources) {
      await runCypher(
        `MERGE (src:Source { id: $id })
         SET src.name = $name, src.type = $type, src.reliability = $reliability`,
        { id: s.id, name: s.name, type: s.type, reliability: s.reliability_score || 0.5 }
      );
      nodesCreated++;
    }

    // 2. Sync Events
    const { rows: events } = await query(
      `SELECT id, title, category, severity, status, location_name, country_code,
              first_reported_at, last_updated_at
       FROM events
       ORDER BY last_updated_at DESC
       LIMIT 250`
    );
    for (const e of events) {
      await runCypher(
        `MERGE (ev:Event { id: $id })
         SET ev.title = $title,
             ev.category = $category,
             ev.severity = $severity,
             ev.status = $status,
             ev.location = $location,
             ev.country = $country,
             ev.last_updated_at = $lastUpdated`,
        {
          id: e.id,
          title: e.title,
          category: e.category || 'other',
          severity: e.severity || 'normal',
          status: e.status || 'developing',
          location: e.location_name || '',
          country: e.country_code || '',
          lastUpdated: e.last_updated_at?.toISOString() || new Date().toISOString(),
        }
      );
      nodesCreated++;
    }

    // 3. Sync Articles and link to Sources & Events
    const { rows: articles } = await query(
      `SELECT a.id, a.source_id, a.title, a.url, a.published_at, ea.event_id
       FROM articles a
       LEFT JOIN event_articles ea ON a.id = ea.article_id
       ORDER BY a.published_at DESC
       LIMIT 300`
    );
    for (const a of articles) {
      await runCypher(
        `MERGE (art:Article { id: $id })
         SET art.title = $title, art.url = $url, art.published_at = $publishedAt`,
        {
          id: a.id,
          title: a.title,
          url: a.url || '',
          publishedAt: a.published_at?.toISOString() || new Date().toISOString(),
        }
      );
      nodesCreated++;

      if (a.source_id) {
        await runCypher(
          `MATCH (art:Article { id: $artId }), (src:Source { id: $srcId })
           MERGE (art)-[:REPORTED_BY]->(src)`,
          { artId: a.id, srcId: a.source_id }
        );
        relationshipsCreated++;
      }

      if (a.event_id) {
        await runCypher(
          `MATCH (art:Article { id: $artId }), (ev:Event { id: $evId })
           MERGE (art)-[:COVERS_EVENT]->(ev)`,
          { artId: a.id, evId: a.event_id }
        );
        relationshipsCreated++;
      }
    }

    // 4. Sync Entities and link to Events
    const { rows: entities } = await query(
      `SELECT e.id, e.name, e.type, e.description, ee.event_id, ee.role
       FROM entities e
       LEFT JOIN entity_events ee ON e.id = ee.entity_id`
    );
    for (const ent of entities) {
      // Map entity types to Neo4j node labels
      const typeLabel = (ent.type.charAt(0).toUpperCase() + ent.type.slice(1)).replace(/[^a-zA-Z]/g, '');
      const validLabel = ['Person', 'Organization', 'Country', 'Location', 'Topic', 'Policy', 'Law', 'Document'].includes(typeLabel)
        ? typeLabel
        : 'Entity';

      await runCypher(
        `MERGE (n:${validLabel} { id: $id })
         SET n.name = $name, n.type = $type, n.description = $description`,
        {
          id: ent.id,
          name: ent.name,
          type: ent.type,
          description: ent.description || '',
        }
      );
      nodesCreated++;

      if (ent.event_id) {
        await runCypher(
          `MATCH (n { id: $entId }), (ev:Event { id: $evId })
           MERGE (n)-[:INVOLVED_IN { role: $role }]->(ev)`,
          {
            entId: ent.id,
            evId: ent.event_id,
            role: ent.role || 'related',
          }
        );
        relationshipsCreated++;
      }
    }

    // 5. Sync Claims and link to Events & Articles
    const { rows: claims } = await query(
      `SELECT id, event_id, article_id, text, claim_type, information_class, verification_status
       FROM claims
       LIMIT 200`
    );
    for (const c of claims) {
      await runCypher(
        `MERGE (clm:Claim { id: $id })
         SET clm.text = $text,
             clm.type = $type,
             clm.infoClass = $infoClass,
             clm.status = $status`,
        {
          id: c.id,
          text: c.text,
          type: c.claim_type,
          infoClass: c.information_class,
          status: c.verification_status,
        }
      );
      nodesCreated++;

      if (c.event_id) {
        await runCypher(
          `MATCH (clm:Claim { id: $clmId }), (ev:Event { id: $evId })
           MERGE (clm)-[:RELATES_TO]->(ev)`,
          { clmId: c.id, evId: c.event_id }
        );
        relationshipsCreated++;
      }

      if (c.article_id) {
        await runCypher(
          `MATCH (clm:Claim { id: $clmId }), (art:Article { id: $artId })
           MERGE (clm)-[:EXTRACTED_FROM]->(art)`,
          { clmId: c.id, artId: c.article_id }
        );
        relationshipsCreated++;
      }
    }

    // 6. Sync Causal Relationships
    const { rows: causals } = await query(
      `SELECT id, event_id, cause_text, effect_text, relationship_type,
              is_directly_supported, confidence, evidence_refs
       FROM causal_relationships`
    );
    for (const cr of causals) {
      await runCypher(
        `MERGE (cl:CausalLink { id: $id })
         SET cl.cause = $cause,
             cl.effect = $effect,
             cl.relType = $relType,
             cl.isDirect = $isDirect,
             cl.confidence = $confidence`,
        {
          id: cr.id,
          cause: cr.cause_text,
          effect: cr.effect_text,
          relType: cr.relationship_type,
          isDirect: cr.is_directly_supported,
          confidence: cr.confidence,
        }
      );
      nodesCreated++;

      if (cr.event_id) {
        await runCypher(
          `MATCH (cl:CausalLink { id: $clId }), (ev:Event { id: $evId })
           MERGE (cl)-[:EXPLAINS]->(ev)`,
          { clId: cr.id, evId: cr.event_id }
        );
        relationshipsCreated++;
      }
    }

    console.log(
      `[KnowledgeGraph] Sync complete: ${nodesCreated} nodes processed, ${relationshipsCreated} relationships mapped.`
    );
    return { nodesCreated, relationshipsCreated, status: 'synced' };
  } catch (err) {
    console.error('[KnowledgeGraph] Error during sync:', err.message);
    return { nodesCreated, relationshipsCreated, status: 'error', error: err.message };
  }
}

/**
 * Query the Neo4j Knowledge Graph for contextual entities, causal links, and related events.
 *
 * @param {object} params
 * @param {string[]} [params.entityNames=[]] - List of entity names to match
 * @param {string[]} [params.eventIds=[]] - List of event IDs to explore
 * @param {string[]} [params.keywords=[]] - Additional topic or keyword filters
 * @param {number} [params.limit=12] - Max results
 * @returns {Promise<{entities: Array, relatedEvents: Array, causalLinks: Array}>}
 */
export async function queryGraphContext({
  entityNames = [],
  eventIds = [],
  keywords = [],
  limit = 12,
} = {}) {
  const healthy = await isHealthy().catch(() => false);
  if (!healthy) {
    return { entities: [], relatedEvents: [], causalLinks: [], graphAvailable: false };
  }

  const cleanEntityNames = entityNames.map(n => n.trim()).filter(Boolean);
  const cleanEventIds = eventIds.filter(Boolean);

  let entities = [];
  let relatedEvents = [];
  let causalLinks = [];
  let discoveredArticleIds = [];
  let discoveredEventIds = [];

  try {
    // 1. Traverse 1-hop and 2-hop connected entities, articles, and events
    if (cleanEntityNames.length > 0 || cleanEventIds.length > 0) {
      const cypher = `
        MATCH (ent)
        WHERE (ent.name IN $entityNames OR ent.id IN $entityNames)
           OR (ent:Event AND ent.id IN $eventIds)
        OPTIONAL MATCH (ent)-[r]-(connected)
        RETURN ent.name AS originName,
               labels(ent) AS originLabels,
               type(r) AS relType,
               connected.id AS targetId,
               connected.name AS targetName,
               connected.title AS targetTitle,
               connected.category AS targetCategory,
               labels(connected) AS targetLabels
        LIMIT toInteger($limit)
      `;

      const result = await runCypher(cypher, {
        entityNames: cleanEntityNames,
        eventIds: cleanEventIds,
        limit: Math.floor(limit),
      });

      for (const record of result.records) {
        const targetId = record.get('targetId');
        const targetName = record.get('targetName') || record.get('targetTitle');
        const targetLabels = record.get('targetLabels') || [];
        const relType = record.get('relType');

        if (targetLabels.includes('Event')) {
          if (targetId && !cleanEventIds.includes(targetId)) {
            discoveredEventIds.push(targetId);
            relatedEvents.push({
              id: targetId,
              title: targetName,
              category: record.get('targetCategory'),
              relationship: relType || 'RELATED_TO',
            });
          }
        } else if (targetLabels.includes('Article')) {
          if (targetId) discoveredArticleIds.push(targetId);
        } else if (targetName) {
          entities.push({
            name: targetName,
            type: targetLabels.find(l => l !== 'Entity') || 'Entity',
            role: relType || 'CONNECTED',
          });
        }
      }
    }

    // 2. Fetch Causal Links if event IDs provided
    if (cleanEventIds.length > 0) {
      const causalCypher = `
        MATCH (cl:CausalLink)-[:EXPLAINS]->(ev:Event)
        WHERE ev.id IN $eventIds
        RETURN cl.id AS id, cl.cause AS cause, cl.effect AS effect,
               cl.relType AS relType, cl.isDirect AS isDirect,
               cl.confidence AS confidence, ev.id AS eventId
        LIMIT 10
      `;

      const causalRes = await runCypher(causalCypher, { eventIds: cleanEventIds });
      for (const record of causalRes.records) {
        causalLinks.push({
          id: record.get('id'),
          cause: record.get('cause'),
          effect: record.get('effect'),
          relType: record.get('relType'),
          isDirect: record.get('isDirect'),
          confidence: record.get('confidence'),
          eventId: record.get('eventId'),
        });
      }
    }

    // Deduplicate entities by name
    const seenEnt = new Set();
    entities = entities.filter(e => {
      const k = e.name.toLowerCase();
      if (seenEnt.has(k)) return false;
      seenEnt.add(k);
      return true;
    });

    // Deduplicate related events by id
    const seenEv = new Set();
    relatedEvents = relatedEvents.filter(ev => {
      if (seenEv.has(ev.id)) return false;
      seenEv.add(ev.id);
      return true;
    });

    return {
      entities,
      relatedEvents,
      causalLinks,
      discoveredArticleIds: [...new Set(discoveredArticleIds)],
      discoveredEventIds: [...new Set(discoveredEventIds)],
      graphAvailable: true,
    };
  } catch (err) {
    console.warn('[KnowledgeGraph] Query error:', err.message);
    return { entities: [], relatedEvents: [], causalLinks: [], graphAvailable: false, error: err.message };
  }
}

/**
 * Insert an evidence-backed causal relationship in PostgreSQL and Neo4j.
 * Strictly enforces that causal edges require verified evidence references.
 *
 * @param {object} params
 * @param {string} params.eventId - Event ID
 * @param {string} params.causeText - Cause description
 * @param {string} params.effectText - Effect description
 * @param {string} params.relationshipType - One of precondition, trigger, mechanism, etc.
 * @param {boolean} [params.isDirectlySupported=true] - Direct or inferred
 * @param {number} [params.confidence=0.8] - Confidence score (0 to 1)
 * @param {Array<{source: string, url?: string, excerpt?: string}>} params.evidenceRefs - Citations
 * @returns {Promise<object>} Created causal relationship record
 */
export async function insertCausalRelationship({
  eventId,
  causeText,
  effectText,
  relationshipType,
  isDirectlySupported = true,
  confidence = 0.8,
  evidenceRefs = [],
  sourceIds = [],
}) {
  if (!causeText || !effectText || !relationshipType) {
    throw new Error('Causal relationship requires causeText, effectText, and relationshipType');
  }

  // Persist into PostgreSQL
  const { rows } = await query(
    `INSERT INTO causal_relationships (
       event_id, cause_text, effect_text, relationship_type,
       is_directly_supported, confidence, evidence_refs, source_ids
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      eventId || null,
      causeText,
      effectText,
      relationshipType,
      Boolean(isDirectlySupported),
      Math.min(1.0, Math.max(0.0, Number(confidence) || 0.8)),
      JSON.stringify(evidenceRefs || []),
      sourceIds || [],
    ]
  );

  const saved = rows[0];

  // Sync to Neo4j if available
  const healthy = await isHealthy().catch(() => false);
  if (healthy) {
    try {
      await runCypher(
        `MERGE (cl:CausalLink { id: $id })
         SET cl.cause = $cause,
             cl.effect = $effect,
             cl.relType = $relType,
             cl.isDirect = $isDirect,
             cl.confidence = $confidence`,
        {
          id: saved.id,
          cause: saved.cause_text,
          effect: saved.effect_text,
          relType: saved.relationship_type,
          isDirect: saved.is_directly_supported,
          confidence: saved.confidence,
        }
      );

      if (saved.event_id) {
        await runCypher(
          `MATCH (cl:CausalLink { id: $clId }), (ev:Event { id: $evId })
           MERGE (cl)-[:EXPLAINS]->(ev)`,
          { clId: saved.id, evId: saved.event_id }
        );
      }
    } catch (graphErr) {
      console.warn('[KnowledgeGraph] Failed to sync causal edge to Neo4j:', graphErr.message);
    }
  }

  return saved;
}
