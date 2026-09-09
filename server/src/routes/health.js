import { isHealthy as isDbHealthy } from '../db/pool.js';
import { isHealthy as isNeo4jHealthy } from '../db/neo4j.js';
import config from '../config/index.js';

/**
 * Health and readiness routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function healthRoutes(app) {
  // Basic liveness probe
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  });

  // Detailed readiness probe — checks all dependencies
  app.get('/health/ready', async (request, reply) => {
    const checks = {};

    // PostgreSQL
    try {
      checks.postgres = await isDbHealthy() ? 'ok' : 'unavailable';
    } catch {
      checks.postgres = 'unavailable';
    }

    // Neo4j
    try {
      checks.neo4j = await isNeo4jHealthy() ? 'ok' : 'unavailable';
    } catch {
      checks.neo4j = 'unavailable';
    }

    // Firebase (config presence only — actual connection tested on first auth)
    checks.firebase = config.firebase.projectId ? 'configured' : 'not_configured';

    // Gemini (config presence only)
    checks.gemini = config.gemini.apiKey ? 'configured' : 'not_configured';

    const allOk = checks.postgres === 'ok' && checks.neo4j === 'ok';

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
