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

export default function EventPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        <p className="empty-state__text" style={{ color: '#6B7280' }}>
          {error || 'The requested event could not be found or has not yet been processed.'}
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/explore" className="btn btn--secondary">
            ← Return to Explore
          </Link>
        </div>
      </div>
    );
  }

  const { event, report = {}, articles = [], claims = [], entities = [], narratives = [], forecasts = [], relatedEvents = [] } = data;

  // Prefer structured report fields, with clean fallbacks to raw data
  const headline = report.headline || event.title;
  const verifiedPicture = report.verifiedPicture || event.summary;
  const whatHappened = report.whatHappened || event.summary;
  const whyThisHappened = report.whyThisHappened;
  const historicalContext = report.historicalContext;
  const confirmedClaims = report.confirmedClaims || claims.filter(c => c.verification_status === 'VERIFIED');
  const uncertainClaims = report.uncertainClaims || claims.filter(c => c.verification_status === 'UNVERIFIED');
  const contradictoryClaims = report.contradictoryClaims || claims.filter(c => c.verification_status === 'CONTRADICTED');
  const timeline = report.timeline || [];
  const legalAndPolicy = report.lawAndPolicy || entities.filter(e => e.type === 'law' || e.type === 'policy' || e.type === 'document');
  const people = report.people || entities.filter(e => e.type === 'person');
  const organizations = report.organizations || entities.filter(e => e.type === 'organization');
  const mediaCoverage = report.mediaCoverage || articles;
  const sources = report.sources || mediaCoverage;
  const lastUpdated = report.lastUpdated || event.last_updated_at;

  return (
    <article className="event-report" aria-labelledby="event-headline">
      {/* 1. Back navigation */}
      <nav className="event-report__back-nav" aria-label="Breadcrumbs">
        <Link to="/explore" className="event-report__back-btn">
          ← Back to Global Intelligence
        </Link>
      </nav>

      {/* 2. Header & Meta Information */}
      <header className="event-report__header">
        <div className="event-report__badges">
          <span className="event-report__category">
            {event.category || 'World News'}
          </span>
          {event.severity && event.severity !== 'normal' && (
            <span className={`badge ${event.severity === 'critical' ? 'badge--contradicted' : 'badge--unverified'}`}>
              Severity: {event.severity.toUpperCase()}
            </span>
          )}
          <span className="badge badge--verified">
            Status: {event.status || 'Verified'}
          </span>
          {event.location_name && (
            <span style={{ fontSize: '0.75rem', color: '#4B5563', background: '#F3F4F6', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
              📍 {event.location_name}
            </span>
          )}
        </div>

        <h1 id="event-headline" className="event-report__title">
          {headline}
        </h1>

        <div className="event-report__lead-meta">
          <span>First Reported: <strong>{formatDate(event.first_reported_at || event.created_at)}</strong></span>
          <span>Last Updated: <strong>{formatDate(lastUpdated)}</strong></span>
          <span>Sources Corroborating: <strong>{Math.max(event.source_count || 1, articles.length)}</strong></span>
          <span>Dispatches Analyzed: <strong>{Math.max(event.article_count || 1, articles.length)}</strong></span>
        </div>
      </header>

      {/* 3. The Verified Picture (Executive Summary Callout) */}
      {verifiedPicture && (
        <aside className="event-report__verified-picture" aria-label="The Verified Picture">
          <div className="event-report__verified-label">
            <span>✓</span> The Verified Picture
          </div>
          <p className="event-report__verified-text">
            {verifiedPicture}
          </p>
        </aside>
      )}

      {/* 4. What Happened (Chronological Narrative) */}
      {whatHappened && (
        <section className="event-report__section" aria-labelledby="heading-what-happened">
          <h2 id="heading-what-happened" className="event-report__section-title">
            What Happened
          </h2>
          <div className="event-report__prose">
            {whatHappened.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>
      )}

      {/* 5. What Is Confirmed */}
      {confirmedClaims.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-confirmed">
          <h2 id="heading-confirmed" className="event-report__section-title">
            What Is Confirmed ({confirmedClaims.length})
          </h2>
          <p className="event-report__section-subtitle">
            Independently verified factual claims corroborated across credible reporting.
          </p>
          <div className="event-report__claims-list">
            {confirmedClaims.map((claim) => (
              <div key={claim.id} className="event-report__claim-card">
                <div className="event-report__claim-header">
                  <span className="badge badge--verified">VERIFIED</span>
                  <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    Class: {claim.information_class || 'fact'} · Type: {claim.claim_type || 'factual'}
                  </span>
                </div>
                <p className="event-report__claim-text">
                  &ldquo;{claim.text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. What Remains Uncertain */}
      {uncertainClaims.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-uncertain">
          <h2 id="heading-uncertain" className="event-report__section-title">
            What Remains Uncertain ({uncertainClaims.length})
          </h2>
          <p className="event-report__section-subtitle">
            Claims or aspects for which primary evidence or official corroboration is still pending.
          </p>
          <div className="event-report__claims-list">
            {uncertainClaims.map((claim) => (
              <div key={claim.id} className="event-report__claim-card">
                <div className="event-report__claim-header">
                  <span className="badge badge--unverified">UNVERIFIED</span>
                  <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    Type: {claim.claim_type || 'unverified'}
                  </span>
                </div>
                <p className="event-report__claim-text">
                  &ldquo;{claim.text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. Contradictory Reporting (When Present) */}
      {contradictoryClaims.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-contradictions">
          <h2 id="heading-contradictions" className="event-report__section-title">
            Contradictory Reporting & Disagreements ({contradictoryClaims.length})
          </h2>
          <p className="event-report__section-subtitle">
            Points where credible outlets provide conflicting assertions or differing data.
          </p>
          <div className="event-report__claims-list">
            {contradictoryClaims.map((claim) => (
              <div key={claim.id} className="event-report__claim-card" style={{ borderColor: '#FECACA' }}>
                <div className="event-report__claim-header">
                  <span className="badge badge--contradicted">CONTRADICTED</span>
                </div>
                <p className="event-report__claim-text">
                  &ldquo;{claim.text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 8. Chronological Timeline */}
      {timeline.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-timeline">
          <h2 id="heading-timeline" className="event-report__section-title">
            Chronological Timeline
          </h2>
          <p className="event-report__section-subtitle">
            Key developments assembled in chronological order.
          </p>
          <div className="event-report__timeline">
            {timeline.map((item) => (
              <div key={item.id} className="event-report__timeline-item">
                <span className="event-report__timeline-dot" aria-hidden="true" />
                <div className="event-report__timeline-time">
                  {formatDateTime(item.timestamp)} · <span style={{ color: '#8B5CF6' }}>{item.source}</span>
                </div>
                <h3 className="event-report__timeline-title">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="event-report__timeline-desc">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 9. Why This Happened (Causal Background) */}
      {whyThisHappened && (
        <section className="event-report__section" aria-labelledby="heading-why">
          <h2 id="heading-why" className="event-report__section-title">
            Why This Happened
          </h2>
          <div className="event-report__prose">
            <p>{whyThisHappened}</p>
          </div>
        </section>
      )}

      {/* 10. Historical Context & Precedent */}
      {historicalContext && (
        <section className="event-report__section" aria-labelledby="heading-historical">
          <h2 id="heading-historical" className="event-report__section-title">
            Historical Context & Precedent
          </h2>
          <div className="event-report__prose">
            <p>{historicalContext}</p>
          </div>
        </section>
      )}

      {/* 11. Law & Policy Framework */}
      {legalAndPolicy.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-law-policy">
          <h2 id="heading-law-policy" className="event-report__section-title">
            Law, Regulation & Policy
          </h2>
          <p className="event-report__section-subtitle">
            Statutes, treaties, or government policies documented in connection with this event.
          </p>
          <div className="event-report__chips">
            {legalAndPolicy.map((item) => (
              <div key={item.id} className="event-report__chip">
                <span>⚖️</span>
                <strong>{item.name}</strong>
                {item.description && <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>— {item.description}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 12. People & Organizations Involved */}
      {(people.length > 0 || organizations.length > 0) && (
        <section className="event-report__section" aria-labelledby="heading-actors">
          <h2 id="heading-actors" className="event-report__section-title">
            Key Actors & Organizations
          </h2>

          {people.length > 0 && (
            <div className="event-report__chips-group">
              <div className="event-report__chips-title">Individuals Documented</div>
              <div className="event-report__chips">
                {people.map((person) => (
                  <div key={person.id} className="event-report__chip">
                    <span>👤</span>
                    <span>{person.name}</span>
                    {person.role && <span className="event-report__chip-role">({person.role})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {organizations.length > 0 && (
            <div className="event-report__chips-group">
              <div className="event-report__chips-title">Entities & Organizations</div>
              <div className="event-report__chips">
                {organizations.map((org) => (
                  <div key={org.id} className="event-report__chip">
                    <span>🏛️</span>
                    <span>{org.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 13. Media Coverage Ledger */}
      {mediaCoverage.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-media">
          <h2 id="heading-media" className="event-report__section-title">
            Cross-Source Media Coverage ({mediaCoverage.length})
          </h2>
          <p className="event-report__section-subtitle">
            Attributable reporting and perspectives across newsrooms.
          </p>
          <div className="event-report__sources-grid">
            {mediaCoverage.map((art) => (
              <div key={art.id} className="event-report__source-card">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className="event-report__source-name">{art.sourceName || art.source_name || 'News Source'}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                      {formatDate(art.publishedAt || art.published_at)}
                    </span>
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
                    View Original Report ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 14. Public / Online Narrative Signals */}
      {narratives.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-narratives">
          <h2 id="heading-narratives" className="event-report__section-title">
            Public Information & Narrative Signals
          </h2>
          <div className="event-report__claims-list">
            {narratives.map((nar) => (
              <div key={nar.id} className="event-report__claim-card">
                <div className="event-report__claim-header">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8B5CF6' }}>
                    Platform: {nar.platform || 'Public Signal'}
                  </span>
                  {nar.share_pct && (
                    <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                      Share: {Math.round(nar.share_pct * 100)}%
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 4px 0' }}>{nar.title}</h3>
                {nar.description && <p style={{ fontSize: '0.85rem', color: '#4B5563', margin: 0 }}>{nar.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 15. Related Events in Knowledge System */}
      {relatedEvents.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-related">
          <h2 id="heading-related" className="event-report__section-title">
            Related Events in Knowledge System
          </h2>
          <div className="event-report__related-grid">
            {relatedEvents.map((rel) => (
              <Link key={rel.id} to={`/event/${rel.id}`} className="event-report__related-card">
                <span className="event-report__category" style={{ fontSize: '0.6875rem', alignSelf: 'flex-start' }}>
                  {rel.category}
                </span>
                <h3 className="event-report__related-title">{rel.title}</h3>
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  Updated {formatDate(rel.last_updated_at)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 16. Forecast Projections */}
      {forecasts.length > 0 && (
        <section className="event-report__section" aria-labelledby="heading-forecasts">
          <h2 id="heading-forecasts" className="event-report__section-title">
            What May Happen Next (Model Forecast)
          </h2>
          <div className="event-report__claims-list">
            {forecasts.map((fc) => (
              <div key={fc.id} className="event-report__claim-card" style={{ borderLeft: '4px solid #8B5CF6' }}>
                <div className="event-report__claim-header">
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED' }}>
                    Probability: {Math.round(fc.probability * 100)}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    Horizon: {fc.time_horizon || 'Near-term'}
                  </span>
                </div>
                <p className="event-report__claim-text">{fc.outcome_description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 17 & 18. Sources and Report Footer */}
      <footer className="event-report__footer">
        <div>
          Intelligence Report assembled by <strong>PRAMĀṆA Evidence Engine</strong>
        </div>
        <div>
          Report Last Updated: <strong>{formatDateTime(lastUpdated)}</strong>
        </div>
      </footer>
    </article>
  );
}
