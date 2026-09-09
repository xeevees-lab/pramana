import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(setHealth)
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Global Intelligence</h1>
      <p className="page-subtitle">
        Real-time news intelligence, verification, and forecasting.
      </p>

      {/* Server connection indicator */}
      {error && (
        <div className="error-state">
          <p className="error-state__title">Server Unavailable</p>
          <p className="error-state__text">
            The backend server is not responding. Start it with <code>npm run dev:server</code>.
          </p>
        </div>
      )}

      {health && (
        <div style={{
          padding: 'var(--space-4)',
          background: 'var(--color-verified-bg)',
          border: '1px solid var(--color-verified)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-6)',
        }}>
          <p style={{ color: 'var(--color-verified)', fontWeight: 500, fontSize: 'var(--text-sm)' }}>
            ✓ Server connected — {health.version} — {health.timestamp}
          </p>
        </div>
      )}

      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◎</div>
        <h2 className="empty-state__title">No Events Yet</h2>
        <p className="empty-state__text">
          The news ingestion pipeline has not run yet. Events will appear here once real sources
          are configured and ingestion begins.
        </p>
      </div>
    </>
  );
}
