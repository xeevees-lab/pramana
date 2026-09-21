import { getIdToken } from './firebase.js';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api';

/**
 * Make an authenticated API request.
 * Automatically attaches Bearer token if user is logged in.
 */
async function apiFetch(path, options = {}) {
  const token = await getIdToken();

  const headers = {
    ...options.headers,
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Guard against indefinite request hanging with a default 15s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, data = {}) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data = {}) => apiFetch(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data = {}) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path, data) => apiFetch(path, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined }),
};
