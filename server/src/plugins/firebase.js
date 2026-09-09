import admin from 'firebase-admin';
import config from '../config/index.js';

let initialized = false;

/**
 * Initialize Firebase Admin SDK.
 * Returns false if credentials are not configured.
 */
export function initFirebase() {
  if (initialized) return true;

  if (!config.firebase.projectId) {
    console.warn('[Firebase] Not configured — FIREBASE_PROJECT_ID missing');
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
    initialized = true;
    console.log('[Firebase] Admin SDK initialized');
    return true;
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Verify a Firebase ID token.
 * @param {string} idToken - Firebase ID token from client
 * @returns {Promise<admin.auth.DecodedIdToken|null>}
 */
export async function verifyIdToken(idToken) {
  if (!initialized) {
    throw new Error('Firebase not initialized');
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Delete a Firebase user account.
 * @param {string} uid - Firebase UID
 */
export async function deleteFirebaseUser(uid) {
  if (!initialized) {
    throw new Error('Firebase not initialized');
  }
  await admin.auth().deleteUser(uid);
}

export function isInitialized() {
  return initialized;
}
