import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CATEGORIES = [
  'all',
  'politics',
  'conflict',
  'diplomacy',
  'economics',
  'technology',
  'climate',
  'health',
];

function formatTimeAgo(dateString) {
  if (!dateString) return 'Just now';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [events, setEvents] = useState([]);
  const [liveEntries, setLiveEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ totalEvents: 0 });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (selectedCategory !== 'all') {
      queryParams.set('category', selectedCategory);
    }
    if (searchQuery.trim()) {
      queryParams.set('q', searchQuery.trim());
    }
    queryParams.set('limit', '30');

    Promise.all([
      fetch(`/api/events?${queryParams.toString()}`).then(r => r.json()),
      fetch('/api/events/live?limit=12').then(r => r.json()),
    ])
      .then(([eventsData, liveData]) => {
        if (!isMounted) return;
        setEvents(eventsData.events || []);
        setStats({ totalEvents: eventsData.pagination?.total || 0 });
        setLiveEntries(liveData.entries || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load dashboard data:', err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, searchQuery]);

  const featuredEvent = events.length > 0 ? events[0] : null;
  const remainingEvents = events.slice(1);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Global Intelligence</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Real-time news intelligence, verified evidence, multi-source narrative analysis, and forecasting.
          </p>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)', fontWeight: 500 }}>
          {stats.totalEvents} Living Events Tracked
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`filter-chip ${selectedCategory === cat ? 'filter-chip--active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}

        <div className="search-bar">
          <input
            type="text"
            className="search-bar__input"
            placeholder="Search events, topics, entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="loading__spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true">◎</div>
          <h2 className="empty-state__title">No Events Found</h2>
          <p className="empty-state__text">
            No events match your current filter or query. Try selecting &ldquo;All&rdquo; or clearing your search.
          </p>
        </div>
      ) : (
        <div className="dashboard-layout">
          {/* Main Events Column */}
          <div>
            {/* Featured Event Hero */}
            {featuredEvent && (
              <Link to={`/event/${featuredEvent.id}`} className="event-hero">
                <div className="event-hero__top">
                  <span className={`category-tag category-tag--${featuredEvent.category || 'politics'}`}>
                    {featuredEvent.category}
                  </span>
                  {featuredEvent.severity && featuredEvent.severity !== 'normal' && (
                    <span className={`badge badge--${featuredEvent.severity === 'critical' ? 'contradicted' : 'unverified'}`}>
                      {featuredEvent.severity}
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)' }}>
                    Updated {formatTimeAgo(featuredEvent.last_updated_at)}
                  </span>
                </div>

                <h2 className="event-hero__title">{featuredEvent.title}</h2>
                <p className="event-hero__summary">{featuredEvent.summary}</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
                  <span className="source-chip">
                    <strong>{featuredEvent.source_count}</strong> sources reporting
                  </span>
                  <span>·</span>
                  <span>
                    <strong>{featuredEvent.article_count}</strong> verified reports
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--color-accent)', fontWeight: 500 }}>
                    Open Intelligence Dossier →
                  </span>
                </div>
              </Link>
            )}

            {/* Grid of Other Active Events */}
            <div className="event-grid">
              {remainingEvents.map((evt) => (
                <Link key={evt.id} to={`/event/${evt.id}`} className="event-card">
                  <div className="event-card__meta">
                    <span className={`category-tag category-tag--${evt.category || 'politics'}`}>
                      {evt.category}
                    </span>
                    <span>{formatTimeAgo(evt.last_updated_at)}</span>
                  </div>

                  <h3 className="event-card__title">{evt.title}</h3>
                  <p className="event-card__summary">{evt.summary}</p>

                  <div className="event-card__footer">
                    <span>{evt.source_count} sources · {evt.article_count} articles</span>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>View dossier →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Real-time Live Feed Sidebar */}
          <aside className="live-sidebar">
            <div className="live-sidebar__header">
              <span className="live-sidebar__title">
                <span className="pulse-dot" /> Live Wire
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)' }}>
                Real-time
              </span>
            </div>

            <div className="live-feed-list">
              {liveEntries.length === 0 ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)' }}>
                  Awaiting new incoming signals...
                </p>
              ) : (
                liveEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    to={entry.event_id ? `/event/${entry.event_id}` : '/live'}
                    className="live-feed-item"
                  >
                    <div className="live-feed-item__time">
                      {formatTimeAgo(entry.created_at)}
                    </div>
                    <div className="live-feed-item__title">
                      {entry.title}
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <Link to="/live" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-accent)' }}>
                Open Full Live Stream →
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
