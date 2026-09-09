import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function formatTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LivePage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLive = () => {
    fetch('/api/events/live?limit=50')
      .then(r => r.json())
      .then(data => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load live wire:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLive();
    const timer = setInterval(fetchLive, 10000); // 10s auto-refresh
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="pulse-dot" /> Live Intelligence Wire
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Real-time feed of newly detected events, breaking developments, and verified reporting.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={fetchLive}
          style={{ fontSize: 'var(--text-xs)' }}
        >
          ↻ Refresh Now
        </button>
      </div>

      {loading ? (
        <div className="loading">
          <div className="loading__spinner" />
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">◉</div>
          <h2 className="empty-state__title">No Live Updates</h2>
          <p className="empty-state__text">
            Live updates will stream here automatically as the ingestion pipeline processes global news feeds.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4) var(--space-5)',
                display: 'flex',
                gap: 'var(--space-4)',
                alignItems: 'baseline',
              }}
            >
              <div style={{ minWidth: '100px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)', fontFeatureSettings: '"tnum"' }}>
                <div>{formatTime(entry.created_at)}</div>
                <div style={{ opacity: 0.7 }}>{formatDate(entry.created_at)}</div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <span className={`badge ${entry.entry_type === 'new_event' ? 'badge--verified' : 'badge--unverified'}`}>
                    {entry.entry_type.replace(/_/g, ' ')}
                  </span>
                  {entry.event_category && (
                    <span className={`category-tag category-tag--${entry.event_category}`}>
                      {entry.event_category}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink)', marginBottom: 'var(--space-1)' }}>
                  {entry.title}
                </div>

                {entry.description && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', margin: 0 }}>
                    {entry.description}
                  </p>
                )}

                {entry.event_id && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Link
                      to={`/event/${entry.event_id}`}
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-accent)' }}
                    >
                      View Linked Intelligence Event →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
