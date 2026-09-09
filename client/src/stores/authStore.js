import { create } from 'zustand';
import { onAuthChange, signInWithGoogle, firebaseSignOut, isConfigured, getIdToken } from '../services/firebase.js';
import { api } from '../services/api.js';

function formatAuthError(err) {
  switch (err?.code) {
    case 'auth/configuration-not-found':
      return 'Google Sign-In is not enabled yet in your Firebase project. In the Firebase Console, go to Build → Authentication → "Sign-in method" tab, click "Google", toggle "Enable", select a Project Support Email, and click "Save".';
    case 'auth/unauthorized-domain':
      return 'The current domain (localhost) is not authorized in Firebase. Go to Firebase Console → Authentication → Settings → Authorized domains and ensure "localhost" is listed.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is disabled. Please enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by your browser. Please allow popups for localhost and try again.';
    default:
      return err?.message || 'An error occurred during authentication.';
  }
}

const useAuthStore = create((set, get) => ({
  // State
  user: null,           // Database user object from server
  firebaseUser: null,   // Firebase user object
  loading: true,        // Initial auth state loading
  error: null,
  isConfigured,         // Whether Firebase credentials are set

  // Initialize auth listener
  init: () => {
    return onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        set({ firebaseUser, loading: true, error: null });
        try {
          // Create/verify session on server
          const { user } = await api.post('/auth/session');
          set({ user, loading: false });
        } catch (err) {
          console.error('Session creation failed:', err);
          set({ user: null, loading: false, error: err.message });
        }
      } else {
        set({ user: null, firebaseUser: null, loading: false, error: null });
      }
    });
  },

  // Sign in with Google
  signIn: async () => {
    set({ loading: true, error: null });
    try {
      await signInWithGoogle();
      // onAuthChange callback will handle the rest
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        set({ loading: false });
      } else {
        set({ error: formatAuthError(err), loading: false });
      }
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await firebaseSignOut();
      set({ user: null, firebaseUser: null, error: null });
    } catch (err) {
      set({ error: err.message });
    }
  },

  // Update profile
  updateProfile: async (data) => {
    const res = await api.patch('/auth/profile', data);
    if (res?.user) {
      set({ user: res.user });
    }
    return res.user;
  },

  // Fetch settings & system status
  fetchSettings: async () => {
    const res = await api.get('/auth/settings');
    if (res?.settings) {
      set((state) => ({
        user: state.user ? { ...state.user, settings: res.settings } : null,
      }));
    }
    return res;
  },

  // Update settings
  updateSettings: async (settingsData) => {
    const res = await api.put('/auth/settings', settingsData);
    if (res?.settings) {
      set((state) => ({
        user: state.user ? { ...state.user, settings: res.settings } : null,
      }));
    }
    return res.settings;
  },

  // Fetch real account stats
  fetchStats: async () => {
    return api.get('/auth/stats');
  },

  // Delete account (requires explicit confirmation)
  deleteAccount: async () => {
    try {
      await api.delete('/auth/account', { confirmation: 'DELETE' });
      await firebaseSignOut();
      set({ user: null, firebaseUser: null, error: null });
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  // Continue as guest for public intelligence exploration
  continueAsGuest: () => {
    set({
      user: {
        id: 'guest',
        display_name: 'Guest Reader',
        email: 'guest@pramana.local',
        role: 'guest',
        bio: 'Visiting analyst in guest preview mode.',
        settings: {
          ai: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
          research: { research_depth: 'standard', response_depth: 'detailed', citation_style: 'inline' },
          privacy: { save_search_history: false, analytics_opt_in: false },
        },
      },
      loading: false,
      error: null,
    });
  },
}));

export default useAuthStore;
