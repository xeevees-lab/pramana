import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import '../styles/event-report.css';

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'sources', label: 'SOURCES' },
  { id: 'claims', label: 'CLAIMS' },
  { id: 'evidence', label: 'EVIDENCE' },
  { id: 'timeline', label: 'TIMELINE' },
  { id: 'cause_effect', label: 'CAUSE & EFFECT' },
  { id: 'narratives', label: 'NARRATIVES' },
  { id: 'entities', label: 'ENTITIES' },
  { id: 'forecast', label: 'FORECAST' },
  { id: 'related', label: 'RELATED EVENTS' },
];

export default function EventPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api.get(`/events/${id}`)
      .then((d) => {
        if (!isMounted) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Error loading intelligence report');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '60vh' }}>
        <div className="loading__spinner" />
      </div>
    );
  }

  if (error || !data || !data.event) {
    return (
      <div className="empty-state" style={{ maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
        <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
        <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>Event Intelligence Unavailable</h2>
        <p className="empty-state__text" style={{ color: 'var(--color-ink-tertiary)' }}>
          {error || 'The requested event could not be found or has not yet been processed.'}
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/explore" className="btn btn--secondary">
            ← Return to Global Intelligence
          </Link>
        </div>
      </div>
    );
  }

  const { event, report = {}, articles = [], claims = [], entities = [], narratives = [], forecasts = [], relatedEvents = [] } = data;

  const headline = report.headline || event.title;
  const verifiedPicture = report.verifiedPicture || event.summary;
  const whatHappened = report.whatHappened || event.summary;
  const whyThisHappened = report.whyThisHappened;
  const historicalContext = report.historicalContext;
  const confirmedClaims = report.confirmedClaims || claims.filter((c) => c.verification_status === 'VERIFIED');
  const uncertainClaims = report.uncertainClaims || claims.filter((c) => c.verification_status === 'UNVERIFIED');
  const contradictoryClaims = report.contradictoryClaims || claims.filter((c) => c.verification_status === 'CONTRADICTED');
  const allClaims = [...confirmedClaims, ...uncertainClaims, ...contradictoryClaims];
  const timeline = report.timeline || [];
  const legalAndPolicy = report.lawAndPolicy || entities.filter((e) => e.type === 'law' || e.type === 'policy' || e.type === 'document');
  const people = report.people || entities.filter((e) => e.type === 'person');
  const organizations = report.organizations || entities.filter((e) => e.type === 'organization');
  const mediaCoverage = report.mediaCoverage || articles;
  const lastUpdated = report.lastUpdated || event.last_updated_at;

  // Causal steps for minimalist flowchart
  const causalSteps = [];
  if (historicalContext) {
    causalSteps.push({ stage: 'PRECEDENT & CONTEXT', text: historicalContext });
  }
  if (whyThisHappened) {
    causalSteps.push({ stage: 'CAUSAL TRIGGER', text: whyThisHappened });
  }
  if (whatHappened) {
    causalSteps.push({ stage: 'OBSERVED EVENT', text: whatHappened.slice(0, 240) + '...' });
  }
  if (forecasts.length > 0) {
    causalSteps.push({ stage: 'PROJECTED IMPACT', text: forecasts[0].outcome_description });
  }

  const showSection = (tabId) => activeTab === 'all' || activeTab === tabId;

  return (
    <article className="event-report" aria-labelledby="event-headline">
      {/* 1. Back Navigation */}
      <nav className="event-report__back-nav" aria-label="Breadcrumbs">
        <Link to="/explore" className="event-report__back-btn">
          ← Back to Global Intelligence
        </Link>
      </nav>

      {/* 2. Top Header: EVENT Banner */}
      <header className="event-report__header">
        <div className="event-report__top-tag">
          <span className="event-tag-pill">EVENT DOSSIER</span>
          <span className="event-tag-cat">{event.category?.toUpperCase() || 'WORLD'}</span>
          {event.location_name && <span className="event-tag-loc">📍 {event.location_name}</span>}
          <span className={`status-badge status-badge--${event.status || 'verified'}`}>
            {event.status || 'Active'}
          </span>
        </div>

        <h1 id="event-headline" className="event-report__title">
          {headline}
        </h1>

        <div className="event-report__lead-meta">
          <span>First Reported: <strong>{formatDate(event.first_reported_at || event.created_at)}</strong></span>
          <span>·</span>
          <span>Last Updated: <strong>{formatDateTime(lastUpdated)}</strong></span>
          <span>·</span>
          <span>Sources: <strong>{Math.max(event.source_count || 1, articles.length)}</strong></span>
          <span>·</span>
          <span>Dispatches: <strong>{Math.max(event.article_count || 1, articles.length)}</strong></span>
          <span>·</span>
          <span>Claims Evaluated: <strong>{allClaims.length}</strong></span>
        </div>
      </header>

      {/* 3. Horizontal Navigation Tabs */}
      <div className="event-nav-tabs-wrapper" role="tablist" aria-label="Event Intelligence Sections">
        <div className="event-nav-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`event-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================
          SECTION: OVERVIEW
         ======================================================== */}
      {showSection('overview') && (
        <>
          {verifiedPicture && (
            <aside className="event-report__verified-picture" aria-label="The Verified Picture">
              <div className="event-report__verified-label">
                <span>✓</span> THE VERIFIED PICTURE
              </div>
              <p className="event-report__verified-text">{verifiedPicture}</p>
            </aside>
          )}

          {whatHappened && (
            <section className="event-section" aria-labelledby="heading-what-happened">
              <div className="event-section__header">
                <span className="event-section__tag">CHRONOLOGICAL SUMMARY</span>
                <h2 id="heading-what-happened" className="event-section__title">What Happened</h2>
              </div>
              <div className="event-report__prose">
                {whatHappened.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ========================================================
          SECTION: SOURCES
         ======================================================== */}
      {showSection('sources') && mediaCoverage.length > 0 && (
        <section className="event-section" aria-labelledby="heading-sources">
          <div className="event-section__header">
            <span className="event-section__tag">CROSS-SOURCE EVIDENCE</span>
            <h2 id="heading-sources" className="event-section__title">
              Sources Reporting ({mediaCoverage.length})
            </h2>
          </div>
          <div className="event-report__sources-grid">
            {mediaCoverage.map((art) => (
              <div key={art.id} className="event-report__source-card">
                <div>
                  <div className="source-card-header">
                    <span className="event-report__source-name">{art.sourceName || art.source_name || 'News Source'}</span>
                    <span className="source-card-date">{formatDate(art.publishedAt || art.published_at)}</span>
                  </div>
                  <h3 className="event-report__source-title">{art.title}</h3>
                </div>
                {art.url && (
                  <a
                    href={art.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-report__source-link"
                  >
                    View Original Dispatch ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: CLAIMS & EVIDENCE
         ======================================================== */}
      {(showSection('claims') || showSection('evidence')) && (
        <section className="event-section" aria-labelledby="heading-claims">
          <div className="event-section__header">
            <span className="event-section__tag">VERIFICATION LEDGER</span>
            <h2 id="heading-claims" className="event-section__title">
              Evaluated Claims &amp; Evidence ({allClaims.length})
            </h2>
          </div>

          <div className="claims-scannable-list">
            {allClaims.length === 0 ? (
              <p className="text-muted">No isolated claims extracted for this event dossier yet.</p>
            ) : (
              allClaims.map((claim) => (
                <article key={claim.id} className="scannable-claim-card">
                  <div className="scannable-claim-header">
                    <span className="scannable-claim-label">CLAIM</span>
                    <span className={`claim-status-pill claim-status-pill--${claim.verification_status?.toLowerCase() || 'unverified'}`}>
                      STATUS: {claim.verification_status || 'UNVERIFIED'}
                    </span>
                  </div>

                  <blockquote className="scannable-claim-quote">
                    &ldquo;{claim.text}&rdquo;
                  </blockquote>

                  <div className="scannable-claim-evidence">
                    <span className="scannable-evidence-label">Evidence &amp; Outlets:</span>
                    <div className="scannable-evidence-sources">
                      {mediaCoverage.slice(0, 3).map((art, idx) => (
                        <span key={idx} className="evidence-source-tag">
                          {art.sourceName || art.source_name || 'Primary Wire'}
                        </span>
                      ))}
                      {claim.claim_type && (
                        <span className="evidence-type-tag">Class: {claim.claim_type}</span>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: TIMELINE (date ↓ event ↓ event)
         ======================================================== */}
      {showSection('timeline') && timeline.length > 0 && (
        <section className="event-section" aria-labelledby="heading-timeline">
          <div className="event-section__header">
            <span className="event-section__tag">CHRONOLOGY</span>
            <h2 id="heading-timeline" className="event-section__title">Event Timeline</h2>
          </div>

          <div className="minimalist-timeline">
            {timeline.map((item, idx) => (
              <div key={item.id || idx} className="timeline-node">
                <div className="timeline-node__track">
                  <span className="timeline-node__marker" />
                  {idx < timeline.length - 1 && <span className="timeline-node__line" />}
                </div>
                <div className="timeline-node__content">
                  <div className="timeline-node__time">
                    {formatDateTime(item.timestamp)}
                    {item.source && <span className="timeline-node__source"> · {item.source}</span>}
                  </div>
                  <h4 className="timeline-node__title">{item.title}</h4>
                  {item.description && <p className="timeline-node__desc">{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: CAUSE & EFFECT (EVENT A ↓ EVENT B ↓ EVENT C)
         ======================================================== */}
      {showSection('cause_effect') && causalSteps.length > 0 && (
        <section className="event-section" aria-labelledby="heading-cause-effect">
          <div className="event-section__header">
            <span className="event-section__tag">CAUSAL REASONING</span>
            <h2 id="heading-cause-effect" className="event-section__title">Cause &amp; Effect</h2>
          </div>

          <div className="minimalist-flowchart">
            {causalSteps.map((step, idx) => (
              <div key={idx} className="flowchart-step-wrapper">
                <div className="flowchart-step">
                  <span className="flowchart-stage">{step.stage}</span>
                  <p className="flowchart-text">{step.text}</p>
                </div>
                {idx < causalSteps.length - 1 && (
                  <div className="flowchart-arrow" aria-hidden="true">
                    ↓
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: NARRATIVES
         ======================================================== */}
      {showSection('narratives') && narratives.length > 0 && (
        <section className="event-section" aria-labelledby="heading-narratives">
          <div className="event-section__header">
            <span className="event-section__tag">PUBLIC SPHERE</span>
            <h2 id="heading-narratives" className="event-section__title">Narratives &amp; Dispatches</h2>
          </div>
          <div className="narratives-grid">
            {narratives.map((nar) => (
              <div key={nar.id} className="narrative-card">
                <div className="narrative-card__meta">
                  <span className="narrative-platform">{nar.platform || 'Public Signal'}</span>
                  {nar.share_pct && (
                    <span className="narrative-share">Share: {Math.round(nar.share_pct * 100)}%</span>
                  )}
                </div>
                <h4 className="narrative-card__title">{nar.title}</h4>
                {nar.description && <p className="narrative-card__desc">{nar.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: ENTITIES
         ======================================================== */}
      {showSection('entities') && (people.length > 0 || organizations.length > 0 || legalAndPolicy.length > 0) && (
        <section className="event-section" aria-labelledby="heading-entities">
          <div className="event-section__header">
            <span className="event-section__tag">KNOWLEDGE GRAPH NODES</span>
            <h2 id="heading-entities" className="event-section__title">Entities Documented</h2>
          </div>

          <div className="entities-columns-grid">
            {people.length > 0 && (
              <div className="entity-col">
                <h4 className="entity-col__title">Individuals</h4>
                <div className="entity-col__list">
                  {people.map((p) => (
                    <div key={p.id} className="entity-pill">
                      <span>👤</span>
                      <strong>{p.name}</strong>
                      {p.role && <span className="entity-role">({p.role})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {organizations.length > 0 && (
              <div className="entity-col">
                <h4 className="entity-col__title">Organizations</h4>
                <div className="entity-col__list">
                  {organizations.map((org) => (
                    <div key={org.id} className="entity-pill">
                      <span>🏛️</span>
                      <strong>{org.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {legalAndPolicy.length > 0 && (
              <div className="entity-col">
                <h4 className="entity-col__title">Legal &amp; Policy</h4>
                <div className="entity-col__list">
                  {legalAndPolicy.map((item) => (
                    <div key={item.id} className="entity-pill">
                      <span>⚖️</span>
                      <strong>{item.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: FORECAST
         ======================================================== */}
      {showSection('forecast') && forecasts.length > 0 && (
        <section className="event-section" aria-labelledby="heading-forecast">
          <div className="event-section__header">
            <span className="event-section__tag">PROJECTIONS</span>
            <h2 id="heading-forecast" className="event-section__title">Forecast &amp; Precedents</h2>
          </div>
          <div className="forecasts-grid">
            {forecasts.map((fc) => (
              <div key={fc.id} className="forecast-card">
                <div className="forecast-card__header">
                  <span className="forecast-prob">
                    Probability: <strong>{Math.round(fc.probability * 100)}%</strong>
                  </span>
                  <span className="forecast-horizon">Horizon: {fc.time_horizon || 'Near-term'}</span>
                </div>
                <p className="forecast-desc">{fc.outcome_description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION: RELATED EVENTS
         ======================================================== */}
      {showSection('related') && relatedEvents.length > 0 && (
        <section className="event-section" aria-labelledby="heading-related">
          <div className="event-section__header">
            <span className="event-section__tag">CONNECTED DOSSIERS</span>
            <h2 id="heading-related" className="event-section__title">Related Events</h2>
          </div>
          <div className="related-events-grid">
            {relatedEvents.map((rel) => (
              <Link key={rel.id} to={`/event/${rel.id}`} className="clean-story-card related-event-card">
                <div className="clean-story-card__category">
                  {rel.category?.toUpperCase() || 'RELATED'}
                </div>
                <h3 className="clean-story-card__headline">
                  {rel.title}
                </h3>
                <p className="clean-story-card__summary">
                  {rel.summary ? (rel.summary.length > 100 ? rel.summary.slice(0, 100) + '...' : rel.summary) : ''}
                </p>
                <div className="clean-story-card__footer">
                  <span className="clean-story-card__meta">Updated {formatDate(rel.last_updated_at)}</span>
                  <span className="clean-badge clean-badge--link">View Dossier &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Report Footer */}
      <footer className="event-report__footer">
        <div>
          Assembled by <strong>PRAMĀṆA Evidence Intelligence Engine</strong>
        </div>
        <div>
          Dossier Timestamp: <strong>{formatDateTime(lastUpdated)}</strong>
        </div>
      </footer>
    </article>
  );
}
