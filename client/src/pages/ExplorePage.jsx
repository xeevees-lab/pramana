import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import '../styles/explore-hub.css';

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

export default function ExplorePage() {
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
      api.get(`/events?${queryParams.toString()}`),
      api.get('/events/live?limit=10'),
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
        console.error('Failed to load explore data:', err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, searchQuery]);

  // Select hero lead event (highest severity or first item with image)
  const heroEvent = events.find(e => e.severity === 'critical' || e.severity === 'high') || events[0] || null;
  const gridEvents = events.filter(e => e.id !== heroEvent?.id);

  return (
    <div className="explore-hub">
      {/* Header & Controls */}
      <div className="explore-controls">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 700, margin: '0 0 4px 0', color: '#111827' }}>
              Explore Global Intelligence
            </h1>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: '#6B7280' }}>
              Real-time multi-source event intelligence, verified facts, and living context.
            </p>
          </div>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
            <strong>{stats.totalEvents}</strong> Living Events Tracked
          </span>
        </div>

        {/* Search Input */}
        <div className="explore-search-row">
          <input
            type="search"
            className="explore-search-input"
            placeholder="Search events, topics, entities, or countries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search intelligence"
          />
        </div>

        {/* Category Pills */}
        <div className="explore-categories" role="tablist" aria-label="News categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`explore-cat-pill ${selectedCategory === cat ? 'explore-cat-pill--active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading" style={{ minHeight: '40vh' }}>
          <div className="loading__spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state" style={{ margin: '4rem auto', textAlign: 'center' }}>
          <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
          <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>No Events Found</h2>
          <p className="empty-state__text" style={{ color: '#6B7280' }}>
            No living events match your filter or search query. Try selecting &ldquo;All&rdquo; or clearing search.
          </p>
          {(selectedCategory !== 'all' || searchQuery) && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
              style={{ marginTop: '1rem' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Hero / Lead Feature Story */}
          {heroEvent && (
            <article className="explore-hero">
              <div className="explore-hero__img-container">
                {heroEvent.image_url ? (
                  <img
                    src={heroEvent.image_url}
                    alt={heroEvent.title}
                    className="explore-hero__img"
                    loading="lazy"
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #EDE9FE 0%, #FAF5FF 100%)', color: '#8B5CF6', fontSize: '2.5rem' }}>
                    ◈
                  </div>
                )}
              </div>

              <div className="explore-hero__content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`category-tag category-tag--${heroEvent.category || 'politics'}`}>
                    {heroEvent.category}
                  </span>
                  {heroEvent.severity && heroEvent.severity !== 'normal' && (
                    <span className={`badge ${heroEvent.severity === 'critical' ? 'badge--contradicted' : 'badge--unverified'}`}>
                      {heroEvent.severity.toUpperCase()}
                    </span>
                  )}
                  <span className="badge badge--verified">
                    {heroEvent.status}
                  </span>
                </div>

                <h2 className="explore-hero__title">
                  <Link to={`/event/${heroEvent.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {heroEvent.title}
                  </Link>
                </h2>

                <p className="explore-hero__summary">
                  {heroEvent.summary}
                </p>

                <div className="explore-hero__meta">
                  <span>{formatTimeAgo(heroEvent.last_updated_at)}</span>
                  <span>·</span>
                  <span>{heroEvent.source_count || 1} sources reporting</span>
                  <span>·</span>
                  <Link
                    to={`/event/${heroEvent.id}`}
                    style={{ color: '#7C3AED', fontWeight: 600, textDecoration: 'none', marginLeft: 'auto' }}
                  >
                    Open Intelligence Dossier →
                  </Link>
                </div>
              </div>
            </article>
          )}

          {/* Main Two-Column Layout */}
          <div className="explore-layout">
            {/* Events Grid */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Living News Intelligence ({events.length})
                </h2>
              </div>

              <div className="explore-events-grid">
                {gridEvents.map((ev) => (
                  <Link key={ev.id} to={`/event/${ev.id}`} className="explore-event-card">
                    {ev.image_url && (
                      <div className="explore-event-card__thumb">
                        <img src={ev.image_url} alt="" loading="lazy" />
                      </div>
                    )}
                    <div className="explore-event-card__body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span className={`category-tag category-tag--${ev.category || 'politics'}`} style={{ fontSize: '0.6875rem' }}>
                          {ev.category}
                        </span>
                        {ev.severity && ev.severity !== 'normal' && (
                          <span className={`badge ${ev.severity === 'critical' ? 'badge--contradicted' : 'badge--unverified'}`} style={{ fontSize: '0.625rem' }}>
                            {ev.severity}
                          </span>
                        )}
                      </div>
                      <h3 className="explore-event-card__title">
                        {ev.title}
                      </h3>
                      {ev.summary && (
                        <p className="explore-event-card__snippet">
                          {ev.summary.length > 130 ? ev.summary.slice(0, 130) + '...' : ev.summary}
                        </p>
                      )}
                    </div>
                    <div className="explore-event-card__footer">
                      <span>{formatTimeAgo(ev.last_updated_at)}</span>
                      <span>{ev.source_count || 1} sources</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Live Wire Sidebar Widget */}
            <aside className="explore-sidebar" aria-label="Real-time news developments">
              <div className="explore-wire-card">
                <div className="explore-wire-header">
                  <div className="explore-wire-title">
                    <span className="pulse-dot" /> Live Wire Updates
                  </div>
                  <Link to="/live" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7C3AED', textDecoration: 'none' }}>
                    View All →
                  </Link>
                </div>

                <div className="explore-wire-feed">
                  {liveEntries.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: '#9CA3AF', padding: '1rem 0' }}>
                      Monitoring for real-time updates...
                    </div>
                  ) : (
                    liveEntries.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="explore-wire-item">
                        <span className="explore-wire-time">
                          {formatTimeAgo(entry.created_at)}
                        </span>
                        {entry.event_id ? (
                          <Link
                            to={`/event/${entry.event_id}`}
                            className="explore-wire-text"
                            style={{ textDecoration: 'none' }}
                          >
                            {entry.title}
                          </Link>
                        ) : (
                          <span className="explore-wire-text">{entry.title}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Research Callout Card */}
              <div className="explore-wire-card" style={{ background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)', borderColor: '#DDD6FE' }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>◇</div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>
                  Ask PRAMĀṆA Intelligence
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
                  Verify claims, submit article URLs, analyze video dispatches, or conduct deep research.
                </p>
                <Link to="/ask" className="btn btn--primary" style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'inline-block' }}>
                  Open Research Workspace →
                </Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
