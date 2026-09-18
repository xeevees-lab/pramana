import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
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
const CATEGORY_MAP = {
  all: null,
  news: 'politics',
  politics: 'politics',
  sports: 'culture',
  india: 'india',
  world: 'diplomacy',
  tech: 'technology',
  technology: 'technology',
  business: 'economics',
  economics: 'economics',
  science: 'technology',
  ai: 'technology',
  climate: 'climate',
  environment: 'climate',
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
  const [searchQuery, setSearchQuery] = useState(urlSearchQuery);
  const [stats, setStats] = useState({ totalEvents: 0 });

  // Sync searchQuery when URL query changes
  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const queryParams = new URLSearchParams();
    const mappedCat = CATEGORY_MAP[rawCategory] || (rawCategory !== 'all' ? rawCategory : null);
    
    if (mappedCat && mappedCat !== 'all') {
      queryParams.set('category', mappedCat);
    }
    if (searchQuery.trim()) {
      queryParams.set('q', searchQuery.trim());
    }
    queryParams.set('limit', '40');

    Promise.all([
      api.get(`/events?${queryParams.toString()}`),
      api.get('/events/live?limit=12'),
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
  }, [rawCategory, searchQuery]);

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

  // Wireframe 1.1 Editorial Distribution:
  // 1. Hero Event: highest severity or first item with valid image
  const heroEvent = events.find((e) => (e.severity === 'critical' || e.severity === 'high') && e.image_url) || events[0] || null;
  const otherEvents = events.filter((e) => e.id !== heroEvent?.id);

  // 2. Top Side Stories: next 3-4 items for right-hand column
  const topSideStories = otherEvents.slice(0, 4);

  // 3. Secondary Story Cards: next 4-8 items for the secondary grid
  const secondaryCards = otherEvents.slice(4, 10);

  // 4. Regional Desks: India and World shelves
  const indiaStories = events.filter(
    (e) =>
      e.id !== heroEvent?.id &&
      (e.category?.toLowerCase() === 'india' ||
        e.title?.toLowerCase().includes('india') ||
        e.summary?.toLowerCase().includes('india') ||
        e.summary?.toLowerCase().includes('delhi'))
  ).slice(0, 4);

  const worldStories = events.filter(
    (e) =>
      e.id !== heroEvent?.id &&
      (e.category?.toLowerCase() === 'diplomacy' ||
        e.category?.toLowerCase() === 'world' ||
        e.title?.toLowerCase().includes('global') ||
        e.title?.toLowerCase().includes('un ') ||
        e.title?.toLowerCase().includes('europe') ||
        e.title?.toLowerCase().includes('china') ||
        e.title?.toLowerCase().includes('us '))
  ).slice(0, 4);

  return (
    <div className="explore-hub">
      {/* Editorial Search & Filter Bar */}
      <div className="explore-editorial-header">
        <div className="explore-editorial-header__top">
          <div>
            <h1 className="explore-editorial-header__title">
              {rawCategory === 'all'
                ? 'Global News & Intelligence'
                : `${rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1)} Desk`}
            </h1>
            <p className="explore-editorial-header__subtitle">
              Multi-source corroborated reporting, living event dossiers, and verified claims.
            </p>
          </div>
          <div className="explore-editorial-header__meta">
            <span className="explore-badge-count">
              <strong>{stats.totalEvents}</strong> Tracked Living Events
            </span>
          </div>
        </div>

        {/* Search Input Row */}
        <form onSubmit={handleSearchSubmit} className="explore-search-bar">
          <svg className="explore-search-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="explore-search-bar__input"
            placeholder="Search verified events, people, organizations, countries, or topics..."
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
            Search Intelligence
          </button>
        </form>

        {/* Filter Indicator when filtered */}
        {(rawCategory !== 'all' || searchQuery) && (
          <div className="explore-active-filter-banner">
            <span>
              Filtering by: {rawCategory !== 'all' && <strong>Category: {rawCategory}</strong>}{' '}
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
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading" style={{ minHeight: '50vh' }}>
          <div className="loading__spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state" style={{ margin: '4rem auto', textAlign: 'center' }}>
          <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
            ◎
          </div>
          <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            No Corroborated Events Found
          </h2>
          <p className="empty-state__text" style={{ color: '#6B7280' }}>
            No living intelligence dossiers match your active filter. Try selecting &ldquo;All&rdquo; or clearing the search term.
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
            Reset to All Intelligence
          </button>
        </div>
      ) : (
        <>
          {/* ========================================================
              WIREFRAME 1.1: HERO SECTION + TOP STORIES COLUMN
             ======================================================== */}
          <div className="editorial-lead-section">
            {/* Major Hero Story */}
            {heroEvent && (
              <article className="editorial-hero">
                <Link to={`/event/${heroEvent.id}`} className="editorial-hero__img-link">
                  {heroEvent.image_url ? (
                    <img
                      src={heroEvent.image_url}
                      alt={heroEvent.title}
                      className="editorial-hero__img"
                      loading="eager"
                    />
                  ) : (
                    <div className="editorial-hero__img-fallback">
                      <span>◈</span>
                    </div>
                  )}
                </Link>

                <div className="editorial-hero__body">
                  <div className="editorial-hero__tags">
                    <span className={`category-tag category-tag--${heroEvent.category || 'politics'}`}>
                      {heroEvent.category || 'General'}
                    </span>
                    {heroEvent.severity && heroEvent.severity !== 'normal' && (
                      <span className={`badge ${heroEvent.severity === 'critical' ? 'badge--contradicted' : 'badge--unverified'}`}>
                        {heroEvent.severity.toUpperCase()}
                      </span>
                    )}
                    <span className="badge badge--verified">
                      {heroEvent.status || 'Verified Event'}
                    </span>
                    <span className="editorial-time-badge">
                      {formatTimeAgo(heroEvent.last_updated_at)}
                    </span>
                  </div>

                  <h2 className="editorial-hero__headline">
                    <Link to={`/event/${heroEvent.id}`} className="editorial-headline-link">
                      {heroEvent.title}
                    </Link>
                  </h2>

                  <p className="editorial-hero__summary">{heroEvent.summary}</p>

                  {/* Surface Existing Intelligence Directly */}
                  <div className="editorial-intelligence-row">
                    <div className="editorial-stat-pill" title="Independent reporting sources">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <strong>{heroEvent.source_count || 1}</strong> Sources
                    </div>

                    <div className="editorial-stat-pill" title="Factually evaluated claims">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <strong>Claims Evaluated</strong>
                    </div>

                    <div className="editorial-stat-pill" title="Interactive chronological timeline">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Timeline Available
                    </div>

                    <Link to={`/event/${heroEvent.id}`} className="editorial-hero__cta">
                      Open Full Dossier →
                    </Link>
                  </div>
                </div>
              </article>
            )}

            {/* Right Top Stories Column (Wireframe 1.1 Side List) */}
            <aside className="editorial-top-sidebar" aria-label="Top side dispatches">
              <div className="editorial-sidebar-header">
                <h2 className="editorial-sidebar-title">Top Intelligence</h2>
                <span className="editorial-sidebar-live-tag">
                  <span className="live-pulse-dot" /> Living
                </span>
              </div>

              <div className="editorial-side-list">
                {topSideStories.map((story) => (
                  <article key={story.id} className="editorial-side-item">
                    <div className="editorial-side-item__meta">
                      <span className="editorial-side-time">{formatTimeAgo(story.last_updated_at)}</span>
                      <span className="editorial-side-sep">|</span>
                      <span className="editorial-side-cat">{story.category || 'World'}</span>
                    </div>

                    <h3 className="editorial-side-item__title">
                      <Link to={`/event/${story.id}`}>{story.title}</Link>
                    </h3>

                    <div className="editorial-side-item__footer">
                      <span>{story.source_count || 1} sources reporting</span>
                    </div>
                  </article>
                ))}
              </div>
            </aside>
          </div>

          {/* ========================================================
              WIREFRAME 1.1: SECONDARY STORY CARDS GRID
             ======================================================== */}
          {secondaryCards.length > 0 && (
            <section className="editorial-section" aria-labelledby="sec-stories-heading">
              <div className="editorial-section__divider">
                <h2 id="sec-stories-heading" className="editorial-section__title">
                  Breaking &amp; Developing Intelligence
                </h2>
              </div>

              <div className="editorial-secondary-grid">
                {secondaryCards.map((card) => (
                  <article key={card.id} className="editorial-card">
                    <Link to={`/event/${card.id}`} className="editorial-card__img-link">
                      {card.image_url ? (
                        <img src={card.image_url} alt="" loading="lazy" className="editorial-card__img" />
                      ) : (
                        <div className="editorial-card__img-fallback">
                          <span>◈</span>
                        </div>
                      )}
                    </Link>

                    <div className="editorial-card__body">
                      <div className="editorial-card__meta">
                        <span className="editorial-card__time">{formatTimeAgo(card.last_updated_at)}</span>
                        <span className="editorial-card__sep">|</span>
                        <span className="editorial-card__category">{card.category || 'News'}</span>
                      </div>

                      <h3 className="editorial-card__headline">
                        <Link to={`/event/${card.id}`}>{card.title}</Link>
                      </h3>

                      {card.summary && (
                        <p className="editorial-card__snippet">
                          {card.summary.length > 115 ? card.summary.slice(0, 115) + '...' : card.summary}
                        </p>
                      )}
                    </div>

                    <div className="editorial-card__footer">
                      <span className="editorial-card__source-count">
                        <strong>{card.source_count || 1}</strong> sources
                      </span>
                      <span className="editorial-card__status-tag">Verified</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ========================================================
              WIREFRAME 1.1: REGIONAL & CATEGORY SHELVES (India, World, Live)
             ======================================================== */}
          {/* 1. India Desk Shelf */}
          {indiaStories.length > 0 && (
            <section className="editorial-shelf" aria-labelledby="india-shelf-title">
              <div className="editorial-shelf__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="editorial-shelf__accent-bar editorial-shelf__accent-bar--india" />
                  <h2 id="india-shelf-title" className="editorial-shelf__title">
                    India Intelligence Desk
                  </h2>
                </div>
                <Link to="/explore?category=india" className="editorial-shelf__link">
                  View All India Intelligence →
                </Link>
              </div>

              <div className="editorial-shelf__grid">
                {indiaStories.map((item) => (
                  <article key={item.id} className="editorial-shelf-card">
                    <div className="editorial-shelf-card__meta">
                      <span>{formatTimeAgo(item.last_updated_at)}</span>
                      <span>·</span>
                      <span>{item.source_count || 1} sources</span>
                    </div>
                    <h3 className="editorial-shelf-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="editorial-shelf-card__excerpt">
                      {item.summary ? item.summary.slice(0, 95) + '...' : ''}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* 2. World Affairs Shelf */}
          {worldStories.length > 0 && (
            <section className="editorial-shelf" aria-labelledby="world-shelf-title">
              <div className="editorial-shelf__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="editorial-shelf__accent-bar editorial-shelf__accent-bar--world" />
                  <h2 id="world-shelf-title" className="editorial-shelf__title">
                    World &amp; Global Affairs
                  </h2>
                </div>
                <Link to="/explore?category=world" className="editorial-shelf__link">
                  View All World Affairs →
                </Link>
              </div>

              <div className="editorial-shelf__grid">
                {worldStories.map((item) => (
                  <article key={item.id} className="editorial-shelf-card">
                    <div className="editorial-shelf-card__meta">
                      <span>{formatTimeAgo(item.last_updated_at)}</span>
                      <span>·</span>
                      <span>{item.source_count || 1} sources</span>
                    </div>
                    <h3 className="editorial-shelf-card__headline">
                      <Link to={`/event/${item.id}`}>{item.title}</Link>
                    </h3>
                    <p className="editorial-shelf-card__excerpt">
                      {item.summary ? item.summary.slice(0, 95) + '...' : ''}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* 3. Live Intelligence Ticker Shelf */}
          {liveEntries.length > 0 && (
            <section className="editorial-live-shelf" aria-labelledby="live-shelf-title">
              <div className="editorial-shelf__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="live-pulse-dot" />
                  <h2 id="live-shelf-title" className="editorial-shelf__title">
                    Real-Time Wire Ticker
                  </h2>
                </div>
                <Link to="/live" className="editorial-shelf__link">
                  Full Chronological Wire →
                </Link>
              </div>

              <div className="editorial-ticker-grid">
                {liveEntries.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="editorial-ticker-item">
                    <div className="editorial-ticker-time">{formatTimeAgo(entry.created_at)}</div>
                    <h4 className="editorial-ticker-title">
                      {entry.event_id ? (
                        <Link to={`/event/${entry.event_id}`}>{entry.title}</Link>
                      ) : (
                        entry.title
                      )}
                    </h4>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
