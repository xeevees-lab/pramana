import { query } from '../db/pool.js';
import { assembleEventReport } from '../services/intelligence/eventReport.js';

/**
 * Events and intelligence query routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function eventsRoutes(app) {
  /**
   * GET /api/events
   * List news events with filters, search, and pagination.
   */
  app.get('/events', async (request) => {
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { category, severity, status, q } = request.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }
    if (severity) {
      conditions.push(`severity = $${idx++}`);
      values.push(severity);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }
    if (q && q.trim()) {
      conditions.push(`(title ILIKE $${idx} OR summary ILIKE $${idx})`);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM events ${whereClause}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;

    // Fetch events
    values.push(limit, offset);
    const { rows: events } = await query(
      `SELECT
         id,
         title,
         summary,
         category,
         severity,
         status,
         location_name,
         country_code,
         image_url,
         image_attribution,
         article_count,
         source_count,
         first_reported_at,
         last_updated_at,
         created_at
       FROM events
       ${whereClause}
       ORDER BY last_updated_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  /**
   * GET /api/events/stats
   * Get real-time key metrics across events, sources, articles, and claims.
   */
  app.get('/events/stats', async () => {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM events) AS total_events,
        (SELECT COUNT(*)::int FROM events WHERE status IN ('active', 'developing')) AS active_events,
        (SELECT COUNT(*)::int FROM sources WHERE enabled = true) AS sources_analyzed,
        (SELECT COUNT(*)::int FROM articles) AS articles_analyzed,
        (SELECT COUNT(*)::int FROM claims) AS claims_tracked,
        (SELECT COUNT(*)::int FROM claims WHERE verification_status = 'VERIFIED') AS verified_claims
    `);

    const stats = rows[0] || {
      total_events: 0,
      active_events: 0,
      sources_analyzed: 0,
      articles_analyzed: 0,
      claims_tracked: 0,
      verified_claims: 0,
    };

    return { stats };
  });

  /**
   * GET /api/events/live
   * Get latest live feed updates.
   */
  app.get('/events/live', async (request) => {
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit, 10) || 25));

    const { rows: entries } = await query(
      `SELECT
         le.id,
         le.event_id,
         le.entry_type,
         le.title,
         le.description,
         le.metadata,
         le.created_at,
         e.title AS event_title,
         e.category AS event_category,
         e.severity AS event_severity
       FROM live_entries le
       LEFT JOIN events e ON le.event_id = e.id
       ORDER BY le.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return { entries };
  });

  /**
   * GET /api/events/:id
   * Get complete event dossier with linked articles, claims, entities, and narratives.
   */
  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params;

    const { rows: events } = await query(
      `SELECT
         id,
         title,
         summary,
         category,
         severity,
         status,
         location_name,
         country_code,
         lat,
         lng,
         image_url,
         image_attribution,
         article_count,
         source_count,
         first_reported_at,
         last_updated_at,
         generated_summary,
         generated_article,
         created_at
       FROM events
       WHERE id = $1`,
      [id]
    );

    if (events.length === 0) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const event = events[0];

    // Parallel fetch related data
    const [articlesRes, claimsRes, entitiesRes, narrativesRes, forecastsRes, relatedEventsRes] = await Promise.all([
      query(
        `SELECT
           a.id,
           a.title,
           a.url,
           a.summary,
           a.author,
           a.published_at,
           a.image_url,
           s.name AS source_name,
           s.reliability_score AS source_reliability,
           ea.relevance_score
         FROM event_articles ea
         JOIN articles a ON ea.article_id = a.id
         LEFT JOIN sources s ON a.source_id = s.id
         WHERE ea.event_id = $1
         ORDER BY a.published_at DESC`,
        [id]
      ),
      query(
        `SELECT
           c.id,
           c.text,
           c.claim_type,
           c.information_class,
           c.verification_status,
           c.extracted_at,
           COUNT(e.id)::int AS evidence_count
         FROM claims c
         LEFT JOIN evidence e ON c.id = e.claim_id
         WHERE c.event_id = $1
         GROUP BY c.id
         ORDER BY c.extracted_at DESC`,
        [id]
      ),
      query(
        `SELECT
           ent.id,
           ent.name,
           ent.type,
           ent.description,
           ee.role
         FROM entity_events ee
         JOIN entities ent ON ee.entity_id = ent.id
         WHERE ee.event_id = $1
         ORDER BY ent.name ASC`,
        [id]
      ),
      query(
        `SELECT
           id, title, description, platform, share_pct, momentum, updated_at
         FROM narratives
         WHERE event_id = $1
         ORDER BY share_pct DESC NULLS LAST`,
        [id]
      ),
      query(
        `SELECT
           id, outcome_description, probability, uncertainty_lower, uncertainty_upper,
           time_horizon, model_version, predicted_at, resolved, actual_outcome
         FROM forecasts
         WHERE event_id = $1
         ORDER BY predicted_at DESC`,
        [id]
      ),
      query(
        `SELECT id, title, summary, category, severity, status, image_url, last_updated_at
         FROM events
         WHERE id != $1 AND (category = $2 OR (country_code IS NOT NULL AND country_code = $3))
         ORDER BY last_updated_at DESC
         LIMIT 4`,
        [id, event.category, event.country_code || '']
      ),
    ]);

    const report = await assembleEventReport(
      event,
      articlesRes.rows,
      claimsRes.rows,
      entitiesRes.rows,
      narrativesRes.rows,
      forecastsRes.rows,
      relatedEventsRes.rows
    );

    return {
      event,
      articles: articlesRes.rows,
      claims: claimsRes.rows,
      entities: entitiesRes.rows,
      narratives: narrativesRes.rows,
      forecasts: forecastsRes.rows,
      relatedEvents: relatedEventsRes.rows,
      report,
    };
  });
}
