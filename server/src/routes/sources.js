import { query } from '../db/pool.js';
import { triggerManualIngestion } from '../services/ingestion/scheduler.js';

/**
 * Sources management and ingestion trigger routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function sourcesRoutes(app) {
  /**
   * GET /api/sources
   * List all news sources with article counts and status.
   */
  app.get('/sources', async (request, reply) => {
    const { rows } = await query(`
      SELECT
        s.id,
        s.name,
        s.type,
        s.url,
        s.enabled,
        s.reliability_score,
        s.last_fetched_at,
        s.config,
        s.created_at,
        COUNT(a.id)::int AS article_count
      FROM sources s
      LEFT JOIN articles a ON s.id = a.source_id
      GROUP BY s.id
      ORDER BY s.name ASC
    `);

    return { sources: rows };
  });

  /**
   * POST /api/sources
   * Add a new custom news source (e.g. custom RSS feed).
   */
  app.post('/sources', async (request, reply) => {
    const { name, type, url, reliability_score = 0.5, enabled = true, config = {} } = request.body || {};

    if (!name || !type) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Name and type are required',
      });
    }

    if (type === 'rss' && !url) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'URL is required for RSS source',
      });
    }

    const { rows } = await query(
      `INSERT INTO sources (name, type, url, reliability_score, enabled, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, type, url || null, reliability_score, enabled, JSON.stringify(config)]
    );

    return reply.status(201).send({ source: rows[0] });
  });

  /**
   * PATCH /api/sources/:id
   * Update an existing source (toggle enabled, change reliability score).
   */
  app.patch('/sources/:id', async (request, reply) => {
    const { id } = request.params;
    const { enabled, reliability_score, url, name, config } = request.body || {};

    const updates = [];
    const values = [];
    let idx = 1;

    if (enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      values.push(enabled);
    }
    if (reliability_score !== undefined) {
      updates.push(`reliability_score = $${idx++}`);
      values.push(reliability_score);
    }
    if (url !== undefined) {
      updates.push(`url = $${idx++}`);
      values.push(url);
    }
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (config !== undefined) {
      updates.push(`config = $${idx++}`);
      values.push(JSON.stringify(config));
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE sources SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    return { source: rows[0] };
  });

  /**
   * DELETE /api/sources/:id
   * Remove a source.
   */
  app.delete('/sources/:id', async (request, reply) => {
    const { id } = request.params;
    const { rowCount } = await query('DELETE FROM sources WHERE id = $1', [id]);

    if (rowCount === 0) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    return { message: 'Source deleted successfully' };
  });

  /**
   * POST /api/sources/:id/fetch
   * Trigger immediate ingestion for a specific source.
   */
  app.post('/sources/:id/fetch', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await triggerManualIngestion(id);
      return { status: 'success', result };
    } catch (err) {
      return reply.status(500).send({
        error: 'Ingestion Error',
        message: err.message,
      });
    }
  });

  /**
   * POST /api/sources/fetch-all
   * Trigger immediate ingestion across all enabled sources.
   */
  app.post('/sources/fetch-all', async (request, reply) => {
    try {
      const result = await triggerManualIngestion(null);
      return { status: 'success', result };
    } catch (err) {
      return reply.status(500).send({
        error: 'Ingestion Error',
        message: err.message,
      });
    }
  });
}
