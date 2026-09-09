import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { deleteFirebaseUser } from '../plugins/firebase.js';
import config from '../config/index.js';

/**
 * Authentication & Account Management routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function authRoutes(app) {
  /**
   * POST /api/auth/session
   * Client sends Firebase ID token after Google sign-in.
   * Server verifies it and returns the user profile.
   */
  app.post('/auth/session', {
    preHandler: [requireAuth],
  }, async (request) => {
    return {
      user: request.user,
    };
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user profile.
   */
  app.get('/auth/me', {
    preHandler: [requireAuth],
  }, async (request) => {
    return {
      user: request.user,
    };
  });

  /**
   * PATCH /api/auth/profile
   * Update editable profile fields (display_name, bio, custom_avatar_url).
   * Identity fields (id, email, role, firebase_uid) are immutable.
   */
  app.patch('/auth/profile', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const user = request.user;
    const body = request.body || {};

    let displayName = user.display_name;
    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Display name cannot be empty and must be a valid text string.',
        });
      }
      if (body.display_name.trim().length > 100) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Display name cannot exceed 100 characters.',
        });
      }
      displayName = body.display_name.trim();
    }

    let bio = user.bio;
    if (body.bio !== undefined) {
      if (body.bio !== null && typeof body.bio !== 'string') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Bio must be a string or null.',
        });
      }
      if (typeof body.bio === 'string' && body.bio.length > 500) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Bio cannot exceed 500 characters.',
        });
      }
      bio = typeof body.bio === 'string' ? body.bio.trim() : null;
    }

    let customAvatarUrl = user.custom_avatar_url;
    if (body.custom_avatar_url !== undefined) {
      if (body.custom_avatar_url !== null && typeof body.custom_avatar_url !== 'string') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Custom avatar URL must be a valid string or null.',
        });
      }
      if (typeof body.custom_avatar_url === 'string') {
        const trimmedUrl = body.custom_avatar_url.trim();
        if (trimmedUrl.length > 0 && !/^https?:\/\/.+/i.test(trimmedUrl)) {
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Custom avatar URL must begin with http:// or https://',
          });
        }
        customAvatarUrl = trimmedUrl.length > 0 ? trimmedUrl : null;
      } else {
        customAvatarUrl = null;
      }
    }

    const { rows } = await query(
      `UPDATE users
       SET display_name = $1, bio = $2, custom_avatar_url = $3
       WHERE id = $4
       RETURNING id, firebase_uid, email, display_name, photo_url, custom_avatar_url, bio, role, settings, created_at, last_login_at`,
      [displayName, bio, customAvatarUrl, user.id]
    );

    return {
      user: rows[0],
      message: 'Profile updated successfully',
    };
  });

  /**
   * GET /api/auth/settings
   * Get current user settings and active system AI model capabilities.
   */
  app.get('/auth/settings', {
    preHandler: [requireAuth],
  }, async (request) => {
    return {
      settings: request.user.settings || {},
      system: {
        active_provider: 'gemini',
        gemini_configured: Boolean(config.gemini.apiKey),
        available_models: [
          {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            description: 'Fast, high-throughput model optimized for real-time intelligence clustering and news synthesis',
            is_default: true,
          },
          {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            description: 'Deep reasoning model for detailed forensic fact-checking and multi-source corroboration',
            is_default: false,
          },
        ],
      },
    };
  });

  /**
   * PUT /api/auth/settings
   * Update user settings (AI model, research depth, privacy preferences).
   */
  app.put('/auth/settings', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const user = request.user;
    const incoming = request.body || {};

    const current = user.settings || {};
    const updated = {
      ai: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        ...(current.ai || {}),
        ...(incoming.ai || {}),
      },
      research: {
        research_depth: 'standard',
        response_depth: 'detailed',
        citation_style: 'inline',
        ...(current.research || {}),
        ...(incoming.research || {}),
      },
      privacy: {
        save_search_history: true,
        analytics_opt_in: false,
        ...(current.privacy || {}),
        ...(incoming.privacy || {}),
      },
    };

    // Validations
    if (updated.ai.provider !== 'gemini') {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Unsupported AI provider. Only Google Gemini is currently active.',
      });
    }

    if (!['gemini-2.5-flash', 'gemini-2.5-pro'].includes(updated.ai.model)) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid AI model. Allowed values: gemini-2.5-flash, gemini-2.5-pro.',
      });
    }

    if (typeof updated.ai.temperature !== 'number' || updated.ai.temperature < 0 || updated.ai.temperature > 1) {
      updated.ai.temperature = 0.3;
    }

    if (!['standard', 'deep'].includes(updated.research.research_depth)) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid research depth. Allowed: standard, deep.',
      });
    }

    if (!['concise', 'detailed'].includes(updated.research.response_depth)) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid response depth. Allowed: concise, detailed.',
      });
    }

    if (!['inline', 'footnote'].includes(updated.research.citation_style)) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid citation style. Allowed: inline, footnote.',
      });
    }

    updated.privacy.save_search_history = Boolean(updated.privacy.save_search_history);
    updated.privacy.analytics_opt_in = Boolean(updated.privacy.analytics_opt_in);

    const { rows } = await query(
      `UPDATE users
       SET settings = $1
       WHERE id = $2
       RETURNING settings`,
      [JSON.stringify(updated), user.id]
    );

    return {
      settings: rows[0].settings,
      message: 'Settings saved successfully',
    };
  });

  /**
   * GET /api/auth/stats
   * Get real query-backed account statistics.
   */
  app.get('/auth/stats', {
    preHandler: [requireAuth],
  }, async (request) => {
    const user = request.user;

    const { rows: fcRows } = await query(
      'SELECT COUNT(*)::int AS count FROM fact_checks WHERE user_id = $1',
      [user.id]
    );

    return {
      fact_checks_submitted: fcRows[0]?.count || 0,
      member_since: user.created_at,
      last_active: user.last_login_at,
      account_type: user.role === 'admin' ? 'Administrator' : 'Verified Intelligence Analyst',
      auth_provider: 'Google OAuth 2.0',
    };
  });

  /**
   * DELETE /api/auth/account
   * Delete user account — removes from database and Firebase.
   * Requires explicit confirmation: { confirmation: 'DELETE' }
   */
  app.delete('/auth/account', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const user = request.user;
    const body = request.body || {};

    if (body.confirmation !== 'DELETE') {
      return reply.status(400).send({
        error: 'Confirmation Required',
        message: 'Account deletion requires explicit confirmation. Please provide confirmation: "DELETE".',
      });
    }

    // Delete from database (cascades to fact_checks)
    await query('DELETE FROM users WHERE id = $1', [user.id]);

    // Delete from Firebase
    try {
      await deleteFirebaseUser(user.firebase_uid);
    } catch (err) {
      // User may already be deleted from Firebase — log but don't fail
      request.log.warn(`Failed to delete Firebase user ${user.firebase_uid}: ${err.message}`);
    }

    return reply.status(200).send({
      message: 'Account deleted successfully',
    });
  });
}
