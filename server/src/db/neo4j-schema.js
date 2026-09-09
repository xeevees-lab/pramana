import { runCypher } from './neo4j.js';

/**
 * Set up Neo4j constraints and indexes for the knowledge graph.
 * Safe to run multiple times — CREATE ... IF NOT EXISTS.
 */
export async function setupNeo4jSchema() {
  const constraints = [
    // Uniqueness constraints (also create indexes)
    'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT org_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT country_id IF NOT EXISTS FOR (n:Country) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT location_id IF NOT EXISTS FOR (n:Location) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT event_id IF NOT EXISTS FOR (n:Event) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT article_id IF NOT EXISTS FOR (n:Article) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT claim_id IF NOT EXISTS FOR (n:Claim) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT source_id IF NOT EXISTS FOR (n:Source) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (n:Topic) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT narrative_id IF NOT EXISTS FOR (n:Narrative) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT policy_id IF NOT EXISTS FOR (n:Policy) REQUIRE n.id IS UNIQUE',
  ];

  const indexes = [
    // Text indexes for search
    'CREATE INDEX person_name IF NOT EXISTS FOR (n:Person) ON (n.name)',
    'CREATE INDEX org_name IF NOT EXISTS FOR (n:Organization) ON (n.name)',
    'CREATE INDEX country_name IF NOT EXISTS FOR (n:Country) ON (n.name)',
    'CREATE INDEX country_code IF NOT EXISTS FOR (n:Country) ON (n.code)',
    'CREATE INDEX location_name IF NOT EXISTS FOR (n:Location) ON (n.name)',
    'CREATE INDEX event_title IF NOT EXISTS FOR (n:Event) ON (n.title)',
    'CREATE INDEX event_category IF NOT EXISTS FOR (n:Event) ON (n.category)',
    'CREATE INDEX topic_name IF NOT EXISTS FOR (n:Topic) ON (n.name)',
    'CREATE INDEX claim_status IF NOT EXISTS FOR (n:Claim) ON (n.status)',
  ];

  let created = 0;

  for (const cypher of [...constraints, ...indexes]) {
    try {
      await runCypher(cypher);
      created++;
    } catch (err) {
      // Log but don't fail — constraint may already exist in older Neo4j versions
      console.warn(`[Neo4j Schema] Warning on: ${cypher.substring(0, 60)}...`, err.message);
    }
  }

  console.log(`[Neo4j Schema] Applied ${created} constraints/indexes`);
  return created;
}
