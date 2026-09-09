import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleString([], {
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

    fetch(`/api/events/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Event not found' : `Error loading event (${res.status})`);
        }
        return res.json();
      })
      .then((d) => {
        if (!isMounted) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="loading">
        <div className="loading__spinner" />
      </div>
    );
  }

  if (error || !data || !data.event) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◎</div>
        <h2 className="empty-state__title">Event Not Found</h2>
        <p className="empty-state__text">
          {error || `Event "${id}" does not exist in the database.`}
        </p>
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Link to="/" className="btn btn--secondary">
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { event, articles = [], claims = [], entities = [] } = data;

  return (
    <article style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Back Link */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          ← Back to Global Intelligence
        </Link>
      </div>

      {/* Dossier Header */}
      <header style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <span className={`category-tag category-tag--${event.category || 'politics'}`}>
            {event.category}
          </span>
          {event.severity && event.severity !== 'normal' && (
            <span className={`badge badge--${event.severity === 'critical' ? 'contradicted' : 'unverified'}`}>
              {event.severity}
            </span>
          )}
          <span className="badge badge--verified">
            Status: {event.status}
          </span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', fontWeight: 700, lineHeight: 1.25, color: 'var(--color-ink)', marginBottom: 'var(--space-4)' }}>
          {event.title}
        </h1>

        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
          {event.summary}
        </p>

        {/* Metadata ribbon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)', flexWrap: 'wrap' }}>
          <span>First reported: <strong>{formatDate(event.first_reported_at)}</strong></span>
          <span>Last updated: <strong>{formatDate(event.last_updated_at)}</strong></span>
          <span>Reporting sources: <strong>{event.source_count}</strong></span>
          <span>Corroborating reports: <strong>{event.article_count}</strong></span>
        </div>
      </header>

      {/* Cross-Source Reporting Ledger */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 600 }}>
            Cross-Source Reporting Ledger ({articles.length})
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)' }}>
            Independent multi-source corroboration
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {articles.map((art) => (
            <div
              key={art.id}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink)' }}>
                    {art.source_name || 'News Wire'}
                  </strong>
                  {art.source_reliability && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)', background: 'var(--color-surface-secondary)', padding: '1px 6px', borderRadius: '4px' }}>
                      Reliability: {Math.round(art.source_reliability * 100)}%
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                  {formatDate(art.published_at)}
                </span>
              </div>

              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                {art.title}
              </h3>

              {art.summary && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', margin: 0 }}>
                  {art.summary}
                </p>
              )}

              <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)' }}>
                  By {art.author || art.source_name || 'Staff'}
                </span>
                {art.url && (
                  <a
                    href={art.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-accent)' }}
                  >
                    View Original Report ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Claims & Verification Section */}
      {claims.length > 0 && (
        <section style={{ marginBottom: 'var(--space-12)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
            Extracted Factual Claims ({claims.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {claims.map((clm) => (
              <div
                key={clm.id}
                style={{
                  background: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <span className={`badge ${clm.verification_status === 'VERIFIED' ? 'badge--verified' : clm.verification_status === 'CONTRADICTED' ? 'badge--contradicted' : 'badge--unverified'}`}>
                    {clm.verification_status}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-tertiary)', textTransform: 'capitalize' }}>
                    Type: {clm.claim_type} · Class: {clm.information_class}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink)', fontWeight: 500, margin: 0 }}>
                  &ldquo;{clm.text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key Entities Section */}
      {entities.length > 0 && (
        <section style={{ marginBottom: 'var(--space-12)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
            Key Entities Involved ({entities.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {entities.map((ent) => (
              <span
                key={ent.id}
                style={{
                  padding: 'var(--space-1) var(--space-3)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                }}
              >
                {ent.name} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>({ent.type})</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
