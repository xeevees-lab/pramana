import { verifyIdToken, isInitialized } from '../plugins/firebase.js';
import { query } from '../db/pool.js';

/**
 * Fastify preHandler that verifies Firebase ID tokens.
 * Attaches `request.user` with the database user record.
 *
 * Usage: Add to route options: { preHandler: [requireAuth] }
 */
export async function requireAuth(request, reply) {
  // Check Firebase is configured
  if (!isInitialized()) {
    return reply.status(503).send({
      error: 'Authentication Unavailable',
      message: 'Firebase authentication is not configured. Set FIREBASE_PROJECT_ID in .env.',
    });
  }

  // Extract Bearer token
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header. Expected: Bearer <token>',
    });
  }

  const idToken = authHeader.slice(7);

  // Verify with Firebase
  const decoded = await verifyIdToken(idToken);
  if (!decoded) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token.',
    });
  }

  // Find or create user in database
  const { rows } = await query(
    `INSERT INTO users (firebase_uid, email, display_name, photo_url, last_login_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (firebase_uid)
     DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       photo_url = EXCLUDED.photo_url,
       last_login_at = NOW()
     RETURNING id, firebase_uid, email, display_name, photo_url, role, created_at`,
    [
      decoded.uid,
      decoded.email || '',
      decoded.name || null,
      decoded.picture || null,
    ]
  );

  request.user = rows[0];
}

/**
 * Optional auth — attaches user if token present, but doesn't block if absent.
 */
export async function optionalAuth(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !isInitialized()) {
    request.user = null;
    return;
  }

  const idToken = authHeader.slice(7);
  const decoded = await verifyIdToken(idToken);
  if (!decoded) {
    request.user = null;
    return;
  }

  const { rows } = await query(
    'SELECT id, firebase_uid, email, display_name, photo_url, role, created_at FROM users WHERE firebase_uid = $1',
    [decoded.uid]
  );

  request.user = rows[0] || null;
}
