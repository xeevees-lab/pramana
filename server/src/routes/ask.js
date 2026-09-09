import { processResearchQuery } from '../services/research/askEngine.js';
import { optionalAuth } from '../middleware/auth.js';

/**
 * Ask and Fact Check research routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function askRoutes(app) {
  /**
   * POST /api/ask/query
   * Unified conversational research endpoint supporting text, topic, URLs, and video URLs.
   */
  app.post('/ask/query', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { query: userQuery, mode = 'ask', conversationHistory = [], url } = request.body || {};

    if (!userQuery && !url) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'A query or URL must be provided.',
      });
    }

    try {
      const result = await processResearchQuery({
        query: userQuery,
        mode,
        conversationHistory,
        url,
        userId: request.user?.id || null,
      });

      return result;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Research Engine Error',
        message: err.message || 'An error occurred while processing the research query.',
      });
    }
  });

  /**
   * POST /api/ask/fact-check
   * Specialized fact-checking endpoint that verifies assertions against database evidence.
   */
  app.post('/ask/fact-check', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { query: userQuery, url } = request.body || {};

    if (!userQuery && !url) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Content or a URL to fact-check must be provided.',
      });
    }

    try {
      const result = await processResearchQuery({
        query: userQuery,
        mode: 'fact_check',
        url,
        userId: request.user?.id || null,
      });

      return result;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Fact Check Error',
        message: err.message || 'An error occurred while executing the fact check.',
      });
    }
  });

  /**
   * POST /api/fact-check
   * Compatibility alias for legacy fact check callers.
   */
  app.post('/fact-check', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { content, url } = request.body || {};
    return await processResearchQuery({
      query: content || request.body?.query || '',
      mode: 'fact_check',
      url,
      userId: request.user?.id || null,
    });
  });
}
