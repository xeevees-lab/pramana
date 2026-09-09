import { processResearchQuery } from '../services/research/askEngine.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

/**
 * Deterministically generate a clean, concise conversation title from the initial query.
 * Avoids unnecessary LLM latency while eliminating boilerplate question phrasing.
 *
 * @param {string} rawQuery
 * @returns {string} Clean title (max 45 chars)
 */
export function generateConversationTitle(rawQuery = '') {
  if (!rawQuery || typeof rawQuery !== 'string') return 'New Research Chat';
  let clean = rawQuery.trim()
    .replace(/^(what happened with|what is happening with|what happened in|what caused|why did|how did|tell me about|is there any|is there|can you explain|what are the|what is the)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[?!.]+$/, '')
    .trim();
  if (!clean) clean = rawQuery.trim();
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  return clean.slice(0, 45);
}

/**
 * Ask, Fact Check, and Conversation History research routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function askRoutes(app) {
  /**
   * GET /api/ask/conversations
   * Lists the authenticated user's research conversations in chronological order.
   */
  app.get('/ask/conversations', { preHandler: [requireAuth] }, async (request, reply) => {
    try {
      const { rows } = await query(
        `SELECT id, title, mode, topic_context, created_at, updated_at
         FROM conversations
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT 60`,
        [request.user.id]
      );
      return { conversations: rows };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Database Error',
        message: 'Unable to retrieve research conversations.',
      });
    }
  });

  /**
   * GET /api/ask/conversations/:id
   * Fetches a conversation thread with its messages.
   * Enforces strict authorization: conversation.user_id === authenticated_user.id.
   */
  app.get('/ask/conversations/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    try {
      const { rows: convRows } = await query(
        `SELECT id, user_id, title, mode, topic_context, created_at, updated_at
         FROM conversations
         WHERE id = $1 AND user_id = $2`,
        [id, request.user.id]
      );

      if (convRows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Conversation not found or access denied.',
        });
      }

      const { rows: msgRows } = await query(
        `SELECT id, role, content, structured_data, created_at
         FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [id]
      );

      return {
        conversation: convRows[0],
        messages: msgRows,
      };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Database Error',
        message: 'Unable to retrieve conversation messages.',
      });
    }
  });

  /**
   * POST /api/ask/conversations
   * Creates a new conversation session for the authenticated user.
   */
  app.post('/ask/conversations', { preHandler: [requireAuth] }, async (request, reply) => {
    const { title, mode = 'ask', topic_context = {} } = request.body || {};
    const safeTitle = (title || '').trim() || 'New Research Chat';

    try {
      const { rows } = await query(
        `INSERT INTO conversations (user_id, title, mode, topic_context, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, user_id, title, mode, topic_context, created_at, updated_at`,
        [request.user.id, safeTitle, mode, JSON.stringify(topic_context)]
      );

      return reply.status(201).send(rows[0]);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Database Error',
        message: 'Unable to initialize research conversation.',
      });
    }
  });

  /**
   * DELETE /api/ask/conversations/:id
   * Deletes a conversation session, strictly verifying user ownership.
   */
  app.delete('/ask/conversations/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    try {
      const { rows } = await query(
        `DELETE FROM conversations
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, request.user.id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Conversation not found or access denied.',
        });
      }

      return { success: true, deletedId: id };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Database Error',
        message: 'Unable to delete conversation.',
      });
    }
  });

  /**
   * POST /api/ask/query
   * Unified conversational research endpoint supporting text, topic, URLs, and video URLs.
   * Seamlessly persists conversation history and referent context when authenticated.
   */
  app.post('/ask/query', { preHandler: [optionalAuth] }, async (request, reply) => {
    const {
      query: userQuery,
      mode = 'ask',
      conversationHistory = [],
      conversationId: clientConvId,
      url,
    } = request.body || {};

    if (!userQuery && !url) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'A query or URL must be provided.',
      });
    }

    try {
      let activeConversationId = clientConvId || null;
      let activeTopicContext = {};

      // If user is authenticated, resolve or create conversation session
      if (request.user?.id) {
        if (activeConversationId) {
          const { rows: verifyRows } = await query(
            `SELECT id, title, topic_context FROM conversations WHERE id = $1 AND user_id = $2`,
            [activeConversationId, request.user.id]
          );
          if (verifyRows.length === 0) {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Target conversation not found or access denied.',
            });
          }
          activeTopicContext = verifyRows[0].topic_context || {};
        } else {
          // Auto-create new conversation with deterministic title
          const initialTitle = generateConversationTitle(userQuery || url || 'Research Query');
          const { rows: newConvRows } = await query(
            `INSERT INTO conversations (user_id, title, mode, topic_context, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id, title, topic_context`,
            [request.user.id, initialTitle, mode, JSON.stringify({})]
          );
          activeConversationId = newConvRows[0].id;
        }

        // Persist user question
        await query(
          `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
           VALUES ($1, 'user', $2, NOW())`,
          [activeConversationId, userQuery || url || '']
        );
      }

      // Execute unified research engine
      const result = await processResearchQuery({
        query: userQuery,
        mode,
        conversationHistory,
        url,
        userId: request.user?.id || null,
        topicContext: activeTopicContext,
      });

      // If authenticated, persist assistant response and update conversation state
      if (activeConversationId && request.user?.id) {
        await query(
          `INSERT INTO conversation_messages (conversation_id, role, content, structured_data, created_at)
           VALUES ($1, 'assistant', $2, $3, NOW())`,
          [
            activeConversationId,
            result.answer || result.executiveSummary || '',
            JSON.stringify(result),
          ]
        );

        // Update topic context with newly discovered entities and primary topic
        const updatedContext = {
          ...activeTopicContext,
          lastQuery: userQuery || '',
          entities: (result.entities || []).slice(0, 10),
          eventFamilyIds: (result.eventFamily || []).map(e => e.id),
          primaryEventId: result.events?.[0]?.id || null,
        };

        await query(
          `UPDATE conversations
           SET updated_at = NOW(), topic_context = $1
           WHERE id = $2`,
          [JSON.stringify(updatedContext), activeConversationId]
        );
      }

      return {
        ...result,
        conversationId: activeConversationId,
      };
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
