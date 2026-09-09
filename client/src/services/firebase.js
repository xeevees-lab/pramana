import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
let auth = null;
let provider = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
}

/**
 * Sign in with Google popup.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithGoogle() {
  if (!auth || !provider) {
    throw new Error('Firebase not configured');
  }
  return signInWithPopup(auth, provider);
}

/**
 * Sign out.
 */
export async function firebaseSignOut() {
  if (!auth) return;
  return signOut(auth);
}

/**
 * Get the current user's ID token for server auth.
 * @returns {Promise<string|null>}
 */
export async function getIdToken() {
  if (!auth || !auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function onAuthChange(callback) {
  if (!auth) {
    // If Firebase is not configured, call with null immediately
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export { isConfigured, auth };
