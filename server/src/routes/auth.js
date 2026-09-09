import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { deleteFirebaseUser } from '../plugins/firebase.js';

/**
 * Authentication routes.
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
   * DELETE /api/auth/account
   * Delete user account — removes from database and Firebase.
   */
  app.delete('/auth/account', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const user = request.user;

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
