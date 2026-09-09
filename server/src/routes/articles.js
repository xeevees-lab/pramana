import { query } from '../db/pool.js';

/**
 * Articles query routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function articlesRoutes(app) {
  /**
   * GET /api/articles
   * List articles with pagination, source filter, and search.
   */
  app.get('/articles', async (request) => {
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { source_id, event_id, q } = request.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (source_id) {
      conditions.push(`a.source_id = $${idx++}`);
      values.push(source_id);
    }

    if (event_id) {
      conditions.push(`EXISTS (SELECT 1 FROM event_articles ea WHERE ea.article_id = a.id AND ea.event_id = $${idx++})`);
      values.push(event_id);
    }

    if (q && q.trim()) {
      conditions.push(`(a.title ILIKE $${idx} OR a.summary ILIKE $${idx})`);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM articles a ${whereClause}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;

    // Fetch page
    values.push(limit, offset);
    const { rows: articles } = await query(
      `SELECT
         a.id,
         a.source_id,
         s.name AS source_name,
         s.reliability_score AS source_reliability,
         a.external_id,
         a.url,
         a.title,
         a.summary,
         a.author,
         a.published_at,
         a.fetched_at,
         a.image_url,
         a.image_attribution,
         a.language,
         ea.event_id
       FROM articles a
       LEFT JOIN sources s ON a.source_id = s.id
       LEFT JOIN event_articles ea ON a.id = ea.article_id
       ${whereClause}
       ORDER BY a.published_at DESC NULLS LAST, a.fetched_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    return {
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  /**
   * GET /api/articles/:id
   * Get single article details with claims and linked events.
   */
  app.get('/articles/:id', async (request, reply) => {
    const { id } = request.params;

    const { rows: articles } = await query(
      `SELECT
         a.id,
         a.source_id,
         s.name AS source_name,
         s.reliability_score AS source_reliability,
         s.url AS source_url,
         a.external_id,
         a.url,
         a.title,
         a.content,
         a.summary,
         a.author,
         a.published_at,
         a.fetched_at,
         a.image_url,
         a.image_attribution,
         a.language,
         a.content_hash
       FROM articles a
       LEFT JOIN sources s ON a.source_id = s.id
       WHERE a.id = $1`,
      [id]
    );

    if (articles.length === 0) {
      return reply.status(404).send({ error: 'Article not found' });
    }

    const article = articles[0];

    // Linked events
    const { rows: events } = await query(
      `SELECT e.id, e.title, e.category, e.severity, e.status, ea.relevance_score
       FROM events e
       JOIN event_articles ea ON e.id = ea.event_id
       WHERE ea.article_id = $1`,
      [id]
    );

    // Linked claims
    const { rows: claims } = await query(
      `SELECT id, text, claim_type, information_class, verification_status, extracted_at
       FROM claims
       WHERE article_id = $1
       ORDER BY extracted_at DESC`,
      [id]
    );

    return {
      article,
      events,
      claims,
    };
  });
}
