import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';

function formatDate(dateString) {
  if (!dateString) return 'Recent';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateString;
  }
}

export default function ArticlePage() {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    api.get(`/articles/${id}`)
      .then((data) => {
        if (!mounted) return;
        setArticle(data.article || data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load article details.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '60vh' }}>
        <div className="loading__spinner" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="empty-state" style={{ maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
        <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
        <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>Article Dispatch Unavailable</h2>
        <p className="empty-state__text" style={{ color: '#6B7280' }}>
          {error || 'The requested article could not be found or has not yet been processed.'}
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/explore" className="btn btn--secondary">
            ← Return to Explore
          </Link>
        </div>
      </div>
    );
  }

  const {
    title,
    summary,
    author,
    published_at,
    url: sourceUrl,
    source_name,
    source_reliability,
    image_url,
    image_attribution,
    category,
    event,
    claims = [],
    relatedEvents = [],
  } = article;

  return (
    <article className="article-dossier" aria-labelledby="article-headline" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem 0' }}>
      {/* 1. Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: '1.25rem' }}>
        <Link to="/explore" style={{ fontSize: '0.8125rem', color: '#6B7280', textDecoration: 'none' }}>
          ← Back to Living Intelligence
        </Link>
      </nav>

      {/* 2. Article Header */}
      <header className="article-dossier__header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {category && (
            <span className={`category-tag category-tag--${category.toLowerCase()}`}>
              {category}
            </span>
          )}
          {source_name && (
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#374151',
              background: '#F3F4F6',
              padding: '2px 8px',
              borderRadius: '4px',
            }}>
              {source_name}
            </span>
          )}
          {source_reliability && (
            <span style={{ fontSize: '0.6875rem', color: '#16A34A', fontWeight: 600 }}>
              {(source_reliability * 100).toFixed(0)}% Reliability
            </span>
          )}
        </div>

        <h1
          id="article-headline"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '2.25rem',
            fontWeight: 700,
            lineHeight: 1.25,
            color: '#111827',
            margin: '0 0 1rem 0',
          }}
        >
          {title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8125rem', color: '#6B7280', flexWrap: 'wrap' }}>
          {author && <span>By <strong>{author}</strong></span>}
          <span>{formatDate(published_at)}</span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500, marginLeft: 'auto' }}
            >
              Original Dispatch Source ↗
            </a>
          )}
        </div>
      </header>

      {/* 3. Article Image (if present) */}
      {image_url && (
        <figure style={{ margin: '0 0 2rem 0', borderRadius: '8px', overflow: 'hidden' }}>
          <img
            src={image_url}
            alt={title}
            style={{ width: '100%', maxHeight: '420px', objectFit: 'cover', display: 'block' }}
          />
          {image_attribution && (
            <figcaption style={{ fontSize: '0.6875rem', color: '#9CA3AF', padding: '6px 0', textAlign: 'right' }}>
              {image_attribution}
            </figcaption>
          )}
        </figure>
      )}

      {/* 4. Article Summary / Excerpt */}
      <div style={{ fontSize: '1.0625rem', lineHeight: 1.7, color: '#1F2937', marginBottom: '2.5rem' }}>
        <p style={{ whiteSpace: 'pre-line' }}>{summary}</p>
      </div>

      {/* 5. CONNECTED PRAMĀṆA KNOWLEDGE GRAPH (Requirement 4) */}
      <section
        className="article-knowledge-card"
        style={{
          background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)',
          border: '1px solid #DDD6FE',
          borderRadius: '8px',
          padding: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.25rem', color: '#7C3AED' }}>◈</span>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Connected PRAMĀṆA Knowledge Graph
          </h2>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#4B5563', margin: '0 0 1.25rem 0' }}>
          This article has been processed, cross-referenced with global newsfeeds, and clustered into PRAMĀṆA&apos;s living multi-source intelligence model.
        </p>

        {/* Linked Living Event */}
        {event ? (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem',
          }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Linked Living Event:
            </span>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: '4px 0 8px 0' }}>
              <Link to={`/event/${event.id}`} style={{ color: '#7C3AED', textDecoration: 'none' }}>
                {event.title} ↗
              </Link>
            </h3>
            {event.summary && (
              <p style={{ fontSize: '0.8125rem', color: '#4B5563', margin: 0 }}>
                {event.summary}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '0.75rem', color: '#6B7280' }}>
              <span>Status: <strong>{event.status || 'Verified'}</strong></span>
              <span>·</span>
              <span>Severity: <strong>{event.severity || 'Normal'}</strong></span>
              <span>·</span>
              <span>{event.source_count || 1} corroborating source(s)</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8125rem', color: '#6B7280', fontStyle: 'italic', marginBottom: '1rem' }}>
            This article is awaiting clustering into an active living event dossier.
          </div>
        )}

        {/* Evaluated Claims Extracted from this Dispatch */}
        {claims.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
              Extracted Assertions &amp; Claim Status ({claims.length}):
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {claims.map((claim, idx) => (
                <div
                  key={claim.id || idx}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '10px',
                  }}
                >
                  <span
                    className={`badge ${
                      claim.verification_status === 'VERIFIED'
                        ? 'badge--verified'
                        : claim.verification_status === 'CONTRADICTED'
                        ? 'badge--contradicted'
                        : 'badge--unverified'
                    }`}
                    style={{ fontSize: '0.625rem', flexShrink: 0 }}
                  >
                    {claim.verification_status}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: '#1F2937' }}>
                    &ldquo;{claim.claim_text || claim.text}&rdquo;
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Living Events */}
        {relatedEvents.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
              Related Contextual Events:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {relatedEvents.map((rel) => (
                <Link
                  key={rel.id}
                  to={`/event/${rel.id}`}
                  style={{
                    fontSize: '0.75rem',
                    color: '#6D28D9',
                    background: '#EDE9FE',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {rel.title} ↗
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
