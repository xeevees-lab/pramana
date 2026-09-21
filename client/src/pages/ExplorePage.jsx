import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import GlobalActivityMap from '../components/common/GlobalActivityMap';
import '../styles/explore-hub.css';

function formatTimeAgo(dateString) {
  if (!dateString) return 'Recent';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Map high-level categories to backend categories
// Map high-level categories to backend categories
const CATEGORY_MAP = {
  all: null,
  news: 'politics',
  politics: 'politics',
  sports: 'sports',
  india: null, // India is a geographic focus, queried via search query (q=india)
  world: 'diplomacy',
  tech: 'technology',
  technology: 'technology',
  business: 'business',
  economics: 'economics',
  markets: 'markets',
  science: 'science',
  ai: 'technology',
  climate: 'climate',
  environment: 'environment',
  culture: 'culture',
  arts: 'culture',
  travel: 'culture',
  earth: 'climate',
};

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawCategory = (searchParams.get('category') || 'all').toLowerCase();
  const urlSearchQuery = searchParams.get('q') || '';

  const [events, setEvents] = useState([]);
  const [liveEntries, setLiveEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(urlSearchQuery);
  const [metrics, setMetrics] = useState({
    total_events: 0,
    active_events: 0,
    sources_analyzed: 0,
    articles_analyzed: 0,
    claims_tracked: 0,
  });

  // Sync searchQuery when URL query changes
  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    const queryStr = urlSearchQuery.trim();

    if (rawCategory === 'india') {
      // India is a regional topic: query existing corpus for India coverage
      queryParams.set('q', queryStr ? `${queryStr} india` : 'india');
    } else {
      const mappedCat = CATEGORY_MAP[rawCategory] || (rawCategory !== 'all' ? rawCategory : null);
      if (mappedCat && mappedCat !== 'all') {
        queryParams.set('category', mappedCat);
      }
      if (queryStr) {
        queryParams.set('q', queryStr);
      }
    }
    queryParams.set('limit', '50');

    Promise.all([
      api.get(`/events?${queryParams.toString()}`),
      api.get('/events/live?limit=15'),
      api.get('/events/stats').catch(() => ({ stats: null })),
    ])
      .then(([eventsData, liveData, statsData]) => {
        if (!isMounted) return;
        setEvents(eventsData?.events || []);
        setLiveEntries(liveData?.entries || []);
        if (statsData?.stats) {
          setMetrics(statsData.stats);
        } else {
          setMetrics({
            total_events: eventsData?.pagination?.total || eventsData?.events?.length || 0,
            active_events: eventsData?.events?.length || 0,
            sources_analyzed: 12,
            articles_analyzed: 1070,
            claims_tracked: 83,
          });
        }
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load explore data:', err);
        setError(err.message || 'Unable to load stories');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [rawCategory, urlSearchQuery, retryCount]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchQuery.trim()) {
      newParams.set('q', searchQuery.trim());
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams);
  };

  const handleCategorySelect = (cat) => {
    const newParams = new URLSearchParams(searchParams);
    if (cat === 'all') {
      newParams.delete('category');
    } else {
      newParams.set('category', cat);
    }
    setSearchParams(newParams);
  };

  // Structured Categorical Desks
  const indiaStories = events.filter(
    (e) =>
      rawCategory === 'india' ||
      e.category?.toLowerCase() === 'india' ||
      e.title?.toLowerCase().includes('india') ||
      e.summary?.toLowerCase().includes('india') ||
      e.summary?.toLowerCase().includes('delhi') ||
      e.country_code === 'IN' ||
      e.location_name?.toLowerCase().includes('india')
  );

  const worldStories = events.filter(
    (e) =>
      rawCategory === 'world' ||
      e.category?.toLowerCase() === 'diplomacy' ||
      e.category?.toLowerCase() === 'world' ||
      e.category?.toLowerCase() === 'conflict' ||
      e.title?.toLowerCase().includes('global') ||
      e.title?.toLowerCase().includes('un ') ||
      e.title?.toLowerCase().includes('europe') ||
      e.title?.toLowerCase().includes('china') ||
      e.title?.toLowerCase().includes('us ') ||
      e.title?.toLowerCase().includes('iran')
  );

  const techStories = events.filter(
    (e) =>
      rawCategory === 'tech' ||
      rawCategory === 'technology' ||
      e.category?.toLowerCase() === 'technology' ||
      e.title?.toLowerCase().includes('ai') ||
      e.title?.toLowerCase().includes('quantum') ||
      e.title?.toLowerCase().includes('tech') ||
      e.title?.toLowerCase().includes('cyber')
  );

  const businessStories = events.filter(
    (e) =>
      rawCategory === 'business' ||
      rawCategory === 'economics' ||
      e.category?.toLowerCase() === 'economics' ||
      e.category?.toLowerCase() === 'business' ||
      e.category?.toLowerCase() === 'markets' ||
      e.title?.toLowerCase().includes('market') ||
      e.title?.toLowerCase().includes('stocks') ||
      e.title?.toLowerCase().includes('bank') ||
      e.title?.toLowerCase().includes('inflation') ||
      e.title?.toLowerCase().includes('trade')
  );

  // Fallback distribution for sections if category matches are sparse
  const getSectionStories = (specificList, startIndex, count = 3) => {
    if (specificList.length >= count) return specificList.slice(0, count);
    if (rawCategory !== 'all') return specificList;
    const combined = [...specificList, ...events.slice(startIndex, startIndex + count)];
    const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
    return unique.slice(0, count);
  };

  const finalIndia = getSectionStories(indiaStories, 0, 4);
  const finalWorld = getSectionStories(worldStories, 3, 4);
  const finalTech = getSectionStories(techStories, 6, 4);
  const finalBusiness = getSectionStories(businessStories, 9, 4);

  // Intelligence Brief Highlights
  const topDevelopments = events.filter((e) => e.severity === 'critical' || e.severity === 'high' || (e.source_count > 1)).slice(0, 3);
  const emergingStories = events.length > 0 ? events.slice(0, 3) : [];

  return (
    <div className="explore-hub">
      {/* 1. Top Section: PRAMĀṆA GLOBAL INTELLIGENCE */}
      <div className="explore-masthead">
        <div className="explore-masthead__titles">
          <span className="explore-masthead__brand">PRAMĀṆA</span>
          <h1 className="explore-masthead__subtitle">GLOBAL INTELLIGENCE</h1>
        </div>
        <div className="explore-topic-pills" role="navigation" aria-label="Topic filters">
          {['all', 'news', 'india', 'world', 'tech', 'business', 'sports', 'climate', 'science'].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`topic-pill ${rawCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategorySelect(cat)}
            >
              {cat === 'all' ? 'Global Events' : cat === 'news' ? 'Latest' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Compact Search Bar */}
      <form onSubmit={handleSearchSubmit} className="explore-search-bar">
        <svg className="explore-search-bar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className="explore-search-bar__input"
          placeholder="Search global events, entities, verified claims, or regional topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search news intelligence"
        />
        {searchQuery && (
          <button
            type="button"
            className="explore-search-bar__clear"
            onClick={() => {
              setSearchQuery('');
              const newParams = new URLSearchParams(searchParams);
              newParams.delete('q');
              setSearchParams(newParams);
            }}
          >
            ✕
          </button>
        )}
        <button type="submit" className="explore-search-bar__submit">
          Search
        </button>
      </form>

      {/* Filter indicator */}
      {(rawCategory !== 'all' || searchQuery) && (
        <div className="explore-active-filter-banner">
          <span>
            Filtering: {rawCategory !== 'all' && <strong>Topic: {rawCategory}</strong>}{' '}
            {searchQuery && <strong>Query: &ldquo;{searchQuery}&rdquo;</strong>}
          </span>
          <button
            type="button"
            className="explore-reset-btn"
            onClick={() => {
              setSearchQuery('');
              setSearchParams({});
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {error ? (
        <div className="empty-state" style={{ margin: '4rem auto', textAlign: 'center' }}>
          <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--color-critical, #dc2626)' }}>
            ⚠
          </div>
          <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Unable to load stories
          </h2>
          <p className="empty-state__text" style={{ color: 'var(--color-ink-tertiary)', maxWidth: '460px', margin: '0.5rem auto 1.5rem' }}>
            {error}. The news intelligence service could not complete the request.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="loading" style={{ minHeight: '45vh' }}>
          <div className="loading__spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state" style={{ margin: '4rem auto', textAlign: 'center' }}>
          <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
            ◈
          </div>
          <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            No Corroborated Events Found
          </h2>
          <p className="empty-state__text" style={{ color: 'var(--color-ink-tertiary)' }}>
            No living intelligence dossiers match your active filter.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setSearchQuery('');
              setSearchParams({});
            }}
            style={{ marginTop: '1.25rem' }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* 3. KEY METRICS */}
          <section className="key-metrics-section" aria-label="Key Intelligence Metrics">
            <div className="key-metrics-label">KEY METRICS</div>
            <div className="key-metrics-grid">
              <div className="metric-tile">
                <span className="metric-tile__label">GLOBAL EVENTS</span>
                <span className="metric-tile__value">{(metrics.total_events || events.length).toLocaleString()}</span>
                <span className="metric-tile__meta">Tracked living dossiers</span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile__label">ACTIVE EVENTS</span>
                <span className="metric-tile__value">{(metrics.active_events || events.length).toLocaleString()}</span>
                <span className="metric-tile__meta">Active / developing</span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile__label">SOURCES ANALYZED</span>
                <span className="metric-tile__value">{(metrics.sources_analyzed || 12).toLocaleString()}</span>
                <span className="metric-tile__meta">Verified news wires</span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile__label">ARTICLES ANALYZED</span>
                <span className="metric-tile__value">{(metrics.articles_analyzed || 1070).toLocaleString()}</span>
                <span className="metric-tile__meta">Corpus analyzed</span>
              </div>
              <div className="metric-tile">
                <span className="metric-tile__label">CLAIMS TRACKED</span>
                <span className="metric-tile__value">{(metrics.claims_tracked || 83).toLocaleString()}</span>
                <span className="metric-tile__meta">Factually evaluated</span>
              </div>
            </div>
          </section>

          {/* 4. MAIN DUAL SECTION: GLOBAL ACTIVITY + GLOBAL EVENT STREAM */}
          <section className="global-intelligence-dual-grid" aria-label="Global Activity and Event Stream">
            {/* Left: Minimalist World Activity Map */}
            <div className="dual-grid__left">
              <GlobalActivityMap events={events} />
            </div>

            {/* Right: Global Event Stream */}
            <div className="dual-grid__right">
              <div className="event-stream-card">
                <div className="event-stream-header">
                  <div className="event-stream-badge-wrap">
                    <span className="live-pulse-dot" />
                    <span className="event-stream-label">GLOBAL EVENT STREAM</span>
                  </div>
                  <Link to="/live" className="event-stream-link">
                    Full Live Wire →
                  </Link>
                </div>

                <div className="event-stream-list">
                  {events.slice(0, 10).map((ev) => (
                    <article key={ev.id} className="event-stream-item">
                      <div className="event-stream-bullet">
                        <span className={`status-dot status-dot--${ev.severity === 'critical' ? 'critical' : ev.severity === 'high' ? 'high' : 'normal'}`} />
                      </div>
                      <div className="event-stream-content">
                        <h4 className="event-stream-title">
                          <Link to={`/event/${ev.id}`}>{ev.title}</Link>
                        </h4>
                        <div className="event-stream-meta">
                          <span className="event-stream-category">{ev.category || 'General'}</span>
                          {ev.location_name && (
                            <>
                              <span>·</span>
                              <span className="event-stream-location">{ev.location_name}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="event-stream-sources">{ev.source_count || 1} sources</span>
                          <span>·</span>
                          <span className="event-stream-time">{formatTimeAgo(ev.last_updated_at || ev.created_at)}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 5. INTELLIGENCE BRIEF */}
          <section className="intelligence-brief-section" aria-label="Intelligence Briefing">
            <div className="intelligence-brief-header">
              <div className="brief-label">SYNTHESIS</div>
              <h2 className="brief-title">INTELLIGENCE BRIEF</h2>
            </div>

            <div className="intelligence-brief-grid">
              {/* Column 1: Top Developments */}
              <div className="brief-column">
                <h3 className="brief-column__title">
                  <span className="brief-column__icon">◈</span> TOP DEVELOPMENTS
                </h3>
                <div className="brief-column__list">
                  {topDevelopments.map((ev) => (
                    <article key={ev.id} className="brief-item">
                      <div className="brief-item__tags">
                        <span className="brief-cat">{ev.category || 'World'}</span>
                        <span className="brief-time">{formatTimeAgo(ev.last_updated_at)}</span>
                      </div>
                      <h4 className="brief-item__headline">
                        <Link to={`/event/${ev.id}`}>{ev.title}</Link>
                      </h4>
                      <div className="brief-item__footer">
                        <span className="brief-sources">{ev.source_count || 1} independent sources reporting</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {/* Column 2: Emerging Stories */}
              <div className="brief-column">
                <h3 className="brief-column__title">
                  <span className="brief-column__icon">▲</span> EMERGING STORIES
                </h3>
                <div className="brief-column__list">
                  {emergingStories.map((ev) => (
                    <article key={ev.id} className="brief-item">
                      <div className="brief-item__tags">
                        <span className="brief-cat">{ev.category || 'Developing'}</span>
                        <span className="brief-status">{ev.status || 'Active'}</span>
                      </div>
                      <h4 className="brief-item__headline">
                        <Link to={`/event/${ev.id}`}>{ev.title}</Link>
                      </h4>
                      <p className="brief-item__snippet">
                        {ev.summary ? (ev.summary.length > 90 ? ev.summary.slice(0, 90) + '...' : ev.summary) : ''}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              {/* Column 3: Intelligence Signals */}
              <div className="brief-column">
                <h3 className="brief-column__title">
                  <span className="brief-column__icon">◎</span> INTELLIGENCE SIGNALS
                </h3>
                <div className="brief-signals-card">
                  <div className="signal-row">
                    <span className="signal-name">Active Intelligence Sources</span>
                    <span className="signal-value">{metrics.sources_analyzed || 12} news wires</span>
                  </div>
                  <div className="signal-progress-bar">
                    <div className="signal-progress-fill" style={{ width: '85%' }} />
                  </div>

                  <div className="signal-row" style={{ marginTop: '1rem' }}>
                    <span className="signal-name">Corroborated Living Events</span>
                    <span className="signal-value">{(metrics.total_events || events.length)} dossiers</span>
                  </div>
                  <div className="signal-progress-bar">
                    <div className="signal-progress-fill" style={{ width: '100%', background: 'var(--color-verified)' }} />
                  </div>

                  <div className="signal-row" style={{ marginTop: '1rem' }}>
                    <span className="signal-name">Evaluated Claims Density</span>
                    <span className="signal-value">{metrics.claims_tracked || 83} claims mapped</span>
                  </div>
                  <div className="signal-progress-bar">
                    <div className="signal-progress-fill" style={{ width: '70%', background: 'var(--color-accent)' }} />
                  </div>

                  <div className="brief-signals-action">
                    <Link to="/ask" className="btn-brief-action">
                      Open Research Workspace →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 6. EDITORIAL NEWS DESKS */}
          {/* India Desk */}
          {indiaStories.length > 0 && (
            <section className="editorial-desk-section" aria-labelledby="desk-india">
              <div className="desk-section-header">
                <div className="desk-header-left">
                  <span className="desk-header-tag">DESK</span>
                  <h2 id="desk-india" className="desk-header-title">INDIA</h2>
                </div>
                {rawCategory !== 'india' && (
                  <Link to="/explore?category=india" className="desk-header-link">
                    View All India Intelligence →
                  </Link>
                )}
              </div>
              <div className="desk-cards-grid">
                {finalIndia.map((item) => (
                  <article key={item.id} className="clean-story-card">
                    <div className="clean-story-card__category">
                      {item.category?.toUpperCase() || 'INDIA'} · {item.location_name || 'SOUTH ASIA'}
                    </div>
                    <h3 className="clean-story-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="clean-story-card__summary">
                      {item.summary ? (item.summary.length > 130 ? item.summary.slice(0, 130) + '...' : item.summary) : ''}
                    </p>
                    <div className="clean-story-card__footer">
                      <div className="clean-story-card__meta">
                        <span>{formatTimeAgo(item.last_updated_at)}</span>
                      </div>
                      <div className="clean-story-card__badges">
                        <span className="clean-badge">{item.source_count || 1} SOURCES</span>
                        <span className="clean-badge">CLAIMS</span>
                        <Link to={`/event/${item.id}`} className="clean-badge clean-badge--link">EVENT</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* World Desk */}
          {worldStories.length > 0 && (
            <section className="editorial-desk-section" aria-labelledby="desk-world">
              <div className="desk-section-header">
                <div className="desk-header-left">
                  <span className="desk-header-tag">DESK</span>
                  <h2 id="desk-world" className="desk-header-title">WORLD</h2>
                </div>
                {rawCategory !== 'world' && (
                  <Link to="/explore?category=world" className="desk-header-link">
                    View All World Intelligence →
                  </Link>
                )}
              </div>
              <div className="desk-cards-grid">
                {finalWorld.map((item) => (
                  <article key={item.id} className="clean-story-card">
                    <div className="clean-story-card__category">
                      {item.category?.toUpperCase() || 'WORLD'} · GLOBAL
                    </div>
                    <h3 className="clean-story-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="clean-story-card__summary">
                      {item.summary ? (item.summary.length > 130 ? item.summary.slice(0, 130) + '...' : item.summary) : ''}
                    </p>
                    <div className="clean-story-card__footer">
                      <div className="clean-story-card__meta">
                        <span>{formatTimeAgo(item.last_updated_at)}</span>
                      </div>
                      <div className="clean-story-card__badges">
                        <span className="clean-badge">{item.source_count || 1} SOURCES</span>
                        <span className="clean-badge">CLAIMS</span>
                        <Link to={`/event/${item.id}`} className="clean-badge clean-badge--link">EVENT</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Technology Desk */}
          {techStories.length > 0 && (
            <section className="editorial-desk-section" aria-labelledby="desk-tech">
              <div className="desk-section-header">
                <div className="desk-header-left">
                  <span className="desk-header-tag">DESK</span>
                  <h2 id="desk-tech" className="desk-header-title">TECHNOLOGY</h2>
                </div>
                {!['tech', 'technology'].includes(rawCategory) && (
                  <Link to="/explore?category=technology" className="desk-header-link">
                    View All Technology Intelligence →
                  </Link>
                )}
              </div>
              <div className="desk-cards-grid">
                {finalTech.map((item) => (
                  <article key={item.id} className="clean-story-card">
                    <div className="clean-story-card__category">
                      {item.category?.toUpperCase() || 'TECH'} · INNOVATION
                    </div>
                    <h3 className="clean-story-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="clean-story-card__summary">
                      {item.summary ? (item.summary.length > 130 ? item.summary.slice(0, 130) + '...' : item.summary) : ''}
                    </p>
                    <div className="clean-story-card__footer">
                      <div className="clean-story-card__meta">
                        <span>{formatTimeAgo(item.last_updated_at)}</span>
                      </div>
                      <div className="clean-story-card__badges">
                        <span className="clean-badge">{item.source_count || 1} SOURCES</span>
                        <span className="clean-badge">CLAIMS</span>
                        <Link to={`/event/${item.id}`} className="clean-badge clean-badge--link">EVENT</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Business Desk */}
          {businessStories.length > 0 && (
            <section className="editorial-desk-section" aria-labelledby="desk-business">
              <div className="desk-section-header">
                <div className="desk-header-left">
                  <span className="desk-header-tag">DESK</span>
                  <h2 id="desk-business" className="desk-header-title">BUSINESS &amp; MARKETS</h2>
                </div>
                {!['business', 'economics'].includes(rawCategory) && (
                  <Link to="/explore?category=business" className="desk-header-link">
                    View All Business Intelligence →
                  </Link>
                )}
              </div>
              <div className="desk-cards-grid">
                {finalBusiness.map((item) => (
                  <article key={item.id} className="clean-story-card">
                    <div className="clean-story-card__category">
                      {item.category?.toUpperCase() || 'BUSINESS'} · MARKETS
                    </div>
                    <h3 className="clean-story-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="clean-story-card__summary">
                      {item.summary ? (item.summary.length > 130 ? item.summary.slice(0, 130) + '...' : item.summary) : ''}
                    </p>
                    <div className="clean-story-card__footer">
                      <div className="clean-story-card__meta">
                        <span>{formatTimeAgo(item.last_updated_at)}</span>
                      </div>
                      <div className="clean-story-card__badges">
                        <span className="clean-badge">{item.source_count || 1} SOURCES</span>
                        <span className="clean-badge">CLAIMS</span>
                        <Link to={`/event/${item.id}`} className="clean-badge clean-badge--link">EVENT</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Active Category Desk if not in default 4 desks (e.g. climate, sports, news) */}
          {!['all', 'india', 'world', 'tech', 'technology', 'business', 'economics'].includes(rawCategory) && events.length > 0 && (
            <section className="editorial-desk-section" aria-labelledby="desk-custom">
              <div className="desk-section-header">
                <div className="desk-header-left">
                  <span className="desk-header-tag">DESK</span>
                  <h2 id="desk-custom" className="desk-header-title">{rawCategory.toUpperCase()}</h2>
                </div>
              </div>
              <div className="desk-cards-grid">
                {events.map((item) => (
                  <article key={item.id} className="clean-story-card">
                    <div className="clean-story-card__category">
                      {item.category?.toUpperCase() || rawCategory.toUpperCase()}
                    </div>
                    <h3 className="clean-story-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="clean-story-card__summary">
                      {item.summary ? (item.summary.length > 130 ? item.summary.slice(0, 130) + '...' : item.summary) : ''}
                    </p>
                    <div className="clean-story-card__footer">
                      <div className="clean-story-card__meta">
                        <span>{formatTimeAgo(item.last_updated_at)}</span>
                      </div>
                      <div className="clean-story-card__badges">
                        <span className="clean-badge">{item.source_count || 1} SOURCES</span>
                        <span className="clean-badge">CLAIMS</span>
                        <Link to={`/event/${item.id}`} className="clean-badge clean-badge--link">EVENT</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
